import assert from 'node:assert/strict';
import { test } from 'node:test';
import { channelLink } from '../src/links.js';

const channel = { name: '💻แนะนำตัว', id: '222', guild: { id: '111' } };

test('เป็น URL เปล่าที่ Discord แปลงเป็นลิงก์ให้เอง (กดได้ทั้งใน DM และในห้อง)', () => {
  const link = channelLink(channel);
  assert.ok(link.includes('https://discord.com/channels/111/222'));
});

test('ไม่ใช้ลิงก์แบบ [ข้อความ](url) เพราะข้อความธรรมดาไม่รองรับ จะกลายเป็นตัวหนังสือกดไม่ได้', () => {
  const link = channelLink(channel);
  assert.ok(!/\]\(/.test(link), `ห้ามเป็นลิงก์แบบ markdown: ${link}`);
});

test('ไม่ใช้ <#id> เพราะใน DM จะขึ้นว่า No Access', () => {
  assert.ok(!channelLink(channel).includes('<#'));
});

test('บอกชื่อห้องไว้ด้วย จะได้รู้ว่าลิงก์พาไปไหน', () => {
  assert.ok(channelLink(channel).includes('💻แนะนำตัว'));
});

test('หาห้องไม่เจอก็ยังมีข้อความสำรอง ไม่พัง', () => {
  assert.equal(channelLink(null), '#แนะนำตัว');
  assert.equal(channelLink(undefined, '#ห้องกฎ'), '#ห้องกฎ');
});

test('ปุ่มลิงก์: style 5 และมี url (กดแล้วไปหน้านั้นเลย)', async () => {
  const { linkButtonRow } = await import('../src/links.js');
  const row = linkButtonRow('➡️ ไปอ่านกฎกิล', 'https://discord.com/channels/1/2');
  assert.equal(row.type, 1);
  const btn = row.components[0];
  assert.equal(btn.style, 5, 'ต้องเป็นปุ่มแบบลิงก์');
  assert.equal(btn.url, 'https://discord.com/channels/1/2');
  assert.equal(btn.label, '➡️ ไปอ่านกฎกิล');
});

test('ปุ่มลิงก์ต้องไม่มี customId ไม่งั้น Discord ปฏิเสธทั้งข้อความ', async () => {
  const { linkButtonRow } = await import('../src/links.js');
  assert.equal(linkButtonRow('x', 'https://a.b').components[0].customId, undefined);
});
