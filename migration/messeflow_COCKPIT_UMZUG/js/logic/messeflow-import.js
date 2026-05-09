// ═══════════════════════════════════════════════════════════════════════════════
// MESSEFLOW IMPORT  ←  Quelle: Messeflow/DEV/js/import/excel.js
// Ziel: messeflow-import.js (logic/)
//
// Enthält:
//   • importExcel()           – Haupt-Import-Funktion (FileReader + SheetJS)
//   • parseFinanzWert()       – Finanzzahlen aus beliebigem Rohformat parsen
//   • parseExcelDate()        – Datumserkennung: Seriennummer / TT.MM.JJJJ /
//                               MM/DD/YYYY / ISO / 2-stelliges Jahr
//
// Ablauf (5 Phasen):
//   Phase 1: „Motiv"-Kopfzeile suchen → trennt Kopfdaten von Flächen-Tabelle
//   Phase 2: Kopfdaten lesen           → Kunde, Liefertermin, Bestelldatum, Finanz
//   Phase 3: Flächen-Spalten erkennen  → Motiv, Druckmaß Breite, Druckmaß Höhe
//   Phase 4: Flächen-Zeilen einlesen   → Wände mit bestellmass aufbauen
//   Phase 5: Projekt anlegen           → Dubletten-Schutz, Team zuweisen, UI
//
// Abhängigkeiten (müssen vor dieser Datei geladen sein):
//   • XLSX          (cdnjs – xlsx.full.min.js)
//   • messflowState  → MesseFlowState, applyStandardZuweisungen, findExistingProject,
//                      recalc, refreshProjectUI, activeProjId
//   • ui/components  → openModal, closeModal, toast, pushNotif
//
// TODO Cockpit-Umzug:
//   - openModal() / closeModal() → Cockpit-Modal-System verwenden
//   - toast() / pushNotif()      → Cockpit-Notification-System
//   - refreshProjectUI()         → in Cockpit-Routing einbinden
//   - XLSX-Abhängigkeit prüfen   (muss im Cockpit-Bundle enthalten sein)
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
// EXCEL IMPORT — mit Kopfdaten-Erkennung
// ═══════════════════════════════════════════════════════
//
// Dateistruktur:
//   Zeilen 1–N:  Kopfdaten   z.B.  "Bestellung"  |  "2025-123"
//                                   "Kunde"        |  "NRW Bank"
//                                   "Liefertermin" |  "15.06.2025"
//   Zeile M:     Kopfzeile   →  enthält das Wort "Motiv" in einer Zelle
//   Zeilen M+1…: Flächen-Daten mit Motiv + Breite + Höhe
//
// Spalten in der Flächen-Tabelle (tolerant erkannt):
//   Motiv    →  W_01, Wand A, …
//   Breite   →  Druckmaß Breite, Druckbreite, Breite, Width, B
//   Höhe     →  Druckmaß Höhe, Druckhöhe, Höhe, Height, H
//   (Sichtmaß-Spalten werden ignoriert)

// Finanzwert aus beliebigem Rohwert als Zahl parsen (Komma → Punkt, € entfernen)
function parseFinanzWert(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const cleaned = String(raw).replace(/[€$£\s]/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function importExcel(event, pid){
  const file = event.target.files[0];
  if(!file) return;
  event.target.value = '';

  const reader = new FileReader();
  reader.onload = function(e){
    try {
      const data = new Uint8Array(e.target.result);
      const wb   = XLSX.read(data, {type:'array'});
      const ws   = wb.Sheets[wb.SheetNames[0]];

      // Alles als Array-of-Arrays lesen (rohe Zellinhalte, keine Header-Interpretation)
      const allRows = XLSX.utils.sheet_to_json(ws, {header:1, defval:'', raw:false});
      if(!allRows.length){ toast('Fehler','Excel ist leer'); return; }

      // ── PHASE 1: Kopfzeile suchen ──────────────────────
      // Finde die Zeile, in der eine Zelle das Wort "Motiv" enthält.
      // Alles davor = Kopfdaten. Ab dieser Zeile = Flächen-Tabelle.

      let headerRowIdx = -1;
      for(let i=0; i<allRows.length; i++){
        const row = allRows[i];
        const hasMotiv = row.some(cell =>
          String(cell).trim().toLowerCase() === 'motiv' ||
          String(cell).trim().toLowerCase().startsWith('motiv')
        );
        if(hasMotiv){ headerRowIdx = i; break; }
      }

      if(headerRowIdx === -1){
        openModal('„Motiv"-Spalte nicht gefunden', `
          <p style="font-size:13px;color:var(--muted);margin-bottom:12px;">
            Das System hat in keiner Zeile eine Zelle mit dem Inhalt <strong>„Motiv"</strong> gefunden.
            Diese Zelle markiert den Beginn der Flächen-Tabelle.
          </p>
          <p style="font-size:13px;margin-bottom:8px;">Gefundene Zeileninhalte (erste 8 Zeilen):</p>
          <div style="background:#f9fafb;border:1px solid var(--line);border-radius:7px;padding:10px 12px;font-size:12px;font-family:monospace;max-height:160px;overflow-y:auto;">
            ${allRows.slice(0,8).map((r,i)=>`Zeile ${i+1}: ${r.filter(c=>String(c).trim()).join(' | ')}`).join('<br>')}
          </div>
          <div class="ma" style="margin-top:14px;"><button class="btn ghost sm" onclick="closeModal()">Schließen</button></div>
        `);
        return;
      }

      // ── PHASE 2: Kopfdaten lesen ────────────────────────
      // Regel: Label steht in Zelle N, Wert IMMER direkt rechts (col+1).
      // Positionen werden nie verändert — keine Filterung der Leerzellen.

      const KOPF_KEYS = {
        bestelldatum:    ['bestellung','bestell-datum','auftragsdatum','bestellt am'],
        liefertermin:    ['liefertermin','lieferdatum','liefert.','liefer termin'],
        kunde:           ['kunde','auftraggeber','auftragnehmer','client'],
        projektname:     ['kom.','kom','kommission','projektname','projekt','veranstaltung'],
        versandart:      ['versand','versandart','versandt','transport'],
        ansprechpartner: ['ansprechpartner','kontakt','contact'],
        // Finanzdaten
        preis:           ['preis','gesamtpreis','auftragswert','wert'],
        provisionBettina:['provision','prov. bettina','bettina provision','provision bettina'],
        rechnung:        ['rechnung','rechnungsbetrag','betrag','invoice'],
        marge:           ['marge','gewinn','profit','gewinnmarge'],
        interneNotizen:  ['interne notizen','notizen','notes','bemerkungen'],
      };

      // ── Datum-Parser ───────────────────────────────────
      // Unterstützte Formate:
      //   Excel-Seriennummer  46012
      //   TT.MM.JJJJ          23.03.2026
      //   TT.MM.JJ            23.03.26
      //   MM/DD/YYYY          3/23/2026   (US)
      //   MM/DD/YY            3/23/26     (US Kurzform)
      //   YYYY-MM-DD          2026-03-23  (ISO)
      // Gibt immer { str:'TT.MM.JJJJ', year, date:Date } oder null zurück.
      function parseExcelDate(raw){
        const s = String(raw ?? '').trim();
        if(!s || s.startsWith('__')) return null;

        // Hilfsfunktion: Jahr 2-stellig → 4-stellig (immer 20xx)
        const fix2 = y => y < 100 ? 2000 + y : y;

        // Hilfsfunktion: Date aus Tag/Monat/Jahr bauen und validieren
        const makeResult = (day, month, year) => {
          year = fix2(year);
          if(day < 1 || day > 31 || month < 1 || month > 12 || year < 1900) return null;
          const d = new Date(Date.UTC(year, month - 1, day));
          if(isNaN(d.getTime())) return null;
          const dd   = String(d.getUTCDate()).padStart(2,'0');
          const mm   = String(d.getUTCMonth()+1).padStart(2,'0');
          const yyyy = d.getUTCFullYear();
          return { str:`${dd}.${mm}.${yyyy}`, year:yyyy, date:d };
        };

        // ── Fall 1: Excel-Seriennummer (nur Ziffern, 4–6 Stellen) ──
        if(/^\d{4,6}$/.test(s)){
          const num = parseInt(s);
          // Excel-Epoch 1 = 01.01.1900, Korrektur für Leap-Year-Bug (+1)
          const d = new Date(Date.UTC(1899,11,30) + num * 86400000);
          if(!isNaN(d.getTime())){
            return makeResult(d.getUTCDate(), d.getUTCMonth()+1, d.getUTCFullYear());
          }
        }

        // ── Fall 2: Schrägstrich → US-Format MM/DD/YYYY oder MM/DD/YY ──
        if(s.includes('/')){
          const parts = s.split('/').map(p => parseInt(p.trim()));
          if(parts.length === 3 && parts.every(p => !isNaN(p))){
            const [month, day, year] = parts; // MM/DD/YY(YY)
            return makeResult(day, month, year);
          }
        }

        // ── Fall 3: Punkt oder Bindestrich ohne Slash ──
        // Wenn Trennzeichen Punkt → TT.MM.JJJJ (deutsch)
        // Wenn Trennzeichen Bindestrich mit Jahr vorne → ISO JJJJ-MM-TT
        const dotMatch  = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
        if(dotMatch){
          return makeResult(parseInt(dotMatch[1]), parseInt(dotMatch[2]), parseInt(dotMatch[3]));
        }

        const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if(isoMatch){
          return makeResult(parseInt(isoMatch[3]), parseInt(isoMatch[2]), parseInt(isoMatch[1]));
        }

        // ── Fallback: generisches Regex für gemischte Trennzeichen ──
        const gen = s.match(/^(\d{1,4})[.\-\/](\d{1,2})[.\-\/](\d{2,4})$/);
        if(gen){
          const a = parseInt(gen[1]), b = parseInt(gen[2]), c = parseInt(gen[3]);
          // Wenn erstes Feld 4-stellig → ISO (JJJJ-MM-TT)
          if(a > 31) return makeResult(c, b, a);
          // Sonst → deutsch TT.MM.JJJJ
          return makeResult(a, b, c);
        }

        return null; // wirklich nicht erkennbar
      }

      // cleanLabel: strip nur Doppelpunkt am Ende, Punkt BLEIBT erhalten
      // "Kom."  → "kom."  → matcht Kandidat 'kom.'
      // "Kom"   → "kom"   → matcht Kandidat 'kom'
      // "Kunde:" → "kunde"
      const cleanLabel = s => String(s).trim().replace(/:$/, '').toLowerCase();

      const kopfDaten = {};
      const kopfRaw   = [];

      for(let i = 0; i < headerRowIdx; i++){
        const row = allRows[i];

        for(let col = 0; col < row.length - 1; col++){
          const rawLabel = String(row[col] ?? '').trim();
          if(!rawLabel || rawLabel.startsWith('__')) continue;

          const labelClean = cleanLabel(rawLabel);

          let matchedKey = null;
          for(const [key, candidates] of Object.entries(KOPF_KEYS)){
            if(candidates.some(c => labelClean === c || labelClean.startsWith(c))){
              matchedKey = key;
              break;
            }
          }
          if(!matchedKey) continue;

          const rawValue = row[col + 1]; // raw — NICHT zu String konvertieren, erst nach Datum-Check
          const rawStr   = String(rawValue ?? '').trim();
          if(!rawStr || rawStr.startsWith('__')) continue;
          if(kopfDaten[matchedKey]) continue; // ersten Treffer behalten

          // Datumsfelder → parsen und normalisieren
          let finalValue = rawStr;
          if(matchedKey === 'bestelldatum' || matchedKey === 'liefertermin'){
            const parsed = parseExcelDate(rawValue ?? rawStr);
            if(parsed) finalValue = parsed.str;
            // rawValue bleibt erhalten in kopfDaten._raw für Validierung
            kopfDaten[matchedKey + '_parsed'] = parsed; // {str, year} oder null
          }

          kopfDaten[matchedKey] = finalValue;
          kopfRaw.push({ label: rawLabel.replace(/:$/, ''), value: finalValue, key: matchedKey });
        }
      }

      // ── VALIDIERUNG ─────────────────────────────────────
      const warnungen = [];
      const looksLikeName = v => /[a-zA-ZäöüÄÖÜß]{2,}/.test(v);

      // Datumsfelder: Jahr muss 4-stellig sein
      for(const field of ['bestelldatum','liefertermin']){
        const parsed = kopfDaten[field + '_parsed'];
        if(kopfDaten[field]){
          if(!parsed){
            warnungen.push(`„${field === 'bestelldatum' ? 'Bestellung' : 'Liefertermin'}": Wert „${kopfDaten[field]}" ist kein erkennbares Datum`);
          } else if(parsed.year < 1000 || String(parsed.year).length < 4){
            warnungen.push(`„${field === 'bestelldatum' ? 'Bestellung' : 'Liefertermin'}": Jahr „${parsed.year}" hat weniger als 4 Stellen – bitte prüfen`);
          }
        }
      }

      // Kunde darf kein Datum sein
      if(kopfDaten.kunde && !looksLikeName(kopfDaten.kunde)){
        warnungen.push(`„Kunde": Wert „${kopfDaten.kunde}" enthält keinen lesbaren Namen – falsche Zuordnung?`);
      }

      // Versand: wenn leer → Standardwert
      if(!kopfDaten.versandart) kopfDaten.versandart = '';

      // ── PHASE 3: Flächen-Spalten erkennen ──────────────
      const headerRow = allRows[headerRowIdx].map(c => String(c).trim());

      function findColIdx(candidates){
        return headerRow.findIndex(h =>
          h && candidates.some(c => h.toLowerCase().includes(c.toLowerCase()))
        );
      }

      // Nur Druckmaß — Sichtmaß ignorieren
      const iMotiv  = findColIdx(['motiv','fläche','flaeche','bezeichnung','pos']);
      const iBreite = findColIdx(['druckmaß breite','druckbreite','druck breite','b (mm)','b(mm)',
                                  'breite (mm)','druck b','druckb']);
      const iHoehe  = findColIdx(['druckmaß höhe','druckmaß hoehe','druckhöhe','druckhoehe',
                                  'druck höhe','h (mm)','h(mm)','höhe (mm)','druck h','druckh']);

      // Fallback: wenn spezifische Druckmaß-Spalten nicht gefunden, nehme generische Breite/Höhe
      // aber nur wenn kein "Sichtmaß" im Namen
      const iBreiteFallback = iBreite >= 0 ? iBreite : findColIdx(['breite','width']);
      const iHoeheFallback  = iHoehe  >= 0 ? iHoehe  : findColIdx(['höhe','hoehe','height']);
      const iPreis          = findColIdx(['preis','price','einzelpreis','pos.preis']);

      const colBreite = iBreite >= 0 ? iBreite : iBreiteFallback;
      const colHoehe  = iHoehe  >= 0 ? iHoehe  : iHoeheFallback;

      if(iMotiv < 0 || colBreite < 0 || colHoehe < 0){
        openModal('Spalten nicht erkannt', `
          <p style="font-size:13px;color:var(--muted);margin-bottom:10px;">
            Kopfzeile (Zeile ${headerRowIdx+1}) gefunden. Aber diese Spalten fehlen:
          </p>
          <div style="font-size:12px;display:flex;flex-direction:column;gap:3px;margin-bottom:12px;">
            <div>${iMotiv<0?'✕':'✓'} <strong>Motiv</strong> – ${iMotiv<0?'nicht gefunden':'gefunden: „'+headerRow[iMotiv]+'"'}</div>
            <div>${colBreite<0?'✕':'✓'} <strong>Druckmaß Breite</strong> – ${colBreite<0?'nicht gefunden':'gefunden: „'+headerRow[colBreite]+'"'}</div>
            <div>${colHoehe<0?'✕':'✓'} <strong>Druckmaß Höhe</strong> – ${colHoehe<0?'nicht gefunden':'gefunden: „'+headerRow[colHoehe]+'"'}</div>
          </div>
          <p style="font-size:12px;color:var(--muted);">Gefundene Spalten: ${headerRow.filter(h=>h&&!h.startsWith('__')).join(' · ')}</p>
          <div class="ma" style="margin-top:14px;"><button class="btn ghost sm" onclick="closeModal()">Schließen</button></div>
        `);
        return;
      }

      // ── PHASE 4: Flächen-Zeilen einlesen ───────────────
      const flaechenImport = [];
      let skipped = 0;

      const dataRows = allRows.slice(headerRowIdx + 1);
      dataRows.forEach((row, idx) => {
        const motiv = String(row[iMotiv]    || '').trim();
        const bRaw  = String(row[colBreite] || '').replace(',','.').trim();
        const hRaw  = String(row[colHoehe]  || '').replace(',','.').trim();

        if(!motiv || motiv.startsWith('__') || motiv.toLowerCase().includes('summe')){ skipped++; return; }
        const breite = parseFloat(bRaw);
        const hoehe  = parseFloat(hRaw);
        if(isNaN(breite) || isNaN(hoehe) || breite <= 0 || hoehe <= 0){ skipped++; return; }

        const posPreis = iPreis >= 0 ? parseFinanzWert(row[iPreis]) : null;
        flaechenImport.push({
          id: 'w'+Date.now()+idx,
          name: motiv,
          datei: null,
          bestellmass: `${breite} × ${hoehe} mm`,
          dateiMass: '',
          masseOk: false,
          abweichungOk: false,
          status: 1,
          preis: posPreis,
        });
      });

      // ── PHASE 5: IMMER NEUEN AUFTRAG ERSTELLEN ──────────
      const kunde       = kopfDaten.kunde        || '';
      const bestelldat  = kopfDaten.bestelldatum  || '';
      const lieferterm  = kopfDaten.liefertermin  || '';
      const projektname = kopfDaten.projektname   || '';
      const versandart  = kopfDaten.versandart    || '';

      // Titel = Kunde + " – " + Kom.  (kein Datum im Titel)
      let auftragsName = '';
      if(kunde && projektname){
        auftragsName = `${kunde} – ${projektname}`;
      } else if(kunde){
        auftragsName = kunde;
      } else if(projektname){
        auftragsName = projektname;
      } else {
        auftragsName = `Import ${new Date().toLocaleDateString('de-DE')}`;
      }

      const newProj = {
        id:    'p'+Date.now(),
        name:  auftragsName,
        kunde: kunde || '–',
        deadline: lieferterm || '',
        status: 'Neu',
        auftragsInfo: {
          bestelldatum: bestelldat,
          liefertermin: lieferterm,
          kunde,
          projektname,
          versandart,
          ansprechpartner: kopfDaten.ansprechpartner || '',
          _importiert: new Date().toLocaleString('de-DE'),
        },
        finanz: {
          preis:            parseFinanzWert(kopfDaten.preis),
          provisionBettina: parseFinanzWert(kopfDaten.provisionBettina),
          rechnung:         parseFinanzWert(kopfDaten.rechnung),
          marge:            parseFinanzWert(kopfDaten.marge),
          interneNotizen:   kopfDaten.interneNotizen || null,
        },
        waende: flaechenImport,
      };

      // Standard-Team (inkl. Bettina / Legacy-ZH nur beim Excel-Import)
      applyStandardZuweisungen(newProj, null, null, true);

      // Dubletten-Schutz: Prüfen, ob Projekt bereits existiert
      const existing = findExistingProject({
        kunde: kopfDaten.kunde,
        projektname: kopfDaten.projektname,
        liefertermin: lieferterm
      });

      if (existing) {
        activeProjId = existing.id;
        toast('Projekt bereits vorhanden', 'Das Projekt wurde bereits importiert und wird nun geöffnet.');
      } else {
        newProj.waende.forEach(w => recalc(w));
        MesseFlowState.projects.push(newProj);
        activeProjId = newProj.id;
      }

      refreshProjectUI();

      // ── Warnungs-Block
      const warnHTML = warnungen.length ? `
        <div style="background:var(--sy);border:1px solid #fde68a;border-radius:8px;padding:11px 14px;margin-bottom:14px;">
          <div style="font-weight:700;color:#92400e;margin-bottom:5px;">⚠ Kopfdaten konnten nicht sauber gelesen werden</div>
          ${warnungen.map(w=>`<div style="font-size:12px;color:#78350f;margin-bottom:2px;">• ${w}</div>`).join('')}
          <div style="font-size:11px;color:#92400e;margin-top:6px;">Bitte im Projekt manuell prüfen und korrigieren.</div>
        </div>` : '';

      // ── Auftragsdaten-Tabelle — sauber gelabelt, nur bekannte Felder
      const kopfFelderAnzeige = [
        {key:'kunde',            label:'Kunde'},
        {key:'projektname',      label:'Kommission / Projekt'},
        {key:'bestelldatum',     label:'Bestelldatum'},
        {key:'liefertermin',     label:'Liefertermin'},
        {key:'versandart',       label:'Versand'},
        {key:'ansprechpartner',  label:'Ansprechpartner'},
      ];
      const kopfHTML = kopfFelderAnzeige.some(f => kopfDaten[f.key]) ? `
        <div style="margin-bottom:14px;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:6px;">Erkannte Auftragsdaten</div>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            ${kopfFelderAnzeige.filter(f=>kopfDaten[f.key]).map(f=>`<tr>
              <td style="padding:4px 10px 4px 0;color:var(--muted);white-space:nowrap;font-size:12px;width:40%;">${f.label}</td>
              <td style="padding:4px 0;font-weight:600;">${kopfDaten[f.key]}</td>
            </tr>`).join('')}
          </table>
        </div>` : '';

      const previewRows = flaechenImport.map(f=>`
        <tr>
          <td style="padding:5px 10px;font-weight:600;font-size:13px;">${f.name}</td>
          <td style="padding:5px 10px;font-family:monospace;font-size:13px;">${f.bestellmass}</td>
          <td style="padding:5px 10px;font-size:12px;color:var(--green);font-weight:700;">✓ Neu</td>
        </tr>`).join('');

      openModal('Auftrag erstellt ✓', `
        <div style="background:var(--sg);border:1px solid #86efac;border-radius:8px;padding:12px 14px;margin-bottom:14px;">
          <div style="font-weight:700;color:var(--green);font-size:14px;margin-bottom:3px;">1 Auftrag erstellt</div>
          <div style="font-size:13px;color:#166534;font-weight:600;">${auftragsName}</div>
          <div style="font-size:12px;color:#166534;margin-top:2px;">${flaechenImport.length} Fläche${flaechenImport.length!==1?'n':''} angelegt · ${skipped} übersprungen</div>
        </div>
        ${warnHTML}
        ${kopfHTML}
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:6px;">Flächen (${flaechenImport.length})</div>
        <div style="overflow-x:auto;max-height:220px;overflow-y:auto;">
          <table style="width:100%;border-collapse:collapse;">
            <thead><tr style="background:#f9fafb;position:sticky;top:0;">
              <th style="text-align:left;padding:5px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);">Motiv</th>
              <th style="text-align:left;padding:5px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);">Bestellmaß</th>
              <th></th>
            </tr></thead>
            <tbody>${previewRows}</tbody>
          </table>
        </div>
        <div class="ma" style="margin-top:14px;">
          <button class="btn primary sm" onclick="closeModal()">Los geht's →</button>
        </div>`);

      const warnToast = warnungen.length ? ' · ⚠ Kopfdaten prüfen' : '';
      toast('Auftrag erstellt', `${auftragsName} · ${flaechenImport.length} Flächen${warnToast}`, warnungen.length ? 'ty' : 'tg');
      pushNotif(newProj.id, `Neuer Auftrag: ${auftragsName} · ${flaechenImport.length} Flächen importiert`);

    } catch(err){
      toast('Fehler', 'Excel konnte nicht gelesen werden: '+err.message);
      console.error(err);
    }
  };
  reader.readAsArrayBuffer(file);
}

window.importExcel = importExcel;
