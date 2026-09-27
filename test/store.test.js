import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// ต้องตั้งก่อน import store.js เพราะอ่านค่าตอนโหลดโมดูล
process.env.ONBOARDING_FILE = join(mkdtempSync(join(tmpdir(), 'clover-store-')), 'onboarding.json');
const store = await import('../src/store.js');

test('เก็บค่าแล้วอ่านกลับได้ และรวมค่าใหม่กับของเดิมโดยไม่ลบทิ้ง', async () => {
  await store.set('111', { ign: 'Mimayuu', status: store.STATUS.requested });
  await store.set('111', { nickname: 'Mint', jobId: 2, status: store.STATUS.introduced });
  const saved = await store.get('111');
  assert.equal(saved.ign, 'Mimayuu', 'IGN จากขั้นแรกต้องไม่หาย');
  assert.equal(saved.nickname, 'Mint');
  assert.equal(saved.status, store.STATUS.introduced);
  assert.ok(saved.updatedAt, 'ต้องบันทึกเวลาแก้ล่าสุด');
});

test('ยังไม่เคยบันทึกก็ได้ null ไม่ใช่พัง', async () => {
  assert.equal(await store.get('ไม่มีคนนี้'), null);
});

test('listByStatus คืนเฉพาะคนที่อยู่ในสถานะนั้น', async () => {
  await store.set('222', { ign: 'Somchai', status: store.STATUS.requested });
  await store.set('333', { ign: 'Done', status: store.STATUS.registered });
  const waiting = await store.listByStatus(store.STATUS.requested);
  const ids = waiting.map((w) => w.discordId);
  assert.ok(ids.includes('222'));
  assert.ok(!ids.includes('333'));
  assert.equal(waiting.find((w) => w.discordId === '222').ign, 'Somchai');
});

test('ลบแล้วหายจริง', async () => {
  await store.set('444', { ign: 'Temp' });
  await store.remove('444');
  assert.equal(await store.get('444'), null);
});

test('เขียนลงไฟล์จริงเป็น JSON ที่อ่านได้ (บอทรีสตาร์ทแล้วข้อมูลไม่หาย)', async () => {
  await store.set('555', { ign: 'Persist' });
  const onDisk = JSON.parse(readFileSync(process.env.ONBOARDING_FILE, 'utf8'));
  assert.equal(onDisk['555'].ign, 'Persist');
});

test('เขียนพร้อมกันหลายคน ข้อมูลไม่ตีกัน', async () => {
  await Promise.all(
    Array.from({ length: 10 }, (_, n) => store.set(`p${n}`, { ign: `IGN${n}` })),
  );
  const onDisk = JSON.parse(readFileSync(process.env.ONBOARDING_FILE, 'utf8'));
  for (let n = 0; n < 10; n++) assert.equal(onDisk[`p${n}`].ign, `IGN${n}`);
});
