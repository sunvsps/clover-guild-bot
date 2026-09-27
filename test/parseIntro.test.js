import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchJob, parseIntroMessage } from '../src/parseIntro.js';

// รายการอาชีพจริงในระบบ
const jobs = [
  { id: 2, label: 'Knight' },
  { id: 5, label: 'Crusader' },
  { id: 3, label: 'Wizard' },
  { id: 4, label: 'Hunter' },
  { id: 8, label: 'Bard' },
  { id: 9, label: 'Dancer' },
  { id: 1, label: 'Priest' },
  { id: 10, label: 'Monk' },
  { id: 7, label: 'Assassin' },
  { id: 11, label: 'Blacksmith' },
  { id: 12, label: 'Alchemist' },
  { id: 13, label: 'Rebel' },
  { id: 6, label: 'อาลิเทีย' },
];

test('แกะข้อความจริงจากห้องแนะนำตัวได้ทุกแบบที่คนพิมพ์', () => {
  const cases = [
    ['IGN: เดียอาโบเทมเพลส\nชื่อ ทิม\nอาชีพ ม้อง', 'เดียอาโบเทมเพลส', 'ทิม', 'ม้อง'],
    ['IGN: มาเบลกินแซ่บ\nชื่อ มีน\nอาชีพ Nightwalker', 'มาเบลกินแซ่บ', 'มีน', 'Nightwalker'],
    ['IGN : Boeing747\nชื่อ วอย\nอาชีพ  ไบโอ', 'Boeing747', 'วอย', 'ไบโอ'],
    ['IGN : อีดอกถ่างขๅ\nชื่อ แวม\nอาชีพ ไบโอ', 'อีดอกถ่างขๅ', 'แวม', 'ไบโอ'],
    ['IGN: -RossesFall\nชื่อ : ยัพ\nอาชีพ : Creator', '-RossesFall', 'ยัพ', 'Creator'],
    ['IGN : OCTss\nชื่อ เปา\nอาชีพ: Bard', 'OCTss', 'เปา', 'Bard'],
  ];
  for (const [text, ign, nickname, job] of cases) {
    const got = parseIntroMessage(text);
    assert.equal(got.ign, ign, text);
    assert.equal(got.nickname, nickname, text);
    assert.equal(got.job, job, text);
  }
});

test('รูปแบบของบอทเอง (มี mention ต่อท้าย) ก็แกะได้', () => {
  const got = parseIntroMessage('IGN: Mimayuu\nชื่อเล่น: Mint\nอาชีพ: Knight\n-# <@123>');
  assert.equal(got.ign, 'Mimayuu');
  assert.equal(got.nickname, 'Mint');
  assert.equal(got.job, 'Knight');
});

test('ข้อความที่ไม่ใช่การแนะนำตัว ต้องไม่ถูกแกะมั่ว', () => {
  assert.equal(parseIntroMessage('สวัสดีครับทุกคน').ign, null);
});

test('จับคู่อาชีพจากคำที่คนในกิลด์เรียกกันเอง', () => {
  const pairs = [
    ['ม้อง', 'Monk'],
    ['Nightwalker', 'Assassin'],
    ['ไบโอ', 'Alchemist'],
    ['Creator', 'Alchemist'],
    ['Bard', 'Bard'],
    ['knight', 'Knight'],
    ['High Priest', 'Priest'],
    ['พาลา', 'Crusader'],
    ['สไนป์', 'Hunter'],
    ['Whitesmith', 'Blacksmith'],
    ['อาลิเทีย', 'อาลิเทีย'],
    ['ดรูอิด', 'อาลิเทีย'],
  ];
  for (const [text, label] of pairs) {
    assert.equal(matchJob(text, jobs)?.label, label, `${text} ควรได้ ${label}`);
  }
});

test('อาชีพที่ไม่รู้จัก ต้องคืน null ไม่ใช่เดามั่ว', () => {
  assert.equal(matchJob('อะไรก็ไม่รู้', jobs), null);
  assert.equal(matchJob('', jobs), null);
  assert.equal(matchJob(null, jobs), null);
});
