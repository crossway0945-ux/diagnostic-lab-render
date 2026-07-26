# วิธีอัปโหลด V12.7.0 ขึ้น GitHub และ Render

แพ็กเกจ `diagnostic-lab-v12-7-0-upload-ready-97-files.zip` มีไฟล์ทั้งหมด **97 ไฟล์** จึงอัปโหลดผ่านหน้าเว็บ GitHub ได้ในครั้งเดียวโดยไม่เกินข้อจำกัด 100 ไฟล์

ไฟล์ ZIP รุ่นนี้เป็นแบบ **flat-root** เมื่อเปิด ZIP ต้องเห็น `package.json`, `server.js` และ `render.yaml` ทันที ห้ามมีโฟลเดอร์ชื่อ release ครอบอีกหนึ่งชั้น

## GitHub

แตก ZIP แล้วอัปโหลด **ไฟล์และโฟลเดอร์ทั้งหมดที่อยู่ข้างใน** ไปที่ repository root `/`

หลังอัปโหลด GitHub ต้องแสดง:

- `/package.json`
- `/server.js`
- `/render.yaml`
- `/domain`
- `/services`

## Render Dashboard

คัดลอกค่าต่อไปนี้ตรงตามนี้:

```text
Root Directory: เว้นว่าง
Build Command: npm install
Start Command: npm start
Health Check Path: /api/health
```

คำว่า “เว้นว่าง” หมายถึงให้ Render เริ่มทำงานจาก repository root ซึ่งเป็นตำแหน่งเดียวกับ `/package.json` ไม่ได้หมายความว่า Render ไม่เชื่อมกับไฟล์

ถ้าใช้ Blueprint จาก `render.yaml` ระบบจะใช้:

```text
rootDir: .
```

## Provider ที่ต้องตั้งใน Render

```text
OPENAI_MODEL=gpt-5.6-sol
OPENAI_REASONING_EFFORT=high
OPENAI_API_KEY=<ตั้งเป็น secret ใน Render เท่านั้น>
```

หลัง deploy ให้ตรวจ `/api/health` และรัน production provider corpus ก่อนเปิดขาย รุ่นนี้ไม่อ้างว่า real-provider ผ่านจนกว่าจะมีผลจริงจาก production account

## Rollback

เก็บ ZIP V12.6.0 เดิมไว้โดยไม่แก้ทับ หาก V12.7.0 ไม่ผ่าน production provider gate ให้ rollback กลับ release เดิมจาก Render แล้วตรวจ environment variables ก่อนทดลองใหม่
