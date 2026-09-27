import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from '../src/onboarding.js';

const fakeInteraction = () => ({
  deferred: false,
  replied: false,
  replies: [],
  async reply(msg) {
    this.replies.push(msg.content);
  },
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('กดรัวพร้อมกัน ทำงานจริงครั้งเดียว ที่เหลือได้ข้อความบอกให้รอ', async () => {
  const i = fakeInteraction();
  let ran = 0;
  const work = async () => {
    await wait(30);
    ran++;
  };
  await Promise.all([1, 2, 3, 4].map(() => once('user-1', i, work)));
  assert.equal(ran, 1);
  assert.equal(i.replies.length, 3);
  assert.match(i.replies[0], /กำลังดำเนินการอยู่/);
});

test('งานแรกเสร็จแล้ว กดใหม่ได้', async () => {
  const i = fakeInteraction();
  let ran = 0;
  const work = async () => {
    ran++;
  };
  await once('user-2', i, work);
  await once('user-2', i, work);
  assert.equal(ran, 2);
});

test('คนละคนไม่บล็อกกัน', async () => {
  const i = fakeInteraction();
  let ran = 0;
  const work = async () => {
    await wait(20);
    ran++;
  };
  await Promise.all([once('user-3', i, work), once('user-4', i, work)]);
  assert.equal(ran, 2);
  assert.equal(i.replies.length, 0);
});

test('งานพัง ล็อกต้องถูกปลด ไม่ค้างจนกดอะไรไม่ได้อีกเลย', async () => {
  const i = fakeInteraction();
  await assert.rejects(() => once('user-5', i, async () => { throw new Error('พัง'); }));
  let ran = 0;
  await once('user-5', i, async () => { ran++; });
  assert.equal(ran, 1, 'หลังงานพัง ต้องกดใหม่ได้');
});
