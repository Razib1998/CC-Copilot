// passenger_startup.cjs
// CommonJS-Wrapper damit Phusion Passenger (node-loader) diese Datei per require() laden kann.
// Anschliessend wird das eigentliche ESM-Modul per dynamischem import() gestartet.
// Hintergrund: server.js nutzt "type":"module" + Top-Level await, was require() nicht unterstuetzt.

import('./src/server.js').catch(function (err) {
  console.error('[passenger_startup] Fehler beim Laden des Servers:', err);
  process.exit(1);
});
