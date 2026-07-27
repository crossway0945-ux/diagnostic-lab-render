# คู่มือติดตั้ง V12.8.2 (ภาษาไทย) — Canonical QA Export + Consistency Gate

## 1. สิ่งที่เพิ่มในรุ่นนี้
- **Export Canonical QA JSON** (เฉพาะแอดมิน) — ดึงข้อมูล canonical ภายในของรายงาน **1 ฉบับ** ออกมาเป็นไฟล์ JSON
  เพื่อใช้ตามแก้ defect ที่เหลือ โดย**ไม่ต้องเข้า Render Shell** หรืออ่านดิสก์เอง
- **Enforced consistency gate** (V12.8.1) — ซ่อมความขัดแย้งข้ามหน้าในรายงานก่อนเซฟ/แสดงผล
- appVersion → **12.8.2** (คะแนน/รูบริก/พรอมป์/แท็กโซโนมี **ไม่เปลี่ยน**)

## 2. อัปโหลดขึ้น GitHub (Root Directory เดิม)
1. แตก ZIP ลงโฟลเดอร์ว่าง
2. อัปเนื้อหาในโฟลเดอร์ `diagnostic-lab-v12-8-0-upload-ready` ทับของเดิม (น้อยกว่า 100 ไฟล์ ลากครั้งเดียวจบ)
3. ตำแหน่งที่ GitHub ต้องมี: `/diagnostic-lab-v12-8-0-upload-ready/package.json`
4. **อย่า** สร้างโฟลเดอร์เวอร์ชันซ้อน · **อย่า** อัปตัว ZIP · **อย่า** ลบโฟลเดอร์แม่
5. ตรวจแล้ว commit เข้า `main`

## 3. ตั้งค่า Render
```
Root Directory: diagnostic-lab-v12-8-0-upload-ready
Build Command : npm install
Start Command : npm start
```
เพิ่มได้ (ไม่บังคับ): `DIAGNOSTIC_QA_EXPORT_RETENTION_DAYS=30` (เก็บ QA snapshot 30 วัน)

ยืนยันว่าโค้ดใหม่ขึ้นแล้ว: เปิด `/api/health` ต้องได้ `"appVersion":"12.8.2"`

## 4. วิธี Export Canonical QA JSON (ครูปอม)
1. ล็อกอินบัญชี **admin** → เปิด `/admin`
2. เลื่อนไปหัวข้อ **Canonical QA Export** → กด **Load reports**
3. ค้นหาด้วย ชื่อนักเรียน / report ID / วันที่ / task type แล้ว **คลิกเลือก 1 แถว**
4. กด **Export Canonical QA JSON** → ไฟล์จะดาวน์โหลดชื่อ `diagnostic-qa-<student>-<reportId>.json`
5. ป้ายท้ายแถวบอกความพร้อมของข้อมูล:
   - *full canonical snapshot* = ข้อมูลครบ (รายงานที่วิเคราะห์**หลัง**ติดตั้งรุ่นนี้)
   - *partial (from saved record)* = ได้ข้อมูล canonical ระดับ issue ครบ (รายงานเก่า ใช้ตามแก้ได้จริง)
   - *canonical data unavailable* = รายงานเก่ามากที่ไม่มีข้อมูล ให้วิเคราะห์ใหม่

> ความปลอดภัย: เฉพาะแอดมินเท่านั้น (นักเรียน/ครูทั่วไปได้ 403), ได้ทีละ 1 รายงาน,
> ไม่มี API key / รหัสผ่าน / ข้อมูลนักเรียนคนอื่นหลุด, ไม่เรียก OpenAI, ไม่หักเครดิต, ไม่แก้รายงาน

## 5. ต้องวิเคราะห์ใหม่ก่อน export ไหม?
- **ไม่ต้อง** สำหรับรายงานเดิมส่วนใหญ่ — export ได้เลย (ได้ข้อมูล canonical ระดับ issue ครบ)
- **ต้องวิเคราะห์ใหม่** ถ้าอยากได้ snapshot เต็ม (canonical analysis + route + consistency audit + provider metadata)

## 6. Rollback
Deploy commit เดิมที่ Render ได้ทันที · โฟลเดอร์ `qa-canonical/` แยกจากรายงานนักเรียน ลบทิ้งไม่กระทบอะไร ·
รายงาน/ประวัติ/เครดิตเดิมไม่ถูกแตะ

## 7. ข้อจำกัดที่ต้องรู้ (ไม่ปิดบัง)
รุ่นนี้**ยังไม่ได้แก้** defect ที่เหลือ 6 ข้อ (#2 taxonomy, #5 revision type, #6 Introduction, #7 Conclusion,
#8 punctuation, #9 PDF extracted text) — ฟีเจอร์นี้คือ**เครื่องมือ**ที่ทำให้ตามแก้ได้แม่นยำ
และยังไม่ได้ทดสอบกับ provider จริง (gpt-5.6-sol) จึงยัง**ไม่ประกาศพร้อมขาย**
