import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { MessageFlags } from 'discord.js';
import { postPanel, silently } from '../src/panels.js';

const SUPPRESS = MessageFlags.SuppressNotifications;

test('silently ติดธง "ไม่เด้งแจ้งเตือน" โดยไม่ทิ้งค่าอื่นในข้อความ', () => {
  const out = silently({ content: 'hello', components: [1] });
  assert.equal(out.content, 'hello');
  assert.deepEqual(out.components, [1]);
  assert.ok((out.flags & SUPPRESS) !== 0);
});

test('silently ไม่ทับ flags เดิมที่มีอยู่', () => {
  const out = silently({ content: 'x', flags: MessageFlags.SuppressEmbeds });
  assert.ok((out.flags & MessageFlags.SuppressEmbeds) !== 0, 'flag เดิมต้องยังอยู่');
  assert.ok((out.flags & SUPPRESS) !== 0);
});

const channel = () => ({
  id: 'ch',
  sentPayload: null,
  client: { user: { id: 'BOT' } },
  messages: { fetch: async () => ({ values: () => [].values(), first: () => undefined }) },
  async send(payload) {
    this.sentPayload = payload;
    return { pin: async () => {} };
  },
});

test('postPanel แบบ silent: ข้อความที่ส่งต้องติดธงเงียบ', async () => {
  const ch = channel();
  await postPanel(ch, 'intro', { content: 'panel' }, { silent: true });
  assert.ok((ch.sentPayload.flags & SUPPRESS) !== 0);
});

test('postPanel ปกติ: ไม่ติดธงเงียบ (ห้องอื่นยังแจ้งเตือนตามปกติ)', async () => {
  const ch = channel();
  await postPanel(ch, 'intro', { content: 'panel' });
  assert.ok(!(ch.sentPayload.flags ?? 0));
});

test('ป้ายปุ่มแนะนำตัวต้องเงียบ แต่การ์ดของสมาชิกต้องแจ้งเตือน', () => {
  const index = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  const onboarding = readFileSync(new URL('../src/onboarding.js', import.meta.url), 'utf8');

  assert.match(index, /postPanel\(intro, 'intro'.*silent: true/s, 'ป้ายในห้องแนะนำตัวต้องเงียบ');
  assert.match(onboarding, /movePanelToBottom\(introChannel.*silent: true/s, 'ป้ายที่ย้ายลงล่างต้องเงียบ');
  assert.ok(
    !/hook\.send\(\s*silently\(/s.test(onboarding),
    'การ์ดแนะนำตัวของสมาชิกต้องแจ้งเตือนตามปกติ',
  );
});

test('ห้อง welcome ต้องแจ้งเตือนตามปกติ คนใหม่จะได้รู้ตัว', () => {
  const index = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  const join = index.slice(index.indexOf("client.on('guildMemberAdd'"), index.indexOf("client.on('interactionCreate'"));
  assert.ok(!join.includes('silently('), 'ข้อความต้อนรับต้องไม่เงียบ');
  assert.ok(join.includes('join-request:'), 'ต้องมีปุ่มขอเข้ากิลติดไปด้วย');
  assert.ok(!/postPanel\(welcome[^)]*silent: true/s.test(index), 'ป้ายใน welcome ต้องไม่เงียบ');
});

test('เรื่องตี้ประจำต้องอยู่หลังยอมรับกฎประมูล ไม่ใช่ตอนแนะนำตัว', () => {
  const src = readFileSync(new URL('../src/onboarding.js', import.meta.url), 'utf8');
  const selectJob = src.slice(src.indexOf('export async function selectJob'));
  const introBody = selectJob.slice(0, selectJob.indexOf('\n}\n'));
  assert.ok(!/ตี้ประจำ/.test(introBody), 'ขั้นแนะนำตัวต้องไม่พูดถึงตี้ประจำแล้ว');

  const dm = src.slice(src.indexOf('async function sendWelcomeDm'));
  const dmBody = dm.slice(0, dm.indexOf('\n}\n'));
  assert.match(dmBody, /ยินดีต้อนรับ/, 'ต้องมีข้อความต้อนรับ');
  assert.match(dmBody, /ตี้ประจำ/, 'ต้องบอกเรื่องตี้ประจำ');
  assert.match(dmBody, /ไม่บังคับ/);
  assert.match(dmBody, /2 คน/);
  assert.match(dmBody, /channelLink\(party/, 'ต้องใช้ลิงก์แบบที่กดได้ใน DM');

  const accept = src.slice(src.indexOf('export async function acceptAuctionRules'));
  assert.ok(
    accept.slice(0, accept.indexOf('\n}\n')).includes('sendWelcomeDm('),
    'ต้องส่ง DM ต้อนรับหลังยอมรับกฎประมูลสำเร็จ',
  );
});

test('DM ตอนอนุมัติ: บอกแค่ให้ไปแนะนำตัว ไม่ต้องพูดเรื่องตี้ประจำ', () => {
  const src = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  const start = src.indexOf('ได้รับการอนุมัติแล้ว');
  const dm = src.slice(start - 200, start + 400);
  assert.match(dm, /แนะนำตัวที่/, 'ต้องบอกให้ไปแนะนำตัว');
  assert.match(dm, /channelLink\(intro/, 'ต้องใช้ channelLink เพราะ <#id> ใน DM จะขึ้น No Access');
  assert.ok(!/ตี้ประจำ/.test(dm), 'ย้ายไปอยู่ DM หลังยอมรับกฎประมูลแล้ว');
});

test('ข้อความต้อนรับต้องมีทั้งประโยคทักและปุ่ม และหน่วงก่อนส่ง', () => {
  const index = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  const join = index.slice(
    index.indexOf("client.on('guildMemberAdd'"),
    index.indexOf("client.on('interactionCreate'"),
  );
  assert.match(join, /เข้ามาในเซิร์ฟเวอร์แล้ว ยินดีต้อนรับ/, 'ต้องมีประโยคทักในข้อความ');
  assert.match(join, /join-request:/, 'ต้องมีปุ่มขอเข้ากิล');
  assert.ok(
    join.indexOf('JOIN_MESSAGE_DELAY_MS') < join.indexOf('welcome\n    .send'),
    'ต้องหน่วงก่อนส่ง ไม่งั้นข้อความอาจไม่ขึ้นบนหน้าจอคนที่เพิ่งเข้า',
  );
});
