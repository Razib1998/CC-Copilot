#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════
// CC INTERN → COCKPIT UMZUG
// Schritt 2: Kunden + CRM-Aktivitäten importieren (KORRIGIERT)
// ─────────────────────────────────────────────────────────────────────
// Datei:   scripts/02_import_kunden.js
// Zweck:   kunden.json → firmen + ccintern_kunden_extra + crm_aktivitaeten
//
// Korrekturen gegenüber v1:
//   ✅ adresse → strasse (echte firmen-Spalte)
//   ✅ notiz → interne_notiz (echte firmen-Spalte)
//   ✅ ap ("Hr. Bergmann") → anrede + nachname (gesplittet)
//   ✅ CC-Intern-Extras → ccintern_kunden_extra (nicht firmen)
//   ✅ firmen.id = deterministisch aus Objekt-Key (Hash) — idempotenter Re-Import
//   ✅ crm_aktivitaeten.id = randomUUID() (original_id bewahrt "A001" etc.)
//   ✅ ico wird NICHT gespeichert (Frontend-Darstellung, kein DB-Feld)
//
// REIHENFOLGE: IMMER nach 01_schema_migration.sql ausführen!
//
// Aufruf:
//   node 02_import_kunden.js                  → SQL-Ausgabe (dry run / Prüfung)
//   node 02_import_kunden.js --execute        → direkt in SQLite schreiben
//   node 02_import_kunden.js --output sql     → SQL-Datei erzeugen
//
// Vor --execute: MITARBEITER_MAP mit echten UUIDs befüllen!
//   SQL: SELECT id, name FROM users;
//
// WICHTIG: Vor produktivem Import MUSS MITARBEITER_MAP befüllt werden (echte users.id).
//          NULL-Werte sind für Tests erlaubt, liefern dann mitarbeiter_id = NULL (Rohname bleibt).
// ══════════════════════════════════════════════════════════════════════

'use strict';

const fs   = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

/** Nur einen Kunden für SQL-Testlauf (kein --execute nötig). */
const TEST_MODE = true;
/** Objekt-Key aus kunden.json; leer → erster Key laut Datei-Reihenfolge. */
const TEST_KUNDE = 'Ruhrbahn';

// ── Konfiguration ─────────────────────────────────────────────────────
const CONFIG = {
  kundenJsonPath: path.join(__dirname, '../daten/kunden.json'),
  // Test-Import: lokale SQLite-Datei neben diesem Skript (Pfad bei Bedarf anpassen)
  dbPath: path.join(__dirname, '../../CC Cockpit/backend/data/cc-cockpit.db'),
  outputSqlPath: path.join(__dirname, '..', 'test_import.sql'),
  dryRun:         !process.argv.includes('--execute'),
  outputSql:      process.argv.includes('--output') && process.argv[process.argv.indexOf('--output') + 1] === 'sql',
};

// ══════════════════════════════════════════════════════════════════════
// MITARBEITER_MAP — MANUELL BEFÜLLEN VOR IMPORT
// ══════════════════════════════════════════════════════════════════════
//
// ** Vor produktivem Import MUSS MITARBEITER_MAP befüllt werden ** (users.id je Name).
//    NULL ist technisch erlaubt (mitarbeiter_id bleibt NULL, mitarbeiter_raw bleibt erhalten).
//
//
// Diese Map verknüpft Mitarbeiternamen aus CC-Intern-Aktivitäten
// mit den echten users.id UUIDs aus der Cockpit-Datenbank.
//
// VOR dem Import ausführen:
//   SELECT id, name FROM users;
//   → Ergebnis hier eintragen (rechts von dem jeweiligen Namen)
//
// Namen stammen aus kunden.json → aktivitaeten[].ma
// Vollständig ermittelt am 2026-04-17 aus allen 8 Firmen-Einträgen:
//
// ┌─────────────┬──────────────────────────────────────────┐
// │ CC-Intern   │ users.id (UUID aus Cockpit-DB eintragen) │
// ├─────────────┼──────────────────────────────────────────┤
// │ Celal       │ ← TODO                                   │
// │ Elvan       │ ← TODO                                   │
// │ Muhammet    │ ← TODO                                   │
// │ Zint        │ ← TODO                                   │
// └─────────────┴──────────────────────────────────────────┘
//
// Fallback-Verhalten wenn ein Name NICHT gemappt ist (null):
//   → mitarbeiter_id = NULL in crm_aktivitaeten
//   → mitarbeiter_raw = Originalname bleibt erhalten (KEIN Datenverlust)
//   → Import bricht NICHT ab — Aktivität wird trotzdem importiert
//   → Nachträglich korrigierbar per UPDATE crm_aktivitaeten SET mitarbeiter_id = '...' WHERE mitarbeiter_raw = '...'
//
const MITARBEITER_MAP = {
  'Celal':    null,   // ← TODO: UUID aus users.id eintragen (SELECT id, name FROM users;)
  'Elvan':    null,   // ← TODO: UUID aus users.id eintragen
  'Muhammet': null,   // ← TODO: UUID aus users.id eintragen
  'Zint':     null,   // ← TODO: UUID aus users.id eintragen
  //
  // Falls weitere Namen auftauchen (z.B. bei erweiterter kunden.json):
  // 'NeuerName': null,  // ← TODO
};

// ── Hilfsfunktionen ───────────────────────────────────────────────────

/**
 * "Hr. Bergmann" → { anrede: "Hr.", nachname: "Bergmann" }
 * "Fr. Weber"    → { anrede: "Fr.", nachname: "Weber" }
 * "Max Mustermann" (ohne Anrede) → { anrede: null, nachname: "Max Mustermann" }
 */
function splitAnsprechpartner(ap) {
  if (!ap || typeof ap !== 'string') return { anrede: null, nachname: null };
  const trim = ap.trim();
  const anredePatterns = ['Hr.', 'Fr.', 'Herr', 'Frau', 'Dr.', 'Prof.'];
  for (const a of anredePatterns) {
    if (trim.startsWith(a + ' ') || trim === a) {
      const rest = trim.slice(a.length).trim();
      return { anrede: a, nachname: rest || null };
    }
  }
  // Keine erkannte Anrede → alles als Nachname
  return { anrede: null, nachname: trim };
}

/**
 * SQL-String escapen (einfaches Anführungszeichen verdoppeln)
 */
function sqlEscape(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : 'NULL';
  return "'" + String(val).replace(/'/g, "''") + "'";
}

/**
 * Leeren String zu NULL normalisieren
 */
function emptyToNull(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s === '' ? null : s;
}

/**
 * Zahl aus number oder String ("12", " 3 ") — sonst null.
 * @param {unknown} val
 * @returns {number|null}
 */
function toNumber(val) {
  if (val == null || val === '') return null;
  const n = Number(val);
  return Number.isNaN(n) ? null : n;
}

/**
 * Einfacher String-Hash (deterministisch) für firma_*-IDs.
 * @param {string} s
 * @returns {string}
 */
function hashName(s) {
  const str = String(s);
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h = (h << 5) - h + c;
    h |= 0;
  }
  const hex = ('00000000' + Math.abs(h).toString(16)).slice(-8);
  return hex;
}

/**
 * Deterministische firmen.id aus Firmen-/Objekt-Key (kein randomUUID).
 * @param {string} nameOrKey
 * @returns {string}
 */
function deterministicFirmaId(nameOrKey) {
  return 'firma_' + hashName(nameOrKey);
}

/**
 * umsatz: TEXT in DB — Zahl parsen wenn möglich, sonst Originalstring.
 * @param {unknown} val
 * @returns {string|null}
 */
function umsatzForDb(val) {
  const n = toNumber(val);
  if (n !== null) return String(n);
  return emptyToNull(val);
}

// ── Hauptlogik ────────────────────────────────────────────────────────

function run() {
  console.log('═══════════════════════════════════════════════════════');
  console.log(' CC INTERN → COCKPIT Import-Skript v2 (KORRIGIERT)');
  console.log(' Modus:', CONFIG.dryRun ? 'DRY RUN (kein DB-Zugriff)' : 'EXECUTE');
  console.log('═══════════════════════════════════════════════════════\n');

  // Kunden-JSON laden
  if (!fs.existsSync(CONFIG.kundenJsonPath)) {
    console.error('FEHLER: kunden.json nicht gefunden:', CONFIG.kundenJsonPath);
    process.exit(1);
  }

  const kundenObj = JSON.parse(fs.readFileSync(CONFIG.kundenJsonPath, 'utf-8'));
  const kundenKeys = Object.keys(kundenObj);
  console.log(`✓ kunden.json geladen — ${kundenKeys.length} Firmen\n`);

  let keysToProcess = kundenKeys;
  if (TEST_MODE) {
    const only = (TEST_KUNDE && String(TEST_KUNDE).trim()) || kundenKeys[0];
    if (!only || !Object.prototype.hasOwnProperty.call(kundenObj, only)) {
      console.error('FEHLER: TEST_KUNDE nicht in kunden.json:', only);
      process.exit(1);
    }
    keysToProcess = [only];
    console.log(`TEST_MODE: nur Kunde "${only}" (${keysToProcess.length} von ${kundenKeys.length})\n`);
  }

  const firmenInserts         = [];
  const ccInternExtraInserts  = [];
  const aktivitaetInserts     = [];

  for (const key of keysToProcess) {
    const k = kundenObj[key];
    const firmaKey = String(key).trim();
    const firmaId = deterministicFirmaId(firmaKey);

    // ── AP splitten ─────────────────────────────────────────────────
    const { anrede, nachname } = splitAnsprechpartner(k.ap);

    // ── firmen INSERT ────────────────────────────────────────────────
    // Spalten-Mapping (verifiziert gegen echte schema.sql):
    //   adresse → strasse (NICHT adresse!)
    //   notiz   → interne_notiz (NICHT notiz!)
    //   ap      → ansprechpartner_anrede + ansprechpartner_nachname (GESPLITTET)
    const firmaSQL = `INSERT OR IGNORE INTO firmen (
  id, name, strasse, plz, stadt,
  telefon, email, status,
  ansprechpartner_anrede, ansprechpartner_nachname,
  interne_notiz
) VALUES (
  ${sqlEscape(firmaId)},
  ${sqlEscape(emptyToNull(k.name || key))},
  ${sqlEscape(emptyToNull(k.adresse))},
  ${sqlEscape(emptyToNull(k.plz))},
  ${sqlEscape(emptyToNull(k.stadt))},
  ${sqlEscape(emptyToNull(k.tel))},
  ${sqlEscape(emptyToNull(k.mail))},
  ${sqlEscape(emptyToNull(k.status) || 'Aktiv')},
  ${sqlEscape(anrede)},
  ${sqlEscape(nachname)},
  ${sqlEscape(emptyToNull(k.notiz))}
);`;
    firmenInserts.push(firmaSQL.trim());

    // ── ccintern_kunden_extra INSERT ─────────────────────────────────
    // CC-Intern-spezifische Felder kommen HIER rein (nicht in firmen!)
    // Neue Spalten: ap_funktion, branche, umsatz, auftragsvolumen, fahrzeuge, letzter_kontakt, naechste_aktion
    const extraSQL = `INSERT OR REPLACE INTO ccintern_kunden_extra (
  firma_id, crm_status, betreuer,
  ap_funktion, branche, umsatz, auftragsvolumen, fahrzeuge,
  letzter_kontakt, naechste_aktion,
  updated_at
) VALUES (
  ${sqlEscape(firmaId)},
  NULL,
  NULL,
  ${sqlEscape(emptyToNull(k.apFunktion))},
  ${sqlEscape(emptyToNull(k.branche))},
  ${sqlEscape(umsatzForDb(k.umsatz))},
  ${sqlEscape(toNumber(k.auftragsvolumen))},
  ${sqlEscape(toNumber(k.fahrzeuge))},
  ${sqlEscape(emptyToNull(k.letzterKontakt))},
  ${sqlEscape(emptyToNull(k.naechsteAktion))},
  datetime('now')
);`;
    ccInternExtraInserts.push(extraSQL.trim());

    console.log(`  ✓ firmen: ${key} → ${firmaId}`);
    console.log(`    AP: "${k.ap}" → anrede="${anrede}", nachname="${nachname}"`);

    // ── crm_aktivitaeten INSERTs ─────────────────────────────────────
    const aktivitaeten = Array.isArray(k.aktivitaeten) ? k.aktivitaeten : [];
    for (const a of aktivitaeten) {
      const maName        = a.ma || null;
      const mitarbeiterId = maName ? (MITARBEITER_MAP[maName] || null) : null;

      if (maName && !Object.prototype.hasOwnProperty.call(MITARBEITER_MAP, maName)) {
        console.warn(`    ⚠  Unbekannter Mitarbeiter: "${maName}" → mitarbeiter_id = NULL`);
      }

      // ⚠️ WICHTIG: randomUUID() — original_id bewahrt den CC-Intern-Key "A001" etc.
      // "A001" ist NICHT global unique (mehrere Firmen können "A001" haben)
      const aktivId = randomUUID();

      // ico (Emoji) wird NICHT gespeichert — ist Frontend-Darstellung, kein Datenwert
      const aktivSQL = `INSERT OR IGNORE INTO crm_aktivitaeten (
  id, original_id, kunde_id, typ, datum, zeit,
  mitarbeiter_id, mitarbeiter_raw,
  notiz, wiedervorlage, wv_aufgabe
) VALUES (
  ${sqlEscape(aktivId)},
  ${sqlEscape(emptyToNull(a.id))},
  ${sqlEscape(firmaId)},
  ${sqlEscape(emptyToNull(a.typ) || 'Unbekannt')},
  ${sqlEscape(emptyToNull(a.datum))},
  ${sqlEscape(emptyToNull(a.zeit))},
  ${sqlEscape(mitarbeiterId)},
  ${sqlEscape(maName)},
  ${sqlEscape(emptyToNull(a.notiz))},
  ${sqlEscape(emptyToNull(a.wv))},
  ${sqlEscape(emptyToNull(a.wvAufgabe))}
);`;
      aktivitaetInserts.push(aktivSQL.trim());
      console.log(`    ✓ aktivität: ${a.id} (${a.typ}, ${a.datum}, MA: ${maName || '—'})`);
    }
  }

  // ── Zusammenfassung ────────────────────────────────────────────────
  console.log(`\n═══════════════════════════════════════════════════════`);
  console.log(` firmen-Inserts:            ${firmenInserts.length}`);
  console.log(` ccintern_kunden_extra:     ${ccInternExtraInserts.length}`);
  console.log(` crm_aktivitaeten-Inserts:  ${aktivitaetInserts.length}`);
  console.log(`═══════════════════════════════════════════════════════\n`);

  // ── SQL zusammenbauen ──────────────────────────────────────────────
  const fullSQL = [
    '-- CC INTERN → COCKPIT Import (v2 KORRIGIERT)',
    '-- Generiert: ' + new Date().toISOString(),
    '-- REIHENFOLGE: firmen → ccintern_kunden_extra → crm_aktivitaeten',
    '',
    '-- ── 1. firmen ──────────────────────────────────────────────',
    ...firmenInserts.map(s => s + '\n'),
    '',
    '-- ── 2. ccintern_kunden_extra ──────────────────────────────',
    ...ccInternExtraInserts.map(s => s + '\n'),
    '',
    '-- ── 3. crm_aktivitaeten ───────────────────────────────────',
    ...aktivitaetInserts.map(s => s + '\n'),
  ].join('\n');

  // SQL-Datei schreiben
  if (CONFIG.outputSql) {
    fs.writeFileSync(CONFIG.outputSqlPath, fullSQL, 'utf-8');
    console.log('✓ SQL gespeichert:', CONFIG.outputSqlPath);
  }

  if (!CONFIG.dryRun) {
    try {
      const Database = require('better-sqlite3');
      if (!fs.existsSync(CONFIG.dbPath)) {
        console.error('FEHLER: DB nicht gefunden:', CONFIG.dbPath);
        process.exit(1);
      }
      const db = new Database(CONFIG.dbPath);
      const allStatements = [...firmenInserts, ...ccInternExtraInserts, ...aktivitaetInserts];
      const tx = db.transaction(() => {
        for (const s of allStatements) db.prepare(s).run();
      });
      tx();
      db.close();
      console.log('✅ Import abgeschlossen!');
    } catch (err) {
      console.error('❌ DB-Fehler:', err.message);
      if (err.message.includes('Cannot find module')) console.log('Tipp: npm install better-sqlite3');
      process.exit(1);
    }
  } else {
    console.log('DRY RUN abgeschlossen. Kein DB-Zugriff.');
    console.log('→ SQL prüfen: node 02_import_kunden.js --output sql');
    console.log('→ Ausführen:  node 02_import_kunden.js --execute');
  }
}

run();