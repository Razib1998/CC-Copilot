// ══════════════════════════════════════════════════════════════════════
// CC INTERN — API + Static Server  (Node.js, keine npm-Abhängigkeiten)
// ─────────────────────────────────────────────────────────────────────
// Alle Geräte im selben WLAN verbinden sich mit http://<büro-ip>:3002
// Daten liegen in ./data/*.json — kein Datenbankserver nötig
// ══════════════════════════════════════════════════════════════════════
'use strict';

var http   = require('http');
var fs     = require('fs');
var path   = require('path');
var urlMod = require('url');
var os     = require('os');

var ROOT     = __dirname;
var DATA_DIR = path.join(__dirname, 'data');
var PORT     = 3002;

// ── Datenverzeichnis anlegen ───────────────────────────────────────
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log('  data/ Verzeichnis erstellt');
}

// ── localStorage-Key → JSON-Dateiname Mapping ─────────────────────
var KEY_MAP = {
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

// ── SSE-Clients ────────────────────────────────────────────────────
var sseClients  = [];
var dataVersion = Date.now();

// ── Daten lesen/schreiben ──────────────────────────────────────────
function dataFile(name) {
  return path.join(DATA_DIR, name + '.json');
}

function readData(name) {
  try {
    var f = dataFile(name);
    if (!fs.existsSync(f)) return null;
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch(e) {
    console.warn('  readData Fehler (' + name + '):', e.message);
    return null;
  }
}

function writeData(name, data) {
  try {
    fs.writeFileSync(dataFile(name), JSON.stringify(data, null, 2), 'utf8');
    dataVersion = Date.now();
    sseNotify({ type: 'update', collection: name, version: dataVersion });
    return true;
  } catch(e) {
    console.error('  writeData Fehler (' + name + '):', e.message);
    return false;
  }
}

// ── SSE: alle Clients benachrichtigen ─────────────────────────────
function sseNotify(payload) {
  var msg = 'data: ' + JSON.stringify(payload) + '\n\n';
  var alive = [];
  sseClients.forEach(function(client) {
    try { client.write(msg); alive.push(client); } catch(e) { /* client weg */ }
  });
  sseClients = alive;
}

// ── Notification anlegen ───────────────────────────────────────────
function addNotification(collection, action, item) {
  try {
    var notifs = readData('notifications') || [];
    var notif = {
      id:         String(Date.now()) + '_' + Math.random().toString(36).slice(2, 6),
      collection: collection,
      action:     action,
      ts:         new Date().toISOString(),
      info:       item ? {
        id:    item.id    || '',
        fz:    item.fz    || item.n    || item.art  || item.titel || '',
        kunde: item.kunde || item.step || '',
      } : {}
    };
    notifs.unshift(notif);
    if (notifs.length > 300) notifs.splice(300);
    fs.writeFileSync(dataFile('notifications'), JSON.stringify(notifs, null, 2), 'utf8');
    // Separate SSE-Nachricht für Notifications
    sseNotify({ type: 'notification', notification: notif });
  } catch(e) { /* Notification-Fehler nicht kritisch */ }
}

// ── Collection-Name auflösen ───────────────────────────────────────
function resolveCollection(raw) {
  var clean = raw.replace(/^\/+/, '').split('/')[0];
  return KEY_MAP[clean] || clean;
}

// ── MIME-Typen ─────────────────────────────────────────────────────
var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
  '.ttf':  'font/ttf',
};

// ══════════════════════════════════════════════════════════════════════
// HTTP SERVER
// ══════════════════════════════════════════════════════════════════════
var server = http.createServer(function(req, res) {
  var parsed   = urlMod.parse(req.url, true);
  var pathname = decodeURIComponent(parsed.pathname);
  var method   = req.method.toUpperCase();

  // CORS — alle Geräte im LAN dürfen zugreifen
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ──────────────────────────────────────────────────────────────────
  // /api/events — SSE Live-Updates
  // ──────────────────────────────────────────────────────────────────
  if (pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('data: ' + JSON.stringify({ type: 'connected', version: dataVersion }) + '\n\n');
    sseClients.push(res);
    // Heartbeat alle 25s (verhindert Timeout)
    var heartbeat = setInterval(function() {
      try { res.write(': heartbeat\n\n'); } catch(e) { clearInterval(heartbeat); }
    }, 25000);
    req.on('close', function() {
      clearInterval(heartbeat);
      var i = sseClients.indexOf(res);
      if (i >= 0) sseClients.splice(i, 1);
    });
    return;
  }

  // ──────────────────────────────────────────────────────────────────
  // /api/ping — Health-Check + Version
  // ──────────────────────────────────────────────────────────────────
  if (pathname === '/api/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok:      true,
      version: dataVersion,
      clients: sseClients.length,
      time:    new Date().toISOString(),
    }));
    return;
  }

  // ──────────────────────────────────────────────────────────────────
  // /api/notifications — Benachrichtigungen laden
  // ──────────────────────────────────────────────────────────────────
  if (pathname === '/api/notifications' && method === 'GET') {
    var notifs = readData('notifications') || [];
    // Optional: nur ungelesene zählen lassen
    var since = parsed.query.since;
    if (since) notifs = notifs.filter(function(n) { return n.ts > since; });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(notifs));
    return;
  }

  // Notifications als gelesen markieren
  if (pathname === '/api/notifications/clear' && method === 'POST') {
    writeData('notifications', []);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Einzelne Notification vom Client hinzufügen (z.B. Chat-Nachricht)
  if (pathname === '/api/notifications' && method === 'POST') {
    var body = '';
    req.on('data', function(chunk) { body += chunk; });
    req.on('end', function() {
      try {
        var notif = JSON.parse(body);
        if (!notif.id) notif.id = String(Date.now()) + '_' + Math.random().toString(36).slice(2, 6);
        if (!notif.ts) notif.ts = new Date().toISOString();
        var notifs = readData('notifications') || [];
        notifs.unshift(notif);
        if (notifs.length > 300) notifs.splice(300);
        fs.writeFileSync(dataFile('notifications'), JSON.stringify(notifs, null, 2), 'utf8');
        // An ALLE verbundenen Clients per SSE senden
        sseNotify({ type: 'notification', notification: notif });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // ──────────────────────────────────────────────────────────────────
  // GET /scan — Mobile Werkstatt-Scan-Seite
  // ──────────────────────────────────────────────────────────────────
  if (pathname === '/scan' || pathname === '/scan/') {
    fs.readFile(path.join(ROOT, 'scan.html'), function(err, data) {
      if (err) { res.writeHead(404); res.end('scan.html nicht gefunden'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  // ──────────────────────────────────────────────────────────────────
  // GET /api/server-info — eigene LAN-IP + Port (für QR-URL-Generierung)
  // ──────────────────────────────────────────────────────────────────
  if (pathname === '/api/server-info') {
    var lanIP = '127.0.0.1';
    try {
      var ifaces = os.networkInterfaces();
      Object.keys(ifaces).forEach(function(name) {
        ifaces[name].forEach(function(iface) {
          if (iface.family === 'IPv4' && !iface.internal) lanIP = iface.address;
        });
      });
    } catch(e) {}
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ip: lanIP, port: PORT, scanUrl: 'http://' + lanIP + ':' + PORT + '/scan' }));
    return;
  }

  // ──────────────────────────────────────────────────────────────────
  // POST /api/schaden-eingang — Schaden aus QR-Scan entgegennehmen (Append)
  // ──────────────────────────────────────────────────────────────────
  if (pathname === '/api/schaden-eingang' && method === 'POST') {
    var body = '';
    req.on('data', function(chunk) { body += chunk; });
    req.on('end', function() {
      try {
        var entry = JSON.parse(body);
        if (!entry.id) entry.id = 'se-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
        entry.eingangszeit = new Date().toISOString();
        var queue = readData('schaden-eingang');
        if (!Array.isArray(queue)) queue = [];
        queue.push(entry);
        writeData('schaden-eingang', queue);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, id: entry.id }));
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // ──────────────────────────────────────────────────────────────────
  // /api/:collection — CRUD-Endpunkte
  // ──────────────────────────────────────────────────────────────────
  if (pathname.startsWith('/api/')) {
    var raw        = pathname.slice(5);
    var collection = resolveCollection(raw);

    // GET → laden
    if (method === 'GET') {
      var data = readData(collection);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data !== null ? data : []));
      return;
    }

    // POST / PUT → speichern
    if (method === 'POST' || method === 'PUT') {
      var body = '';
      req.on('data', function(chunk) { body += chunk; });
      req.on('end', function() {
        try {
          var payload = JSON.parse(body);
          var ok = writeData(collection, payload);
          if (ok) {
            // Notification nur für relevante Collections
            var notifCollections = ['auftraege','aufgaben','urlaub','anwesenheit'];
            if (notifCollections.indexOf(collection) >= 0) {
              var last = Array.isArray(payload) ? payload[payload.length - 1] : payload;
              addNotification(collection, 'save', last || {});
            }
          }
          res.writeHead(ok ? 200 : 500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: ok, version: dataVersion }));
        } catch(e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    // DELETE → leeren
    if (method === 'DELETE') {
      writeData(collection, []);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.writeHead(405); res.end('Method Not Allowed');
    return;
  }

  // ──────────────────────────────────────────────────────────────────
  // Static Files — index.html, JS, CSS, etc.
  // ──────────────────────────────────────────────────────────────────
  var filePath = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);
  var ext = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, function(err, fileData) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found: ' + pathname);
    } else {
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(fileData);
    }
  });
});

// ──────────────────────────────────────────────────────────────────
// SERVER STARTEN
// ──────────────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', function() {
  // Lokale IP-Adresse ermitteln (für Handy-Zugriff)
  var localIP = '???';
  try {
    var ifaces = os.networkInterfaces();
    Object.keys(ifaces).forEach(function(name) {
      ifaces[name].forEach(function(iface) {
        if (iface.family === 'IPv4' && !iface.internal) localIP = iface.address;
      });
    });
  } catch(e) {}

  var pad = function(s, n) { while(s.length < n) s += ' '; return s; };

  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║         CC INTERN — SERVER GESTARTET             ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log('║  ' + pad('Desktop:  http://localhost:' + PORT, 48) + '║');
  console.log('║  ' + pad('Handy:    http://' + localIP + ':' + PORT, 48) + '║');
  console.log('║  ' + pad('Tablet:   http://' + localIP + ':' + PORT, 48) + '║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log('║  Daten:  ./data/*.json                           ║');
  console.log('║  API:    http://localhost:' + PORT + '/api/ping          ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
  console.log('  Alle Geräte müssen im selben WLAN sein.');
  console.log('  Beenden mit: Ctrl+C');
  console.log('');
});
