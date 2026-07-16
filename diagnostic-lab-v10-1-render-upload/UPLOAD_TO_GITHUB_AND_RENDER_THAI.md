# วิธีอัปโหลด V10.1 ขึ้น GitHub และ Render

ZIP V10.1 ชุดนี้แก้ปัญหาโฟลเดอร์ซ้อนแล้ว: ภายใน ZIP เป็นไฟล์โปรเจกต์โดยตรง และ Windows จะสร้างโฟลเดอร์ชื่อ ZIP ให้เพียงหนึ่งชั้นตอนใช้ `Extract All`

## 1. แตก ZIP

คลิกขวา ZIP แล้วเลือก `Extract All` หลังแตกไฟล์ต้องเห็นโฟลเดอร์ชื่อ:

```text
diagnostic-lab-v10-1-render-upload
```

ภายในโฟลเดอร์นี้ต้องเห็น `package.json`, `server.js`, `script.js` และโฟลเดอร์ `services` ทันที

ห้ามมีโฟลเดอร์ชื่อ `diagnostic-lab-v10-1-render-upload` ซ้อนอยู่ข้างในอีกชั้น

## 2. อัปโหลดขึ้น GitHub

อัปโหลด **โฟลเดอร์ทั้งโฟลเดอร์** ข้างต้นไว้ที่ระดับบนสุดของ repository `diagnostic-lab-render`

ก่อน deploy ให้เปิด GitHub และตรวจว่า path นี้มีอยู่จริง:

```text
diagnostic-lab-v10-1-render-upload/package.json
```

## 3. ตั้งค่า Render

ใส่ค่าตามนี้ทุกตัว:

```text
Root Directory: diagnostic-lab-v10-1-render-upload
Build Command: npm install
Start Command: npm start
```

จากนั้นกด Save Changes แล้วเลือก:

```text
Manual Deploy > Clear build cache & deploy
```

ห้ามเว้น Root Directory ว่างสำหรับ ZIP ชุดนี้ และห้ามใส่ `.zip` ต่อท้ายชื่อ
