import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { ApiError, apiErrorMessage, getJobs, registerMember } from '../src/api.js';

const realFetch = globalThis.fetch;
const JOBS = [
  { id: 2, label: 'Knight', color: '#d94c4c', sortOrder: 0 },
  { id: 6, label: 'อาลิเทีย', color: '#3fa37a', sortOrder: 12 },
];

let calls = [];
const stubFetch = (handler) => {
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  };
};
const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

beforeEach(() => {
  calls = [];
  process.env.API_BOT_KEY = 'test-key';
  process.env.API_BASE_URL = 'http://localhost:3000';
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

test('แนบ X-Bot-Key ไปทุก request', async () => {
  stubFetch(() => jsonResponse(200, JOBS));
  await getJobs();
  assert.equal(calls[0].init.headers['X-Bot-Key'], 'test-key');
  assert.match(calls[0].url, /\/api\/v1\/bot\/jobs$/);
});

test('backend ล่มหลัง cache ไว้แล้ว: ใช้ค่าเดิมต่อ ไม่ทำให้คนกรอกฟอร์มไม่ได้', async () => {
  stubFetch(() => jsonResponse(200, JOBS));
  const first = await getJobs();
  assert.equal(first.length, 2);

  stubFetch(() => {
    throw new Error('เน็ตล่ม');
  });
  const cached = await getJobs();
  assert.deepEqual(cached, first);
});

test('ไม่มีคีย์ -> NO_API_KEY พร้อมข้อความไทย', async () => {
  delete process.env.API_BOT_KEY;
  await assert.rejects(
    () => registerMember('1', { ign: 'X', jobId: 2, nickname: null }),
    (err) => {
      assert.equal(err.code, 'NO_API_KEY');
      assert.match(apiErrorMessage(err), /API_BOT_KEY/);
      return true;
    },
  );
});

test('IGN ซ้ำ -> DUPLICATE_IGN แปลเป็นข้อความไทยที่สมาชิกอ่านรู้เรื่อง', async () => {
  stubFetch(() => jsonResponse(409, { error: { code: 'DUPLICATE_IGN', message: 'dup' } }));
  await assert.rejects(
    () => registerMember('1', { ign: 'X', jobId: 2, nickname: null }),
    (err) => {
      assert.equal(err.status, 409);
      assert.equal(err.code, 'DUPLICATE_IGN');
      assert.match(apiErrorMessage(err), /ชื่อในเกมนี้มีคนใช้/);
      return true;
    },
  );
});

test('error ที่ไม่รู้จักยังได้ข้อความที่บอกรหัสไว้ ไม่ใช่ค่าว่าง', () => {
  assert.match(apiErrorMessage(new ApiError(500, 'WEIRD_THING')), /WEIRD_THING/);
  assert.match(apiErrorMessage(new Error('อื่นๆ')), /ไม่รู้จัก/);
});

test('ส่ง ign/jobId/nickname ไปครบตามที่ backend ต้องการ', async () => {
  stubFetch(() => jsonResponse(200, { ign: 'X' }));
  await registerMember('900', { ign: 'Mimayuu', jobId: 2, nickname: 'Mint' });
  assert.match(calls[0].url, /\/api\/v1\/bot\/members\/900$/);
  assert.equal(calls[0].init.method, 'PUT');
  assert.deepEqual(JSON.parse(calls[0].init.body), { ign: 'Mimayuu', jobId: 2, nickname: 'Mint' });
});
