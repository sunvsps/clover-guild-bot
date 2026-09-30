// ปุ่มในกระทู้ forum "เปลี่ยนชื่อ-เปลี่ยนอาชีพ" ทำงานแบบเดียวกับตอนแนะนำตัว
//
// เปลี่ยนอาชีพ: กดปุ่ม → dropdown (เห็นคนเดียว) → เลือก
// เปลี่ยนชื่อ:  กดปุ่ม → ฟอร์มกรอกชื่อใหม่ → ส่ง
//
// จากนั้น: บันทึกลง database → เปลี่ยนชื่อในเซิร์ฟ → แก้การ์ดแนะนำตัว
//          → โพสต์ "ของเก่า >> ของใหม่" ในกระทู้ ในชื่อและรูปของเจ้าตัว
import {
  ActionRowBuilder,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { apiErrorMessage, getJobs, updateMember } from './api.js';
import { CHANNELS } from './config.js';
import { findChannel } from './lookup.js';
import { eph, formatNickname, postAsMember, updateIntroCard } from './onboarding.js';
import { changeJobPanel, changeNamePanel, jobSelectRow, movePanelToBottom } from './panels.js';
import * as store from './store.js';

/** กระทู้เปลี่ยนอาชีพ/เปลี่ยนชื่อ (รวมที่ถูก archive แล้ว เพราะกระทู้เงียบนานๆ Discord จะเก็บเข้ากรุเอง) */
export async function findChangeThreads(guild) {
  const forum = findChannel(guild, CHANNELS.changeForum, ChannelType.GuildForum);
  if (!forum) return { forum: null, jobThread: null, nameThread: null };
  const [active, archived] = await Promise.all([forum.threads.fetchActive(), forum.threads.fetchArchived()]);
  const threads = [...active.threads.values(), ...archived.threads.values()];
  return {
    forum,
    jobThread: threads.find((t) => t.name.includes('อาชีพ')) ?? null,
    nameThread: threads.find((t) => t.name.includes('ชื่อ') && !t.name.includes('อาชีพ')) ?? null,
  };
}

/** ป้ายปุ่มของแต่ละกระทู้ ใช้ทั้งตอน /โพสต์ปุ่ม และตอนย้ายปุ่มลงล่างหลังมีคนเปลี่ยน */
export const CHANGE_PANELS = {
  job: { customId: 'change-job-btn', payload: changeJobPanel },
  name: { customId: 'change-name-btn', payload: changeNamePanel },
};

export const CHANGE_IDS = {
  jobButton: 'change-job-btn',
  jobSelect: 'change-job',
  nameButton: 'change-name-btn',
  nameModal: 'change-name-modal',
};

const isChangeInteraction = (i) =>
  (i.isButton() && (i.customId === CHANGE_IDS.jobButton || i.customId === CHANGE_IDS.nameButton)) ||
  (i.isStringSelectMenu() && i.customId === CHANGE_IDS.jobSelect) ||
  (i.isModalSubmit() && i.customId === CHANGE_IDS.nameModal);

/** คืน false ถ้าไม่ใช่ interaction ของ flow นี้ ให้ตัวอื่นจัดการต่อ */
export async function handleChangeInteraction(i) {
  if (!isChangeInteraction(i)) return false;

  if (i.customId === CHANGE_IDS.jobButton) {
    const jobs = await getJobs();
    await i.reply({
      content: 'เลือกอาชีพใหม่ของตัวละคร',
      components: [jobSelectRow(jobs, CHANGE_IDS.jobSelect)],
      ...eph,
    });
    return true;
  }

  if (i.customId === CHANGE_IDS.nameButton) {
    await i.showModal(
      new ModalBuilder()
        .setCustomId(CHANGE_IDS.nameModal)
        .setTitle('เปลี่ยนชื่อในเกม')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('new-ign')
              .setLabel('ชื่อในเกมใหม่ (IGN)')
              .setStyle(TextInputStyle.Short)
              .setMaxLength(64)
              .setRequired(true),
          ),
        ),
    );
    return true;
  }

  // ขั้นบันทึก: ต้องรับทราบก่อน เพราะงานข้างล่างรวมกันเกิน 3 วินาทีที่ Discord ให้
  if (i.isStringSelectMenu()) {
    await i.deferUpdate();
    await i.editReply({ content: '⏳ กำลังบันทึก...', components: [] }).catch(() => {});
    await applyChange(i, { jobId: Number(i.values[0]) }, (u) => `${u.before.job} >> ${u.job.label}`, CHANGE_PANELS.job);
  } else {
    await i.deferReply(eph);
    const ign = i.fields.getTextInputValue('new-ign').trim();
    await applyChange(i, { ign }, (u) => `${u.before.ign} >> ${u.ign}`, CHANGE_PANELS.name);
  }
  return true;
}

async function applyChange(i, patch, announce, panel) {
  let updated;
  try {
    updated = await updateMember(i.user.id, patch);
  } catch (err) {
    return i.editReply({ content: `❌ ${apiErrorMessage(err)}`, components: [] });
  }

  const member = i.member ?? (await i.guild.members.fetch(i.user.id));
  const data = { ign: updated.ign, job: updated.job.label, nickname: updated.nickname };
  const nick = formatNickname(data);

  await member.setNickname(nick).catch((err) => console.error('เปลี่ยนชื่อในเซิร์ฟไม่ได้:', err.message));
  if (await store.get(i.user.id)) {
    await store.set(i.user.id, { ign: updated.ign, jobId: updated.job.id, job: updated.job.label });
  }
  await updateIntroCard(i.guild, member, data).catch((err) =>
    console.error('แก้การ์ดแนะนำตัวไม่ได้:', err.message),
  );

  const unchanged = updated.before.ign === updated.ign && updated.before.job === updated.job.label;
  if (!unchanged) {
    await postAsMember(i.channel, member, announce(updated));
    // ข้อความที่เพิ่งโพสต์ดันปุ่มขึ้นไป ย้ายลงมาล่างสุดแบบไม่แจ้งเตือน เหมือนห้องแนะนำตัว
    await movePanelToBottom(i.channel, panel.customId, panel.payload(), { silent: true }).catch((err) =>
      console.error('ย้ายปุ่มลงล่างไม่ได้:', err.message),
    );
  }

  return i.editReply({
    content: unchanged ? 'ข้อมูลเหมือนเดิม ไม่มีอะไรเปลี่ยน' : `✅ บันทึกแล้ว ชื่อในเซิร์ฟ: \`${nick}\``,
    components: [],
  });
}
