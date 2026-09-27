import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NICKNAME_MAX } from '../src/config.js';
import { formatNickname } from '../src/onboarding.js';

test('ชื่อปกติได้รูปแบบ IGN/อาชีพ(ชื่อเล่น)', () => {
  assert.equal(formatNickname({ ign: 'Mimayuu', job: 'Knight', nickname: 'Mint' }), 'Mimayuu/Knight(Mint)');
});

test('ไม่มีชื่อเล่น ก็ไม่มีวงเล็บ', () => {
  assert.equal(formatNickname({ ign: 'Mimayuu', job: 'Knight', nickname: '' }), 'Mimayuu/Knight');
});

test('ชื่อไทยและอักขระพิเศษจากชีทกิลด์ใช้ได้', () => {
  const name = formatNickname({ ign: 'เสีEวค่ะXลวงMา', job: 'Blacksmith', nickname: 'ปอนด์' });
  assert.equal(name, 'เสีEวค่ะXลวงMา/Blacksmith(ปอนด์)');
  assert.ok(name.length <= NICKNAME_MAX);
});

test('ยาวเกิน 32 ตัว: ตัดชื่อเล่นออกก่อน', () => {
  const name = formatNickname({ ign: 'ทะลวงรูโบ๋เบ๋', job: 'Blacksmith', nickname: 'ยาวมากๆเลยนะ' });
  assert.ok(name.length <= NICKNAME_MAX, `ยาว ${name.length}`);
  assert.equal(name, 'ทะลวงรูโบ๋เบ๋/Blacksmith');
});

test('ตัดชื่อเล่นแล้วยังยาวเกิน: เหลือแต่ IGN', () => {
  const ign = 'A'.repeat(28);
  assert.equal(formatNickname({ ign, job: 'Blacksmith', nickname: 'X' }), ign);
});

test('IGN อย่างเดียวก็ยังยาวเกิน: ตัดให้พอดี 32', () => {
  const name = formatNickname({ ign: 'B'.repeat(40), job: 'Knight', nickname: 'X' });
  assert.equal(name.length, NICKNAME_MAX);
});
