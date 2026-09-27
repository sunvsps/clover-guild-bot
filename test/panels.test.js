import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MessageType } from 'discord.js';
import { movePanelToBottom, postPanel } from '../src/panels.js';

const BOT = 'bot-id';

/** ข้อความจำลอง: ป้ายของบอท / การ์ดจาก webhook / ข้อความทักที่ mention คน / ข้อความระบบปักหมุด */
const msg = (id, kind) => ({
  id,
  webhookId: kind === 'webhook' ? 'hook' : null,
  author: { id: kind === 'human' ? 'someone' : BOT },
  type: kind === 'pin' ? MessageType.ChannelPinnedMessage : MessageType.Default,
  mentions: { users: { size: kind === 'greeting' ? 1 : 0 } },
  components: kind === 'panel' || kind === 'greeting' ? [{ components: [{ customId: 'intro' }] }] : [],
  deleted: false,
  async delete() {
    this.deleted = true;
  },
});

/** ห้องจำลอง: messages.fetch คืนข้อความใหม่สุดก่อน เหมือน Discord จริง */
const channel = (messages) => ({
  sent: 0,
  pinned: 0,
  client: { user: { id: BOT } },
  messages: {
    fetch: async () => ({
      values: () => messages.values(),
      first: () => messages[0],
    }),
  },
  async send() {
    this.sent++;
    const m = msg('new', 'panel');
    m.pin = async () => {
      this.pinned++;
    };
    return m;
  },
});

test('postPanel ลบป้ายเก่าแล้วส่งใหม่', async () => {
  const old = msg('old', 'panel');
  const ch = channel([old]);
  const removed = await postPanel(ch, 'intro', {});
  assert.equal(removed, 1);
  assert.equal(old.deleted, true);
  assert.equal(ch.sent, 1);
});

test('ไม่แตะการ์ดสมาชิก (webhook), ข้อความคน และข้อความทักที่ mention', async () => {
  const card = msg('card', 'webhook');
  const human = msg('human', 'human');
  const greeting = msg('greeting', 'greeting');
  const ch = channel([card, human, greeting]);
  await postPanel(ch, 'intro', {});
  assert.equal(card.deleted, false);
  assert.equal(human.deleted, false);
  assert.equal(greeting.deleted, false, 'ข้อความทักคนใหม่ต้องไม่ถูกลบ');
});

test('ลบข้อความระบบ "pinned a message" ของบอทด้วย', async () => {
  const pin = msg('pin', 'pin');
  const ch = channel([pin]);
  const removed = await postPanel(ch, 'intro', {});
  assert.equal(pin.deleted, true);
  assert.equal(removed, 1);
});

test('ไม่ลบป้ายของปุ่มอื่น (คนละ customId)', async () => {
  const other = msg('other', 'panel');
  other.components = [{ components: [{ customId: 'party' }] }];
  const ch = channel([other]);
  const removed = await postPanel(ch, 'intro', {});
  assert.equal(other.deleted, false);
  assert.equal(removed, 0);
});

test('movePanelToBottom: ป้ายอยู่ล่างสุดแล้ว ไม่ทำอะไรเลย', async () => {
  const panel = msg('panel', 'panel');
  const ch = channel([panel]);
  const removed = await movePanelToBottom(ch, 'intro', {});
  assert.equal(removed, 0);
  assert.equal(ch.sent, 0, 'ไม่ควรส่งซ้ำ');
  assert.equal(panel.deleted, false);
});

test('movePanelToBottom: มีการ์ดมาแทรก ย้ายป้ายลงล่าง', async () => {
  const card = msg('card', 'webhook');
  const panel = msg('panel', 'panel');
  const ch = channel([card, panel]); // การ์ดใหม่กว่า = ป้ายถูกดันขึ้น
  await movePanelToBottom(ch, 'intro', {});
  assert.equal(ch.sent, 1);
  assert.equal(panel.deleted, true);
  assert.equal(card.deleted, false);
});

test('ปักหมุดเมื่อสั่ง pin', async () => {
  const ch = channel([]);
  await postPanel(ch, 'intro', {}, { pin: true });
  assert.equal(ch.pinned, 1);
});

test('dropdown อาชีพต้องไม่มีตัวเลือกไหนถูกติ๊กไว้ล่วงหน้า (ไม่งั้นเลือกค่าเดิมซ้ำไม่ได้)', async () => {
  const { jobSelectRow } = await import('../src/panels.js');
  const jobs = [
    { id: 2, label: 'Knight' },
    { id: 6, label: 'อาลิเทีย' },
  ];
  const options = jobSelectRow(jobs).toJSON().components[0].options;
  assert.equal(options.length, 2);
  for (const o of options) assert.ok(!o.default, `${o.label} ไม่ควรถูกติ๊กไว้`);
  assert.deepEqual(
    options.map((o) => o.value),
    ['2', '6'],
  );
});

test('dropdown รับได้สูงสุด 25 อาชีพตามที่ Discord จำกัด', async () => {
  const { jobSelectRow } = await import('../src/panels.js');
  const many = Array.from({ length: 40 }, (_, n) => ({ id: n + 1, label: `Job${n + 1}` }));
  assert.equal(jobSelectRow(many).toJSON().components[0].options.length, 25);
});

test('deleteJoinMessage ลบเฉพาะปุ่มของคนนั้น ไม่แตะของคนอื่น', async () => {
  const { deleteJoinMessage } = await import('../src/panels.js');
  const mine = msg('mine', 'panel');
  mine.components = [{ components: [{ customId: 'join-request:111' }] }];
  mine.mentions = { users: { size: 1 } }; // ข้อความทักที่ mention เจ้าตัว
  const other = msg('other', 'panel');
  other.components = [{ components: [{ customId: 'join-request:222' }] }];
  const generic = msg('generic', 'panel');
  generic.components = [{ components: [{ customId: 'join-request' }] }];

  const ch = channel([mine, other, generic]);
  const removed = await deleteJoinMessage(ch, '111');
  assert.equal(removed, 1);
  assert.equal(mine.deleted, true);
  assert.equal(other.deleted, false, 'ปุ่มของคนอื่นต้องอยู่ต่อ');
  assert.equal(generic.deleted, false, 'ป้ายกลางของห้องต้องไม่ถูกลบ');
  assert.equal(ch.sent, 0, 'ลบอย่างเดียว ไม่โพสต์ใหม่');
});

test('deleteJoinMessage ไม่แตะข้อความของคนหรือ webhook', async () => {
  const { deleteJoinMessage } = await import('../src/panels.js');
  const human = msg('human', 'human');
  human.components = [{ components: [{ customId: 'join-request:111' }] }];
  const hook = msg('hook', 'webhook');
  hook.components = [{ components: [{ customId: 'join-request:111' }] }];
  const ch = channel([human, hook]);
  assert.equal(await deleteJoinMessage(ch, '111'), 0);
  assert.equal(human.deleted, false);
  assert.equal(hook.deleted, false);
});
