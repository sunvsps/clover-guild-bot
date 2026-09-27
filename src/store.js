// สถานะ onboarding ของแต่ละคน เก็บเป็นไฟล์ JSON ข้างบอท
//
// เดิมบอทอ่านค่า IGN/อาชีพ จากข้อความในห้องแนะนำตัวด้วย regex ซึ่งหายได้ถ้าโพสต์ถูกลบหรือเลื่อนพ้น 100 ข้อความ
// ไฟล์นี้จึงเป็นที่เก็บจริงระหว่างทาง ส่วนข้อมูลที่ยืนยันแล้วปลายทางอยู่ใน database ผ่าน backend
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ตั้ง ONBOARDING_FILE ได้เพื่อให้เทสต์เขียนลงไฟล์ชั่วคราว ไม่ไปทับข้อมูลจริง
const FILE =
  process.env.ONBOARDING_FILE ??
  join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'onboarding.json');

/** สถานะที่เป็นไปได้ตามลำดับ flow */
export const STATUS = {
  requested: 'requested', // กรอก IGN ขอเข้ากิลแล้ว รอแอดมินอนุมัติ
  approved: 'approved', // แอดมินอนุมัติแล้ว เข้าห้องแนะนำตัวได้
  rejected: 'rejected', // ไม่อนุมัติ (สมัครใหม่ได้)
  introduced: 'introduced', // กรอกฟอร์มแนะนำตัวครบแล้ว
  acceptedGuild: 'accepted_guild', // ยอมรับกฎกิลแล้ว
  registered: 'registered', // ยอมรับกฎครบและบันทึกลง database สำเร็จ
};

let cache = null;
let loading = null;
let writing = Promise.resolve();

/**
 * อ่านไฟล์ครั้งเดียวแล้วจำไว้
 *
 * ต้องจำ "promise ที่กำลังอ่านอยู่" ด้วย ไม่ใช่จำแค่ผลลัพธ์: ถ้าคนหลายคนกดปุ่มพร้อมกันตอนบอทเพิ่งเปิด
 * ทุกคนจะเข้ามาอ่านไฟล์พร้อมกันแล้วต่างคนต่างได้ object คนละก้อน คนที่เขียนทีหลังจะทับข้อมูลของคนก่อนหน้า
 */
async function load() {
  if (cache) return cache;
  if (!loading) {
    loading = (async () => {
      try {
        cache = JSON.parse(await readFile(FILE, 'utf8'));
      } catch (err) {
        if (err.code !== 'ENOENT') console.error('อ่านไฟล์สถานะไม่ได้ เริ่มใหม่เป็นค่าว่าง:', err.message);
        cache = {};
      }
      return cache;
    })();
  }
  return loading;
}

/** เขียนแบบ atomic (เขียนไฟล์ชั่วคราวแล้ว rename) กันไฟล์พังถ้าบอทดับกลางคัน */
async function flush() {
  const data = JSON.stringify(cache, null, 2);
  writing = writing.then(async () => {
    await mkdir(dirname(FILE), { recursive: true });
    const tmp = `${FILE}.${process.pid}.tmp`;
    await writeFile(tmp, data);
    await rename(tmp, FILE);
  });
  return writing;
}

export async function get(discordId) {
  return (await load())[discordId] ?? null;
}

/** รวมค่าใหม่เข้ากับของเดิม แล้วบันทึกทันที */
export async function set(discordId, patch) {
  const all = await load();
  all[discordId] = { ...(all[discordId] ?? {}), ...patch, updatedAt: new Date().toISOString() };
  await flush();
  return all[discordId];
}

export async function remove(discordId) {
  const all = await load();
  delete all[discordId];
  await flush();
}

/** รายชื่อทั้งหมดที่อยู่ในสถานะที่ต้องการ ใช้ทำคำสั่ง /รออนุมัติ */
export async function listByStatus(status) {
  const all = await load();
  return Object.entries(all)
    .filter(([, v]) => v.status === status)
    .map(([discordId, v]) => ({ discordId, ...v }));
}
