import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { buildCorsAllowedOriginsSet, createCorsOriginCallback } from './lib/cors-allowlist.js';
import { getJwtSecret } from './auth/jwt.js';
import {
  backupSqliteDatabaseBeforeOpen,
  logDatabaseStartupDiagnostics,
  openDatabase,
} from './db/database.js';
import { createAuthRouter } from './routes/auth.js';
import { createInvitePublicRouter } from './routes/invite-public.js';
import {
  createPublicMeldenRouter,
  sendMobileSchadenMeldenPage,
  rateLimitPublicFahrzeugGet,
} from './routes/public-melden.js';
import { createWorkshopRepairRequestRouter } from './routes/workshop-repair-request.js';
import { createApiV1Router } from './routes/api-v1.js';
import { ensureDevTestLoginUser } from './lib/ensure-dev-test-login-user.js';
import { sendError } from './lib/api-v1-envelope.js';
import { mountLegacyApiRemoved } from './lib/legacy-api-removed.js';
import { defaultFlagsForRole } from './auth/project-access-rules.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('SERVER FILE ACTIVE:', __filename);

try {
  getJwtSecret();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}

const PORT = Number.parseInt(process.env.PORT || '5371', 10);
const HOST = process.env.HOST || '0.0.0.0';

/**
 * Mindestens ein Projekt in der DB; sonst Standard-Projekt + project_access (API `x-project-id`).
 * @param {Awaited<ReturnType<import('./db/database.js').openDatabase>>} store
 */
async function ensureDefaultProject(store) {
  try {
    const projects = await store.listProjects();
    if (projects && projects.length > 0) {
      console.log('[INIT] Projekte vorhanden:', projects.length);
      return;
    }
    console.log('[INIT] Kein Projekt gefunden → erstelle Default-Projekt');

    const firmen = await store.listFirmen();
    if (!firmen || firmen.length === 0) {
      await store.insertFirma({
        id: randomUUID(),
        name: 'Standard Firma',
      });
    }

    const projectId = randomUUID();
    await store.insertProject({ id: projectId, name: 'Standard Projekt', kundenId: null });

    const users = await store.listUsers();
    const supers = (users || []).filter((u) => u && String(u.global_role || '').trim() === 'SUPER_ADMIN');
    const grantTargets = supers.length > 0 ? supers : users || [];
    const flags = defaultFlagsForRole('admin');
    for (const u of grantTargets) {
      if (!u || u.id == null) continue;
      const uid = String(u.id).trim();
      if (!uid) continue;
      const existing = await store.getProjectAccessByUserAndProject(uid, projectId);
      if (existing) continue;
      await store.insertProjectAccess({
        id: randomUUID(),
        userId: uid,
        projectId,
        role: 'admin',
        canViewPrices: flags.can_view_prices,
        canEdit: flags.can_edit,
        canCreateAuftraege: flags.can_create_auftraege,
      });
    }

    console.log('[INIT] Default Projekt erstellt:', projectId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[INIT] ensureDefaultProject Fehler:', msg);
  }
}

const fusaCleanEnv = process.env.FUSA_CLEAN_DEV_ROOT?.trim();
const fusaPath = fusaCleanEnv
  ? path.resolve(fusaCleanEnv)
  : path.resolve(__dirname, '../../../FUSA_CLEAN - Code/DEV');

console.log('[FUSA CLEAN] resolved path:', fusaPath);
console.log('[FUSA CLEAN] exists:', fs.existsSync(fusaPath));
console.log(
  '[FUSA CLEAN] index exists:',
  fs.existsSync(path.join(fusaPath, 'index.html')),
);

logDatabaseStartupDiagnostics();

const { allowedOrigins, isProduction } = buildCorsAllowedOriginsSet();
const corsOrigin = createCorsOriginCallback(allowedOrigins, isProduction);

const CC_CORS_LOCAL_VITE_ORIGINS = ['http://localhost:3000', 'http://localhost:3001'];

const app = express();
app.use(
  cors({
    origin: (origin, cb) => {
      const o = origin == null ? '' : String(origin).trim().replace(/\/+$/, '');
      if (o && CC_CORS_LOCAL_VITE_ORIGINS.includes(o)) return cb(null, o);
      return corsOrigin(origin, cb);
    },
    credentials: true,
    optionsSuccessStatus: 204,
  }),
);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

/** Immer registrieren (kein if exists) — vor allen API-Routen, kein SPA-Fallback davor. */
app.use('/fusa-clean', express.static(fusaPath));

app.get('/fusa-clean-test', (_req, res) => {
  res.json({
    fusaPath,
    exists: fs.existsSync(fusaPath),
    indexExists: fs.existsSync(path.join(fusaPath, 'index.html')),
  });
});

backupSqliteDatabaseBeforeOpen();
const store = await openDatabase();

async function logKalenderDbStartCheck(storeArg) {
  const host = String(process.env.MYSQL_HOST || '').trim();
  const user = String(process.env.MYSQL_USER || '').trim();
  const database = String(process.env.MYSQL_DATABASE || '').trim();
  const mysqlOn = Boolean(host && user && database);
  const backendRoot = path.resolve(__dirname, '..');
  const sqlitePath =
    String(process.env.SQLITE_DB_PATH || '').trim() ||
    path.join(backendRoot, 'data', 'cc-cockpit.db');
  let countTableAll = null;
  try {
    if (typeof storeArg.countKalenderTermineTableAll === 'function') {
      countTableAll = await storeArg.countKalenderTermineTableAll();
    }
  } catch (e) {
    countTableAll = 'error:' + (e instanceof Error ? e.message : String(e));
  }
  console.log('[KALENDER_DB_START_CHECK]', {
    NODE_ENV: process.env.NODE_ENV ?? null,
    dbMode: mysqlOn ? 'mysql' : 'sqlite',
    sqliteDbPath: mysqlOn ? null : path.resolve(sqlitePath),
    mysqlDatabase: mysqlOn ? database : null,
    countKalenderTermineTableAll: countTableAll,
  });
}

await logKalenderDbStartCheck(store);

let serverShutdownDone = false;
function gracefulShutdown(signal) {
  if (serverShutdownDone) return;
  serverShutdownDone = true;
  console.log(`[server] ${signal} — SQLite persist…`);
  try {
    if (store && typeof store.persist === 'function') {
      Promise.resolve(store.persist())
        .then(() => process.exit(0))
        .catch((err) => {
          console.error('[server] persist fehlgeschlagen:', err);
          process.exit(1);
        });
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('[server] persist fehlgeschlagen:', err);
    process.exit(1);
  }
}
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

await ensureDevTestLoginUser(store);
await ensureDefaultProject(store);

if (
  String(process.env.NODE_ENV || '').toLowerCase() !== 'production' &&
  String(process.env.CC_DEV_PROVISION_KEY || '').trim().length >= 8
) {
  console.warn(
    '[server] CC_DEV_PROVISION_KEY ist gesetzt: Dev-Provision-Auth nur Loopback + non-production (siehe middleware/dev-provision-auth.js).',
  );
}

app.use('/api/v1', createApiV1Router(store));
console.log('[server] Router unter /api/v1 eingebunden (createApiV1Router).');

mountLegacyApiRemoved(app);

app.use('/auth', createAuthRouter(store));

app.use('/invites', createInvitePublicRouter(store));

app.use('/public', createPublicMeldenRouter(store));
app.use('/public', createWorkshopRepairRequestRouter(store));
app.get('/m/fahrzeug/:fahrzeugId', rateLimitPublicFahrzeugGet, sendMobileSchadenMeldenPage);
app.get('/scan', rateLimitPublicFahrzeugGet, (req, res) => {
  const fz = typeof req.query.fz === 'string' ? req.query.fz.trim() : '';
  if (!fz) return res.status(400).type('text/plain').send('Parameter fz fehlt.');
  return res.redirect(302, `/m/fahrzeug/${encodeURIComponent(fz)}`);
});

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

// Nach allen Routen: Fehler als JSON (Frontend zeigt `message` statt generischem „Internal Server Error“).
app.use((err, req, res, next) => {
  console.error('[server]', req.method, req.path, err);
  if (res.headersSent) {
    next(err);
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  sendError(res, 500, 'INTERNAL_ERROR', message);
});

app.listen(PORT, HOST, () => {
  console.log(`CC Cockpit Backend listening on http://${HOST}:${PORT}`);
  console.log(
    'Auth: POST /auth/login, GET /auth/me | API v1: /api/v1/* | invites: GET /invites/{token}, POST /invites/{token}/activate | public: GET /public/fahrzeug/:id, POST /public/schaeden | mobil: GET /m/fahrzeug/:id',
  );
});
