/**
 * สร้างไฟล์ CSV ที่ Excel เปิดแล้วอ่านภาษาไทยได้ถูกต้อง
 *
 * Excel บน Windows เดารหัสภาษาจากไบต์แรกของไฟล์ ถ้าไม่ใส่ BOM ข้อความไทยจะกลายเป็นตัวประหลาด
 * และค่าที่มี , " หรือขึ้นบรรทัดใหม่ ต้องครอบด้วย " พร้อมแปลง " เป็น "" ตามมาตรฐาน CSV
 */
const BOM = '﻿';

const escapeCell = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function toCsv(headers, rows) {
  const lines = [headers.map(escapeCell).join(',')];
  for (const row of rows) lines.push(row.map(escapeCell).join(','));
  return BOM + lines.join('\r\n') + '\r\n';
}
