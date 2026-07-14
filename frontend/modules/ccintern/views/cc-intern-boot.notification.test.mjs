import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, 'cc-intern-boot.js'), 'utf8');

function sliceBetween(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `source section missing: ${start}`);
  return source.slice(from, to);
}

const notificationFunctions = [
  sliceBetween('function ccNotifEscAttr', '/** Desktop-Glocke'),
  sliceBetween('function ccDesktopKommunikationGlockeSichtbar', '// ── ccNotifToggle'),
  sliceBetween('function ccNotifRender()', '// ── ccNotifClear'),
].join('\n');

function makeContext() {
  const list = { innerHTML: '' };
  const dropdown = { style: { display: '' } };
  const badge = { textContent: '', style: { display: 'none' } };
  const bell = { style: {} };
  const chatInput = { focused: false, focus() { this.focused = true; } };
  const chat = {
    scrolled: false,
    scrollIntoView() { this.scrolled = true; },
    querySelector(selector) { return selector === '.chat-input-field' ? chatInput : null; },
  };
  const ctx = {
    Array,
    Number,
    Promise,
    String,
    console,
    CC_NOTIF_DATA: [],
    CC_NOTIF_LAST_SEEN: '',
    CC_NOTIF_LABELS: {},
    CC_NOTIF_OPEN: true,
    AUFTRAEGE: [],
    window: { CCIntern: { cockpitApi: null } },
    document: {
      getElementById(id) {
        if (id === 'cc-notif-list') return list;
        if (id === 'cc-notif-dropdown') return dropdown;
        if (id === 'cc-notif-badge') return badge;
        if (id === 'cc-notif-btn') return bell;
        if (id === 'chat-container-AU-TEST-1') return chat;
        return null;
      },
    },
    setTimeout(fn) {
      fn();
      return 1;
    },
  };
  vm.createContext(ctx);
  vm.runInContext(notificationFunctions, ctx);
  return { ctx, list, dropdown, badge, chat, chatInput };
}

test('desktop badge counts only unread comments and remains visible at zero', () => {
  const { ctx, badge } = makeContext();
  ctx.window.CURRENT_USER_ID = 'admin-1';
  ctx.AUFTRAEGE = [{
    id: 'AU-TEST-1',
    kommentare: [
      { id: 'own', autorMaId: 'admin-1', seenBy: [], text: 'own' },
      { id: 'seen', autorMaId: 'worker-1', seenBy: ['admin-1'], text: 'seen' },
      { id: 'new', autorMaId: 'worker-1', seenBy: [], text: 'new' },
    ],
  }];
  ctx.ccNotifBadgeUpdate();
  assert.equal(badge.textContent, '1');
  assert.equal(badge.style.display, '');

  ctx.AUFTRAEGE[0].kommentare[2].seenBy.push('admin-1');
  ctx.ccNotifBadgeUpdate();
  assert.equal(badge.textContent, '0');
  assert.equal(badge.style.display, '');
});

test('communication fallback links each order directly', () => {
  const { ctx } = makeContext();
  ctx.AUFTRAEGE = [{
    id: 'AU-TEST-1',
    kunde: 'Testkunde',
    kommentare: [{ text: 'Bitte prüfen', ts: '2026-07-14T09:30:00.000Z' }],
  }];
  const html = ctx.ccNotifBuildKommFragenHtml();
  assert.match(html, /data-cc-au-id="AU-TEST-1"/);
  assert.match(html, /ccNotifOpenAuftragKomm/);
  assert.doesNotMatch(html, /Zur Auftragsübersicht/);
});

test('desktop conversation rows visibly distinguish unread and seen state', () => {
  const { ctx } = makeContext();
  ctx.window.CURRENT_USER_ID = 'admin-1';
  ctx.AUFTRAEGE = [
    { id: 'AU-NEW', kunde: 'Neu', kommentare: [{ text: 'new', autorMaId: 'worker', seenBy: [] }] },
    { id: 'AU-SEEN', kunde: 'Seen', kommentare: [{ text: 'seen', autorMaId: 'worker', seenBy: ['admin-1'] }] },
  ];
  const html = ctx.ccNotifBuildKommFragenHtml();
  assert.match(html, /cc-notif-conversation is-unread/);
  assert.match(html, /Neu · 1/);
  assert.match(html, /cc-notif-conversation is-seen/);
  assert.match(html, /Gelesen/);
});

test('server chat notification row is clickable and carries its order id', () => {
  const { ctx, list } = makeContext();
  ctx.CC_NOTIF_DATA = [{
    action: 'chat',
    ts: '2026-07-14T09:31:00.000Z',
    info: { id: 'AU-TEST-1', kunde: 'Testkunde', autor: 'Mitarbeiter', text: 'Neue Nachricht' },
  }];
  ctx.ccNotifRender();
  assert.match(list.innerHTML, /role="button"/);
  assert.match(list.innerHTML, /data-cc-au-id="AU-TEST-1"/);
  assert.match(list.innerHTML, /ccNotifOpenAuftragKomm/);
});

test('notification deep-link opens order and focuses communication input', async () => {
  const { ctx, dropdown, chat, chatInput } = makeContext();
  ctx.AUFTRAEGE = [{ id: 'AU-TEST-1', ccApiId: '11111111-1111-4111-8111-111111111111' }];
  let pageOpened = false;
  let openedId = '';
  ctx.goPage = (page) => { pageOpened = page === 'auftraege'; };
  ctx.openAuftragDetail = async (id) => { openedId = id; };

  await ctx.ccNotifOpenAuftragKomm('11111111-1111-4111-8111-111111111111');
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(pageOpened, true);
  assert.equal(openedId, 'AU-TEST-1');
  assert.equal(dropdown.style.display, 'none');
  assert.equal(chat.scrolled, true);
  assert.equal(chatInput.focused, true);
});
