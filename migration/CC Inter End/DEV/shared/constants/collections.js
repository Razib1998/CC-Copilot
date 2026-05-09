/**
 * CC Intern — Collection-Konstanten
 * Zentrale Quelle für KEY_MAP und Collection-Namen.
 * Gespiegelt aus server.js — bei Änderungen synchron halten.
 */

export const KEY_MAP = {
  'cc_intern_auftraege_v1':      'auftraege',
  'cc_intern_fusa_v1':           'fusa_termine',
  'cc_intern_ma_v1':             'mitarbeiter',
  'cc_intern_aufgaben_v1':       'aufgaben',
  'cc_intern_anwesenheit_v1':    'anwesenheit',
  'cc_intern_urlaub_v1':         'urlaub',
  'cc_urlaub_v1':                'urlaub',
  'cc_intern_leads_v1':          'leads',
  'cc_intern_lager_v1':          'lager',
  'cc_intern_lager_cc_v1':       'lager',
  'cc_intern_rechnungen_v1':     'rechnungen',
  'cc_intern_kunden_v1':         'kunden',
  'cc_intern_kunden_v2':         'kunden',
  'cc_intern_lieferanten_v1':    'lieferanten',
  'cc_intern_angebote_v1':      'angebote',
  'cc_intern_anfragen_v1':      'anfragen',
  'cc_intern_cl_vorlagen_v1':   'cl_vorlagen',
};

export const COLLECTIONS = {
  AUFTRAEGE:    'auftraege',
  ANGEBOTE:     'angebote',
  AUFGABEN:     'aufgaben',
  MITARBEITER:  'mitarbeiter',
  KUNDEN:       'kunden',
  LEADS:        'leads',
  LAGER:        'lager',
  RECHNUNGEN:   'rechnungen',
  LIEFERANTEN:  'lieferanten',
  ANWESENHEIT:  'anwesenheit',
  URLAUB:       'urlaub',
  NOTIFICATIONS:'notifications',
  ANFRAGEN:     'anfragen',
  CL_VORLAGEN:  'cl_vorlagen',
};

// Collections die automatisch Notifications auslösen
export const NOTIF_COLLECTIONS = ['auftraege', 'aufgaben', 'urlaub', 'anwesenheit'];
