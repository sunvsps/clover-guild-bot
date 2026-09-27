// ตั้งค่าเซิร์ฟอัตโนมัติ: npm run setup:dry (ดูก่อน) / npm run setup:apply (ทำจริง)
//
// สิทธิ์ที่ตั้งให้ ไล่ตามลำดับของ onboarding flow:
//   #welcome                     ทุกคนเห็น (ปุ่ม "ขอเข้ากิล" อยู่ที่นี่) — ไม่ย้ายหมวด ปล่อยลอยไว้ตามที่เซิร์ฟจริงเป็น
//   #แนะนำตัว                     เห็นเมื่อผ่านการตรวจแล้วเท่านั้น
//   forum กฎระเบียบฯ              เห็นหลังแนะนำตัว
//   #กฎการประมูล                  เห็นหลังยอมรับกฎกิล
//   หมวด Auction House           เฉพาะสมาชิกกับทีมดูแล
import { ChannelType, Client, GatewayIntentBits, PermissionFlagsBits as P } from 'discord.js';
import { CATEGORIES, CHANNELS, MEMBER_ONLY_CATEGORIES, ROLES } from '../src/config.js';
import { findCategory, findChannel, findRole } from '../src/lookup.js';

const APPLY = process.argv.includes('--apply');
// ชี้ไปเซิร์ฟอื่นได้ด้วย --guild <id> ปลอดภัยกว่าการแก้ .env ชั่วคราวแล้วลืมแก้กลับ
const GUILD_ID = process.argv.includes('--guild')
  ? process.argv[process.argv.indexOf('--guild') + 1]
  : process.env.GUILD_ID;
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const log = (msg) => console.log(`${APPLY ? '✅' : '👀 [dry-run]'} ${msg}`);

client.once('ready', async () => {
  try {
    const guild = await client.guilds.fetch(GUILD_ID).catch(() => {
      throw new Error(
        `บอทไม่ได้อยู่ในเซิร์ฟ ${GUILD_ID} (หรือ id ผิด) — ต้องเชิญบอทเข้าเซิร์ฟนั้นก่อน`,
      );
    });
    await guild.channels.fetch();
    await guild.roles.fetch();
    console.log(`เซิร์ฟ: ${guild.name}\n`);

    const everyone = guild.roles.everyone;
    const member = findRole(guild, ROLES.member);
    const staff = findRole(guild, ROLES.staff);
    const merchant = findRole(guild, ROLES.merchant);
    if (!member || !staff) throw new Error(`ไม่เจอ role "${ROLES.member}" หรือ "${ROLES.staff}"`);

    // 1) role ตามขั้นของ flow
    const ensureRole = async (name) => {
      const found = findRole(guild, name);
      if (found) {
        console.log(`• role "${name}" มีอยู่แล้ว`);
        return found.id;
      }
      log(`สร้าง role "${name}"`);
      return APPLY ? (await guild.roles.create({ name, reason: 'onboarding setup' })).id : `PENDING-${name}`;
    };
    const pendingId = await ensureRole(ROLES.pending);
    const approvedId = await ensureRole(ROLES.approved);
    const introducedId = await ensureRole(ROLES.introduced);
    const acceptedGuildId = await ensureRole(ROLES.acceptedGuild);

    const readOnly = {
      allow: [P.ViewChannel, P.ReadMessageHistory],
      deny: [P.SendMessages, P.SendMessagesInThreads, P.CreatePublicThreads],
    };

    // 2) #welcome — ด่านแรก ทุกคนเห็นแต่พิมพ์ไม่ได้ (คงตำแหน่งห้องไว้ ไม่ย้ายเข้าหมวด)
    const welcome = findChannel(guild, CHANNELS.welcome, ChannelType.GuildText);
    if (!welcome) throw new Error('ไม่เจอห้อง welcome');
    log(`#${welcome.name}: ทุกคนเห็น แต่พิมพ์ไม่ได้`);
    if (APPLY) {
      await welcome.permissionOverwrites.set([
        { id: everyone.id, ...readOnly, deny: [...readOnly.deny, P.AddReactions, P.CreatePrivateThreads] },
        { id: staff.id, allow: [P.ViewChannel, P.SendMessages] },
      ]);
    }

    // 3) หมวดป้ายประกาศ: เฉพาะสมาชิก ยกเว้น #แนะนำตัว ที่เปิดให้คนผ่านการตรวจแล้วเข้าได้
    const board = findCategory(guild, CATEGORIES.board);
    if (!board) throw new Error(`ไม่เจอหมวด "${CATEGORIES.board}"`);
    const intro = findChannel(guild, CHANNELS.intro, ChannelType.GuildText);
    if (!intro) throw new Error('ไม่เจอห้อง แนะนำตัว');

    const membersOnly = [
      { id: everyone.id, deny: [P.ViewChannel] },
      { id: member.id, allow: [P.ViewChannel] },
      { id: staff.id, allow: [P.ViewChannel, P.SendMessages] },
    ];
    await lockCategory(guild, board, membersOnly, 'เฉพาะสมาชิก / ทีมดูแล', [intro.id]);

    log(`#${intro.name}: เห็นเมื่อผ่านการตรวจแล้ว (ผ่านการตรวจ / แนะนำตัวแล้ว / ยอมรับกฎกิลแล้ว / สมาชิก / ทีมดูแล)`);
    if (APPLY) {
      await intro.permissionOverwrites.set([
        { id: everyone.id, deny: [P.ViewChannel] },
        { id: pendingId, deny: [P.ViewChannel] },
        { id: approvedId, ...readOnly },
        { id: introducedId, ...readOnly },
        { id: acceptedGuildId, ...readOnly },
        { id: member.id, ...readOnly },
        { id: staff.id, allow: [P.ViewChannel, P.SendMessages] },
      ]);
    }

    // 4) หมวดกฎ: forum กฎกิลเห็นหลังแนะนำตัว, #กฎการประมูล เห็นหลังยอมรับกฎกิล
    const rulesCat = findCategory(guild, CATEGORIES.rules);
    if (!rulesCat) throw new Error(`ไม่เจอหมวด "${CATEGORIES.rules}"`);
    const base = [
      { id: everyone.id, deny: [P.ViewChannel] },
      { id: member.id, allow: [P.ViewChannel] },
      { id: staff.id, allow: [P.ViewChannel, P.SendMessages] },
      ...(merchant ? [{ id: merchant.id, deny: [P.ViewChannel] }] : []),
    ];
    const guildRulesPerms = [
      ...base,
      { id: introducedId, ...readOnly },
      { id: acceptedGuildId, ...readOnly },
    ];
    const auctionRulesPerms = [...base, { id: acceptedGuildId, ...readOnly }];
    await lockCategory(
      guild,
      rulesCat,
      guildRulesPerms,
      'เห็นหลังแนะนำตัว (แนะนำตัวแล้ว / ยอมรับกฎกิลแล้ว / สมาชิก / ทีมดูแล)',
    );

    const auctionRules = findChannel(guild, CHANNELS.auctionRules, ChannelType.GuildText);
    if (!auctionRules) throw new Error('ไม่เจอห้อง กฎการประมูล');
    log(`#${auctionRules.name}: เห็นหลังยอมรับกฎกิล (ยอมรับกฎกิลแล้ว / สมาชิก / ทีมดูแล)`);
    if (APPLY) await auctionRules.permissionOverwrites.set(auctionRulesPerms);

    // 5) หมวดอื่นที่ต้องเป็นเฉพาะสมาชิก (ซื้อขาย, แชททั่วไป, War, ห้องโถง)
    const membersOnlyOther = [
      { id: everyone.id, deny: [P.ViewChannel] },
      { id: member.id, allow: [P.ViewChannel] },
      { id: staff.id, allow: [P.ViewChannel] },
      ...(merchant ? [{ id: merchant.id, allow: [P.ViewChannel] }] : []),
    ];
    for (const name of MEMBER_ONLY_CATEGORIES) {
      const cat = findCategory(guild, name);
      if (!cat) {
        console.log(`⚠️  ไม่เจอหมวด "${name}" — ข้ามไป`);
        continue;
      }
      await lockCategory(guild, cat, membersOnlyOther, 'เฉพาะสมาชิก / ทีมดูแล');
    }

    // 6) Auction House: เฉพาะสมาชิก
    const auctionCat = findCategory(guild, CATEGORIES.auction);
    if (!auctionCat) throw new Error(`ไม่เจอหมวด "${CATEGORIES.auction}"`);
    await lockCategory(
      guild,
      auctionCat,
      [
        { id: everyone.id, deny: [P.ViewChannel] },
        { id: member.id, allow: [P.ViewChannel] },
        { id: staff.id, allow: [P.ViewChannel] },
      ],
      'เฉพาะสมาชิก / ทีมดูแล',
    );

    // 7) ตรวจว่าโพสต์กฎที่บอทต้องเอาปุ่มไปแปะมีอยู่จริง
    const forum = findChannel(guild, CHANNELS.rulesForum, ChannelType.GuildForum);
    const [active, archived] = await Promise.all([
      forum.threads.fetchActive(),
      forum.threads.fetchArchived(),
    ]);
    const posts = [...active.threads.values(), ...archived.threads.values()];
    const rulesPost = posts.find((t) => t.name.includes(CHANNELS.guildRulesPost));
    if (rulesPost) console.log(`• เจอโพสต์กฎ: "${rulesPost.name}" (ปุ่มยอมรับกฎกิลจะไปอยู่ที่นี่)`);
    else if (posts.length) console.log(`⚠️  ไม่เจอโพสต์ที่มีคำว่า "${CHANNELS.guildRulesPost}" จะใช้ "${posts[0].name}" แทน`);
    else console.log(`⚠️  forum "${forum.name}" ยังไม่มีโพสต์ — /โพสต์ปุ่ม จะยังทำงานไม่ได้`);

    console.log(APPLY ? '\nเสร็จแล้ว 🎉' : '\nยังไม่ได้แก้อะไร — ถ้าถูกต้องให้รัน: npm run setup:apply');
  } catch (err) {
    console.error('❌', err.message);
    process.exitCode = 1;
  } finally {
    client.destroy();
  }
});

/** ตั้งสิทธิ์ที่หมวด แล้วให้ห้องข้างในตามหมวด ยกเว้นห้องใน skipIds ที่ตั้งสิทธิ์ของตัวเองต่างหาก */
async function lockCategory(guild, category, perms, desc, skipIds = []) {
  const children = guild.channels.cache.filter((c) => c.parentId === category.id);
  const synced = children.filter((c) => !skipIds.includes(c.id));
  log(`หมวด "${category.name}" + ${synced.size} ห้องข้างใน: ${desc}`);
  if (!APPLY) return;
  await category.permissionOverwrites.set(perms);
  for (const ch of synced.values()) await ch.lockPermissions();
}

client.login(process.env.DISCORD_TOKEN);
