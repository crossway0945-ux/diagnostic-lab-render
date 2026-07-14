# วิธี Deploy Diagnostic Lab V8 บน Render

ใช้ขั้นตอนฉบับเดียวใน `DEPLOY_THIS_VERSION_THAI.md`

ค่าที่ต้องตั้งคือ:

```text
Root Directory: เว้นว่าง (Leave blank)
Build Command: npm install
Start Command: npm start
```

เปิดโฟลเดอร์ที่แตกจาก ZIP แล้วอัปโหลด **ไฟล์และโฟลเดอร์ด้านในทั้งหมด** เข้า repository root จากนั้นตรวจว่า GitHub แสดง `package.json`, `server.js` และ `services/` ที่ระดับบนสุด เมื่อเป็นโครงสร้างนี้ต้องเว้น Root Directory ใน Render ให้ว่าง
