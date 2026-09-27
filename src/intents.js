import { GatewayIntentBits } from 'discord.js';

/**
 * สิทธิ์ที่บอทขอจาก Discord
 *
 * MessageContent เป็น "สิทธิ์พิเศษ" ที่ต้องเปิดในหน้า Developer Portal ก่อน ถ้าไม่เปิดแล้วขอ
 * บอทจะ login ไม่ผ่านเลย (Used disallowed intents) จึงเปิดผ่าน .env เพื่อให้เลือกได้
 *
 * ถ้าไม่เปิด: บอทอ่านเนื้อหาข้อความของคนอื่นไม่ได้ (ได้ค่าว่าง) ซึ่งทำให้
 *   - ดึงข้อมูลแนะนำตัวของสมาชิกเก่าไม่ได้
 *   - หาการ์ดแนะนำตัวเดิมเพื่อแก้ไขไม่เจอ จึงโพสต์การ์ดใหม่ซ้ำทุกครั้ง
 */
export const wantsMessageContent = () => process.env.MESSAGE_CONTENT_INTENT === 'true';

export function intents() {
  const list = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers];
  if (wantsMessageContent()) list.push(GatewayIntentBits.MessageContent);
  return list;
}
