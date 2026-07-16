# Deploy IELTS Writing 7+ Diagnostic Lab V10

## ค่าที่ต้องกรอกใน Render

```text
Root Directory: diagnostic-lab-v10-final-commercial-sale-readiness-upload
Build Command: npm install
Start Command: npm start
```

แพ็กเกจนี้ตั้งใจให้ Root Directory **ไม่ว่าง** โดยชื่อโฟลเดอร์ใน GitHub ต้องตรงกับค่าข้างบนทุกตัวอักษร

## ตรวจใน GitHub ก่อนกด Deploy

ต้องเปิด path ต่อไปนี้ได้:

```text
diagnostic-lab-v10-final-commercial-sale-readiness-upload/package.json
diagnostic-lab-v10-final-commercial-sale-readiness-upload/server.js
diagnostic-lab-v10-final-commercial-sale-readiness-upload/services/apiRouter.js
diagnostic-lab-v10-final-commercial-sale-readiness-upload/services/task1Safety.js
diagnostic-lab-v10-final-commercial-sale-readiness-upload/services/task2Safety.js
diagnostic-lab-v10-final-commercial-sale-readiness-upload/tests/v10-commercial-sale-readiness.test.mjs
```

ถ้า `package.json` อยู่ที่ระดับ repository root แทน แปลว่าอัปโหลดผิดโครงสร้างสำหรับแพ็กเกจนี้ ให้ย้ายไฟล์กลับเข้าโฟลเดอร์ชื่อที่กำหนดก่อน ไม่ต้องเปลี่ยน Root Directory ไปมา

## ลำดับ Deploy

1. Upload โฟลเดอร์ทั้งชุดขึ้น GitHub
2. ตรวจ path `diagnostic-lab-v10-final-commercial-sale-readiness-upload/package.json`
3. ตั้งค่า Render ตามบล็อกด้านบน
4. กด Save Changes
5. เลือก Manual Deploy > Clear build cache & deploy
6. รอ log แสดง `npm install` และ `npm start` สำเร็จ

## Smoke test หลัง Deploy

1. เปิด `/api/health` และตรวจว่า `ok: true`
2. Login ด้วยบัญชีทดสอบ
3. ตรวจ dropdown Task 1 และ Task 2 ว่าตรงตาม V10
4. เลือกประเภทผิดแบบชัดเจนและยืนยันว่าระบบ block ก่อนใช้ credit
5. ทดสอบ Auto-detect ทั้ง Task 1 และ Task 2
6. วิเคราะห์รายงาน Task 1 และ Task 2 อย่างละหนึ่งชิ้น
7. ส่ง input เดิมซ้ำและยืนยันว่าเปิดรายงานเดิม ไม่เพิ่ม progress และไม่ใช้ credit/daily limit
8. เปลี่ยนงานเขียนหนึ่งประโยคและยืนยันว่าเกิด submission ใหม่
9. เปิด Progress ของนักเรียนแต่ละคนและตรวจว่าไม่มีข้อมูลข้ามคน
10. เปิด report, PDF, invalidate, archive, restore และ permanent delete ด้วยโปรไฟล์ทดสอบ

Production ยังต้อง smoke test หลัง deploy จริงก่อนประกาศว่า deploy สำเร็จ
