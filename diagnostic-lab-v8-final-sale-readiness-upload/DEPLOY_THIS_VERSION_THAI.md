# Deploy Diagnostic Lab V8.2 บน Render

เวอร์ชันนี้เป็น V8.2 Critical Correction: แก้ prompt classification, Opinion position/concession route, canonical framework projection, report invalidation และ progress integrity พร้อมเก็บ V8.1 output recovery ไว้ครบ

## สำคัญ: โครงสร้างอัปโหลดที่ใช้ในรอบนี้

เมื่อใช้ Extract All ให้เปิดโฟลเดอร์ที่ได้ แล้วอัปโหลด **ไฟล์และโฟลเดอร์ด้านในทั้งหมด** ไปที่ repository root ของ `diagnostic-lab-render`

ตรวจใน GitHub ก่อน deploy ว่า path ต่อไปนี้เปิดได้จริงที่ระดับบนสุด:

```text
package.json
server.js
script.js
services/canonicalAnalysis.js
tests/v8-2-opinion-route-progress.test.mjs
```

## ค่า Render ที่ถูกต้อง

```text
Root Directory: เว้นว่าง (Leave blank)
Build Command: npm install
Start Command: npm start
```

ห้ามใส่ชื่อ ZIP หรือชื่อโฟลเดอร์ที่แตกจาก ZIP ใน Root Directory เพราะ `package.json` อยู่ repository root

จากนั้นเลือก **Save Changes** แล้วเลือก **Manual Deploy > Clear build cache & deploy**

ก่อน deploy ตรวจใน GitHub ให้แน่ใจว่า `package.json` อยู่ระดับบนสุดของ repository

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
