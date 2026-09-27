// ป้ายประกาศ (ข้อความ + ปุ่ม) ที่ค้างอยู่ในห้อง วางครั้งเดียวแล้วใช้ได้ตลอด
//
// ข้อความของสมาชิกจะดันป้ายขึ้นไปเรื่อยๆ (การ์ดแนะนำตัว, ข้อความต้อนรับ) ป้ายจึงต้องย้ายลงมาล่างสุด
// ทุกครั้งที่มีข้อความใหม่มาแทรก — Discord แก้ตำแหน่งข้อความไม่ได้ ทำได้แค่ลบแล้วส่งใหม่
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  MessageType,
  StringSelectMenuBuilder,
} from 'discord.js';
import { COLOR, GUILD_NAME } from './config.js';

const row = (...components) => new ActionRowBuilder().addComponents(...components);
const button = (id, label, style = ButtonStyle.Primary) =>
  new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);

export const joinPanel = () => ({
  embeds: [
    new EmbedBuilder()
      .setColor(COLOR)
      .setTitle(`🍀 ขอเข้ากิล ${GUILD_NAME}`)
      .setDescription(
        [
          'กดปุ่มด้านล่างแล้วกรอก **ชื่อตัวละครในเกม (IGN)** เพื่อส่งคำขอให้ทีมดูแลตรวจสอบ',
          'เมื่อได้รับอนุมัติ จะเห็นห้องแนะนำตัวและห้องอื่นๆ ของกิลด์',
        ].join('\n'),
      ),
  ],
  components: [row(button('join-request', 'ขอเข้ากิล', ButtonStyle.Success))],
});

export const introPanel = () => ({
  embeds: [
    new EmbedBuilder()
      .setColor(COLOR)
      .setTitle('📝 แนะนำตัว')
      .setDescription(
        [
          'กดปุ่มด้านล่างเพื่อกรอก IGN ชื่อเล่น และเลือกอาชีพ',
          'กดซ้ำเพื่อแก้ไขข้อมูลเดิมได้',
          '',
          '**แนะนำตัวแล้ว?** ขั้นต่อไปคือไปอ่านกฎกิลแล้วกดยอมรับ (ปุ่มจะขึ้นให้หลังกรอกเสร็จ)',
        ].join('\n'),
      ),
  ],
  components: [row(button('intro', 'แนะนำตัว', ButtonStyle.Success))],
});

export const partyPanel = () => ({
  embeds: [
    new EmbedBuilder()
      .setColor(COLOR)
      .setTitle('👫 แจ้งตี้ประจำ')
      .setDescription(
        'ไม่บังคับ — ถ้ามีตี้ประจำ แจ้งไว้เพื่อให้ทีมดูแลจัดตี้ Guild War ได้ถูก\nตี้ละ 2–5 คน',
      ),
  ],
  components: [row(button('party', 'แจ้งตี้ประจำ'))],
});

export const guildRulesPanel = () => ({
  content: '☝️ อ่านกฎการอยู่ร่วมกันด้านบนแล้ว กดปุ่มด้านล่างเพื่อยอมรับ',
  components: [row(button('rules-guild', 'ยอมรับกฎกิล', ButtonStyle.Success))],
});

export const auctionRulesPanel = () => ({
  content: '☝️ อ่านกฎการประมูลด้านบนแล้ว กดปุ่มด้านล่างเพื่อยอมรับและเข้าห้องกิลด์',
  components: [row(button('rules-auction', 'ยอมรับกฎการประมูล', ButtonStyle.Success))],
});

/**
 * วางป้ายไว้ล่างสุดของห้อง โดยลบป้ายเดิมของบอทออกก่อน (ดูจาก customId ของปุ่ม)
 * คืนค่าจำนวนข้อความที่ลบไป
 *
 * ไม่แตะ: ข้อความจาก webhook (การ์ดแนะนำตัว/ตี้ของสมาชิก) และข้อความที่ทักถึงตัวบุคคล
 */
/** ส่งแบบไม่เด้งแจ้งเตือนใคร (เหมือน @silent) ข้อความยังขึ้นในห้องตามปกติ */
export const silently = (payload) => ({
  ...payload,
  flags: (payload.flags ?? 0) | MessageFlags.SuppressNotifications,
});

export async function postPanel(channel, customId, payload, { pin = false, silent = false } = {}) {
  const botId = channel.client.user.id;
  let removed = 0;
  const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  for (const m of messages?.values() ?? []) {
    if (m.webhookId || m.author?.id !== botId) continue;
    if (m.mentions.users.size > 0) continue; // ข้อความทักคนใหม่ ไม่ใช่ป้ายประกาศ
    const isPinNotice = m.type === MessageType.ChannelPinnedMessage;
    const ids = m.components.flatMap((r) => (r.components ?? []).map((c) => c.customId));
    if (!isPinNotice && !ids.includes(customId)) continue;
    await m.delete().catch(() => {});
    removed++;
  }

  const sent = await channel.send(silent ? silently(payload) : payload);
  if (pin) {
    await sent.pin().catch(() => {});
    const after = await channel.messages.fetch({ limit: 5 }).catch(() => null);
    for (const m of after?.values() ?? []) {
      if (m.type === MessageType.ChannelPinnedMessage && m.author?.id === botId) {
        await m.delete().catch(() => {});
      }
    }
  }
  return removed;
}

/**
 * ทำทีละคิวต่อห้อง: ถ้าคนสองคนแนะนำตัวเสร็จพร้อมกัน ต่างคนต่างเห็นว่าป้ายไม่ได้อยู่ล่างสุด
 * แล้วต่างคนต่างโพสต์ใหม่ จะได้ป้ายซ้ำสองอันในห้อง
 */
const panelQueues = new Map();

export function movePanelToBottom(channel, customId, payload, opts = {}) {
  const key = `${channel.id}:${customId}`;
  const queued = (panelQueues.get(key) ?? Promise.resolve())
    .catch(() => {})
    .then(() => movePanelToBottomNow(channel, customId, payload, opts));
  panelQueues.set(key, queued);
  return queued;
}

/** ป้ายอยู่ล่างสุดอยู่แล้วก็ไม่ต้องทำอะไร ไม่งั้นย้ายลงมา (เรียกหลังมีข้อความใหม่มาแทรก) */
async function movePanelToBottomNow(channel, customId, payload, opts = {}) {
  const messages = await channel.messages.fetch({ limit: 5 }).catch(() => null);
  const last = messages?.first();
  const lastIsPanel =
    last &&
    !last.webhookId &&
    last.author?.id === channel.client.user.id &&
    last.components.flatMap((r) => (r.components ?? []).map((c) => c.customId)).includes(customId);
  if (lastIsPanel) return 0;
  return postPanel(channel, customId, payload, opts);
}

/**
 * dropdown เลือกอาชีพ
 *
 * ห้ามตั้ง default ไว้: Discord ยิง event เฉพาะตอนค่า "เปลี่ยน" ถ้าคนเลือกค่าเดิมที่ถูกติ๊กไว้อยู่แล้ว
 * จะไม่มีอะไรเกิดขึ้น เขาจะติดอยู่ตรงนั้นจนต้องเลือกอาชีพอื่นก่อนแล้วค่อยเริ่มใหม่
 */
export function jobSelectRow(jobs) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('intro-job')
      .setPlaceholder('เลือกอาชีพของตัวละคร')
      .addOptions(jobs.slice(0, 25).map((j) => ({ label: j.label, value: String(j.id) }))),
  );
}

/**
 * ลบข้อความต้อนรับ + ปุ่มขอเข้ากิลของคนคนนั้นออกจากห้อง หลังเขากดส่งคำขอแล้ว
 * ห้อง welcome จะได้เหลือเฉพาะปุ่มของคนที่ยังไม่ได้สมัคร ไม่กองสะสม
 */
export async function deleteJoinMessage(channel, userId) {
  const botId = channel.client.user.id;
  const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  let removed = 0;
  for (const m of messages?.values() ?? []) {
    if (m.webhookId || m.author?.id !== botId) continue;
    const ids = m.components.flatMap((r) => (r.components ?? []).map((c) => c.customId));
    if (!ids.includes(`join-request:${userId}`)) continue;
    await m.delete().catch(() => {});
    removed++;
  }
  return removed;
}
