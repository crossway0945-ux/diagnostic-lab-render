# วิธีอัปโหลด V12.8.0

ใช้ ZIP ชื่อ `diagnostic-lab-v12-8-0-upload-ready.zip`

1. แตก ZIP จะพบโฟลเดอร์ `diagnostic-lab-v12-8-0-upload-ready` เพียงชั้นเดียว
2. อัปโหลดโฟลเดอร์นี้ไว้ที่ root ของ GitHub repository
3. ตรวจว่า GitHub มีไฟล์ตาม path นี้โดยตรง:
   `/diagnostic-lab-v12-8-0-upload-ready/package.json`
4. ห้ามสร้างโฟลเดอร์ซ้อนชื่อเดิมอีกชั้น

ตั้งค่า Render:

- Root Directory: `diagnostic-lab-v12-8-0-upload-ready`
- Build Command: `npm install`
- Start Command: `npm start`

หาก log แจ้งว่าเปิด
`/opt/render/project/src/diagnostic-lab-v12-8-0-upload-ready/package.json`
ไม่ได้ แปลว่า path ใน GitHub ไม่ตรงตามข้อ 3 หรือมีโฟลเดอร์ซ้อนเพิ่มอีกชั้น

ก่อน deploy ให้ตั้ง environment variables ตาม `RENDER_ENV_TEMPLATE.txt` และเก็บ `OPENAI_API_KEY`, `OPENAI_MODEL`, `SESSION_SECRET`, `ADMIN_SECRET` ใน Render dashboard เท่านั้น
