# Deploy Diagnostic Lab V8.3 บน Render

ไฟล์นี้ใช้สำหรับ V8.3 Task 2 Taxonomy and Semantic Position Correction เท่านั้น

1. แตก ZIP
2. ลากโฟลเดอร์ `diagnostic-lab-v8-3-task2-taxonomy-final-upload` เข้า GitHub ทั้งโฟลเดอร์
3. ตั้งค่า Render ดังนี้

```text
Root Directory: diagnostic-lab-v8-3-task2-taxonomy-final-upload
Build Command: npm install
Start Command: npm start
```

4. กด `Manual Deploy` > `Clear build cache & deploy`
5. อ่านรายการตรวจหลัง deploy ใน `UPLOAD_V8_3_TO_RENDER_THAI.md`

ไม่ต้องแก้ Environment Variables เดิม ไม่ต้องสร้าง API key ใหม่ และไม่ต้องเปลี่ยน auth, quota, ราคา, จำนวนครั้ง หรือวันหมดอายุ
