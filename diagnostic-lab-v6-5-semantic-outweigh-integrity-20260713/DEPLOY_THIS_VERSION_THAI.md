# Deploy Diagnostic Lab V6.5 บน Render

เวอร์ชันนี้แก้ semantic position, paragraph route, conclusion route, secure Band 7.5 gate และการจับคู่ Top Issue กับ Detailed Feedback จากรายงาน Evin โดยคง regression ของ Eva, Poon Poon, homeschooling, Task 1, การเลือกนักเรียน และระบบบัญชีเดิมไว้ครบ

## ไฟล์ที่ต้องใช้

```text
diagnostic-lab-v6-5-semantic-outweigh-integrity-20260713.zip
```

ZIP จัดแบบ flat archive หลัง Extract All ต้องเห็น `package.json`, `script.js`, `server.js` และโฟลเดอร์ `services` อยู่ตรงชั้นแรกทันที

โครงสร้างที่ถูกต้อง:

```text
diagnostic-lab-v6-5-semantic-outweigh-integrity-20260713/
  package.json
  script.js
  server.js
  services/
```

ห้ามมีโฟลเดอร์ชื่อ V6.5 ซ้อนอีกชั้น เพราะ Render จะหา `package.json` ไม่พบ

## อัปโหลดเข้า GitHub

1. แตก ZIP ก่อน ห้ามอัปโหลด ZIP โดยตรง
2. อัปโหลดโฟลเดอร์ `diagnostic-lab-v6-5-semantic-outweigh-integrity-20260713` ทั้งก้อนเข้า repository เดิม
3. ตรวจใน GitHub ว่ามี path เหล่านี้จริง:

```text
diagnostic-lab-v6-5-semantic-outweigh-integrity-20260713/package.json
diagnostic-lab-v6-5-semantic-outweigh-integrity-20260713/script.js
diagnostic-lab-v6-5-semantic-outweigh-integrity-20260713/server.js
```

## ค่า Render

Root Directory - คัดลอกเฉพาะบรรทัดนี้ ห้ามเติม `/package.json` และห้ามมี `/` ต่อท้าย:

```text
diagnostic-lab-v6-5-semantic-outweigh-integrity-20260713
```

Build Command:

```text
npm install
```

Start Command:

```text
npm start
```

กด Save Changes แล้วเลือก Manual Deploy > Clear build cache & deploy

## Smoke Test หลัง Deploy

1. Hard refresh หน้าเว็บ: Windows ใช้ `Ctrl + Shift + R`; macOS ใช้ `Cmd + Shift + R`
2. Login, เปิด New Analysis และเลือกนักเรียน ปุ่มต้องเปลี่ยนเป็น `Analyze My Writing`
3. ตรวจงาน Evin 309 คำ ระบบควรแสดง:
   - Detected position: `advantages outweigh the disadvantages`
   - Position confidence: High
   - Body 1: disadvantage เรื่อง employment/job-market pressure
   - Body 2: stronger advantages เรื่อง labour supply/tax revenue/economic development
   - Conclusion: clearly restates that advantages outweigh disadvantages
   - Overall และทั้ง 4 criteria: `7.0` ไม่ใช่ `7.0-7.5`
   - Main limiter ต้องกล่าวถึง analysis หลัง example และ Body 2 ที่แน่นเกินไป
   - Top Issue 3 Grammar/Punctuation ต้องชี้หลักฐาน punctuation/grammar ของตัวเอง ไม่ซ้ำ Development card
4. ตรวจงาน Eva 269 คำ ระบบควรแสดง:
   - Detected position: `advantages outweigh the disadvantages`
   - Position confidence: High
   - Body 1: disadvantage เรื่อง future ageing/retirement pressure
   - Body 2: stronger advantages เรื่อง labour supply/tax revenue/economic development
   - Conclusion: restates that advantages outweigh disadvantages
   - Overall: 6.5; TR 6.5; CC 6.5-7.0; LR 6.0-6.5; GRA 6.0-6.5
5. ตรวจงาน Poon Poon 190 คำ ระบบต้องยังแสดงโครงสร้าง 4 ส่วน, Body 2 สั้น, conclusion unfinished และคะแนน 4.0-4.5
6. ตรวจ homeschooling ตัวอย่างมาตรฐาน ระบบต้องยังแสดง `disadvantages outweigh the advantages` และ `7.0-7.5`

## ส่วนที่ไม่ได้เปลี่ยน

- Authentication, password hash, accounts, roles, quota, expiry และราคา
- Student profiles, progress history และ persistent storage
- Backend deterministic word count
- เกณฑ์ Task 1 และ Render environment variables
