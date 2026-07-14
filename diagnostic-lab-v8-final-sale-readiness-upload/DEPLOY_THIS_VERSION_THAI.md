# Deploy Diagnostic Lab V8.1 บน Render

เวอร์ชันนี้เป็น V8.1 Output-Recovery Hotfix บนฐาน V8 Final Sale-Readiness Consolidation: ใช้ canonical analysis/scoring ชุดเดียว แยก Task 1/Task 2 และ IELTS/Kru Pom framework อย่างถูกต้อง พร้อมตัดหรือซ่อมเฉพาะ output จาก AI ที่เป็นข้อความไม่สมบูรณ์หรือซ้ำก่อนถึง release gate โดยไม่ลดความเข้มงวดของการตรวจคะแนน จำนวนคำ ตัวตนนักเรียน route และ exact evidence

## สำคัญ: โครงสร้างอัปโหลดที่ใช้ในรอบนี้

เมื่อใช้ Extract All จะได้โฟลเดอร์พร้อมอัปโหลดชื่อ `diagnostic-lab-v8-final-sale-readiness-upload` และภายในต้องเห็น `package.json`, `script.js`, `server.js` และโฟลเดอร์ `services` ทันที ห้ามมีโฟลเดอร์ชื่อเดิมซ้อนอีกชั้น

ให้อัปโหลดโฟลเดอร์ `diagnostic-lab-v8-final-sale-readiness-upload` ทั้งโฟลเดอร์ไปไว้ที่ repository root ของ `diagnostic-lab-render`

ตรวจใน GitHub ก่อน deploy ว่า path ต่อไปนี้เปิดได้จริง:

```text
diagnostic-lab-v8-final-sale-readiness-upload/package.json
diagnostic-lab-v8-final-sale-readiness-upload/server.js
diagnostic-lab-v8-final-sale-readiness-upload/script.js
diagnostic-lab-v8-final-sale-readiness-upload/services/canonicalAnalysis.js
diagnostic-lab-v8-final-sale-readiness-upload/tests/v8-sale-readiness.test.mjs
```

## ค่า Render ที่ถูกต้อง

```text
Root Directory: diagnostic-lab-v8-final-sale-readiness-upload
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
5. Overall ต้องคำนวณจากค่า criterion ranges หลัง criterion cap และต้องไม่มี independent Overall cap
6. ตรวจ Minimal Correction ของ `on the roads ,` ต้องแก้เฉพาะ spacing เป็น `on the roads,` ไม่เปลี่ยนเป็น `on the road`
7. การ revision ที่เพิ่ม premise ใหม่ต้องเป็น `Teacher-Guided Expansion` ไม่ใช่ `Route-Preserving Revision`
8. ใน Student Profiles ทดลอง Archive แล้ว Restore; ประวัติและ account credits ต้องไม่ถูกลบ
9. ทดลอง Permanent delete เฉพาะโปรไฟล์ทดสอบที่ archive แล้ว: ต้องขอชื่อยืนยัน, ลบเฉพาะ reports/progress/cache ของนักเรียนคนนั้น และ account credits ต้องไม่เปลี่ยน
10. วิเคราะห์ Task 2 จริงอย่างน้อยหนึ่งชิ้นและยืนยันว่า output ที่มีการ์ดข้อความไม่สมบูรณ์เฉพาะจุดไม่ทำให้รายงานทั้งฉบับล้ม; ถ้าข้อมูลคะแนน/จำนวนคำ/ตัวตน/หลักฐานขัดแย้ง ระบบยังต้องปฏิเสธและไม่หักเครดิต

## Archive และ Permanent delete

- Archive เก็บ submission history, progress, account credits และโปรไฟล์ไว้สำหรับ Restore
- Permanent delete ลบเฉพาะ student profile, reports, progress และ cache ของโปรไฟล์ที่ยืนยัน
- Permanent delete ไม่เปลี่ยน account credits/usage และไม่กระทบนักเรียนคนอื่น

ระบบ archive โปรไฟล์ออกจากตัวเลือกวิเคราะห์โดยไม่ทำลายข้อมูลย้อนหลัง ส่วน permanent delete ลบโปรไฟล์และข้อมูลรายงานของนักเรียนคนนั้นเท่านั้นหลังการยืนยันที่เข้มกว่า และไม่คืนหรือลด account credits
