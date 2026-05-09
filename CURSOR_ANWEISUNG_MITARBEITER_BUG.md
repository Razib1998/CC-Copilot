# Anweisung an Cursor: Verifikation Mitarbeiter-Aufgaben-Bug

## WICHTIG – Regeln für diese Aufgabe

1. **NUR PRÜFEN, NICHTS ÄNDERN.** Keine Refaktorierung, keine Fixes, kein Umbau. Nur Code lesen und Befunde bestätigen oder widerlegen.
2. **Belege mit Datei + Zeilennummer.** Jeder Befund muss mit exaktem Pfad und Zeilenbereich belegt werden.
3. **Keine Vermutungen.** Wenn etwas nicht eindeutig im Code steht, als "unklar" markieren.
4. **Antwort auf Deutsch.**

---

## Kontext

Projekt: `CC Cockpit` / `CC Intern` (frontend/modules/ccintern)
Symptom: Mitarbeiter "Okan" bekommt im Desktop- UND Mobile-View korrekt seine Aufgaben angezeigt (9 Aufgaben). Alle anderen Mitarbeiter (z. B. "Selim Aydogdu", "Melanie Neuert") sehen 0 Aufgaben. Zusätzlich: Avatare zeigen "?" statt Initialen, und der Mitarbeiter-Einstellungsdialog hat keine Kürzel-Spalte.

Referenzmitarbeiter: **Okan funktioniert.** Alle anderen nicht. Die Abweichung zwischen Okan und den anderen ist der Schlüssel.

---

## Hypothese, die du verifizieren sollst

Es gibt drei verkettete Bugs, die zusammen erklären, warum nur Okan funktioniert:

### Bug 1: `cockpitMaInitials()` erzeugt falsche Kürzel für mehrteilige Namen

**Datei:** `frontend/modules/ccintern/cc-intern-main.js`, Funktion `cockpitMaInitials()` (ca. Zeile 43–49)

Erwartete Logik: Für Mitarbeiter sollte das Kürzel so gebildet werden, dass es zu den Seeds in den AUFTRAEGE passt (`'OK'`, `'SE'`, `'ME'`).

Tatsächliche Logik (Hypothese):
- Bei mehrteiligen Namen nimmt die Funktion **ersten Buchstaben Vorname + ersten Buchstaben Nachname**.
- Also: `"Melanie Neuert"` → `"MN"` (nicht `"ME"`)
- `"Selim Aydogdu"` → `"SA"` (nicht `"SE"`)
- `"Okan"` → `"OK"` (einteilig → funktioniert zufällig)

**Prüfauftrag:**
1. Lies `cockpitMaInitials()` komplett.
2. Bestätige oder widerlege: Die Funktion produziert für `"Melanie Neuert"` den Wert `"MN"` und für `"Selim Aydogdu"` den Wert `"SA"`.
3. Suche die Stelle, an der dieses `av` in `MA_DATA` geschrieben wird (ca. `cc-intern-main.js:62–80`, Variable `mappedUsers`).

### Bug 2: `maKuerzelOderIdZuUserUuid()` kann falsches av nicht zur UUID zurück auflösen

**Datei:** `frontend/modules/ccintern/views/auftraege-detail-view.js`, Funktion `maKuerzelOderIdZuUserUuid()` (ca. Zeile 3194–3242)

Erwartete Logik: Der Resolver soll aus einem Kürzel (z. B. `"SE"` aus dem AUFTRAEGE-Seed) die zugehörige Cockpit-UUID finden.

Hypothese:
- Der Resolver vergleicht nur gegen `m.av` (das inzwischen falsch gesetzt ist, siehe Bug 1).
- Er nutzt **nicht** `m.k` (obwohl dieses Feld im Speichern-Pfad existiert).
- Er nutzt **nicht** die Initialen aus `m.n` als Fallback.
- Er referenziert eine Funktion `cockpitStyleAvVonName`, die im Codebase **nirgendwo definiert** ist → ReferenceError-Risiko zur Laufzeit.

**Prüfauftrag:**
1. Lies `maKuerzelOderIdZuUserUuid()` vollständig.
2. Liste auf, gegen welche Felder (`m.av`, `m.k`, `m.n`, `m.maId`, `m.id`) der Resolver prüft.
3. Prüfe mit `grep -rn "cockpitStyleAvVonName" frontend/`: Wird die Funktion irgendwo **definiert**? Oder nur aufgerufen?
4. Bestätige oder widerlege: Wenn `m.av === "MN"` ist (statt erwartet `"ME"`), kann der Resolver aus `"ME"` **nicht** die UUID von Melanie finden.

### Bug 3: Totes Feld `m.k` – gespeichert, aber nie gelesen

**Dateien:**
- `frontend/modules/ccintern/views/auftraege-detail-view.js` ca. Zeile 3131–3143 (Load-Pfad setzt `m.k`)
- `frontend/modules/ccintern/views/auftraege-detail-view.js` ca. Zeile 3146–3155 (`saveMitarbeiter()` persistiert `m.k`)
- `frontend/modules/ccintern/views/mitarbeiter-view.js` ca. Zeile 192–253 (Settings-Dialog-Template)

Hypothese:
- Das Feld `m.k` wird im Load-Pfad gesetzt und von `saveMitarbeiter()` persistiert.
- Im Settings-Dialog gibt es **keine Eingabespalte** dafür (nur 4 Spalten: Name, Rolle, Soll, Urlaub).
- In `maKuerzelOderIdZuUserUuid()` wird `m.k` **nicht** abgefragt.
- In `maAufgabeIstFuerMa()` / `maIdGleich()` wird `m.k` **nicht** abgefragt.

**Prüfauftrag:**
1. `grep -rn "\.k " frontend/modules/ccintern/` und `grep -rn "m\.k" frontend/modules/ccintern/` – wo wird `m.k` geschrieben, wo gelesen?
2. Lies das Settings-Dialog-Template in `mitarbeiter-view.js` (ca. Z. 192–253). Bestätige: Spalten sind nur Name / Rolle / Soll / Urlaub, **keine** Kürzel-Spalte.
3. Bestätige oder widerlege: `m.k` ist ein Dead Field.

### Bug 4: Konkurrierende MA_DATA-Ladewege

**Dateien:**
- `frontend/modules/ccintern/cc-intern-main.js` ca. Zeile 18–92 (`loadCockpitData()`, setzt `av` via `cockpitMaInitials`)
- `frontend/modules/ccintern/views/cc-intern-boot.js` ca. Zeile 352–356 (DataService-Load, setzt **kein** `av`)

Hypothese:
- Es gibt zwei Pfade, die `MA_DATA` befüllen.
- Der DataService-Pfad lädt persistierte Zeilen ohne `av`-Feld → Avatar-Card zeigt `"?"`.
- Der Cockpit-Pfad würde `av` setzen, wird aber vom DataService-Pfad überschrieben.

**Prüfauftrag:**
1. Lies beide Ladewege.
2. Zeige die Reihenfolge: Wer läuft zuletzt? Welcher Pfad gewinnt?
3. Prüfe im Render-Code (`mitarbeiter-view.js` ca. Z. 170): Was zeigt die UI, wenn `m.av` leer/undefined ist? (Vermutlich `"?"`)

---

## Diagnostisches Konsolen-Snippet (nur zum Ausführen in der Browser-Konsole)

Lies das Snippet, aber **verändere den Code nicht**. Bestätige nur, dass die in den Konsolen-Ausgaben erwarteten Felder/Funktionen so im Code existieren.

```js
console.group('OKAN-DIAGNOSE');
var okan = (window.MA_DATA || []).find(m => (m.n||'').toLowerCase().startsWith('okan'));
console.log('Okan Rohdaten:', okan);
console.log('Okan Felder:', Object.keys(okan || {}));

var alleAufgaben = (window.INTERN_AUFGABEN || []);
console.log('Anzahl INTERN_AUFGABEN total:', alleAufgaben.length);

if (okan && typeof maAufgaben === 'function') {
  console.log('maAufgaben(okan.maId) =', maAufgaben(okan.maId).length);
}
if (okan && typeof mobMeineWorkflowAufgaben === 'function') {
  console.log('mobMeineWorkflowAufgaben() für Okan =', mobMeineWorkflowAufgaben(okan.maId).length);
}
console.groupEnd();

console.group('SELIM/MELANIE-DIAGNOSE');
['selim','melanie'].forEach(function(vn){
  var m = (window.MA_DATA || []).find(x => (x.n||'').toLowerCase().startsWith(vn));
  console.log(vn, 'Rohdaten:', m);
  if (m && typeof maAufgaben === 'function') {
    console.log(vn, 'maAufgaben:', maAufgaben(m.maId).length);
  }
});
console.groupEnd();

console.group('RESOLVER-TEST');
if (typeof maKuerzelOderIdZuUserUuid === 'function') {
  console.log('resolve("OK") =', maKuerzelOderIdZuUserUuid('OK'));
  console.log('resolve("SE") =', maKuerzelOderIdZuUserUuid('SE'));
  console.log('resolve("ME") =', maKuerzelOderIdZuUserUuid('ME'));
}
console.groupEnd();
```

**Prüfauftrag:**
1. Alle im Snippet genutzten Namen (`MA_DATA`, `INTERN_AUFGABEN`, `maAufgaben`, `mobMeineWorkflowAufgaben`, `maKuerzelOderIdZuUserUuid`) – existieren sie tatsächlich im Code? Wo?

---

## Ausgabeformat für dein Ergebnis

Antworte strikt in dieser Struktur:

```
BEFUND BUG 1 (cockpitMaInitials): [BESTÄTIGT | WIDERLEGT | UNKLAR]
Beleg: <Datei:Zeile> + kurzes Zitat

BEFUND BUG 2 (maKuerzelOderIdZuUserUuid): [BESTÄTIGT | WIDERLEGT | UNKLAR]
Beleg: <Datei:Zeile> + kurzes Zitat
cockpitStyleAvVonName definiert? [JA/NEIN] – Beleg: grep-Ergebnis

BEFUND BUG 3 (m.k Dead Field): [BESTÄTIGT | WIDERLEGT | UNKLAR]
Schreibstellen: <Liste>
Lesestellen: <Liste>
Kürzel-Spalte im Settings-Dialog: [JA/NEIN]

BEFUND BUG 4 (konkurrierende Ladewege): [BESTÄTIGT | WIDERLEGT | UNKLAR]
Pfad 1: <Datei:Zeile>
Pfad 2: <Datei:Zeile>
Gewinner (letzte Schreibung gewinnt): <Pfad>

Zusammenfassende Antwort in einem Satz: Warum sieht nur Okan Aufgaben?
```

**Nochmal zur Sicherheit: Schreibe KEINEN Fix. Prüfe nur.**
