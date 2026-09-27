import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// Discord ให้เวลาตอบ interaction แค่ 3 วินาที ถ้าเกินจะได้ Unknown interaction (10062)
// งานที่ต้องคุยกับ Discord/ไฟล์/backend ก่อนตอบ จึงต้อง defer ไว้ก่อนเสมอ
// เทสต์นี้อ่านซอร์สเพื่อกันไม่ให้ลำดับถูกสลับกลับไปแบบเดิมโดยไม่รู้ตัว
const src = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');

const sliceBetween = (from, to) => {
  const start = src.indexOf(from);
  assert.ok(start > 0, `ไม่เจอโค้ดส่วน: ${from}`);
  const end = to ? src.indexOf(to, start) : src.length;
  return src.slice(start, end > 0 ? end : src.length);
};

test('อนุมัติสมาชิก: ต้อง deferUpdate ก่อนดึงข้อมูลและใส่ role', () => {
  const block = sliceBetween("// ── ด่าน 2: แนะนำตัว ──");
  const approve = sliceBetween("await i.deferUpdate();", "// ── ด่าน 2: แนะนำตัว ──");
  assert.ok(approve.includes('guild.members.fetch'), 'ต้องดึงสมาชิกหลัง defer');
  assert.ok(approve.includes('setStage('), 'ต้องใส่ role หลัง defer');
  assert.ok(!approve.includes('i.update('), 'หลัง defer ต้องใช้ editReply ไม่ใช่ update');
  assert.ok(block.length > 0);
});

test('อนุมัติสมาชิก: ห้ามมี await คั่นก่อน deferUpdate', () => {
  const branch = sliceBetween("if (i.customId.startsWith('approve:')", 'await i.deferUpdate();');
  const awaitsBefore = branch.match(/await /g) ?? [];
  assert.equal(awaitsBefore.length, 0, `มี await ก่อน defer ${awaitsBefore.length} จุด: ${branch}`);
});

test('ไม่อนุมัติ: เปิดฟอร์มเป็นคำตอบแรก แล้วค่อย defer ตอนรับค่าจากฟอร์ม', () => {
  const branch = sliceBetween("if (action === 'reject')", 'await i.deferUpdate();');
  assert.ok(branch.includes('i.showModal('), 'ต้องเปิดฟอร์มทันที');
  assert.ok(!branch.includes('await '), 'ห้าม await ก่อน showModal');
  const modal = sliceBetween("if (i.customId.startsWith('reject:')) {");
  assert.ok(modal.indexOf('deferReply') < modal.indexOf('guild.members.fetch'), 'ต้อง defer ก่อนทำงาน');
});

test('ลองบันทึกอีกครั้ง: defer ก่อนดึงข้อมูล', () => {
  const branch = sliceBetween("if (i.customId.startsWith('retry-register:'))", '// ── แจ้งตี้ประจำ ──');
  assert.ok(
    branch.indexOf('deferReply') < branch.indexOf('guild.members.fetch'),
    'ต้อง defer ก่อนดึงสมาชิก',
  );
});

test('ทุกจุดที่เรียก findGuildRulesPost ต้อง defer ไว้ก่อน (ครั้งแรกโหลดฟอรั่มทั้งหมด ช้า)', () => {
  for (const m of src.matchAll(/findGuildRulesPost\(/g)) {
    const before = src.slice(Math.max(0, m.index - 600), m.index);
    assert.ok(
      /defer(Reply|Update)\(/.test(before) || before.includes('async function postPanels'),
      `เรียก findGuildRulesPost โดยไม่ defer ก่อน ที่ตำแหน่ง ${m.index}`,
    );
  }
});

test('สคริปต์ตั้งค่าเซิร์ฟและดึงข้อมูล ต้องรับ --guild ได้ ไม่ใช่อ่านจาก .env อย่างเดียว', () => {
  for (const file of ['../scripts/setup-server.js', '../scripts/import-intros.js']) {
    const code = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(code, /--guild/, `${file} ต้องรับ --guild`);
    assert.ok(
      code.indexOf('const GUILD_ID') < code.indexOf('guilds.fetch('),
      `${file} ต้องอ่านค่า --guild ก่อนเชื่อมเซิร์ฟ`,
    );
    assert.match(code, /บอทไม่ได้อยู่ในเซิร์ฟ/, `${file} ต้องบอกให้ชัดถ้าบอทไม่ได้อยู่ในเซิร์ฟนั้น`);
  }
});
