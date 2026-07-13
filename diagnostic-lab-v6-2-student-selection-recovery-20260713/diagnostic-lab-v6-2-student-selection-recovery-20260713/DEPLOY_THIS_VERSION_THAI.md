# Deploy Diagnostic Lab V6.2 บน Render

ชุดนี้แก้ปัญหาบัญชี teacher/internal เลือกนักเรียนแล้ว แต่ปุ่มยังค้างเป็น `Select a Student` และกดตรวจไม่ได้

## ชื่อที่ต้องใช้

ชื่อ ZIP, ชื่อโฟลเดอร์ภายใน และ Render Root Directory ตรงกันทั้งหมด:

```text
diagnostic-lab-v6-2-student-selection-recovery-20260713
```

## วิธีอัปโหลดเข้า GitHub

1. แตก ZIP ก่อน ห้ามอัปโหลดไฟล์ ZIP เข้า repository โดยตรง
2. อัปโหลดโฟลเดอร์นี้ทั้งโฟลเดอร์เข้า repository `diagnostic-lab-render`
3. เปิดตรวจใน GitHub ว่ามีไฟล์ต่อไปนี้จริง:

```text
diagnostic-lab-v6-2-student-selection-recovery-20260713/package.json
diagnostic-lab-v6-2-student-selection-recovery-20260713/script.js
diagnostic-lab-v6-2-student-selection-recovery-20260713/server.js
```

4. เปิด `script.js` ใน GitHub และตรวจว่าภายใน student-profile change handler มีสามบรรทัดนี้เรียงกัน:

```js
updateSelectedStudentDisplay();
updateAnalyzeAvailability();
loadProgressHistory();
```

ถ้าไม่มี `updateAnalyzeAvailability();` ห้าม deploy เพราะไฟล์ที่อัปโหลดไม่ใช่เวอร์ชันแก้ไขนี้

## ค่า Render

ไปที่ Render service > Settings > Build & Deploy แล้วกรอกดังนี้

Root Directory - ใส่ชื่อโฟลเดอร์เท่านั้น ห้ามใส่ `/package.json` และห้ามมี `/` ต่อท้าย:

```text
diagnostic-lab-v6-2-student-selection-recovery-20260713
```

Build Command:

```text
npm install
```

Start Command:

```text
npm start
```

จากนั้นกด Save Changes

## ลำดับ Deploy

1. ตรวจว่า commit ล่าสุดใน GitHub มีโฟลเดอร์ V6.2 และไฟล์ครบ
2. ตรวจ Root Directory ใน Render อีกครั้งให้จบที่ `20260713` เท่านั้น
3. เลือก Manual Deploy > Clear build cache & deploy
4. รอจนสถานะเป็น Live

## Smoke Test หลัง Deploy

1. เปิดหน้าเว็บใหม่ด้วย hard refresh
   - Windows: `Ctrl + Shift + R`
   - macOS: `Cmd + Shift + R`
2. Login ด้วยบัญชีเดิม
3. ไปที่ New Analysis
4. เลือกนักเรียน เช่น Poon Poon (SW)
5. ข้อความด้านล่างต้องแสดงชื่อนักเรียน
6. ปุ่มต้องเปลี่ยนจาก `Select a Student` เป็น `Analyze My Writing` ทันที
7. กรอก prompt และ writing แล้วกดตรวจ
8. สำหรับงาน Task 2 จำนวน 190 คำ ระบบต้องแสดง:

```text
Word count: 190 | Minimum: 250 | Shortfall: 60
```

และยังต้องอนุญาตให้ส่งตรวจได้

## สิ่งที่เวอร์ชันนี้ไม่เปลี่ยน

- Authentication และ password hash
- Accounts, roles, quota, expiry และราคา
- Student profiles และการแยก progress
- Backend deterministic word count
- Task 1 และ Task 2 diagnostic standards
- Fatal output-quality validation
- Persistent data และ Render environment variables
