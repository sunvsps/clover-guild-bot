// คุยกับ backend (clover-guild-project) ผ่าน HTTP โดยแนบ X-Bot-Key ทุกครั้ง
const BASE_URL = (process.env.API_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const TIMEOUT_MS = 10_000;

/** error ที่รู้สาเหตุจาก backend เช่น DUPLICATE_IGN, INVALID_JOB */
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message ?? code);
    this.status = status;
    this.code = code;
  }
}

async function request(path, { method = 'GET', body } = {}) {
  const key = process.env.API_BOT_KEY;
  if (!key) throw new ApiError(0, 'NO_API_KEY', 'ยังไม่ได้ตั้ง API_BOT_KEY ใน .env');

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'X-Bot-Key': key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((err) => {
    // ต่อ backend ไม่ติดเลย (ยังไม่ได้เปิดเซิร์ฟเวอร์ / คนละเครื่อง / timeout)
    throw new ApiError(0, 'UNREACHABLE', `ติดต่อ backend ไม่ได้: ${err.message}`);
  });

  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.code ?? 'UNKNOWN', data?.error?.message);
  }
  return data;
}

let jobsCache = { at: 0, jobs: [] };
const JOBS_TTL_MS = 5 * 60 * 1000;

/**
 * รายการอาชีพสำหรับทำ dropdown ดึงจาก backend เพื่อไม่ให้รายชื่อสองที่ไม่ตรงกัน
 * ถ้าดึงไม่ได้แต่เคยดึงสำเร็จมาก่อน จะใช้ค่าเดิมต่อ เพื่อไม่ให้คนกรอกฟอร์มไม่ได้ตอน backend ล่ม
 */
export async function getJobs() {
  if (Date.now() - jobsCache.at < JOBS_TTL_MS && jobsCache.jobs.length) return jobsCache.jobs;
  try {
    const jobs = await request('/api/v1/bot/jobs');
    jobsCache = { at: Date.now(), jobs };
    return jobs;
  } catch (err) {
    if (jobsCache.jobs.length) {
      console.error('ดึงรายการอาชีพไม่ได้ ใช้ค่าที่ cache ไว้ต่อ:', err.message);
      return jobsCache.jobs;
    }
    throw err;
  }
}

/** ลงทะเบียนสมาชิก (สร้างใหม่หรืออัปเดตของเดิมก็ใช้ตัวนี้) */
export const registerMember = (discordId, { ign, jobId, nickname }) =>
  request(`/api/v1/bot/members/${discordId}`, { method: 'PUT', body: { ign, jobId, nickname } });

export const updateMember = (discordId, patch) =>
  request(`/api/v1/bot/members/${discordId}`, { method: 'PATCH', body: patch });

export const deactivateMember = (discordId) =>
  request(`/api/v1/bot/members/${discordId}/deactivate`, { method: 'POST' });

/** ข้อความภาษาไทยสำหรับ error ที่เจอบ่อย ใช้ตอบคนกรอกฟอร์ม */
export function apiErrorMessage(err) {
  if (!(err instanceof ApiError)) return 'เกิดข้อผิดพลาดที่ไม่รู้จัก';
  return (
    {
      DUPLICATE_IGN: 'ชื่อในเกมนี้มีคนใช้ลงทะเบียนแล้ว ถ้าคิดว่าผิดพลาดแจ้งทีมดูแลกิลด์',
      INVALID_JOB: 'ไม่พบอาชีพนี้ในระบบ ลองเลือกใหม่อีกครั้ง',
      BOT_KEY_INVALID: 'บอทยืนยันตัวกับระบบไม่ผ่าน (API_BOT_KEY ไม่ถูกต้อง) แจ้งทีมดูแลกิลด์',
      NO_API_KEY: 'บอทยังไม่ได้ตั้งค่า API_BOT_KEY แจ้งทีมดูแลกิลด์',
      UNREACHABLE: 'ระบบหลังบ้านไม่ตอบสนอง ลองใหม่อีกครั้งหรือแจ้งทีมดูแลกิลด์',
      SERVICE_BUSY: 'ระบบกำลังยุ่ง ลองกดใหม่อีกครั้ง',
    }[err.code] ?? `บันทึกข้อมูลไม่สำเร็จ (${err.code})`
  );
}
