# Deploy Diagnostic Lab V6.3 บน Render

เวอร์ชันนี้แก้ paragraph detection, route summary, issue/evidence/location mapping, Targeted Revision และข้อความสรุปซ้ำตาม feedback ของรายงาน Poon Poon

## ไฟล์ ZIP และโครงสร้างหลังแตกไฟล์

ไฟล์ที่ต้องใช้:

```text
diagnostic-lab-v6-3-parser-mapping-recovery-20260713.zip
```

ZIP นี้จัดแบบ flat archive เมื่อกด Extract All ระบบจะสร้างโฟลเดอร์ปลายทางชื่อเดียวกับ ZIP และไฟล์ `package.json` ต้องอยู่ตรงชั้นแรกของโฟลเดอร์นั้น

โครงสร้างที่ถูกต้อง:

```text
diagnostic-lab-v6-3-parser-mapping-recovery-20260713/
  package.json
  script.js
  server.js
  services/
```

โครงสร้างที่ผิดและจะทำให้ Render ขึ้น `ENOENT`:

```text
diagnostic-lab-v6-3-parser-mapping-recovery-20260713/
  diagnostic-lab-v6-3-parser-mapping-recovery-20260713/
    package.json
```

## อัปโหลดเข้า GitHub

1. แตก ZIP ก่อน ห้ามอัปโหลดไฟล์ ZIP เข้า repository โดยตรง
2. อัปโหลดโฟลเดอร์ `diagnostic-lab-v6-3-parser-mapping-recovery-20260713` ทั้งโฟลเดอร์เข้า repository เดิม
3. เปิด GitHub และยืนยันว่า path เหล่านี้มีจริง:

```text
diagnostic-lab-v6-3-parser-mapping-recovery-20260713/package.json
diagnostic-lab-v6-3-parser-mapping-recovery-20260713/script.js
diagnostic-lab-v6-3-parser-mapping-recovery-20260713/server.js
```

4. ตรวจว่าไม่มีชื่อโฟลเดอร์ V6.3 ซ้ำสองชั้น

## ค่า Render ที่ต้องกรอก

ไปที่ Render service > Settings > Build & Deploy

Root Directory — คัดลอกเฉพาะบรรทัดนี้ ห้ามเติม `/package.json` และห้ามมี `/` ต่อท้าย:

```text
diagnostic-lab-v6-3-parser-mapping-recovery-20260713
```

Build Command:

```text
npm install
```

Start Command:

```text
npm start
```

จากนั้นกด Save Changes แล้วเลือก Manual Deploy > Clear build cache & deploy

ถ้า log ยังอ้างถึงชื่อ V6.1 หรือ V6.2 แปลว่า Root Directory หรือ commit ที่ deploy ยังไม่ใช่เวอร์ชันนี้

## Smoke Test หลัง Deploy

1. Hard refresh หน้าเว็บ
   - Windows: `Ctrl + Shift + R`
   - macOS: `Cmd + Shift + R`
2. Login แล้วเปิด New Analysis
3. เลือก Poon Poon (SW) ปุ่มต้องเปลี่ยนจาก `Select a Student` เป็น `Analyze My Writing`
4. ส่งงาน Task 2 ตัวอย่าง 190 คำ ระบบต้องยังอนุญาตให้กดตรวจ และแสดง `Shortfall: 60`
5. ตรวจรายงานว่าแสดง:
   - `Introduction + Body 1 + Body 2 + incomplete conclusion`
   - Conclusion present but unfinished
   - Short body paragraph เป็น Body 2
   - Body 1 สนับสนุน, Body 2 คัดค้าน/จำกัด, conclusion agree ช้าและเขียนไม่จบ
   - Unclear Thesis Route อยู่ Introduction และใช้ประโยค thesis จริง
   - Meaning-changing language ใช้ evidence เช่น `with charging` หรือ `free to charge`
   - Cost sentence อยู่ Body Paragraph 2 และ Targeted Revision แก้ทั้งประโยค

## ส่วนที่คงเดิม

- Authentication และ password hash
- Accounts, roles, quota, expiry และราคา
- Student profiles และการแยก progress
- Backend deterministic word count
- เกณฑ์คะแนน Task 1 และ Task 2
- Persistent data และ Render environment variables
