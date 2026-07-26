# วิธีอัปโหลดและตั้งค่า Render — V12.6.0

## ไฟล์ที่ต้องใช้

ใช้ไฟล์:

`diagnostic-lab-v12-6-0-global-feedback-integrity.zip`

ZIP นี้จัดเป็นแบบ flat-root โดย `package.json` อยู่ที่ระดับบนสุดของ ZIP

## วิธีอัปโหลดขึ้น GitHub

1. แตก ZIP
2. เปิดโฟลเดอร์ที่แตกแล้ว
3. อัปโหลด **ไฟล์และโฟลเดอร์ทั้งหมดที่อยู่ข้างใน** ไปยัง GitHub repository root `/`
4. ตรวจหน้า GitHub ให้เห็นไฟล์ต่อไปนี้ทันที:

```text
/package.json
/package-lock.json
/server.js
/render.yaml
/index.html
```

ห้ามอัปโหลด ZIP เข้าไปเฉย ๆ และห้ามทำให้เกิดโครงสร้างแบบ:

```text
/diagnostic-lab-v12-6-0-global-feedback-integrity/package.json
```

ถ้า GitHub มีโครงสร้างแบบข้างบน แปลว่ามี wrapper folder เกินมาอีกชั้น

## ค่า Render Dashboard ที่ต้องกรอก

```text
Root Directory: เว้นว่าง
Build Command: npm install
Start Command: npm start
Health Check Path: /api/health
```

Root Directory ที่เว้นว่างจะชี้ไปยัง repository root โดยอัตโนมัติ เพราะ `package.json` อยู่ที่ `/package.json`

ห้ามกรอกชื่อ ZIP ห้ามกรอกชื่อโฟลเดอร์ release และห้ามกรอก `/`

ถ้าสร้าง service ด้วย Blueprint จาก `render.yaml` ระบบจะใช้ `rootDir: .` ซึ่งมีความหมายเดียวกัน

## Environment Variables หลัก

ตั้งค่าตาม `RENDER_ENV_TEMPLATE.txt` โดยค่าที่สำคัญคือ:

```text
NODE_ENV=production
NODE_VERSION=22.16.0
HOST=0.0.0.0
DIAGNOSTIC_STORAGE_ADAPTER=local-json
DIAGNOSTIC_DATA_DIR=/var/data
DATA_DIR=/var/data
DIAGNOSTIC_REQUIRE_FULL_ENGINE=true
DIAGNOSTIC_ANALYSIS_MODE=async-render
DIAGNOSTIC_ENABLE_NETLIFY_BLOBS=false
OPENAI_BASE_URL=https://api.openai.com/v1/responses
OPENAI_TIMEOUT_MS=600000
OPENAI_MAX_OUTPUT_TOKENS=16000
OPENAI_RETRY_MAX_OUTPUT_TOKENS=24000
OPENAI_REASONING_EFFORT=high
OPENAI_MODEL=gpt-5.6-sol
```

ต้องสร้างค่า secret ใน Render Dashboard เอง:

```text
OPENAI_API_KEY
SESSION_SECRET
ADMIN_SECRET
```

ห้ามใส่ secret ลง GitHub หรือ ZIP

## Persistent Disk

ตั้ง Render Persistent Disk:

```text
Mount Path: /var/data
Size: 1 GB หรือมากกว่า
```

ข้อมูลผู้ใช้ ประวัติรายงาน quota และ durable analysis jobs จะอยู่ที่ `/var/data`

## ตรวจหลัง deploy

1. เปิด `/api/health`
2. ยืนยัน `appVersion` เป็น `12.6.0`
3. ยืนยัน `frontendPreflightPassed` เป็น `true`
4. เข้าหน้า Admin แล้วรัน Provider Connectivity และ Production Output Contract
5. ทดสอบรายงาน Task 1 และ Task 2 อย่างน้อยอย่างละหนึ่งชุด
6. Export PDF ไทยและอังกฤษ แล้วตรวจว่าค้นหา/คัดลอกข้อความได้

## หมายเหตุเรื่องสถานะ release

Automated regression และ local browser/PDF QA ผ่านแล้ว แต่เครื่องที่สร้าง release ไม่มี `OPENAI_API_KEY` จึงยังไม่ได้ยืนยัน real-provider corpus กับ `gpt-5.6-sol` การทดสอบ production provider หลังตั้ง secret เป็นขั้นตอนบังคับก่อนเปิดขาย
