# วิธีอัปโหลด V10 ขึ้น GitHub และ Render

แพ็กเกจนี้จัดโครงสร้างให้ใช้ Root Directory แบบมีชื่อแน่นอน เพื่อไม่ต้องเดาว่าต้องเว้นว่างหรือไม่

## 1. แตก ZIP

หลังแตกไฟล์ ต้องเห็นโฟลเดอร์ชื่อ:

```text
diagnostic-lab-v10-final-commercial-sale-readiness-upload
```

ภายในโฟลเดอร์นี้ต้องมี `package.json`, `server.js`, `script.js` และโฟลเดอร์ `services`

## 2. อัปโหลดขึ้น GitHub

อัปโหลด **โฟลเดอร์ทั้งโฟลเดอร์** ข้างต้นไว้ที่ระดับบนสุดของ repository `diagnostic-lab-render`

ก่อน deploy ให้เปิด GitHub และตรวจว่า path นี้มีอยู่จริง:

```text
diagnostic-lab-v10-final-commercial-sale-readiness-upload/package.json
```

## 3. ตั้งค่า Render

ใส่ค่าตามนี้ทุกตัว:

```text
Root Directory: diagnostic-lab-v10-final-commercial-sale-readiness-upload
Build Command: npm install
Start Command: npm start
```

จากนั้นกด Save Changes แล้วเลือก:

```text
Manual Deploy > Clear build cache & deploy
```

ห้ามเว้น Root Directory ว่างสำหรับ ZIP ชุดนี้ และห้ามใส่ `.zip` ต่อท้ายชื่อ
