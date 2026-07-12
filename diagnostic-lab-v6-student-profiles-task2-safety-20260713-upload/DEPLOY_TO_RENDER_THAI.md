# วิธี Deploy Hotfix นี้บน Render

ไฟล์ชุดนี้เป็น hotfix สำหรับ IELTS Writing 7+ Diagnostic Lab เท่านั้น

## สิ่งที่แก้ในชุดนี้

- ปรับ Task 2 calibration ให้ feedback ยังเข้มเหมือนเดิม แต่ไม่กด essay ระดับ Band 7 ลงเป็น 6.0-6.5 เพียงเพราะมี high-band repair issue เช่น SAR ยังไม่เต็ม, link-back หาย 1 จุด, หรือ intruder sentence 1 ประโยค
- เพิ่ม duplicate analysis cache: ถ้านักเรียนคนเดิมส่ง essay เดิมซ้ำ ระบบจะคืน report เดิม ไม่เรียก diagnostic engine ใหม่ และไม่หัก credit
- เก็บ `submissionHash` ใน history record สำหรับกันส่งซ้ำ
- เพิ่ม regression tests สำหรับ homeschooling outweigh essay, duplicate whitespace, meaningful change, และ weak Task 2 essay

## ถ้า upload เป็นโฟลเดอร์ใน GitHub

ให้แตก ZIP แล้ว upload ทั้งโฟลเดอร์นี้เข้า GitHub:

```text
diagnostic-lab-task2-calibration-cache-hotfix-20260614-upload
```

จากนั้นไป Render service `diagnostic-lab-render` แล้วตั้งค่า:

```text
Root Directory:
diagnostic-lab-task2-calibration-cache-hotfix-20260614-upload
```

```text
Build Command:
npm install
```

```text
Start Command:
npm start
```

อย่าใส่ชื่อโฟลเดอร์ใน Build Command เพราะ Render จะเข้า Root Directory ให้อัตโนมัติแล้ว

## Environment variables ที่ต้องมีใน Render

ค่าที่ควรมี:

```text
NODE_ENV=production
HOST=0.0.0.0
DIAGNOSTIC_STORAGE_ADAPTER=local-json
DIAGNOSTIC_DATA_DIR=/var/data
DIAGNOSTIC_REQUIRE_FULL_ENGINE=true
DIAGNOSTIC_ANALYSIS_MODE=sync
OPENAI_BASE_URL=https://api.openai.com/v1/responses
OPENAI_TIMEOUT_MS=180000
OPENAI_MAX_OUTPUT_TOKENS=3500
OPENAI_REASONING_EFFORT=low
OPENAI_MODEL=<model ที่ใช้งานจริง>
OPENAI_API_KEY=<secret key>
SESSION_SECRET=<secret>
ADMIN_SECRET=<secret>
```

ถ้าใช้ persistent disk บน Render ให้ mount path เป็น:

```text
/var/data
```

## หลังเปลี่ยน Root Directory

ไปที่ Render:

```text
Manual Deploy -> Clear build cache & deploy
```

ถ้าไม่มีปุ่ม clear cache ให้ใช้:

```text
Deploy latest commit
```

## Smoke tests หลัง deploy

1. เปิด `/api/health` แล้วต้องเห็น `ok:true`, `diagnosticEngineConnected:true`, และ `durableStorage:true`
2. login ด้วยบัญชี test ที่มีอยู่
3. ส่ง homeschooling outweigh essay ควรได้ estimated band range `7.0-7.5`
4. ส่ง essay เดิมซ้ำโดยเปลี่ยนแค่ช่องว่าง ระบบต้องขึ้นข้อความ `This essay was already analyzed. Showing the existing report.`
5. credit ต้องไม่ลดเมื่อส่ง essay ซ้ำ
6. เปลี่ยนเนื้อหา essay จริง 1 ประโยค แล้วส่งใหม่ ต้องถูกนับเป็น analysis ใหม่และหัก 1 credit
7. เปิด Activity History/PDF export แล้วต้องใช้ saved report เดิม ไม่ regenerate

## ข้อห้าม

- ห้าม commit `.env`
- ห้าม commit API key หรือ secret
- ห้าม upload `node_modules`
- ห้ามเปลี่ยน Render Build Command เป็นคำสั่งที่มีชื่อโฟลเดอร์นำหน้า
