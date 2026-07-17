# วิธีอัปโหลด V11.2 ขึ้น GitHub และ Render

## ค่าที่ต้องใช้

```text
Root Directory: diagnostic-lab-v11-2-final-ready-upload
Build Command: npm install
Start Command: npm start
```

ใช้ค่า Root Directory ด้านบนเมื่อใน GitHub เห็นโฟลเดอร์
`diagnostic-lab-v11-2-final-ready-upload` และเมื่อเปิดเข้าไปแล้วเห็น
`package.json` อยู่ข้างใน

ก่อน Deploy ให้ตรวจ path นี้ใน GitHub ให้เปิดได้จริง:

```text
diagnostic-lab-v11-2-final-ready-upload/package.json
```

ถ้า GitHub แสดง `package.json` อยู่ระดับบนสุดของ repository แทน แปลว่าไฟล์ถูก
upload แบบไม่มีโฟลเดอร์ครอบ ในกรณีนั้นให้เว้น `Root Directory` ว่าง ห้ามใส่ชื่อ ZIP
และห้ามเติม `.zip`

หลังแก้ค่า ให้เลือก:

```text
Manual Deploy > Clear build cache & deploy
```

เมื่อสำเร็จ ตรวจ `https://diagnostic.wonderbloom.co/api/health` และต้องเห็น
`appVersion` เป็น `11.2.0`

## Environment Variables ที่จำเป็น

- `NODE_ENV=production`
- `DIAGNOSTIC_STORAGE_ADAPTER=local-json`
- `DIAGNOSTIC_DATA_DIR=/var/data`
- `DIAGNOSTIC_REQUIRE_FULL_ENGINE=true`
- `OPENAI_API_KEY` ใส่ใน Render เท่านั้น
- `OPENAI_MODEL` ใส่ชื่อโมเดลที่บัญชีใช้งานได้
- `SESSION_SECRET` และ `ADMIN_SECRET` ต้องเป็น secret แบบสุ่มยาว

อย่าใส่ secret จริงลงใน GitHub หรือ ZIP
