# Deploy Diagnostic Lab V7 บน Render

เวอร์ชันนี้เป็น V7 One-Shot Production Calibration สำหรับ Task 2 scoring, task-type routing, feedback fidelity และการนำโปรไฟล์นักเรียนออกจากรายงานแบบเก็บประวัติไว้

## สำคัญ: โครงสร้างอัปโหลดที่ใช้ในรอบนี้

เมื่อแตก ZIP จะได้โฟลเดอร์พร้อมอัปโหลดชื่อ `diagnostic-lab-v7-one-shot-production-calibration-20260713-upload` ภายในต้องเห็น `package.json`, `script.js`, `server.js` และโฟลเดอร์ `services` ทันที

ให้อัปโหลดโฟลเดอร์ `diagnostic-lab-v7-one-shot-production-calibration-20260713-upload` ทั้งโฟลเดอร์ไปไว้ที่ repository root ของ `diagnostic-lab-render`

ตรวจใน GitHub ก่อน deploy ว่า path ต่อไปนี้เปิดได้จริง:

```text
diagnostic-lab-v7-one-shot-production-calibration-20260713-upload/package.json
diagnostic-lab-v7-one-shot-production-calibration-20260713-upload/server.js
diagnostic-lab-v7-one-shot-production-calibration-20260713-upload/script.js
diagnostic-lab-v7-one-shot-production-calibration-20260713-upload/services/task2Safety.js
diagnostic-lab-v7-one-shot-production-calibration-20260713-upload/tests/v7-production-calibration.test.mjs
```

## ค่า Render ที่ถูกต้อง

```text
Root Directory: diagnostic-lab-v7-one-shot-production-calibration-20260713-upload
Build Command: npm install
Start Command: npm start
```

คัดลอกชื่อ Root Directory ตามบรรทัดด้านบนเท่านั้น ห้ามเติม `/package.json` และห้ามเติม `/` ต่อท้าย

จากนั้นเลือก **Save Changes** แล้วเลือก **Manual Deploy > Clear build cache & deploy**

ก่อน deploy ตรวจใน GitHub ให้แน่ใจว่า `package.json` อยู่ภายในโฟลเดอร์ชื่อนี้ตรงหนึ่งชั้น ไม่ได้ซ้อนโฟลเดอร์ชื่อเดิมสองครั้ง

## Smoke test หลัง deploy

1. เปิด `https://diagnostic.wonderbloom.co/api/health` และตรวจว่า service ตอบสำเร็จ
2. Hard refresh หน้าเว็บ แล้ว login
3. วิเคราะห์ Problem & Solution: ต้องไม่มี `Detected position`, `supports the proposition` หรือคำสั่งให้แก้ stance
4. รายงานต้องแสดง task type, route, criteria, overall และ cap จาก canonical analysis ชุดเดียวกัน
5. Overall ต้องคำนวณจากค่า criterion ranges; หากมี cap ต้องมี `Explicit cap applied` พร้อมเหตุผล
6. ตรวจ Minimal Correction ของ `on the roads ,` ต้องแก้เฉพาะ spacing เป็น `on the roads,` ไม่เปลี่ยนเป็น `on the road`
7. การ revision ที่เพิ่ม premise ใหม่ต้องเป็น `Teacher-Guided Expansion` ไม่ใช่ `Route-Preserving Revision`
8. ใน Student Profiles ทดลอง Remove selected student from reports แล้ว Restore; ประวัติและ account credits ต้องไม่ถูกลบ

## ข้อมูลที่การ Remove student ไม่ลบ

- submission history
- progress history
- account credits และ usage
- โปรไฟล์ที่เก็บไว้สำหรับ Restore

ระบบ archive โปรไฟล์ออกจากรายงานและตัวเลือกวิเคราะห์ โดยไม่ทำลายข้อมูลย้อนหลัง
