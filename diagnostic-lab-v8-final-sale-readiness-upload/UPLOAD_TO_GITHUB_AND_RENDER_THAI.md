# ค่าอัปโหลดและ Render สำหรับ V8

แตก ZIP แล้วเปิดโฟลเดอร์ที่ได้ จากนั้นอัปโหลด **ไฟล์และโฟลเดอร์ด้านในทั้งหมด** ไปที่ root ของ repository `diagnostic-lab-render` ให้ GitHub แสดง `package.json` ที่ระดับบนสุด

```text
Root Directory: เว้นว่าง (Leave blank)
Build Command: npm install
Start Command: npm start
```

ห้ามใส่ชื่อ ZIP หรือชื่อโฟลเดอร์ที่แตกจาก ZIP ใน Root Directory เพราะแพ็กเกจนี้เป็น flat archive และ `package.json` อยู่ repository root

รายละเอียดและ smoke test อยู่ใน `DEPLOY_THIS_VERSION_THAI.md`
