-- CC INTERN → COCKPIT Import (v2 KORRIGIERT)
-- Generiert: 2026-04-17T13:27:19.182Z
-- REIHENFOLGE: firmen → ccintern_kunden_extra → crm_aktivitaeten

-- ── 1. firmen ──────────────────────────────────────────────
INSERT OR IGNORE INTO firmen (
  id, name, strasse, plz, stadt,
  telefon, email, status,
  ansprechpartner_anrede, ansprechpartner_nachname,
  interne_notiz
) VALUES (
  'firma_2b45f1b2',
  'Ruhrbahn GmbH',
  'Schildsehe 69',
  '45127',
  'Essen',
  '+49 201 826-1200',
  'bergmann@ruhrbahn.de',
  'Aktiv',
  'Hr.',
  'Bergmann',
  'Jahresvertrag bis 12/2026. Q3-Planung anstehend.'
);


-- ── 2. ccintern_kunden_extra ──────────────────────────────
INSERT OR REPLACE INTO ccintern_kunden_extra (
  firma_id, crm_status, betreuer,
  ap_funktion, branche, umsatz, auftragsvolumen, fahrzeuge,
  letzter_kontakt, naechste_aktion,
  updated_at
) VALUES (
  'firma_2b45f1b2',
  NULL,
  NULL,
  'Leiter Fuhrpark',
  'ÖPNV',
  '€ 128.400',
  12,
  48,
  'Heute',
  'Q3-Planung besprechen',
  datetime('now')
);


-- ── 3. crm_aktivitaeten ───────────────────────────────────
INSERT OR IGNORE INTO crm_aktivitaeten (
  id, original_id, kunde_id, typ, datum, zeit,
  mitarbeiter_id, mitarbeiter_raw,
  notiz, wiedervorlage, wv_aufgabe
) VALUES (
  '2f3be068-7e5f-4f86-8214-17520c760245',
  'A001',
  'firma_2b45f1b2',
  'Anruf',
  '2026-03-21',
  '10:00',
  NULL,
  'Muhammet',
  'Q3 Planung besprochen. Bergmann möchte Angebot bis Ende April.',
  NULL,
  NULL
);

INSERT OR IGNORE INTO crm_aktivitaeten (
  id, original_id, kunde_id, typ, datum, zeit,
  mitarbeiter_id, mitarbeiter_raw,
  notiz, wiedervorlage, wv_aufgabe
) VALUES (
  '3e7e1b88-9e3e-484c-8940-391cbd5d018f',
  'A002',
  'firma_2b45f1b2',
  'E-Mail',
  '2026-03-15',
  '14:00',
  NULL,
  'Elvan',
  'Jahresvertrag 2026 per Mail bestätigt.',
  NULL,
  NULL
);
