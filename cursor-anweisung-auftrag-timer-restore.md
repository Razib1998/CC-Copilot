# Cursor-Anweisung: Auftrag-Timer wird nach F5 nicht wiederhergestellt

## Datei
`frontend/modules/ccintern/views/mitarbeiter-app-mob-inline.js`

---

## Verifizierter Root Cause (IST-Analyse)

**Szenario:** Echter MA-App-Shell (`window.__CCINTERN_MITARBEITER_APP_BOOT__ === true`)

**Ablauf nach F5:**

1. `mobInit()` (Z. 212) ruft `mobApplyCockpitUser(appUid)` (Z. 223) auf — zu diesem Zeitpunkt ist `MA_DATA` noch nicht geladen.

2. In `mobApplyCockpitUser` (Z. 5734):
   - Zeile 5740: `MOB_MA_ID = null` (Reset) + `sessionStorage.removeItem('mob_ma_id')`
   - Zeile 5753: `if (!MA_DATA.length)` → true → speichert `window.__MOB_PENDING_COCKPIT_USER_ID__` → **early return** ohne MOB_MA_ID zu setzen

3. Zurück in `mobInit` (Z. 225): `if (MOB_MA_ID)` = **false** → `mobZeigeLogin()` → **`mobRestoreAuftragArbeitszeit` wird NICHT aufgerufen**

4. Später ruft `dalInit()` → `loadMitarbeiter()` → `mobReapplyCockpitOrTestMa()` → `mobApplyCockpitUser()` erneut auf — jetzt mit geladenem MA_DATA → setzt `MOB_MA_ID = mid` + ruft `mobSetMA(mid)` auf — **aber `mobRestoreAuftragArbeitszeit` fehlt in diesem Pfad komplett**

**Ergebnis:** `[AUFTRAG_RESTORE_START]` erscheint nie in der Konsole. Der Auftrag-Timer wird nicht wiederhergestellt.

---

## Änderung 1: Flag in `mobInit` setzen (echter App-Pfad)

**Zeile ~226** (innerhalb `if (mobIsRealMaAppSession())` → `if (MOB_MA_ID)` Block):

```js
// VORHER:
    if (MOB_MA_ID) {
      mobZeitRestore(function () {
        mobRestoreAuftragArbeitszeit(function () {
          mobRenderHome();
          mobTab('home');
        });
      });
      return;
    }

// NACHHER:
    if (MOB_MA_ID) {
      window.__MOB_AUFTRAG_RESTORE_TRIGGERED__ = true;
      mobZeitRestore(function () {
        mobRestoreAuftragArbeitszeit(function () {
          mobRenderHome();
          mobTab('home');
        });
      });
      return;
    }
```

---

## Änderung 2: Deferred Restore in `mobApplyCockpitUser`

**Zeile ~5794–5801** (nach dem erfolgreichen `mobSetMA(mid)`-Aufruf, innerhalb `mobApplyCockpitUser`):

```js
// VORHER:
  var mid = res.workingMaId;
  try { sessionStorage.setItem('mob_ma_id', mid); } catch (e) {}
  MOB_MA_ID = mid;
  if (typeof mobSetMA === 'function' && document.getElementById('mob-hallo')) {
    mobSetMA(mid);
  }
  if (typeof ccMobTestBarSync === 'function') { ccMobTestBarSync(); }
}

// NACHHER:
  var mid = res.workingMaId;
  try { sessionStorage.setItem('mob_ma_id', mid); } catch (e) {}
  MOB_MA_ID = mid;
  if (typeof mobSetMA === 'function' && document.getElementById('mob-hallo')) {
    mobSetMA(mid);
  }
  // Race-condition fix (B4-Timer-Restore): mobInit lief ohne MA_DATA → Restore hier nachholen
  if (appOnly && !window.__MOB_AUFTRAG_RESTORE_TRIGGERED__) {
    window.__MOB_AUFTRAG_RESTORE_TRIGGERED__ = true;
    if (typeof mobZeitRestore === 'function') {
      mobZeitRestore(function () {
        if (typeof mobRestoreAuftragArbeitszeit === 'function') {
          mobRestoreAuftragArbeitszeit(function () {
            if (typeof mobRenderHome === 'function') mobRenderHome();
            if (typeof mobTab === 'function') mobTab('home');
          });
        }
      });
    }
  }
  if (typeof ccMobTestBarSync === 'function') { ccMobTestBarSync(); }
}
```

---

## Wichtige Hinweise

- `appOnly` ist bereits am Anfang von `mobApplyCockpitUser` als `var appOnly = mobIsRealMaAppSession()` gesetzt (Z. 5736) — kein neuer Variable-Name nötig
- `window.__MOB_AUFTRAG_RESTORE_TRIGGERED__` wird bei jedem F5/Page-Load neu gesetzt (kein Persist), da es eine `window`-Variable ist → kein sessionStorage/localStorage-Konflikt
- Der `mobZeitRestore`-Aufruf ist bewusst: er holt die Anwesenheitszeit UND ruft danach `mobRestoreAuftragArbeitszeit` auf — exakt wie im regulären `mobInit`-Pfad (Z. 251–256)
- **Kein Refactoring** — nur minimale additive Änderungen an zwei genau lokalisierten Stellen
- **Nicht anfassen:** `mobRestoreAuftragArbeitszeit` selbst, `mobZeitRestore`, `mobAuftragLaufzeitTick`, `zeitAktivKey`, `zeitAktivParseAnyKey`

---

## Verifikation nach der Änderung

1. MA-App öffnen, Auftrag-Timer für einen Schritt starten (Start-Button)
2. F5 drücken
3. In der Browser-Konsole erwarten:
   - `[ARBEITSZEIT_RESTORE]` → Anwesenheits-Session
   - `[AUFTRAG_RESTORE_START]` → **MUSS jetzt erscheinen** (vorher fehlte es)
   - `[AUFTRAG_RESTORE_FOUND]` mit korrekter `session_auftrag_id`
   - `[AUFTRAG_RESTORE_SESSION]` + `[AUFTRAG_RESTORE_APPLY_ONLY_UI]`
4. `#mob-lauft-timer` zeigt die weiterlaufende Zeit — kein Reset auf `00:00:00`
