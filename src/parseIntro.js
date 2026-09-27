// แกะ IGN / ชื่อเล่น / อาชีพ จากข้อความแนะนำตัวที่สมาชิกพิมพ์เอง
//
// รูปแบบที่คนพิมพ์กันจริงมีหลายแบบ เช่น
//   IGN: เดียอาโบเทมเพลส / ชื่อ ทิม / อาชีพ ม้อง
//   IGN : Boeing747 / ชื่อ วอย / อาชีพ  ไบโอ
//   IGN: -RossesFall / ชื่อ : ยัพ / อาชีพ : Creator
// จึงรับทั้งแบบมีและไม่มีเครื่องหมาย : และเว้นวรรคกี่ตัวก็ได้

const FIELD = {
  ign: /^\s*ign\s*[:：]?\s*(.+?)\s*$/im,
  nickname: /^\s*(?:ชื่อเล่น|ชื่อ)\s*[:：]?\s*(.+?)\s*$/im,
  job: /^\s*(?:อาชีพ|คลาส|class|job)\s*[:：]?\s*(.+?)\s*$/im,
};

/** ชื่ออาชีพที่คนในกิลด์เรียกกันเอง (ไทย/ย่อ/ขั้นสูง) -> ชื่อที่ใช้ในระบบ */
const JOB_WORDS = {
  // สายดาบ
  ลอร์ด: 'Knight',
  'lord knight': 'Knight',
  lk: 'Knight',
  ไนท์: 'Knight',
  พาลา: 'Crusader',
  paladin: 'Crusader',
  พาลาดิน: 'Crusader',
  // สายเวท
  วิซ: 'Wizard',
  'high wizard': 'Wizard',
  hw: 'Wizard',
  วอร์ล็อค: 'Wizard',
  // สายธนู
  สไนป์: 'Hunter',
  sniper: 'Hunter',
  เรนเจอร์: 'Hunter',
  // สายเพลง/เต้น
  bard: 'Bard',
  บาร์ด: 'Bard',
  dancer: 'Dancer',
  แดนเซอร์: 'Dancer',
  // สายบัพ
  พีส: 'Priest',
  priest: 'Priest',
  'high priest': 'Priest',
  hp: 'Priest',
  // สายหมัด
  ม้อง: 'Monk',
  monk: 'Monk',
  แชมป์: 'Monk',
  champion: 'Monk',
  // สายลอบ
  ซิน: 'Assassin',
  'assassin cross': 'Assassin',
  nightwalker: 'Assassin',
  'night walker': 'Assassin',
  'นักเดินราตรี': 'Assassin',
  // สายช่าง
  whitesmith: 'Blacksmith',
  ไวท์สมิธ: 'Blacksmith',
  ช่าง: 'Blacksmith',
  // สายยา
  ไบโอ: 'Alchemist',
  bio: 'Alchemist',
  creator: 'Alchemist',
  ครีเอเตอร์: 'Alchemist',
  alchemist: 'Alchemist',
  // อื่นๆ
  รีเบล: 'Rebel',
  ปืน: 'Rebel',
  อาลิเทีย: 'อาลิเทีย',
  ดรูอิด: 'อาลิเทีย',
};

const clean = (s) => s.normalize('NFC').trim().replace(/\s+/g, ' ');

/** คืน { ign, nickname, job } เท่าที่แกะได้ (ค่าที่ไม่เจอจะเป็น null) */
export function parseIntroMessage(content) {
  const pick = (re) => {
    const m = content.match(re);
    return m ? clean(m[1]) : null;
  };
  return { ign: pick(FIELD.ign), nickname: pick(FIELD.nickname), job: pick(FIELD.job) };
}

/**
 * จับคู่ชื่ออาชีพที่คนพิมพ์ กับรายการอาชีพจริงในระบบ
 * คืน job object ถ้าแน่ใจ หรือ null ถ้าไม่รู้จัก (ให้คนตรวจเอง ดีกว่าเดาผิด)
 */
export function matchJob(text, jobs) {
  if (!text) return null;
  const key = clean(text).toLowerCase();
  const byLabel = new Map(jobs.map((j) => [j.label.toLowerCase(), j]));
  if (byLabel.has(key)) return byLabel.get(key);

  const mapped = JOB_WORDS[key];
  if (mapped) return byLabel.get(mapped.toLowerCase()) ?? null;

  // คำที่มีชื่ออาชีพอยู่ข้างใน เช่น "High Priest สายบัพ"
  for (const [label, job] of byLabel) if (key.includes(label)) return job;
  for (const [word, label] of Object.entries(JOB_WORDS)) {
    if (key.includes(word)) return byLabel.get(label.toLowerCase()) ?? null;
  }
  return null;
}
