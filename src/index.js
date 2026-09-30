import {
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { apiErrorMessage, getJobs, registerMember } from './api.js';
import { CHANGE_PANELS, findChangeThreads, handleChangeInteraction } from './memberChange.js';
import { CHANNELS, COLOR, GUILD_NAME, ROLES } from './config.js';
import { channelLink, linkButton } from './links.js';
import { intents, wantsMessageContent } from './intents.js';
import { findChannel } from './lookup.js';
import {
  acceptAuctionRules,
  acceptGuildRules,
  button,
  eph,
  findGuildRulesPost,
  finishMembership,
  hasRole,
  once,
  introModal,
  joinModal,
  row,
  selectJob,
  setStage,
  submitIntro,
  submitJoinRequest,
  textInput,
} from './onboarding.js';
import {
  auctionRulesPanel,
  guildRulesPanel,
  introPanel,
  joinPanel,
  movePanelToBottom,
  partyPanel,
  postPanel,
} from './panels.js';
import * as store from './store.js';

const client = new Client({ intents: intents() });

/** หน่วงก่อนทักคนเข้าใหม่ ให้ client ของเขาโหลดห้องเสร็จก่อน ไม่งั้นข้อความอาจไม่ขึ้นให้เขาเห็น */
const JOIN_MESSAGE_DELAY_MS = 3000;

client.once('ready', async () => {
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  await guild.commands.set([
    new SlashCommandBuilder()
      .setName('โพสต์ปุ่ม')
      .setDescription('โพสต์ข้อความ + ปุ่ม onboarding ลงห้องต่างๆ (แอดมิน)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    new SlashCommandBuilder()
      .setName('รออนุมัติ')
      .setDescription('ดูรายชื่อสมาชิกใหม่ที่รออนุมัติ (ทีมดูแล)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  ]);
  console.log(`🍀 ${client.user.tag} พร้อมใช้งานใน ${guild.name}`);
  if (!wantsMessageContent()) {
    console.warn(
      '⚠️  ยังไม่ได้เปิด MESSAGE_CONTENT_INTENT — การ์ดแนะนำตัวเดิมจะหาไม่เจอ (โพสต์ซ้ำแทนการแก้)',
    );
  }
});

// ─── คนเข้าเซิร์ฟใหม่: ยังไม่ได้ role อะไร จึงเห็นแค่ #welcome ───
//
// โพสต์ข้อความต้อนรับ + ปุ่มขอเข้ากิลของคนนั้นโดยเฉพาะ แล้วลบทิ้งเมื่อเขากดส่งคำขอแล้ว
// (ดู deleteJoinMessage ใน onboarding.js) ห้องจึงมีเฉพาะปุ่มของคนที่ยังไม่ได้สมัคร
client.on('guildMemberAdd', async (member) => {
  if (member.guild.id !== process.env.GUILD_ID) return;
  const welcome = findChannel(member.guild, CHANNELS.welcome);
  if (!welcome) return;

  // รอให้ client ของคนที่เพิ่งเข้าโหลดเซิร์ฟเสร็จก่อน ถ้าโพสต์ทันทีที่ Discord แจ้งว่ามีคนเข้า
  // ข้อความมักไม่ขึ้นบนหน้าจอของเขาจนกว่าจะรีเฟรช (คนอื่นในห้องเห็นปกติ)
  await new Promise((resolve) => setTimeout(resolve, JOIN_MESSAGE_DELAY_MS));

  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(`🍀 ยินดีต้อนรับสู่ ${GUILD_NAME}`)
    .setDescription(
      [
        `สวัสดี ${member}! ทำตามนี้เพื่อเข้ากิลด์`,
        '',
        '**1.** กดปุ่ม "ขอเข้ากิล" ด้านล่าง แล้วกรอกชื่อตัวละครในเกม',
        '**2.** รอทีมดูแลกิลด์อนุมัติ (บอทจะ DM มาบอก)',
        '**3.** แนะนำตัว (IGN / ชื่อเล่น / อาชีพ)',
        '**4.** ยอมรับกฎกิลและกฎการประมูล แล้วเข้าใช้งานได้ทั้งหมด',
      ].join('\n'),
    )
    .setThumbnail(member.displayAvatarURL());

  // #welcome แจ้งเตือนตามปกติ เพื่อให้คนใหม่รู้ตัวว่ามีอะไรให้ทำ (เงียบเฉพาะห้องแนะนำตัว)
  await welcome
    .send({
      content: `🍀 ${member} เข้ามาในเซิร์ฟเวอร์แล้ว ยินดีต้อนรับ!`,
      embeds: [embed],
      components: [row(button(`join-request:${member.id}`, 'ขอเข้ากิล', ButtonStyle.Success))],
      allowedMentions: { users: [member.id] },
    })
    .catch(console.error);
});

client.on('interactionCreate', async (i) => {
  try {
    if (i.isChatInputCommand() && i.commandName === 'โพสต์ปุ่ม') return await postPanels(i);
    if (i.isChatInputCommand() && i.commandName === 'รออนุมัติ') return await listPending(i);
    if (await handleChangeInteraction(i)) return;
    if (i.isStringSelectMenu() && i.customId === 'intro-job')
      return await once(i.user.id, i, () => selectJob(i));
    if (i.isButton()) return await onButton(i);
    if (i.isModalSubmit()) return await onModal(i);
  } catch (err) {
    const what = i.isChatInputCommand() ? `/${i.commandName}` : (i.customId ?? i.type);
    console.error(`❌ พังที่: ${what} | ผู้ใช้: ${i.user.tag} | ห้อง: ${i.channel?.name ?? 'DM'}`);
    console.error(err);
    const msg = { content: '❌ เกิดข้อผิดพลาด ลองใหม่อีกครั้ง หรือแจ้งทีมดูแลกิลด์', ...eph };
    if (i.deferred || i.replied) i.followUp(msg).catch(() => {});
    else if (i.isRepliable()) i.reply(msg).catch(() => {});
  }
});

async function postPanels(i) {
  const g = i.guild;
  const welcome = findChannel(g, CHANNELS.welcome);
  const intro = findChannel(g, CHANNELS.intro);
  const party = findChannel(g, CHANNELS.party);
  const auctionRules = findChannel(g, CHANNELS.auctionRules);
  const missing = [
    ['welcome', welcome],
    ['แนะนำตัว', intro],
    ['แจ้งตี้ประจำ', party],
    ['กฎการประมูล', auctionRules],
  ]
    .filter(([, c]) => !c)
    .map(([n]) => n);
  if (missing.length) return i.reply({ content: `❌ ไม่เจอห้อง: ${missing.join(', ')}`, ...eph });

  const guildRulesPost = await findGuildRulesPost(g);
  if (!guildRulesPost) {
    const forum = findChannel(g, CHANNELS.rulesForum, ChannelType.GuildForum);
    return i.reply({
      content: forum
        ? `❌ forum ${forum} ยังไม่มีโพสต์ — สร้างโพสต์กฎก่อน (ชื่อโพสต์มีคำว่า "${CHANNELS.guildRulesPost}") แล้วสั่งใหม่`
        : `❌ ไม่เจอ forum ที่ชื่อมีคำว่า "${CHANNELS.rulesForum}"`,
      ...eph,
    });
  }

  await i.deferReply(eph);
  let removed = 0;
  removed += await postPanel(welcome, 'join-request', joinPanel(), { pin: true });
  removed += await postPanel(intro, 'intro', introPanel(), { silent: true });
  removed += await postPanel(party, 'party', partyPanel(), { silent: true });
  removed += await postPanel(guildRulesPost, 'rules-guild', guildRulesPanel(), { pin: true });
  removed += await postPanel(auctionRules, 'rules-auction', auctionRulesPanel());

  // โพสต์ปุ่มในกระทู้เปลี่ยนชื่อ/เปลี่ยนอาชีพ (ถ้ามี)
  const { forum: changeForum, jobThread, nameThread } = await findChangeThreads(g);
  for (const [thread, panel] of [
    [jobThread, CHANGE_PANELS.job],
    [nameThread, CHANGE_PANELS.name],
  ]) {
    if (thread) removed += await postPanel(thread, panel.customId, panel.payload(), { silent: true });
  }

  const changeNote = changeForum ? '' : `\n⚠️ ไม่เจอ forum "${CHANNELS.changeForum}" (ข้ามไป)`;
  await i.editReply(
    `✅ โพสต์ปุ่มครบแล้ว (ขอเข้ากิล, แนะนำตัว, แจ้งตี้, กฎกิล, กฎการประมูล, เปลี่ยนชื่อ/อาชีพ)` +
      (removed ? `\n🧹 ลบปุ่มเก่าที่ซ้ำออก ${removed} อัน` : '') +
      changeNote,
  );
}

/**
 * ปุ่มที่ส่งไปใน DM ไม่มี guild/member ติดมากับ interaction (Discord ส่งมาแค่ user)
 * จึงต้องไปดึงจากเซิร์ฟที่บอทดูแลเอง ไม่งั้นโค้ดที่เช็ก role จะพัง
 */
async function guildContext(i) {
  if (i.guild && i.member) return { guild: i.guild, member: i.member };
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const member = await guild.members.fetch(i.user.id).catch(() => null);
  return { guild, member };
}

const isStaff = (member) =>
  hasRole(member, ROLES.staff) || member.permissions.has(PermissionFlagsBits.ManageRoles);

const stamp = (embed, text, color) =>
  EmbedBuilder.from(embed)
    .setColor(color)
    .setFooter({
      text: `${text} • ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`,
    });

/** แนะนำตัวได้ครั้งเดียว แก้ข้อมูลทีหลังต้องไปที่กระทู้เปลี่ยนชื่อ-เปลี่ยนอาชีพ */
const isPastIntro = (member) =>
  [ROLES.introduced, ROLES.acceptedGuild, ROLES.member].some((r) => hasRole(member, r));

async function onButton(i) {
  const { guild, member } = await guildContext(i);
  if (!member) return i.reply({ content: 'ไม่พบคุณในเซิร์ฟเวอร์ ลองเข้าเซิร์ฟใหม่อีกครั้ง', ...eph });

  // ── ด่าน 1: ขอเข้ากิล ──
  if (i.customId === 'join-request' || i.customId.startsWith('join-request:')) {
    // ปุ่มที่ติดมากับข้อความทักเป็นของคนนั้นคนเดียว คนอื่นกดให้ไปใช้ปุ่มกลางของห้องแทน
    const owner = i.customId.split(':')[1];
    if (owner && owner !== i.user.id) {
      return i.reply({
        content: `ปุ่มนี้เป็นของ <@${owner}> นะ — ถ้าจะขอเข้ากิล กดปุ่มที่ปักหมุดไว้ด้านบนของห้องนี้ได้เลย`,
        ...eph,
      });
    }
    if (hasRole(member, ROLES.member)) {
      return i.reply({ content: '✅ คุณเป็นสมาชิกกิลด์อยู่แล้ว', ...eph });
    }
    if (hasRole(member, ROLES.pending)) {
      return i.reply({ content: '⏳ ส่งคำขอไปแล้ว กำลังรอทีมดูแลกิลด์อนุมัติ', ...eph });
    }
    const saved = await store.get(i.user.id);
    return i.showModal(joinModal(saved?.ign));
  }

  if (i.customId.startsWith('approve:') || i.customId.startsWith('reject:')) {
    if (!isStaff(member)) return i.reply({ content: 'ปุ่มนี้สำหรับทีมดูแลกิลด์เท่านั้น', ...eph });
    const [action, userId] = i.customId.split(':');

    // ไม่อนุมัติ: ต้องเปิดฟอร์มเป็นคำตอบแรกเท่านั้น (Discord ไม่ให้ deferUpdate ก่อน showModal)
    // จึงตรวจสถานะของ target หลังส่งฟอร์มแทน
    if (action === 'reject') {
      return i.showModal(
        new ModalBuilder()
          .setCustomId(`reject:${userId}:${i.message.id}`)
          .setTitle('ไม่อนุมัติ')
          .addComponents(
            row(
              new TextInputBuilder()
                .setCustomId('reason')
                .setLabel('เหตุผล (ส่งให้ผู้สมัครทาง DM)')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
                .setMaxLength(300),
            ),
          ),
      );
    }

    // อนุมัติ: รับทราบก่อนทำงาน เพราะดึงข้อมูลสมาชิก + ใส่/ถอด role + เขียนไฟล์ รวมกันเกิน 3 วินาทีได้
    // (เคยเจอ Unknown interaction 10062: งานสำเร็จแล้วแต่หน้าจอไม่อัปเดต แอดมินเลยกดซ้ำ)
    await i.deferUpdate();
    const target = await guild.members.fetch(userId).catch(() => null);
    if (!target) {
      return i.editReply({ content: `⚠️ <@${userId}> ออกจากเซิร์ฟไปแล้ว`, embeds: [], components: [] });
    }
    if (!hasRole(target, ROLES.pending)) {
      return i.followUp({ content: 'คนนี้ไม่ได้อยู่ในสถานะรออนุมัติแล้ว (อาจมีคนกดไปก่อน)', ...eph });
    }

    await setStage(target, {
      add: ROLES.approved,
      remove: [ROLES.pending],
      reason: `อนุมัติโดย ${i.user.tag}`,
    });
    await store.set(userId, { status: store.STATUS.approved });
    await i.editReply({
      embeds: [stamp(i.message.embeds[0], `✅ อนุมัติโดย ${i.user.username}`, 0x3ba55d)],
      components: [],
    });
    const intro = findChannel(guild, CHANNELS.intro);
    return target
      .send(
        `✅ คำขอเข้ากิล ${GUILD_NAME} ได้รับการอนุมัติแล้ว!\nขั้นต่อไป: แนะนำตัวที่ ${channelLink(intro)}`,
      )
      .catch(() => {});
  }

  // ── ด่าน 2: แนะนำตัว ──
  if (i.customId === 'intro') {
    if (isPastIntro(member)) {
      const { jobThread, nameThread } = await findChangeThreads(guild);
      const links = [
        jobThread && linkButton('เปลี่ยนอาชีพ', jobThread.url),
        nameThread && linkButton('เปลี่ยนชื่อ', nameThread.url),
      ].filter(Boolean);
      return i.reply({
        content: 'คุณแนะนำตัวไปแล้ว ถ้าจะเปลี่ยนชื่อหรืออาชีพ ไปที่กระทู้ด้านล่าง',
        components: links.length ? [{ type: 1, components: links }] : [],
        ...eph,
      });
    }
    if (!hasRole(member, ROLES.approved)) {
      return i.reply({ content: 'ต้องได้รับอนุมัติจากทีมดูแลกิลด์ก่อนนะ', ...eph });
    }
    return i.showModal(await introModal(i.user.id));
  }

  // ── ด่าน 3: กฎ ──
  const confirm = (id, what) =>
    i.reply({
      content: `ยืนยันว่าอ่านและยอมรับ **${what}** แล้ว?`,
      components: [
        row(
          button(`${id}-accept`, 'ยอมรับ', ButtonStyle.Success),
          button('rules-cancel', 'ยกเลิก', ButtonStyle.Secondary),
        ),
      ],
      ...eph,
    });

  if (i.customId === 'rules-guild') {
    if (hasRole(member, ROLES.member)) return i.reply({ content: '✅ คุณเป็นสมาชิกกิลด์อยู่แล้ว', ...eph });
    if (hasRole(member, ROLES.acceptedGuild)) {
      return i.reply({ content: '✅ คุณยอมรับกฎกิลแล้ว', ...eph });
    }
    if (!hasRole(member, ROLES.introduced)) {
      const intro = findChannel(guild, CHANNELS.intro);
      return i.reply({ content: `กรุณาแนะนำตัวที่ ${intro ?? '#แนะนำตัว'} ก่อนนะ`, ...eph });
    }
    return confirm('rules-guild', `กฎการอยู่ร่วมกันในกิล ${GUILD_NAME}`);
  }

  if (i.customId === 'rules-auction') {
    if (hasRole(member, ROLES.member)) return i.reply({ content: '✅ คุณเป็นสมาชิกกิลด์อยู่แล้ว', ...eph });
    if (!hasRole(member, ROLES.acceptedGuild)) {
      // ครั้งแรกต้องโหลดโพสต์ในฟอรั่มทั้งหมด ซึ่งช้ากว่า 3 วินาทีได้ จึงรับทราบก่อน
      await i.deferReply(eph);
      const post = await findGuildRulesPost(guild);
      return i.editReply(`กรุณายอมรับกฎกิลที่ ${post ?? 'ห้องกฎระเบียบและข้อตกลงร่วมกัน'} ก่อนนะ`);
    }
    return confirm('rules-auction', `กฎการประมูลกิล ${GUILD_NAME}`);
  }

  if (i.customId === 'rules-cancel') {
    return i.update({ content: 'ยกเลิกแล้ว กดปุ่มยอมรับใหม่ได้ทุกเมื่อ', components: [] });
  }
  if (i.customId === 'rules-guild-accept') return once(i.user.id, i, () => acceptGuildRules(i));
  if (i.customId === 'rules-auction-accept') return once(i.user.id, i, () => acceptAuctionRules(i));

  // ── ทีมดูแลกดลองบันทึกซ้ำ เมื่อยิงเข้า backend ไม่สำเร็จ ──
  if (i.customId.startsWith('retry-register:')) {
    if (!isStaff(member)) return i.reply({ content: 'ปุ่มนี้สำหรับทีมดูแลกิลด์เท่านั้น', ...eph });
    const userId = i.customId.split(':')[1];
    await i.deferReply(eph); // ต้องรับทราบก่อนไปดึงข้อมูลสมาชิกและอ่านไฟล์
    const target = await guild.members.fetch(userId).catch(() => null);
    const data = await store.get(userId);
    if (!target || !data?.jobId) {
      return i.editReply('ไม่พบสมาชิกหรือข้อมูลแนะนำตัวแล้ว');
    }
    try {
      await registerMember(userId, {
        ign: data.ign,
        jobId: data.jobId,
        nickname: data.nickname || null,
      });
    } catch (err) {
      return i.editReply(`❌ ยังไม่สำเร็จ: ${apiErrorMessage(err)}`);
    }
    await store.set(userId, { status: store.STATUS.registered });
    await finishMembership(target, data);
    await target.send(`🎉 ลงทะเบียนสมาชิก ${GUILD_NAME} สำเร็จแล้ว!`).catch(() => {});
    return i.editReply(`✅ บันทึก ${target} ลงระบบแล้ว`);
  }

  // ── แจ้งตี้ประจำ ──
  if (i.customId === 'party') {
    const modal = new ModalBuilder().setCustomId('party:new').setTitle('แจ้งตี้ประจำ (2–5 คน)');
    for (let n = 1; n <= 5; n++) {
      modal.addComponents(textInput(`m${n}`, `สมาชิกคนที่ ${n}`, { required: n <= 2 }));
    }
    return i.showModal(modal);
  }

  if (i.customId.startsWith('party-edit:')) {
    const ownerId = i.customId.split(':')[1];
    if (ownerId !== i.user.id && !hasRole(member, ROLES.staff)) {
      return i.reply({ content: 'แก้ได้เฉพาะคนที่แจ้งตี้นี้ หรือทีมดูแลกิลด์', ...eph });
    }
    const names = i.message.content
      .split('\n')
      .filter((l) => /^\d+\. /.test(l))
      .map((l) => l.replace(/^\d+\. /, ''));
    const modal = new ModalBuilder()
      .setCustomId(`party:${i.message.id}:${ownerId}`)
      .setTitle('แก้ไขตี้ประจำ');
    for (let n = 1; n <= 5; n++) {
      modal.addComponents(
        textInput(`m${n}`, `สมาชิกคนที่ ${n}`, { required: n <= 2, value: names[n - 1] }),
      );
    }
    return i.showModal(modal);
  }
}

async function listPending(i) {
  await i.deferReply(eph);
  const pending = await store.listByStatus(store.STATUS.requested);
  const staffLog = findChannel(i.guild, CHANNELS.staffLog);
  if (!pending.length) return i.editReply('✅ ไม่มีใครรออนุมัติ');
  return i.editReply(
    [
      `⏳ **รออนุมัติ ${pending.length} คน** — กดอนุมัติได้ที่ ${staffLog ?? '#staff-log'}`,
      ...pending.map((p) => `• <@${p.discordId}> — IGN: ${p.ign}`),
    ].join('\n'),
  );
}

async function onModal(i) {
  const { guild, member } = await guildContext(i);

  if (i.customId === 'join-request') return once(i.user.id, i, () => submitJoinRequest(i, member));
  if (i.customId === 'intro') return once(i.user.id, i, () => submitIntro(i, member));

  if (i.customId.startsWith('reject:')) {
    const [, userId, messageId] = i.customId.split(':');
    const reason = i.fields.getTextInputValue('reason').trim();
    await i.deferReply(eph); // ถอด role + DM + แก้ข้อความเดิม รวมกันเกิน 3 วินาทีได้
    const target = await guild.members.fetch(userId).catch(() => null);
    if (target && !hasRole(target, ROLES.pending)) {
      return i.editReply('คนนี้ไม่ได้อยู่ในสถานะรออนุมัติแล้ว (อาจมีคนกดไปก่อน)');
    }
    if (target) {
      // ถอดแค่ "รออนุมัติ" และเก็บ IGN ที่กรอกไว้ เพื่อให้กดขอเข้ากิลใหม่ได้ทันที
      await setStage(target, { remove: [ROLES.pending], reason: `ไม่อนุมัติโดย ${i.user.tag}` });
      await store.set(userId, { status: store.STATUS.rejected });
      await target
        .send(
          `❌ คำขอเข้ากิล ${GUILD_NAME} ยังไม่ได้รับการอนุมัติ${reason ? `\nเหตุผล: ${reason}` : ''}\nแก้ไขแล้วกดขอเข้ากิลใหม่ได้ที่ห้อง welcome หรือสอบถามทีมดูแลกิลด์`,
        )
        .catch(() => {});
    }
    const msg = await i.channel.messages.fetch(messageId);
    const embed = stamp(msg.embeds[0], `❌ ไม่อนุมัติโดย ${i.user.username}`, 0xda373c);
    if (reason) embed.addFields({ name: 'เหตุผล', value: reason });
    await msg.edit({ embeds: [embed], components: [] });
    return i.editReply('✅ บันทึกว่าไม่อนุมัติแล้ว');
  }

  if (i.customId.startsWith('party:')) {
    const [, messageId, ownerId] = i.customId.split(':');
    const names = [1, 2, 3, 4, 5].map((n) => i.fields.getTextInputValue(`m${n}`).trim()).filter(Boolean);
    if (names.length < 2) return i.reply({ content: 'ตี้ต้องมีอย่างน้อย 2 คน', ...eph });

    const owner = messageId === 'new' ? i.user.id : ownerId;
    await i.deferReply(eph);
    const content = `${names.map((n, idx) => `${idx + 1}. ${n}`).join('\n')}\n-# แจ้งโดย <@${owner}>`;
    const components = [row(button(`party-edit:${owner}`, 'แก้ไขตี้', ButtonStyle.Secondary))];
    const hooks = await i.channel.fetchWebhooks();
    const hook =
      hooks.find((h) => h.name === 'Clover Intro') ??
      (await i.channel.createWebhook({ name: 'Clover Intro' }));

    if (messageId === 'new') {
      await hook.send({
        content,
        components,
        username: i.member.displayName,
        avatarURL: i.member.displayAvatarURL(),
        allowedMentions: { parse: [] },
      });
      await movePanelToBottom(i.channel, 'party', partyPanel(), { silent: true }).catch((err) =>
        console.error('ย้ายปุ่มแจ้งตี้ลงล่างไม่ได้:', err.message),
      );
      return i.editReply('✅ แจ้งตี้ประจำเรียบร้อย');
    }
    await hook.editMessage(messageId, { content, components, allowedMentions: { parse: [] } });
    return i.editReply('✅ แก้ไขตี้แล้ว');
  }
}

// เตือนตั้งแต่เปิดบอทถ้าเชื่อม backend ไม่ได้ จะได้ไม่ไปพังตอนสมาชิกกำลังกรอกฟอร์ม
getJobs()
  .then((jobs) => console.log(`เชื่อม backend ได้ (${jobs.length} อาชีพ)`))
  .catch((err) => console.error('⚠️  เชื่อม backend ไม่ได้:', apiErrorMessage(err)));

client.login(process.env.DISCORD_TOKEN);
