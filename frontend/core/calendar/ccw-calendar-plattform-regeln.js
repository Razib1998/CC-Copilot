/**
 * Cockpit-Kalender — verbindliche Plattform-Regeln (CC Plattform, April 2026).
 * Inhalt entspricht `Tabellen_CC/Kalender_Regeln_CC_Plattform.docx`: Architekturvertrag
 * für alle weiteren Kalender-Erweiterungen. Keine fachliche Logik — nur Normierung
 * und Referenz für Leser, Reviews und spätere API-Anbindung.
 */

/** Kalender erzeugt keine eigenen fachlichen Objekte — nur Anzeige auf Kern-Daten. */
export const KALENDER_IST_NUR_SICHT = true;

/**
 * Die fünf Regeln (Fehler, die nicht passieren dürfen).
 * @type {ReadonlyArray<{ id: number; titel: string; verbot: string; erlaubt: string[]; folgerung: string }>}
 */
export const KALENDER_PLATTFORM_REGELN = Object.freeze([
  {
    id: 1,
    titel: 'Kalender darf keine eigene Wahrheit werden',
    verbot: 'Termine im Kalender separat speichern, ändern oder erfinden.',
    erlaubt: ['Auftrag bleibt Quelle', 'Schaden bleibt Quelle', 'Montage bleibt Quelle', 'Deadline bleibt Quelle'],
    folgerung: 'Kalender zeigt nur an.',
  },
  {
    id: 2,
    titel: 'Keine doppelte Terminpflege',
    verbot: 'Denselben Termin in Cockpit, CC Intern, FUSA und Mobile separat bearbeiten.',
    erlaubt: [
      'Ein Feld ändern = überall sofort sichtbar',
      'Nicht: überall einzeln nachziehen',
      'Keine parallelen Terminfelder in verschiedenen Modulen',
    ],
    folgerung: 'Eine Quelle — eine Änderung — überall sichtbar.',
  },
  {
    id: 3,
    titel: 'Keine Sonderlogik nur für den Kalender',
    verbot: 'Extra Kalender-Status, -IDs, -Rechte oder eigene Kalender-Datenstruktur.',
    erlaubt: [
      'Kein extra Kalender-Status',
      'Keine extra Kalender-ID',
      'Keine extra Kalender-Rechte',
      'Kein separates Kalender-Datenmodell',
      'Nur Mapping auf Core-Daten (Aufträge, Schäden, Montage, Deadlines)',
    ],
    folgerung: 'Kalender braucht keine eigene Fachlogik — nur Mapping.',
  },
  {
    id: 4,
    titel: 'Rechte nicht nur optisch lösen',
    verbot: 'Nutzer sieht Daten, die er ohne Recht nicht sehen dürfte — nur weil ein Button fehlt.',
    erlaubt: [
      'Preise nicht ohne Preisrecht',
      'Interne Notizen nur mit Recht',
      'Fremde Projekte nur mit Projektzugriff',
      'Backend prüft Rechte vor der Ausgabe — nicht das Frontend',
    ],
    folgerung: 'Rechte greifen vor dem Anzeigen, nicht per ausgeblendetem Button.',
  },
  {
    id: 5,
    titel: 'Mobile und Desktop nicht vermischen',
    verbot: 'Auf dem Handy denselben vollen Planer wie auf Desktop.',
    erlaubt: [
      'Desktop = Gesamtplanung, Übersicht, Ressourcen, Konflikte',
      'Mobile = Meine Termine, Aufgaben, Status, Foto, Start–Stopp',
      'Keine komplexe Mehrwochen-Planung auf Mobilgeräten',
    ],
    folgerung: 'Mobil = Ausführung. Desktop = Planung.',
  },
]);

/**
 * Erlaubte Kern-Objekte (Quellen-Sicht): Kalender darf ausschließlich darauf abbilden,
 * er erzeugt keine eigenen fachlichen Datensätze.
 * @type {ReadonlyArray<{ kern: string; nutztKalender: string; kalenderTutNicht: string }>}
 */
export const KALENDER_ERLAUBTE_KERN_QUELLEN = Object.freeze([
  {
    kern: 'Aufträge',
    nutztKalender: 'Datum, Titel, Typ, Projekt, Status',
    kalenderTutNicht: 'Keinen Auftrag anlegen oder ändern',
  },
  {
    kern: 'Montage',
    nutztKalender: 'Datum, Fahrzeug, Mitarbeiter, Typ',
    kalenderTutNicht: 'Keine Montage anlegen oder ändern',
  },
  {
    kern: 'Schäden',
    nutztKalender: 'Datum, Fahrzeug, Schwere, Status',
    kalenderTutNicht: 'Keinen Schaden anlegen oder ändern',
  },
  {
    kern: 'Aufgaben',
    nutztKalender: 'Fälligkeit, Titel, Zuständig, Projekt',
    kalenderTutNicht: 'Keine Aufgabe anlegen oder ändern',
  },
  {
    kern: 'Projektdeadlines',
    nutztKalender: 'Meilenstein-Datum, Projektname',
    kalenderTutNicht: 'Keine Deadline setzen oder ändern',
  },
]);

export const KALENDER_MERKSATZ =
  'Der Kalender ist eine Sicht auf bestehende Daten — keine eigene Fachwelt.';

/**
 * Kurzreferenz für Logs oder Dev-Tools (optional).
 * @returns {string}
 */
export function formatKalenderPlattformRegelnKurz() {
  const r = KALENDER_PLATTFORM_REGELN.map(x => `R${x.id}: ${x.titel}`).join('\n');
  const q = KALENDER_ERLAUBTE_KERN_QUELLEN.map(x => `- ${x.kern}: ${x.nutztKalender}`).join('\n');
  return `${KALENDER_MERKSATZ}\n\n${r}\n\nErlaubte Kern-Quellen:\n${q}`;
}
