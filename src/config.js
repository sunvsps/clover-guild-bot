// ห้องและ role ค้นหาจาก "ชื่อ" (มีคำนี้อยู่ในชื่อ) ไม่ต้องใส่ ID
export const CHANNELS = {
  welcome: 'welcome',
  intro: 'แนะนำตัว',
  party: 'แจ้งตี้ประจำ',
  rulesForum: 'กฎระเบียบและข้อตกลงร่วมกัน',
  guildRulesPost: 'กฎการอยู่ร่วมกัน', // ชื่อโพสต์ใน forum
  auctionRules: 'กฎการประมูล',
  lounge: 'แชทห้องนั่งเล่น',
  staffLog: 'staff-log',
  changeForum: 'เปลี่ยนชื่อ-เปลี่ยนอาชีพ',
};

export const CATEGORIES = {
  board: 'ป้ายประกาศกิลด์', // #แนะนำตัว และ #แจ้งตี้ประจำ อยู่ในหมวดนี้
  rules: 'กฎระเบียบและข้อตกลงกิลด์',
  auction: 'Auction House',
};

/** หมวดที่เปิดให้เฉพาะสมาชิกกับทีมดูแล (คนเพิ่งเข้าเซิร์ฟต้องไม่เห็น) */
export const MEMBER_ONLY_CATEGORIES = [
  'ห้องซื้อขาย-แลกเปลี่ยน',
  'CLOVER_TH',
  'War',
  'ห้องโถงกิลด์',
];

export const ROLES = {
  pending: 'รออนุมัติ', // กรอก IGN ขอเข้ากิลแล้ว รอแอดมินตรวจ
  approved: 'ผ่านการตรวจ', // แอดมินอนุมัติแล้ว จึงเห็นห้องแนะนำตัวและห้องกฎ
  introduced: 'แนะนำตัวแล้ว',
  acceptedGuild: 'ยอมรับกฎกิลแล้ว',
  member: 'สมาชิกของกิลด์',
  staff: 'ทีมดูแลกิลด์',
  merchant: 'พ่อค้า',
};

/** ชื่อในเซิร์ฟ: IGN/อาชีพ(ชื่อเล่น) เช่น Mimayuu/Knight(Mint) — Discord จำกัดไว้ 32 ตัวอักษร */
export const NICKNAME_MAX = 32;

export const GUILD_NAME = 'CLOVER_TH';
export const COLOR = 0x3ba55d;
