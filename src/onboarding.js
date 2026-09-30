// Flow รับสมาชิกใหม่ 3 ด่าน
//
//   1. #welcome        กดปุ่ม "ขอเข้ากิล" กรอก IGN -> แจ้งทีมดูแลใน #staff-log (role: รออนุมัติ)
//   2. แอดมินกดอนุมัติ  -> role "ผ่านการตรวจ" จึงเห็น #แนะนำตัว และห้องกฎ
//   3. #แนะนำตัว        กรอก IGN/ชื่อเล่น แล้วเลือกอาชีพ -> ยอมรับกฎกิล -> ยอมรับกฎประมูล
//                      -> บันทึกลง database ผ่าน backend -> role "สมาชิกของกิลด์" + เปลี่ยนชื่อในเซิร์ฟ
//
// คนนอกที่ได้ลิงก์มาเองจะค้างอยู่ที่ด่าน 1 เพราะยังไม่เห็นห้องอะไรนอกจาก #welcome
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { apiErrorMessage, getJobs, registerMember } from './api.js';
import { CHANNELS, GUILD_NAME, NICKNAME_MAX, ROLES } from './config.js';
import { channelLink, linkButtonRow } from './links.js';
import { findChannel, findRole } from './lookup.js';
import { deleteJoinMessage, introPanel, jobSelectRow, movePanelToBottom } from './panels.js';
import * as store from './store.js';

export const eph = { flags: 64 }; // MessageFlags.Ephemeral

/**
 * กันกดซ้ำ: ระหว่างที่คำสั่งของคนนั้นยังทำงานอยู่ การกดรอบถัดไปจะถูกปัดทิ้ง
 * (บอทต้องคุยกับ Discord และ backend หลายรอบ คนกดจึงเห็นว่า "ค้าง" แล้วกดรัว)
 */
const inFlight = new Set();

export async function once(userId, interaction, work) {
  if (inFlight.has(userId)) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({ content: '⏳ กำลังดำเนินการอยู่ รอสักครู่นะ', ...eph }).catch(() => {});
    }
    return;
  }
  inFlight.add(userId);
  try {
    return await work();
  } finally {
    inFlight.delete(userId);
  }
}

const row = (...components) => new ActionRowBuilder().addComponents(...components);
const button = (id, label, style = ButtonStyle.Primary) =>
  new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
const textInput = (id, label, { value, placeholder, required = true, max = 40 } = {}) => {
  const input = new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(TextInputStyle.Short)
    .setRequired(required)
    .setMaxLength(max);
  if (value) input.setValue(value);
  if (placeholder) input.setPlaceholder(placeholder);
  return row(input);
};

const hasRole = (member, name) => member.roles.cache.some((r) => r.name === name);

/** ใส่ role ที่ต้องการและถอด role ขั้นก่อนหน้าออกในครั้งเดียว (ไม่ error ถ้า role ยังไม่ถูกสร้าง) */
async function setStage(member, { add, remove = [], reason }) {
  const toAdd = add ? findRole(member.guild, add) : null;
  const toRemove = remove.map((n) => findRole(member.guild, n)).filter(Boolean);
  if (toAdd) await member.roles.add(toAdd, reason);
  for (const r of toRemove) await member.roles.remove(r, reason).catch(() => {});
}

/** IGN/อาชีพ(ชื่อเล่น) ตัดให้พอดี 32 ตัวอักษร โดยตัดชื่อเล่นก่อน แล้วค่อยตัดอาชีพ */
export function formatNickname({ ign, job, nickname }) {
  const candidates = [
    `${ign}/${job}${nickname ? ` (${nickname})` : ''}`,
    `${ign}/${job}`,
    `${ign}`,
  ];
  return (candidates.find((c) => c.length <= NICKNAME_MAX) ?? ign).slice(0, NICKNAME_MAX);
}

// ─── ด่าน 1: ขอเข้ากิล ───

export function joinModal(previousIgn) {
  return new ModalBuilder()
    .setCustomId('join-request')
    .setTitle('ขอเข้ากิล')
    .addComponents(
      textInput('ign', 'IGN (ชื่อตัวละครในเกม)', { value: previousIgn, placeholder: 'Mimayuu' }),
    );
}

export async function submitJoinRequest(i, member = i.member) {
  const ign = i.fields.getTextInputValue('ign').trim();
  await i.deferReply(eph);
  await store.set(i.user.id, { ign, status: store.STATUS.requested });
  await setStage(member, { add: ROLES.pending, reason: 'ขอเข้ากิล' });
  await sendApprovalRequest(member, ign);
  // ส่งคำขอแล้ว ปุ่มของคนนี้ไม่ต้องค้างอยู่ในห้องอีก
  const welcome = findChannel(member.guild, CHANNELS.welcome);
  if (welcome) await deleteJoinMessage(welcome, i.user.id).catch(() => {});
  return i.editReply(
    '✅ ส่งคำขอให้ทีมดูแลกิลด์แล้ว\n⏳ รออนุมัติสักครู่ เมื่ออนุมัติแล้วบอทจะ DM มาบอก และจะเห็นห้องแนะนำตัว',
  );
}

async function sendApprovalRequest(member, ign) {
  const staffLog = findChannel(member.guild, CHANNELS.staffLog);
  if (!staffLog) return console.error(`ไม่เจอห้อง ${CHANNELS.staffLog}`);
  const ts = (d) => `<t:${Math.floor(d.getTime() / 1000)}:R>`;

  await staffLog.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xf0b232)
        .setTitle('⏳ คำขอเข้ากิลใหม่')
        .setThumbnail(member.displayAvatarURL())
        .addFields(
          { name: 'Discord', value: `${member} (${member.user.username})` },
          { name: 'Discord ID', value: `\`${member.id}\``, inline: true },
          { name: 'IGN ที่แจ้ง', value: ign, inline: true },
          { name: 'สร้างบัญชี', value: ts(member.user.createdAt), inline: true },
          { name: 'เข้าเซิร์ฟ', value: ts(member.joinedAt), inline: true },
        ),
    ],
    components: [
      row(
        button(`approve:${member.id}`, 'อนุมัติ', ButtonStyle.Success),
        button(`reject:${member.id}`, 'ไม่อนุมัติ', ButtonStyle.Danger),
      ),
    ],
  });
}

/**
 * ตอบกลับไว้ "ล่างสุด" ของห้อง
 *
 * ข้อความ ephemeral ถูกตรึงไว้ที่ตำแหน่งตอนที่มันถูกสร้าง ซึ่งคือตอนเปิด dropdown เลือกอาชีพ
 * พอโพสต์การ์ดแนะนำตัวต่อท้าย ข้อความเดิมจะไปอยู่ "เหนือ" การ์ด คนเลยมองไม่เห็นว่าต้องไปไหนต่อ
 * จึงต้องลบของเก่าแล้วส่งใหม่ เพื่อให้คำแนะนำขั้นต่อไปอยู่ล่างสุดจริงๆ
 */
async function replyAtBottom(i, payload) {
  await i.deleteReply().catch(() => {});
  return i.followUp({ ...payload, ...eph });
}

// ─── ด่าน 2: แนะนำตัว (IGN + ชื่อเล่น แล้วเลือกอาชีพ) ───

export async function introModal(userId) {
  const saved = (await store.get(userId)) ?? {};
  // เริ่มรอบใหม่ทุกครั้งที่กดแนะนำตัว: ล้างอาชีพที่เคยเลือกไว้ จะได้ไม่มีค่าค้างไปชนกับ dropdown รอบนี้
  await store.set(userId, { jobId: null, job: null });
  return new ModalBuilder()
    .setCustomId('intro')
    .setTitle('แนะนำตัว')
    .addComponents(
      textInput('ign', 'IGN (ชื่อตัวละครในเกม)', { value: saved.ign, placeholder: 'Mimayuu' }),
      textInput('nickname', 'ชื่อเล่น', { value: saved.nickname, placeholder: 'Mint' }),
    );
}

/** Discord ไม่รับ dropdown ในฟอร์ม modal จึงถามอาชีพต่อในข้อความ ephemeral หลังกรอกข้อความเสร็จ */
export async function submitIntro(i) {
  const ign = i.fields.getTextInputValue('ign').trim();
  const nickname = i.fields.getTextInputValue('nickname').trim();
  await i.deferReply(eph);
  await store.set(i.user.id, { ign, nickname });

  let jobs;
  try {
    jobs = await getJobs();
  } catch (err) {
    console.error('ดึงรายการอาชีพไม่ได้:', err);
    await alertStaff(i.guild, `ดึงรายการอาชีพให้ ${i.user} ไม่ได้: ${apiErrorMessage(err)}`);
    return i.editReply(`❌ ${apiErrorMessage(err)}`);
  }

  return i.editReply({
    content: `**IGN:** ${ign}\n**ชื่อเล่น:** ${nickname}\n\nขั้นสุดท้าย เลือกอาชีพของตัวละคร`,
    components: [jobSelectRow(jobs)],
  });
}

export async function selectJob(i) {
  // Discord ให้เวลาตอบ interaction แค่ 3 วินาที แต่ขั้นนี้ต้องโพสต์การ์ดผ่าน webhook และหาโพสต์กฎในฟอรั่ม
  // ซึ่งรวมกันนานกว่านั้น จึงต้องรับทราบก่อน แล้วค่อยแก้ข้อความทีหลัง
  await i.deferUpdate();
  // เอา dropdown ออกทันที จะได้กดซ้ำไม่ได้ และเห็นว่าบอทรับคำสั่งแล้ว
  await i.editReply({ content: '⏳ กำลังบันทึกข้อมูล...', components: [] }).catch(() => {});
  const jobId = Number(i.values[0]);
  const jobs = await getJobs().catch(() => []);
  const job = jobs.find((j) => j.id === jobId);
  if (!job) {
    // ไม่รู้ชื่ออาชีพ = เอาไปตั้งชื่อในเซิร์ฟไม่ได้ และ backend อาจปฏิเสธ id นี้ ให้หยุดตรงนี้ดีกว่าบันทึกค่าผิด
    await alertStaff(i.guild, `เลือกอาชีพ id ${jobId} ให้ ${i.user} ไม่สำเร็จ: ดึงรายการอาชีพจาก backend ไม่ได้`);
    return i.editReply({
      content: '❌ ดึงรายการอาชีพจากระบบไม่ได้ ลองกดแนะนำตัวใหม่อีกครั้ง หรือแจ้งทีมดูแลกิลด์',
      components: [],
    });
  }
  const saved = await store.set(i.user.id, {
    jobId,
    job: job.label,
    status: store.STATUS.introduced,
  });

  // บั๊ก 2: สมาชิกเต็มตัวที่กลับมาแก้ข้อมูล ไม่ควรได้ role ขั้นกลางกลับมาอีก
  const alreadyMember = hasRole(i.member, ROLES.member);
  if (!alreadyMember) await setStage(i.member, { add: ROLES.introduced, reason: 'แนะนำตัวแล้ว' });
  await postIntroCard(i.guild, i.member, saved);
  // การ์ดที่เพิ่งโพสต์ดันปุ่มขึ้นไป ย้ายปุ่มลงมาล่างสุดเพื่อให้คนถัดไปเห็นทันทีที่เปิดห้อง
  const introChannel = findChannel(i.guild, CHANNELS.intro);
  if (introChannel)
    await movePanelToBottom(introChannel, 'intro', introPanel(), { silent: true }).catch(() => {});

  const summary = `**IGN:** ${saved.ign}  **ชื่อเล่น:** ${saved.nickname}  **อาชีพ:** ${saved.job}`;

  if (alreadyMember) {
    // สมาชิกเดิมแก้ข้อมูล: อัปเดตเข้า database และเปลี่ยนชื่อในเซิร์ฟให้ตรงกันทันที
    try {
      await registerMember(i.user.id, {
        ign: saved.ign,
        jobId: saved.jobId,
        nickname: saved.nickname || null,
      });
    } catch (err) {
      console.error('อัปเดตข้อมูลสมาชิกไม่สำเร็จ:', err);
      await alertStaff(
        i.guild,
        `❌ อัปเดตข้อมูล ${i.user} (IGN: ${saved.ign}) ไม่สำเร็จ: ${apiErrorMessage(err)}`,
        [row(button(`retry-register:${i.user.id}`, 'ลองบันทึกอีกครั้ง', ButtonStyle.Primary))],
      );
      return i.editReply({ content: `❌ ${apiErrorMessage(err)}`, components: [] });
    }
    await finishMembership(i.member, saved);
    return replyAtBottom(i, { content: `✅ อัปเดตข้อมูลแล้ว\n${summary}` });
  }

  const rulesPost = await findGuildRulesPost(i.guild);
  return replyAtBottom(i, {
    content: ['✅ บันทึกข้อมูลแล้ว', summary, '', 'ขั้นต่อไป: อ่านกฎกิลแล้วกดยอมรับ'].join('\n'),
    components: rulesPost ? [linkButtonRow('➡️ ไปอ่านกฎกิล', rulesPost.url)] : [],
  });
}

/**
 * ส่งข้อความในชื่อและรูปของสมาชิก (ผ่าน webhook) ใช้ได้ทั้งห้องปกติและกระทู้ใน forum
 * webhook สร้างในกระทู้ไม่ได้ ต้องสร้างที่ห้องแม่แล้วระบุ threadId
 */
export async function postAsMember(channel, member, content) {
  const hook = await introHook(channel.isThread() ? channel.parent : channel);
  return hook.send({
    content,
    username: member.displayName,
    avatarURL: member.displayAvatarURL(),
    allowedMentions: { parse: [] },
    ...(channel.isThread() ? { threadId: channel.id } : {}),
  });
}

async function introHook(channel) {
  const hooks = await channel.fetchWebhooks();
  return hooks.find((h) => h.name === 'Clover Intro') ?? channel.createWebhook({ name: 'Clover Intro' });
}

const introCardText = (member, data) =>
  `IGN: ${data.ign}\nชื่อเล่น: ${data.nickname ?? '-'}\nอาชีพ: ${data.job}\n-# ${member}`;

async function findIntroCard(channel, hook, memberId) {
  const messages = await channel.messages.fetch({ limit: 100 });
  return messages.find((m) => m.webhookId === hook.id && m.content.includes(`<@${memberId}>`));
}

/** แนะนำตัว (หรือแนะนำตัวใหม่): ลบการ์ดเดิมแล้วโพสต์ใหม่ล่างสุด ให้คนในห้องเห็นทุกครั้ง */
async function postIntroCard(guild, member, data) {
  const channel = findChannel(guild, CHANNELS.intro);
  if (!channel) return;
  const hook = await introHook(channel);
  const old = await findIntroCard(channel, hook, member.id);
  if (old) await hook.deleteMessage(old.id).catch(() => {});
  await postAsMember(channel, member, introCardText(member, data));
}

/** เปลี่ยนชื่อ/อาชีพทีหลัง: แก้การ์ดเดิมให้ตรงกับข้อมูลใหม่ (ไม่มีการ์ดก็ไม่ต้องสร้าง) */
export async function updateIntroCard(guild, member, data) {
  const channel = findChannel(guild, CHANNELS.intro);
  if (!channel) return;
  const hook = await introHook(channel);
  const old = await findIntroCard(channel, hook, member.id);
  if (old)
    await hook.editMessage(old.id, { content: introCardText(member, data), allowedMentions: { parse: [] } });
}

// การหาโพสต์ต้องโหลด thread ทั้ง active และ archived ซึ่งช้าเกินกว่าที่จะทำระหว่างตอบ interaction
// (Discord ให้ 3 วินาที) และโพสต์กฎแทบไม่เปลี่ยน จึงจำไว้ 10 นาที
let rulesPostCache = { at: 0, post: null };
const RULES_POST_TTL_MS = 10 * 60 * 1000;

export async function findGuildRulesPost(guild) {
  if (Date.now() - rulesPostCache.at < RULES_POST_TTL_MS && rulesPostCache.post) return rulesPostCache.post;
  const forum = findChannel(guild, CHANNELS.rulesForum, 15 /* GuildForum */);
  if (!forum) return null;
  const [active, archived] = await Promise.all([forum.threads.fetchActive(), forum.threads.fetchArchived()]);
  const posts = [...active.threads.values(), ...archived.threads.values()];
  const post = posts.find((t) => t.name.includes(CHANNELS.guildRulesPost)) ?? posts[0] ?? null;
  rulesPostCache = { at: Date.now(), post };
  return post;
}

// ─── ด่าน 3: ยอมรับกฎ แล้วบันทึกลง database ───

export async function acceptGuildRules(i) {
  await i.deferUpdate(); // การใส่/ถอด role เป็น request ไป Discord หลายรอบ อาจเกิน 3 วินาที
  await i.editReply({ content: '⏳ กำลังบันทึก...', components: [] }).catch(() => {});
  await setStage(i.member, {
    add: ROLES.acceptedGuild,
    remove: [ROLES.introduced],
    reason: 'ยอมรับกฎกิล',
  });
  await store.set(i.user.id, { status: store.STATUS.acceptedGuild });
  const auctionRules = findChannel(i.guild, CHANNELS.auctionRules);
  return i.editReply({
    content: '✅ ยอมรับกฎกิลแล้ว\nขั้นสุดท้าย: อ่านกฎการประมูลแล้วกดยอมรับ',
    components: auctionRules
      ? [linkButtonRow('➡️ ไปอ่านกฎการประมูล', `https://discord.com/channels/${i.guild.id}/${auctionRules.id}`)]
      : [],
  });
}

/** ยอมรับกฎครบ -> ยิงข้อมูลเข้า database แล้วค่อยให้ role สมาชิก (ถ้าบันทึกไม่ผ่าน ไม่ให้ role) */
export async function acceptAuctionRules(i) {
  await i.deferUpdate();
  await i.editReply({ content: '⏳ กำลังลงทะเบียนเข้าระบบ...', components: [] }).catch(() => {});
  const data = await store.get(i.user.id);
  if (!data?.ign || !data?.jobId) {
    return i.editReply({ content: '❌ ไม่พบข้อมูลแนะนำตัว กรุณาแนะนำตัวใหม่อีกครั้ง', components: [] });
  }

  try {
    await registerMember(i.user.id, {
      ign: data.ign,
      jobId: data.jobId,
      nickname: data.nickname || null,
    });
  } catch (err) {
    console.error('บันทึกสมาชิกไม่สำเร็จ:', err);
    await alertStaff(
      i.guild,
      `❌ บันทึก ${i.user} (IGN: ${data.ign}) ลงระบบไม่สำเร็จ: ${apiErrorMessage(err)}`,
      [row(button(`retry-register:${i.user.id}`, 'ลองบันทึกอีกครั้ง', ButtonStyle.Primary))],
    );
    return i.editReply({
      content: `❌ ${apiErrorMessage(err)}\nทีมดูแลกิลด์ได้รับแจ้งแล้ว ยังไม่ต้องกดซ้ำ`,
      components: [],
    });
  }

  await store.set(i.user.id, { status: store.STATUS.registered });
  await finishMembership(i.member, data);
  await sendWelcomeDm(i.member);
  const lounge = findChannel(i.guild, CHANNELS.lounge);
  return i.editReply({
    content: `🎉 ยินดีต้อนรับสู่ ${GUILD_NAME}!\nเข้าใช้งานห้องกิลด์และเว็บประมูลได้เลย ไปคุยกันที่ ${lounge ?? '#แชทห้องนั่งเล่น'}`,
    components: [],
  });
}

/**
 * DM ต้อนรับหลังลงทะเบียนครบ พร้อมบอกเรื่องตี้ประจำ
 * แยกเป็นอีกข้อความหนึ่ง จะได้ไม่ปนกับขั้นตอนระหว่างทาง และคนอ่านย้อนได้ภายหลัง
 */
async function sendWelcomeDm(member) {
  const party = findChannel(member.guild, CHANNELS.party);
  await member
    .send(
      [
        `🎉 ยินดีต้อนรับสู่ ${GUILD_NAME}!`,
        'ตอนนี้เข้าใช้งานห้องกิลด์และเว็บประมูลได้ทั้งหมดแล้ว',
        '',
        `ถ้ามีตี้ประจำ แจ้งได้ที่ ${channelLink(party, '#แจ้งตี้ประจำ')}`,
        '-# ไม่บังคับ และต้องมีสมาชิกในตี้ตั้งแต่ 2 คนขึ้นไป',
      ].join('\n'),
    )
    .catch(() => {}); // คนที่ปิดรับ DM
}

/** ให้ role สมาชิกและตั้งชื่อในเซิร์ฟ — ตั้งชื่อไม่ได้ไม่ถือว่าล้มเหลว (เจ้าของเซิร์ฟเปลี่ยนชื่อไม่ได้เลย) */
export async function finishMembership(member, data) {
  await setStage(member, {
    add: ROLES.member,
    remove: [ROLES.acceptedGuild, ROLES.introduced, ROLES.approved, ROLES.pending],
    reason: 'ลงทะเบียนสมาชิกครบ',
  });
  const nickname = formatNickname({ ign: data.ign, job: data.job, nickname: data.nickname });
  await member.setNickname(nickname, 'ตั้งชื่อตามข้อมูลในเกม').catch((err) => {
    console.error(`ตั้งชื่อ ${member.user.username} ไม่ได้:`, err.message);
  });
}

export async function alertStaff(guild, content, components = []) {
  const staffLog = findChannel(guild, CHANNELS.staffLog);
  if (staffLog) await staffLog.send({ content, components }).catch(() => {});
}

export { hasRole, setStage, button, row, textInput };
