# IELTS Diagnostic Lab - Launch แบบไม่ใช้ Netlify Backend

คำตอบสั้น ๆ: สำหรับเครื่องมือนี้ แนะนำให้ launch ทั้งเว็บบน Render Web Service แทน Netlify Drop/Netlify Functions

เหตุผล:

- ระบบนี้ไม่ได้เป็นเว็บ static ธรรมดา เพราะมี login, session, quota, progress history และ diagnostic API
- งานตรวจ IELTS แบบละเอียดใช้เวลานานกว่า serverless flow ทั่วไปได้ง่าย
- Render รัน `server.js` เป็น Node server ปกติ จึงเหมาะกับงาน backend แบบนี้มากกว่า
- Netlify ยังใช้เป็น domain/static ได้ แต่ไม่ควรใช้เป็น backend หลักของ diagnostic engine ตอนนี้

## สิ่งที่ผมแก้ในแพ็กนี้

- เพิ่ม `render.yaml` สำหรับ Render Blueprint
- ตั้งค่าให้ backend รันแบบ Node Web Service
- ตั้ง storage เป็น `local-json` บน persistent disk `/var/data`
- แก้ bug storage seed ที่ทำให้ login ล้มได้เมื่อใช้ data directory แยกจากไฟล์ต้นฉบับ
- ปิด Netlify blobs/background mode สำหรับ production path นี้

## วิธี Launch บน Render

1. สร้าง GitHub repository ใหม่ เช่น `ielts-diagnostic-lab`
2. อัปโหลดไฟล์ทั้งหมดในแพ็กนี้เข้า repository นั้น
3. เข้า Render Dashboard
4. กด `New` -> `Web Service`
5. เลือก repository ที่เพิ่งอัปโหลด
6. ใช้ค่าต่อไปนี้

```text
Runtime: Node
Region: Singapore
Build Command: npm install
Start Command: npm start
Health Check Path: /api/health
```

7. เพิ่ม Persistent Disk

```text
Disk name: diagnostic-data
Mount path: /var/data
Size: 1 GB
```

8. ตั้ง Environment Variables ตามนี้

```text
NODE_ENV=production
HOST=0.0.0.0
DIAGNOSTIC_STORAGE_ADAPTER=local-json
DIAGNOSTIC_DATA_DIR=/var/data
DIAGNOSTIC_REQUIRE_FULL_ENGINE=true
DIAGNOSTIC_ANALYSIS_MODE=sync
DIAGNOSTIC_ENABLE_NETLIFY_BLOBS=false
OPENAI_BASE_URL=https://api.openai.com/v1/responses
OPENAI_TIMEOUT_MS=180000
OPENAI_MAX_OUTPUT_TOKENS=3500
OPENAI_REASONING_EFFORT=low
SESSION_SECRET=<ให้ Render generate หรือใส่ string ยาว ๆ>
ADMIN_SECRET=<ให้ Render generate หรือใส่ string ยาว ๆ>
OPENAI_API_KEY=<ใส่ secret key ใหม่ ห้ามใช้ key ที่เคยส่งในแชท>
OPENAI_MODEL=<ใส่ model ที่บัญชี OpenAI ของคุณใช้ได้>
```

ถ้าใช้ `render.yaml` แบบ Blueprint Render จะถามค่า `OPENAI_API_KEY` และ `OPENAI_MODEL` ให้กรอกเอง เพราะสองค่านี้ไม่ควร hardcode ลงไฟล์

## หลัง Deploy เสร็จ ให้เช็กตามนี้

เปิด:

```text
https://<your-render-service>.onrender.com/api/health
```

ควรเห็นค่าประมาณนี้:

```json
{
  "ok": true,
  "apiConnected": true,
  "diagnosticEngineConfigured": true,
  "diagnosticEngineConnected": true,
  "analysisMode": "sync",
  "storageMode": "local-json",
  "storageRuntime": "node",
  "durableStorage": true,
  "timeoutMs": 180000
}
```

จากนั้นทดสอบตามลำดับนี้:

1. Login ด้วย account เดิม
2. Submit Task 2 แบบไม่มีรูปก่อน
3. Submit Task 1 แบบไม่มีรูปก่อน
4. Submit Task 1 แบบมีรูป
5. กด Export PDF

## Domain

แนะนำให้เอา domain `diagnostic.wonderbloom.co` ชี้ไปที่ Render โดยตรง

ใน Render:

```text
Settings -> Custom Domains -> Add Custom Domain
```

ใส่:

```text
diagnostic.wonderbloom.co
```

จากนั้น Render จะให้ค่า DNS เช่น CNAME ให้นำไปตั้งใน DNS provider ของ domain

## เรื่อง OpenAI Key

key ที่เคยส่งในแชทแล้วต้องถือว่าไม่ปลอดภัย ให้ทำตามนี้:

1. ไปที่ OpenAI dashboard
2. สร้าง secret key ใหม่
3. ใส่ key ใหม่ใน Render Environment Variables
4. Revoke/delete key เก่าที่เคยส่งในแชท

## ไม่แนะนำให้ทำต่อ

- ไม่แนะนำให้ใช้ Netlify Drop เป็น production backend ของเครื่องมือนี้
- ไม่แนะนำให้แก้ Netlify environment variables ไปเรื่อย ๆ เพราะอาการ timeout/login/storage จะกลับมาวนอีก
- ไม่แนะนำให้เปิด fallback/basic checker เพราะจะทำให้ผลตรวจดูเหมือนตรวจจริงแต่ไม่ละเอียดตาม criteria

ทางที่ควรเดินตอนนี้คือ Render Web Service + persistent disk ก่อน แล้วค่อยขยับไป Postgres/queue worker ภายหลังเมื่อมีนักเรียนใช้จริงมากขึ้น
