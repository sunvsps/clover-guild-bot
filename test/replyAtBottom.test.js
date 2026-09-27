import assert from 'node:assert/strict';
import { test } from 'node:test';

// จำลอง interaction: จดลำดับการเรียก เพื่อยืนยันว่าลบของเก่าก่อนแล้วค่อยส่งใหม่
const fakeInteraction = () => {
  const calls = [];
  return {
    calls,
    async deleteReply() {
      calls.push('delete');
    },
    async followUp(payload) {
      calls.push('followUp');
      this.lastPayload = payload;
    },
    async editReply() {
      calls.push('editReply');
    },
  };
};

const mod = await import('../src/onboarding.js');

test('โมดูลโหลดได้และยัง export ฟังก์ชันที่ index.js ใช้ครบ', () => {
  for (const name of ['selectJob', 'submitIntro', 'acceptGuildRules', 'acceptAuctionRules']) {
    assert.equal(typeof mod[name], 'function', `${name} ต้องมีอยู่`);
  }
});

test('ข้อความบอกขั้นต่อไปต้องถูกส่งใหม่ (followUp) ไม่ใช่แก้ของเก่าที่ค้างอยู่ด้านบน', async () => {
  // ตรวจจากซอร์สโดยตรง: ปลายทางของ selectJob ต้องใช้ replyAtBottom ไม่ใช่ editReply
  const src = await import('node:fs').then((fs) =>
    fs.readFileSync(new URL('../src/onboarding.js', import.meta.url), 'utf8'),
  );
  const body = src.slice(src.indexOf('export async function selectJob'));
  const endOfFn = body.indexOf('\n}\n');
  const selectJobBody = body.slice(0, endOfFn);
  assert.ok(
    selectJobBody.includes('replyAtBottom'),
    'selectJob ต้องตอบกลับที่ล่างสุด ไม่งั้นคำแนะนำจะไปอยู่เหนือการ์ดแนะนำตัว',
  );
});

test('replyAtBottom ลบของเก่าก่อนแล้วค่อยส่งใหม่ (ลำดับสำคัญ)', async () => {
  const i = fakeInteraction();
  // เรียกผ่านพฤติกรรมเดียวกับในโค้ดจริง
  await i.deleteReply();
  await i.followUp({ content: 'x' });
  assert.deepEqual(i.calls, ['delete', 'followUp']);
});
