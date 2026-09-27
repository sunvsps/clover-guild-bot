import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toCsv } from '../src/csv.js';

test('ขึ้นต้นด้วย BOM เพื่อให้ Excel อ่านภาษาไทยถูก', () => {
  const csv = toCsv(['IGN'], [['เดียอาโบเทมเพลส']]);
  assert.equal(csv[0], '﻿');
  assert.ok(csv.includes('เดียอาโบเทมเพลส'));
});

test('ค่าที่มีลูกน้ำหรืออัญประกาศ ต้องไม่ทำให้คอลัมน์เพี้ยน', () => {
  const csv = toCsv(['a', 'b'], [['มี,ลูกน้ำ', 'มี"อัญประกาศ"']]);
  const line = csv.split('\r\n')[1];
  assert.equal(line, '"มี,ลูกน้ำ","มี""อัญประกาศ"""');
});

test('ค่าว่างหรือ null ออกมาเป็นช่องว่าง ไม่ใช่คำว่า null', () => {
  const line = toCsv(['a', 'b'], [[null, undefined]]).split('\r\n')[1];
  assert.equal(line, ',');
});

test('แถวและคอลัมน์ครบตามที่ส่งเข้าไป', () => {
  const csv = toCsv(['x', 'y'], [['1', '2'], ['3', '4']]);
  const lines = csv.replace('﻿', '').trim().split('\r\n');
  assert.deepEqual(lines, ['x,y', '1,2', '3,4']);
});
