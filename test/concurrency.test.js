import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

/** โหลด store.js เป็นก้อนใหม่ (cache ว่าง) เหมือนบอทเพิ่งเปิดเครื่อง */
let n = 0;
const freshStore = async (file) => {
  process.env.ONBOARDING_FILE = file;
  return import(`../src/store.js?fresh=${n++}`);
};
const tempFile = () => join(mkdtempSync(join(tmpdir(), 'clover-conc-')), 'onboarding.json');

test('คนหลายคนกดขอเข้ากิลพร้อมกันตอนบอทเพิ่งเปิด ข้อมูลต้องไม่หาย', async () => {
  const file = tempFile();
  writeFileSync(file, JSON.stringify({ เดิม: { ign: 'OldMember' } }));
  const store = await freshStore(file);

  // ทุกคนกดพร้อมกัน = load() ถูกเรียกพร้อมกันตอน cache ยังว่าง
  await Promise.all(
    Array.from({ length: 8 }, (_, k) => store.set(`u${k}`, { ign: `IGN${k}`, status: store.STATUS.requested })),
  );

  const onDisk = JSON.parse(await readFile(file, 'utf8'));
  for (let k = 0; k < 8; k++) {
    assert.equal(onDisk[`u${k}`]?.ign, `IGN${k}`, `ข้อมูลของ u${k} หายไป`);
  }
  assert.equal(onDisk['เดิม'].ign, 'OldMember', 'ข้อมูลเดิมในไฟล์ต้องไม่ถูกทับ');
});

test('อ่านและเขียนสลับกันพร้อมกัน ก็ยังได้ค่าครบ', async () => {
  const store = await freshStore(tempFile());
  const work = [];
  for (let k = 0; k < 6; k++) {
    work.push(store.set(`p${k}`, { ign: `A${k}` }));
    work.push(store.get(`p${k}`));
    work.push(store.listByStatus(store.STATUS.requested));
  }
  await Promise.all(work);
  for (let k = 0; k < 6; k++) assert.equal((await store.get(`p${k}`)).ign, `A${k}`);
});

test('ป้ายในห้องต้องไม่ซ้ำ เมื่อสองคนแนะนำตัวเสร็จพร้อมกัน', async () => {
  const { movePanelToBottom } = await import('../src/panels.js');
  let sent = 0;
  const messages = [{ id: 'card', webhookId: 'hook', author: { id: 'other' }, components: [], mentions: { users: { size: 0 } } }];
  const channel = {
    id: 'ch-1',
    client: { user: { id: 'BOT' } },
    messages: {
      fetch: async () => {
        await new Promise((r) => setTimeout(r, 5)); // จำลองความหน่วงของเครือข่าย
        return { values: () => messages.values(), first: () => messages[0] };
      },
    },
    async send() {
      sent++;
      const panel = {
        id: `panel-${sent}`,
        webhookId: null,
        author: { id: 'BOT' },
        type: 0,
        mentions: { users: { size: 0 } },
        components: [{ components: [{ customId: 'intro' }] }],
        delete: async () => {},
        pin: async () => {},
      };
      messages.unshift(panel); // ข้อความใหม่สุดอยู่หน้าสุด เหมือน Discord
      return panel;
    },
  };

  await Promise.all([
    movePanelToBottom(channel, 'intro', {}),
    movePanelToBottom(channel, 'intro', {}),
    movePanelToBottom(channel, 'intro', {}),
  ]);
  assert.equal(sent, 1, `ควรโพสต์ป้ายครั้งเดียว แต่โพสต์ ${sent} ครั้ง`);
});
