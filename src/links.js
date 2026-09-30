/**
 * ลิงก์ไปยังห้องสำหรับข้อความที่ส่งใน DM
 *
 * ใน DM การกล่าวถึงห้องด้วย <#id> จะแสดงเป็น "No Access" เพราะ DM ไม่ได้อยู่ในเซิร์ฟ
 * และลิงก์แบบ [ข้อความ](url) ใช้ได้เฉพาะในกล่อง embed ในข้อความธรรมดาจะโชว์เป็นตัวหนังสือดิบๆ กดไม่ได้
 * เหลือทางเดียวที่กดได้จริงทุกที่: ใส่ URL เปล่าๆ ให้ Discord แปลงเป็นลิงก์เอง
 */
export function channelLink(channel, fallback = '#แนะนำตัว') {
  if (!channel) return fallback;
  return `#${channel.name} https://discord.com/channels/${channel.guild.id}/${channel.id}`;
}

/**
 * ปุ่มลิงก์ไปห้อง/โพสต์ ใช้พาไปขั้นต่อไปหลังทำขั้นปัจจุบันเสร็จ
 *
 * ปุ่มแบบลิงก์ไม่มี customId (กดแล้วเปิดหน้านั้นเลย ไม่ได้ยิงกลับมาหาบอท)
 * จำเป็นเพราะป้าย "แนะนำตัว" ถูกย้ายมาอยู่ล่างสุดเสมอ คนที่ไม่อ่านข้อความจะกดแนะนำตัวซ้ำแทนที่จะไปต่อ
 */
export const linkButton = (label, url) => ({ type: 2, style: 5, label, url });

export function linkButtonRow(label, url) {
  return { type: 1, components: [linkButton(label, url)] };
}
