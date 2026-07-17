# วิธีอัปโหลด Diagnostic Lab V11.3 ขึ้น GitHub และ Render

ไฟล์ที่ต้องใช้คือ `diagnostic-lab-v11-3-final-ready-upload.zip`

## 1. แตก ZIP

เมื่อแตกไฟล์แล้ว จะได้โฟลเดอร์ชื่อ:

```text
diagnostic-lab-v11-3-final-ready-upload
```

อัปโหลดโฟลเดอร์นี้ทั้งโฟลเดอร์ขึ้น GitHub โดยต้องรักษาชื่อและโครงสร้างเดิมไว้

## 2. ตรวจใน GitHub ก่อน Deploy

ต้องเปิด path นี้ได้จริง:

```text
diagnostic-lab-v11-3-final-ready-upload/package.json
```

ถ้าเห็น `package.json` ที่ path นี้ แปลว่าโครงสร้างถูกต้อง

## 3. ตั้งค่า Render

```text
Root Directory: diagnostic-lab-v11-3-final-ready-upload
Build Command: npm install
Start Command: npm start
```

Root Directory ห้ามเว้นว่างสำหรับ ZIP ชุดนี้ และห้ามใส่ `.zip`

หลังบันทึกค่า ให้เลือก:

```text
Manual Deploy > Clear build cache & deploy
```

## 4. ตรวจหลัง Deploy

1. เปิด `/api/health` และตรวจว่า service ตอบสำเร็จ
2. Hard refresh หน้าเว็บ แล้ว login ใหม่
3. วิเคราะห์งาน Sun เดิม: ต้องได้ Overall `6.0-6.5` และ Position `strongly disagree`
4. Priority Issues ต้องมี 5 รายการ และ Evidence-Based Feedback ต้องมี 7 cards
5. ดาวน์โหลด PDF แล้วตรวจว่ามี Introduction และ Conclusion card และค้นหาข้อความใน PDF ได้ตามปกติ
6. วิเคราะห์งานเดิมซ้ำ: ต้องเพิ่ม Report Version แต่จำนวนงานใน Progress ต้องไม่เพิ่ม

## หาก Render แจ้ง ENOENT package.json

สาเหตุคือ Root Directory ไม่ตรงกับตำแหน่งจริงใน GitHub ให้ตรวจว่า path
`diagnostic-lab-v11-3-final-ready-upload/package.json` เปิดได้ แล้วคัดลอกค่า Root Directory ด้านบนใหม่ทั้งบรรทัด
