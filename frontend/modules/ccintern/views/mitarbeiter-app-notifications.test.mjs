import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, 'mitarbeiter-app-mob-inline.js'), 'utf8');
const themeCss = fs.readFileSync(path.join(__dirname, '../../../cc-design-styl-c.css'), 'utf8');
const start = source.indexOf('function mobUuidEqualsBadge');
const end = source.indexOf('/** Basisliste Home/Aufgaben', start);
assert.ok(start >= 0 && end > start);
const notificationSource = source.slice(start, end);

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function makeContext() {
  const nodes = new Map();
  const body = {
    appended: null,
    appendChild(node) {
      this.appended = node;
      nodes.set(node.id, node);
    },
  };
  const document = {
    body,
    getElementById(id) { return nodes.get(id) || null; },
    createElement() {
      return {
        id: '',
        innerHTML: '',
        style: {},
        onclick: null,
        remove() { nodes.delete(this.id); if (body.appended === this) body.appended = null; },
      };
    },
  };
  const ctx = {
    Array,
    Date,
    Number,
    Object,
    String,
    console,
    document,
    window: {},
    AUFTRAEGE: [],
    MOB_MA_ID: 'worker-1',
    INTERN_AUFGABEN: [],
    mobDetEsc: escapeHtml,
    mobEscJsSingleQuoted: (value) => String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"),
    mobMaKuerzelOderIdZuUserUuid: () => '',
    mobCcinternCockpitMount: () => true,
    setTimeout(fn) { fn(); return 1; },
  };
  vm.createContext(ctx);
  vm.runInContext(notificationSource, ctx);
  ctx.mobAuftragHatMaBeteiligung = () => true;
  return { ctx, body, nodes };
}

function seedChats(ctx) {
  ctx.AUFTRAEGE = [
    {
      id: 'AU-2026-007',
      kunde: 'Test Kunden',
      kommentare: [
        { id: 'k1', text: 'hey', autor: 'Nazim', autorMaId: 'other', seenBy: [], ts: '2026-07-14T12:59:00.000Z' },
      ],
    },
    {
      id: 'AU-2026-006',
      kunde: 'Test Kunden',
      kommentare: [
        { id: 'k2', text: 'from test kunden 06', autor: 'Nazim', autorMaId: 'other', seenBy: ['worker-1'], ts: '2026-07-14T13:00:00.000Z' },
      ],
    },
  ];
}

test('mobile bell modal lists every available order chat', () => {
  const { ctx, body } = makeContext();
  seedChats(ctx);
  ctx.mobNachrichtenModalRender();
  assert.ok(body.appended);
  assert.equal(body.appended.id, 'mob-nachrichten-modal');
  assert.match(body.appended.innerHTML, /AU-2026-007/);
  assert.match(body.appended.innerHTML, /AU-2026-006/);
  assert.match(body.appended.innerHTML, /mobNachrichtenChatOeffnen\('AU-2026-007'\)/);
  assert.match(body.appended.innerHTML, /1 ungelesen/);
  assert.match(body.appended.innerHTML, /🔔 Kommunikation/);
  assert.match(body.appended.innerHTML, /💬 Kommunikation in Aufträgen/);
  assert.match(body.appended.innerHTML, /background:#EFF7FF/);
  assert.match(body.appended.innerHTML, /background:#FFFFFF/);
  assert.doesNotMatch(body.appended.innerHTML, /linear-gradient/);
  assert.match(body.appended.innerHTML, /cc-mob-notif-card is-unread/);
  assert.match(body.appended.innerHTML, /Neu · 1/);
  assert.match(body.appended.innerHTML, /cc-mob-notif-card is-seen/);
  assert.match(body.appended.innerHTML, /Gelesen/);
});

test('notification cards define both light and dark theme state colors', () => {
  assert.match(themeCss, /\.cc-mob-notif-card\.is-unread/);
  assert.match(themeCss, /\.cc-mob-notif-card\.is-seen/);
  assert.match(themeCss, /html\[data-theme='dark'\] \.cc-mob-notif-card\.is-unread/);
  assert.match(themeCss, /html\[data-theme='dark'\] \.cc-mob-notif-card\.is-seen/);
  assert.match(themeCss, /html\[data-theme='dark'\] \.cc-notif-conversation\.is-unread/);
  assert.match(themeCss, /html\[data-theme='dark'\] \.cc-notif-conversation\.is-seen/);
});

test('mobile badge decreases from unread count to a visible zero', () => {
  const { ctx, nodes } = makeContext();
  const badge = { textContent: '', style: { display: 'none' } };
  nodes.set('mob-fragen-badge', badge);
  seedChats(ctx);
  ctx.mobUpdateNachrichtenBadge();
  assert.equal(badge.textContent, '1');
  assert.equal(badge.style.display, '');

  ctx.AUFTRAEGE[0].kommentare[0].seenBy.push('worker-1');
  ctx.mobUpdateNachrichtenBadge();
  assert.equal(badge.textContent, '0');
  assert.equal(badge.style.display, '');
});

test('mobile bell reloads orders and opens the chooser instead of one automatic chat', () => {
  const { ctx, body } = makeContext();
  seedChats(ctx);
  let reloaded = false;
  ctx.mobReloadAuftraegeThen = (done) => { reloaded = true; done(); };
  ctx.mobGlockeNachrichtenOeffnen();
  assert.equal(reloaded, true);
  assert.equal(body.appended?.id, 'mob-nachrichten-modal');
});

test('choosing a conversation opens the exact order communication', () => {
  const { ctx } = makeContext();
  let tab = '';
  let opened = null;
  ctx.mobTab = (value) => { tab = value; };
  ctx.mobOpenAuftragDetail = (id, options) => { opened = { id, options }; };
  ctx.mobNachrichtenChatOeffnen('AU-2026-006');
  assert.equal(tab, 'home');
  assert.equal(opened?.id, 'AU-2026-006');
  assert.equal(opened?.options?.focusKommunikation, true);
});
