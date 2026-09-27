// ดึงข้อมูลสมาชิกเก่าจากข้อความในห้องแนะนำตัว เข้าสู่ระบบ
//
//   npm run import:intros            ดูอย่างเดียว ไม่แตะ database
//   npm run import:intros -- --apply บันทึกเข้า database จริง
//   เพิ่ม --guild <id> เพื่อชี้ไปเซิร์ฟอื่น (ค่าเริ่มต้นใช้ GUILD_ID ใน .env)
//
// อ่านทุกข้อความในห้อง แกะ IGN/ชื่อเล่น/อาชีพ แล้วแยกเป็น 2 กลุ่ม:
//   พร้อมบันทึก = ได้ครบทั้ง IGN และอาชีพที่ตรงกับรายการในระบบ
//   ต้องตรวจเอง = ขาดข้อมูล หรือชื่ออาชีพไม่รู้จัก (ไม่เดาให้ เพราะเดาผิดแล้วแก้ยาก)
import { writeFile } from 'node:fs/promises';
import { Client } from 'discord.js';
import { apiErrorMessage, getJobs, registerMember } from '../src/api.js';
import { CHANNELS } from '../src/config.js';
import { toCsv } from '../src/csv.js';
import { intents, wantsMessageContent } from '../src/intents.js';
import { findChannel } from '../src/lookup.js';
import { matchJob, parseIntroMessage } from '../src/parseIntro.js';

const APPLY = process.argv.includes('--apply');
const guildArg = process.argv[process.argv.indexOf('--guild') + 1];
const GUILD_ID = process.argv.includes('--guild') ? guildArg : process.env.GUILD_ID;
const OUT_FILE = new URL('../data/intros.json', import.meta.url);
const CSV_FILE = new URL('../data/intros.csv', import.meta.url);

if (!wantsMessageContent()) {
  console.error(
    [
      '❌ ต้องเปิดสิทธิ์อ่านเนื้อหาข้อความก่อน ไม่งั้นบอทจะอ่านข้อความแนะนำตัวไม่ได้เลย (ได้ค่าว่าง)',
      '',
      '1. เปิด https://discord.com/developers/applications แล้วเลือกแอปของบอท',
      '2. ไปที่ Bot -> Privileged Gateway Intents -> เปิด MESSAGE CONTENT INTENT แล้วกด Save',
      '3. เพิ่มบรรทัดนี้ใน clover-bot/.env :  MESSAGE_CONTENT_INTENT=true',
    ].join('\n'),
  );
  process.exit(1);
}

const client = new Client({ intents: intents() });

/** ดึงข้อความทั้งห้อง (Discord ให้ทีละ 100) */
async function fetchAllMessages(channel) {
  const all = [];
  let before;
  for (;;) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (!batch.size) break;
    all.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }
  return all;
}

client.once('ready', async () => {
  try {
    const guild = await client.guilds.fetch(GUILD_ID).catch(() => {
      throw new Error(
        `บอทไม่ได้อยู่ในเซิร์ฟ ${GUILD_ID} (หรือ id ผิด) — ต้องเชิญบอทเข้าเซิร์ฟนั้นก่อน`,
      );
    });
    await guild.channels.fetch();
    await guild.members.fetch();
    const channel = findChannel(guild, CHANNELS.intro);
    if (!channel) throw new Error(`ไม่เจอห้อง "${CHANNELS.intro}" ในเซิร์ฟ ${guild.name}`);

    const jobs = await getJobs();
    const messages = await fetchAllMessages(channel);
    console.log(`เซิร์ฟ: ${guild.name} | ห้อง #${channel.name} | ข้อความทั้งหมด ${messages.length}\n`);

    // คนเดียวกันอาจพิมพ์หลายครั้ง ใช้ข้อความล่าสุดของแต่ละคน
    const latest = new Map();
    for (const m of [...messages].sort((a, b) => a.createdTimestamp - b.createdTimestamp)) {
      const parsed = parseIntroMessage(m.content);
      if (!parsed.ign) continue; // ข้อความที่ไม่ใช่การแนะนำตัว
      // ข้อความที่บอทโพสต์แทนสมาชิก (webhook) จะมี mention ของเจ้าตัวอยู่ท้ายข้อความ
      const ownerId = m.content.match(/<@!?(\d+)>/)?.[1] ?? (m.webhookId ? null : m.author.id);
      if (!ownerId) continue;
      latest.set(ownerId, { ...parsed, at: m.createdAt, messageId: m.id });
    }

    const ready = [];
    const review = [];
    const skipped = [];
    for (const [discordId, row] of latest) {
      const member = guild.members.cache.get(discordId);
      const job = matchJob(row.job, jobs);
      const entry = {
        discordId,
        discordName: member?.user.username ?? '(ออกจากเซิร์ฟแล้ว)',
        serverName: member?.displayName ?? null,
        ign: row.ign,
        nickname: row.nickname,
        jobText: row.job,
        jobId: job?.id ?? null,
        job: job?.label ?? null,
        inServer: Boolean(member),
      };
      // คนที่ออกจากเซิร์ฟไปแล้วไม่นำเข้า แต่ยังแสดงให้เห็นว่าข้ามใครไปบ้าง จะได้ไม่หายเงียบ
      if (!member) {
        entry.reason = 'ออกจากเซิร์ฟไปแล้ว';
        skipped.push(entry);
        continue;
      }
      if (!job) {
        entry.reason = row.job ? `ไม่รู้จักอาชีพ "${row.job}"` : 'ไม่ได้ระบุอาชีพ';
        review.push(entry);
        continue;
      }
      ready.push(entry);
    }

    await writeFile(OUT_FILE, JSON.stringify({ ready, review, skipped }, null, 2));

    // ไฟล์สำหรับเปิดใน Excel: รวมทุกกลุ่มไว้ในตารางเดียว มีคอลัมน์ "อาชีพ (แก้ได้)" ให้เติมเอง
    const statusOf = (list, label) => list.map((r) => ({ ...r, status: label }));
    const all = [...statusOf(ready, 'พร้อมบันทึก'), ...statusOf(review, 'ต้องตรวจเอง'), ...statusOf(skipped, 'ข้าม')];
    await writeFile(
      CSV_FILE,
      toCsv(
        ['Discord ID', 'บัญชี Discord', 'ชื่อในเซิร์ฟ', 'IGN', 'ชื่อเล่น', 'อาชีพที่พิมพ์มา', 'อาชีพในระบบ', 'jobId', 'สถานะ', 'หมายเหตุ'],
        all.map((r) => [
          r.discordId,
          r.discordName,
          r.serverName,
          r.ign,
          r.nickname,
          r.jobText,
          r.job,
          r.jobId,
          r.status,
          r.reason ?? '',
        ]),
      ),
    );
    console.log(`✅ พร้อมบันทึก ${ready.length} คน`);
    for (const r of ready) console.log(`   ${r.ign} / ${r.job}${r.nickname ? ` (${r.nickname})` : ''} — ${r.discordName}`);
    console.log(`\n⚠️  ต้องตรวจเอง ${review.length} คน`);
    for (const r of review) console.log(`   ${r.ign ?? '(ไม่มี IGN)'} — ${r.reason} — ${r.discordName}`);
    console.log(`\n⏭️  ข้าม ${skipped.length} คน (ออกจากเซิร์ฟไปแล้ว)`);
    for (const r of skipped) console.log(`   ${r.ign} — ${r.discordId}`);
    console.log(`\nไฟล์สำหรับ Excel: ${CSV_FILE.pathname}`);
    console.log(`ไฟล์รายละเอียด (JSON): ${OUT_FILE.pathname}`);

    if (!APPLY) {
      console.log('\nยังไม่ได้บันทึกอะไรลง database — ถ้าถูกต้องให้รัน: npm run import:intros -- --apply');
      return;
    }

    console.log('\nกำลังบันทึกเข้า database...');
    let ok = 0;
    for (const r of ready) {
      try {
        await registerMember(r.discordId, { ign: r.ign, jobId: r.jobId, nickname: r.nickname || null });
        ok++;
      } catch (err) {
        console.error(`   ❌ ${r.ign}: ${apiErrorMessage(err)}`);
      }
    }
    console.log(`บันทึกสำเร็จ ${ok}/${ready.length} คน (ไม่ได้แตะ role ในเซิร์ฟ)`);
  } catch (err) {
    console.error('❌', err.message);
    process.exitCode = 1;
  } finally {
    client.destroy();
  }
});

client.login(process.env.DISCORD_TOKEN);
