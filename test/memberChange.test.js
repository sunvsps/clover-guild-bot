import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { MessageFlags } from 'discord.js';

process.env.ONBOARDING_FILE = join(await mkdtemp(join(tmpdir(), 'change-')), 'onboarding.json');
const { handleChangeInteraction, CHANGE_IDS } = await import('../src/memberChange.js');

const JOBS = [
  { id: 2, label: 'Knight', color: '#d94c4c', sortOrder: 0 },
  { id: 3, label: 'Wizard', color: '#4c6cd9', sortOrder: 2 },
];
const realFetch = globalThis.fetch;
let patches;

const stubBackend = (patchResponse) => {
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/api/v1/bot/jobs')) return { ok: true, status: 200, json: async () => JOBS };
    patches.push(JSON.parse(init.body));
    return { ok: patchResponse.status === 200, status: patchResponse.status, json: async () => patchResponse.body };
  };
};

const memberRow = (over = {}) => ({
  memberId: 'm1',
  discordId: '111',
  ign: 'Mimayuu',
  nickname: 'Mint',
  job: { id: 3, label: 'Wizard', color: '#4c6cd9' },
  isActive: true,
  isIncomplete: false,
  before: { ign: 'Mimayuu', job: 'Knight' },
  ...over,
});

/** interaction ปลอมที่จำว่าบอทตอบอะไรไปบ้าง และโพสต์อะไรลงกระทู้ในชื่อใคร */
function fakeInteraction({ kind, customId, values, fields = {} }) {
  const log = { replies: [], edits: [], modal: null, posted: [], nick: null, panels: [] };
  const hook = {
    name: 'Clover Intro',
    send: async (p) => log.posted.push(p),
  };
  const forum = { fetchWebhooks: async () => ({ find: (f) => [hook].find(f) }), createWebhook: async () => hook };
  const noMessages = { first: () => undefined, values: () => [] };
  const thread = {
    id: `thread-${Math.random()}`,
    isThread: () => true,
    parent: forum,
    client: { user: { id: 'bot' } },
    messages: { fetch: async () => noMessages },
    send: async (p) => log.panels.push(p),
  };
  const member = {
    id: '111',
    displayName: 'Mimayuu/Knight (Mint)',
    displayAvatarURL: () => 'https://cdn/avatar.png',
    setNickname: async (n) => {
      log.nick = n;
    },
  };
  const i = {
    customId,
    values,
    user: { id: '111' },
    member,
    guild: { channels: { cache: { find: () => undefined } } },
    channel: thread,
    isButton: () => kind === 'button',
    isStringSelectMenu: () => kind === 'select',
    isModalSubmit: () => kind === 'modal',
    fields: { getTextInputValue: (k) => fields[k] },
    reply: async (p) => log.replies.push(p),
    showModal: async (m) => {
      log.modal = m.toJSON();
    },
    deferUpdate: async () => {},
    deferReply: async () => {},
    editReply: async (p) => log.edits.push(typeof p === 'string' ? { content: p } : p),
  };
  return { i, log };
}

beforeEach(() => {
  patches = [];
  process.env.API_BOT_KEY = 'test-key';
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

test('interaction อื่นไม่ยุ่ง ปล่อยให้ handler เดิมทำต่อ', async () => {
  const { i } = fakeInteraction({ kind: 'button', customId: 'intro' });
  assert.equal(await handleChangeInteraction(i), false);
});

test('กดปุ่มเปลี่ยนอาชีพ: ได้ dropdown อาชีพ เห็นคนเดียว', async () => {
  stubBackend({ status: 200, body: memberRow() });
  const { i, log } = fakeInteraction({ kind: 'button', customId: CHANGE_IDS.jobButton });
  await handleChangeInteraction(i);
  const reply = log.replies[0];
  assert.ok(reply.flags, 'ต้องเป็นข้อความ ephemeral');
  const select = reply.components[0].toJSON().components[0];
  assert.equal(select.custom_id, CHANGE_IDS.jobSelect);
  assert.deepEqual(select.options.map((o) => o.label), ['Knight', 'Wizard']);
});

test('เลือกอาชีพ: บันทึก, เปลี่ยนชื่อในเซิร์ฟ, โพสต์ "เก่า >> ใหม่" ในชื่อเจ้าตัว', async () => {
  stubBackend({ status: 200, body: memberRow() });
  const { i, log } = fakeInteraction({ kind: 'select', customId: CHANGE_IDS.jobSelect, values: ['3'] });
  await handleChangeInteraction(i);

  assert.deepEqual(patches, [{ jobId: 3 }]);
  assert.equal(log.nick, 'Mimayuu/Wizard (Mint)');
  assert.equal(log.posted.length, 1);
  assert.equal(log.posted[0].content, 'Knight >> Wizard');
  assert.equal(log.posted[0].username, 'Mimayuu/Knight (Mint)', 'ต้องโพสต์ในชื่อสมาชิก ไม่ใช่บอท');
  assert.equal(log.posted[0].avatarURL, 'https://cdn/avatar.png');
  assert.equal(log.posted[0].threadId, i.channel.id, 'ต้องโพสต์ลงกระทู้ที่กดปุ่ม');
  assert.match(log.edits.at(-1).content, /✅/);
});

test('หลังโพสต์ "เก่า >> ใหม่": ย้ายปุ่มลงล่างสุดแบบไม่แจ้งเตือน', async () => {
  stubBackend({ status: 200, body: memberRow() });
  const { i, log } = fakeInteraction({ kind: 'select', customId: CHANGE_IDS.jobSelect, values: ['3'] });
  await handleChangeInteraction(i);
  assert.equal(log.panels.length, 1);
  const panel = log.panels[0];
  assert.equal(panel.components[0].toJSON().components[0].custom_id, CHANGE_IDS.jobButton);
  assert.ok(panel.flags & MessageFlags.SuppressNotifications, 'ปุ่มที่โพสต์ใหม่ต้องไม่เด้งแจ้งเตือน');
});

test('กดปุ่มเปลี่ยนชื่อ: ได้ฟอร์มช่องเดียวสำหรับชื่อใหม่', async () => {
  const { i, log } = fakeInteraction({ kind: 'button', customId: CHANGE_IDS.nameButton });
  await handleChangeInteraction(i);
  assert.equal(log.modal.custom_id, CHANGE_IDS.nameModal);
  const inputs = log.modal.components.flatMap((r) => r.components);
  assert.deepEqual(inputs.map((c) => c.custom_id), ['new-ign']);
});

test('ส่งชื่อใหม่: โพสต์ "ชื่อเก่า >> ชื่อใหม่" ในชื่อเจ้าตัว', async () => {
  stubBackend({
    status: 200,
    body: memberRow({ ign: 'NewMint', job: { id: 2, label: 'Knight' }, before: { ign: 'Mimayuu', job: 'Knight' } }),
  });
  const { i, log } = fakeInteraction({
    kind: 'modal',
    customId: CHANGE_IDS.nameModal,
    fields: { 'new-ign': '  NewMint  ' },
  });
  await handleChangeInteraction(i);

  assert.deepEqual(patches, [{ ign: 'NewMint' }]);
  assert.equal(log.nick, 'NewMint/Knight (Mint)');
  assert.equal(log.posted[0].content, 'Mimayuu >> NewMint');
  assert.equal(log.posted[0].username, 'Mimayuu/Knight (Mint)');
});

test('ชื่อซ้ำ: แจ้งเจ้าตัว ไม่โพสต์ ไม่เปลี่ยนชื่อในเซิร์ฟ', async () => {
  stubBackend({ status: 409, body: { error: { code: 'DUPLICATE_IGN' } } });
  const { i, log } = fakeInteraction({
    kind: 'modal',
    customId: CHANGE_IDS.nameModal,
    fields: { 'new-ign': 'Taken' },
  });
  await handleChangeInteraction(i);
  assert.equal(log.posted.length, 0);
  assert.equal(log.nick, null);
  assert.match(log.edits.at(-1).content, /มีคนใช้/);
});

test('เลือกอาชีพเดิม: ไม่โพสต์ข้อความ "Knight >> Knight"', async () => {
  stubBackend({
    status: 200,
    body: memberRow({ job: { id: 2, label: 'Knight' }, before: { ign: 'Mimayuu', job: 'Knight' } }),
  });
  const { i, log } = fakeInteraction({ kind: 'select', customId: CHANGE_IDS.jobSelect, values: ['2'] });
  await handleChangeInteraction(i);
  assert.equal(log.posted.length, 0);
  assert.equal(log.panels.length, 0, 'ไม่มีข้อความใหม่ ปุ่มก็ไม่ต้องย้าย');
});
