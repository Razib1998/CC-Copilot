// ═══════════════════════════════════════════════════════
// MESSEFLOW → CC INTERN ÜBERGABE
// ═══════════════════════════════════════════════════════
//
// FLOW (ein durchgehender Auftrag, kein zweites System):
//
//   MesseFlow-Projekt
//     └─ Alle Wände an Caldera exportiert  ← TRIGGER
//          └─ ccinternAuftrag angelegt (am Projekt gespeichert)
//               └─ kalenderEintrag daraus erzeugt
//                    └─ Lieferung + Fotos direkt am Auftrag
//
// STATUS: intern (detailliert) vs. extern (einfach)
//   intern: Übergeben → In Bearbeitung → Druck läuft →
//           Fertig produziert → Verpackt → Unterwegs → Geliefert
//   extern: Zum Druck → Wird gedruckt → Unterwegs → Geliefert
//
// VERKNÜPFUNG (in project.ccinternAuftrag):
//   sourceSystem  = 'messeflow'
//   sourceId      = MesseFlow-Projekt-ID
//   id            = CC-JJJJ-NNNN
//
// FOTOS: direkt am Auftrag in lieferung.fotos[]
//   { ccinternOrderId, zeitpunkt, hochgeladenVon, typ, dateiname, datenUrl }
// ═══════════════════════════════════════════════════════

// ── Status-Definitionen ──────────────────────────────────────────────────────

/** Interner CC-Workflow: detaillierte Produktionsschritte */
const MF_CC_STATUS_INTERN = [
  'Übergeben',        // von MesseFlow übergeben
  'In Bearbeitung',   // cc_intern nimmt den Auftrag an
  'Druck läuft',      // in Caldera / am Drucker
  'Fertig produziert',// Druck abgeschlossen
  'Verpackt',         // bereit für Versand
  'Unterwegs',        // beim Kunden / Montage unterwegs
  'Geliefert',        // abgeschlossen
];

/**
 * Externer Status — was Agentur / Zwischenhändler / Produktion sehen.
 * Einfache, klare Begriffe — keine internen Details.
 */
const MF_CC_STATUS_EXTERN_MAP = {
  'Übergeben':         'Zum Druck',
  'In Bearbeitung':    'Wird gedruckt',
  'Druck läuft':       'Wird gedruckt',
  'Fertig produziert': 'Wird gedruckt',
  'Verpackt':          'Unterwegs',
  'Unterwegs':         'Unterwegs',
  'Geliefert':         'Geliefert',
};

/** Farb-Metadaten für interne Status-Badges */
const MF_CC_STATUS_META = {
  'Übergeben':         { cl: '#92400e', bg: '#fef3c7', bd: '#f59e0b' },
  'In Bearbeitung':    { cl: '#1e40af', bg: '#eff6ff', bd: '#93c5fd' },
  'Druck läuft':       { cl: '#6b21a8', bg: '#faf5ff', bd: '#d8b4fe' },
  'Fertig produziert': { cl: '#065f46', bg: '#ecfdf5', bd: '#6ee7b7' },
  'Verpackt':          { cl: '#1e40af', bg: '#eff6ff', bd: '#93c5fd' },
  'Unterwegs':         { cl: '#92400e', bg: '#fff7ed', bd: '#fdba74' },
  'Geliefert':         { cl: '#166534', bg: '#f0fdf4', bd: '#86efac' },
};

window.MF_CC_STATUS_INTERN      = MF_CC_STATUS_INTERN;
window.MF_CC_STATUS_EXTERN_MAP  = MF_CC_STATUS_EXTERN_MAP;
window.MF_CC_STATUS_META        = MF_CC_STATUS_META;

// ── ID-Generator ─────────────────────────────────────────────────────────────

/**
 * Erzeugt die nächste interne CC-Auftrags-ID: CC-JJJJ-NNNN
 * Ableitung aus vorhandenen IDs — kein separater Zähler im State nötig.
 */
function mfNextCcInternId() {
  const year = new Date().getFullYear();
  let max = 0;
  (MesseFlowState.projects || []).forEach(p => {
    const id = p.ccinternAuftrag?.id;
    if (id) {
      const m = id.match(/^CC-(\d{4})-(\d+)$/);
      if (m && parseInt(m[1]) === year) max = Math.max(max, parseInt(m[2]));
    }
  });
  return `CC-${year}-${String(max + 1).padStart(4, '0')}`;
}

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────

/**
 * Externen Status aus internem ableiten.
 */
function mfCcExternStatus(internStatus) {
  return MF_CC_STATUS_EXTERN_MAP[internStatus] || internStatus;
}

/**
 * Nächster interner Status in der Kette (oder null wenn letzter).
 */
function mfCcNextStatus(aktuellerStatus) {
  const idx = MF_CC_STATUS_INTERN.indexOf(aktuellerStatus);
  if (idx < 0 || idx >= MF_CC_STATUS_INTERN.length - 1) return null;
  return MF_CC_STATUS_INTERN[idx + 1];
}

/**
 * Prüft ob ALLE exportierbaren Wände eines Projekts nach Caldera übertragen wurden.
 */
function mfAlleWaendeExportiert(projektId) {
  const p = getP(projektId);
  if (!p) return false;
  const exportierbar = p.waende.filter(w => w.status >= 3 && w.status !== 6 && w.datei);
  if (exportierbar.length === 0) return false;
  return exportierbar.every(w => w._calderaExportiert === true);
}

/**
 * Baut das Positionen-Array für den CC-Intern-Auftrag aus MesseFlow-Wänden.
 * Alle Wände mit Datei ODER Bestellmaß werden übernommen.
 */
function mfBuildCcInternPositionen(p) {
  return p.waende
    .filter(w => w.datei || w.bestellmass)
    .map(w => ({
      wandId:       w.id,
      bezeichnung:  w.name,
      bestellmass:  w.bestellmass   || '–',
      material:     w.material      || '–',
      menge:        w.menge         || 1,
      // Dateien — verknüpft, nicht kopiert
      datei:        w.datei         || null,
      dateien:      (w.dateien || []).map(d => ({
        id:      d.id,
        name:    d.name,
        version: d.version,
        status:  d.status,
      })),
      // Caldera-Dateiname (wie beim Export)
      calderaPfad:  (typeof calderaPdfName === 'function') ? calderaPdfName(p, w) : null,
      _exportiert:  w._calderaExportiert || false,
    }));
}

/**
 * Erzeugt den Kalender-Eintrag aus dem CC-Intern-Auftrag.
 * Reihenfolge: MesseFlow → CC-Intern-Auftrag → Kalender (NICHT direkt aus MesseFlow)
 */
function mfBuildKalenderEintrag(ccAuftrag) {
  return {
    id:           'kal_' + ccAuftrag.id,
    titel:        ccAuftrag.bezeichnung,
    kunde:        ccAuftrag.kunde,
    liefertermin: ccAuftrag.liefertermin,
    veranstaltung:ccAuftrag.veranstaltung || null,
    // Verknüpfung
    ccInternId:   ccAuftrag.id,
    sourceSystem: ccAuftrag.sourceSystem,
    sourceId:     ccAuftrag.sourceId,
    erstellt:     new Date().toISOString(),
  };
}

// ── Auftrag anlegen ──────────────────────────────────────────────────────────

/**
 * Legt den CC-Intern-Auftrag an einem MesseFlow-Projekt an.
 * Wird automatisch nach vollständigem Caldera-Export aufgerufen.
 * Gibt false zurück wenn bereits vorhanden.
 *
 * VOLLSTÄNDIGES SCHEMA:
 * {
 *   id, createdAt,
 *   sourceSystem, sourceId,          // Verknüpfung zu MesseFlow
 *   kunde, bezeichnung, liefertermin,
 *   prioritaet, auftragswert,
 *   veranstaltung, stand,
 *   positionen[],                    // Wände mit Maßen + Dateien
 *   statusIntern,                    // interner Workflow-Status
 *   statusExtern,                    // vereinfachter externer Status
 *   lieferung: {                     // Lieferstatus + Fotos
 *     geliefertAm, geliefertVon,
 *     fotos[]                        // Liefernachweis direkt am Auftrag
 *   },
 *   kalenderEintrag,                 // aus diesem Auftrag abgeleitet
 *   notizen
 * }
 */
function mfCreateCcInternAuftrag(projektId) {
  const p = getP(projektId);
  if (!p) return false;
  if (p.ccinternAuftrag) return false; // kein Doppel-Anlegen

  const id         = mfNextCcInternId();
  const positionen = mfBuildCcInternPositionen(p);
  const initStatus = 'Übergeben';

  const auftrag = {
    id,
    createdAt: new Date().toISOString(),

    // ── Verknüpfung zu MesseFlow ───────────────────────────────────────────
    sourceSystem: 'messeflow',
    sourceId:     p.id,

    // ── Kerndaten aus MesseFlow (übernommen, nicht dupliziert) ─────────────
    kunde:         p.auftragsInfo?.kunde        || p.kunde || '–',
    bezeichnung:   p.auftragsInfo?.projektname  || p.name  || '–',
    liefertermin:  p.deadline                   || null,
    prioritaet:    p.prioritaet                 || 'Normal',
    auftragswert:  p.finanz?.preis              || null,
    veranstaltung: p.auftragsInfo?.messe        || null,
    stand:         p.auftragsInfo?.stand        || null,

    // ── Positionen (Wände mit Maßen + Dateien) ────────────────────────────
    positionen,

    // ── Status (intern detailliert / extern vereinfacht) ──────────────────
    statusIntern: initStatus,
    statusExtern: mfCcExternStatus(initStatus),

    // ── Lieferung + Lieferfotos (direkt am Auftrag, kein separates Modul) ─
    lieferung: {
      geliefertAm:  null,
      geliefertVon: null,   // userId
      fotos:        [],     // Liefernachweis-Fotos (schema siehe mfCcAddLieferfoto)
      notiz:        null,
    },

    // ── Kalender wird AUS diesem Auftrag gespeist ─────────────────────────
    // Quelle: CC-Intern-Auftrag → Kalender (NICHT direkt MesseFlow → Kalender)
    kalenderEintrag: null,

    notizen: '',
  };

  // Kalender-Eintrag aus Auftrag ableiten
  auftrag.kalenderEintrag = mfBuildKalenderEintrag(auftrag);

  // Am Projekt speichern (verknüpft, nicht isoliert)
  p.ccinternAuftrag = auftrag;
  if (typeof mfSaveState === 'function') mfSaveState();

  // Audit-Log
  if (typeof mfAuditLog === 'function') {
    mfAuditLog(projektId, 'ccintern_uebergabe', { ccId: id, positionen: positionen.length });
  }

  return auftrag;
}

// ── Status-Steuerung ─────────────────────────────────────────────────────────

/**
 * Setzt den internen CC-Status und leitet daraus den externen ab.
 * Erlaubte Werte: MF_CC_STATUS_INTERN[]
 */
function mfUpdateCcInternStatus(projektId, neuerStatus) {
  const p = getP(projektId);
  if (!p?.ccinternAuftrag) return false;
  p.ccinternAuftrag.statusIntern = neuerStatus;
  p.ccinternAuftrag.statusExtern = mfCcExternStatus(neuerStatus);
  // Rückwärtskompatibilität
  p.ccinternAuftrag.status = neuerStatus;
  if (typeof mfSaveState === 'function') mfSaveState();
  if (typeof mfAuditLog === 'function') {
    mfAuditLog(projektId, 'ccintern_status', {
      statusIntern: neuerStatus,
      statusExtern: mfCcExternStatus(neuerStatus),
    });
  }
  return true;
}

// ── Lieferung ────────────────────────────────────────────────────────────────

/**
 * Fügt ein Lieferfoto direkt am CC-Intern-Auftrag hinzu.
 * Fotos landen NICHT separat — sie sind Teil des Auftrags.
 *
 * Foto-Schema:
 * {
 *   id:              'lf_' + timestamp,
 *   ccinternOrderId: 'CC-2026-0001',
 *   dateiname:       'foto.jpg',
 *   datenUrl:        'data:image/jpeg;base64,...',  // oder Server-URL
 *   zeitpunkt:       ISO-String,
 *   hochgeladenVon:  userId,
 *   typ:             'liefernachweis'
 * }
 */
function mfCcAddLieferfoto(projektId, fotoData) {
  const p = getP(projektId);
  if (!p?.ccinternAuftrag) return false;
  const foto = {
    id:              'lf_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
    ccinternOrderId: p.ccinternAuftrag.id,
    dateiname:       fotoData.dateiname  || 'foto.jpg',
    datenUrl:        fotoData.datenUrl   || null,   // base64 oder Server-URL
    zeitpunkt:       new Date().toISOString(),
    hochgeladenVon:  fotoData.userId     || (typeof currentUserId !== 'undefined' ? currentUserId : null),
    typ:             'liefernachweis',
  };
  p.ccinternAuftrag.lieferung.fotos.push(foto);
  if (typeof mfSaveState === 'function') mfSaveState();
  return foto;
}

/**
 * Setzt den Auftrag auf "Geliefert" — mit optionalen Fotos.
 * Keine Unterschrift, kein Kommentar-Zwang.
 * Foto-Upload: optional, direkt am Auftrag gespeichert.
 */
function mfCcSetGeliefert(projektId, userId, optFotos) {
  const p = getP(projektId);
  if (!p?.ccinternAuftrag) return false;

  const a   = p.ccinternAuftrag;
  const now = new Date().toISOString();

  a.statusIntern           = 'Geliefert';
  a.statusExtern           = 'Geliefert';
  a.status                 = 'Geliefert';
  a.lieferung.geliefertAm  = now;
  a.lieferung.geliefertVon = userId || (typeof currentUserId !== 'undefined' ? currentUserId : null);

  // Fotos direkt anhängen (optionaler Array von Foto-Objekten)
  if (Array.isArray(optFotos) && optFotos.length > 0) {
    optFotos.forEach(f => mfCcAddLieferfoto(projektId, { ...f, userId }));
  }

  if (typeof mfSaveState === 'function') mfSaveState();
  if (typeof mfAuditLog === 'function') {
    mfAuditLog(projektId, 'ccintern_geliefert', {
      geliefertVon: a.lieferung.geliefertVon,
      fotos:        a.lieferung.fotos.length,
    });
  }

  return true;
}

// ── Lesefunktionen ───────────────────────────────────────────────────────────

function mfGetCcInternAuftrag(projektId) {
  return getP(projektId)?.ccinternAuftrag || null;
}

// ── Trigger ──────────────────────────────────────────────────────────────────

/**
 * TRIGGER — wird nach jedem erfolgreichen Caldera-Export aufgerufen.
 * Legt automatisch den CC-Intern-Auftrag an, sobald ALLE Wände exportiert sind.
 * Kein manueller Button nötig. Der Caldera-Export ist der einzige Trigger.
 */
function mfUebergabePruefen(projektId) {
  if (!mfAlleWaendeExportiert(projektId)) return;
  if (mfGetCcInternAuftrag(projektId)) return; // bereits vorhanden

  const auftrag = mfCreateCcInternAuftrag(projektId);
  if (!auftrag) return;

  if (typeof toast === 'function') {
    toast(
      '🏭 CC-Intern Auftrag angelegt',
      `${auftrag.id} — alle Wände übergeben. Produktion kann starten.`,
      'tg'
    );
  }
  if (typeof renderView === 'function') renderView();
}

// ── UI-Hilfsfunktion: Lieferfotos verarbeiten (Mobile + Desktop) ─────────────

/**
 * Verarbeitet File-Input-Events für Lieferfotos.
 * Auf Mobile: capture="environment" öffnet direkt die Kamera.
 * Fotos werden als base64 geladen und direkt am Auftrag gespeichert.
 */
function mfCcLieferFotoUpload(projektId, inputEl) {
  const files = inputEl?.files;
  if (!files || !files.length) return;

  Array.from(files).forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      mfCcAddLieferfoto(projektId, {
        dateiname: file.name,
        datenUrl:  e.target.result,
      });
      if (typeof renderView === 'function') renderView();
    };
    reader.readAsDataURL(file);
  });
}

// ── Window-Exports ────────────────────────────────────────────────────────────
window.mfNextCcInternId       = mfNextCcInternId;
window.mfCcExternStatus       = mfCcExternStatus;
window.mfCcNextStatus         = mfCcNextStatus;
window.mfAlleWaendeExportiert = mfAlleWaendeExportiert;
window.mfCreateCcInternAuftrag= mfCreateCcInternAuftrag;
window.mfGetCcInternAuftrag   = mfGetCcInternAuftrag;
window.mfUpdateCcInternStatus = mfUpdateCcInternStatus;
window.mfCcAddLieferfoto      = mfCcAddLieferfoto;
window.mfCcSetGeliefert       = mfCcSetGeliefert;
window.mfCcLieferFotoUpload   = mfCcLieferFotoUpload;
window.mfUebergabePruefen     = mfUebergabePruefen;
