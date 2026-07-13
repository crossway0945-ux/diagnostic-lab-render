# วิธี Deploy Diagnostic Lab V6.5 บน Render

ไฟล์ชุดนี้เป็น hotfix สำหรับ IELTS Writing 7+ Diagnostic Lab เท่านั้น

## สิ่งที่แก้ในชุดนี้

- อ่าน outweigh position จากความหมาย ไม่ผูกกับวลีตายตัว เช่น `economic benefits ... far outweigh ... drawbacks` และ `far greater national advantages`
- แยก Body 1/Body 2 route จาก polarity และ controlling sentence
- แยก Band 7.0 ออกจาก secure 7.5 ด้วย development/precision gate
- บังคับ Top Issue ให้จับคู่ Detailed Feedback แบบหนึ่งต่อหนึ่งและใช้ evidence ตรงหมวด
- คง duplicate analysis cache, student history, quota และ regression เดิมไว้ครบ

## ถ้า upload เป็นโฟลเดอร์ใน GitHub

ให้แตก ZIP แล้ว upload ทั้งโฟลเดอร์นี้เข้า GitHub:

```text
diagnostic-lab-v6-5-semantic-outweigh-integrity-20260713
```

จากนั้นไป Render service `diagnostic-lab-render` แล้วตั้งค่า:

```text
Root Directory:
diagnostic-lab-v6-5-semantic-outweigh-integrity-20260713
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
3. ส่ง Evin 309-word outweigh essay ควรได้ position `advantages outweigh the disadvantages`, Body 1 disadvantage, Body 2 advantages, conclusion clear และ Overall `7.0`
4. ส่ง Eva 269-word outweigh essay ต้องยังได้ Overall สูงสุด 6.5 ตาม frequent-error gate
5. ส่ง homeschooling outweigh essay ควรได้ estimated band range `7.0-7.5`
6. ส่ง Poon Poon 190-word essay ต้องยังได้ 4.0-4.5 และตรวจ unfinished conclusion
7. ส่ง essay เดิมซ้ำโดยเปลี่ยนแค่ช่องว่าง ระบบต้องขึ้นข้อความ `This essay was already analyzed. Showing the existing report.` และ credit ต้องไม่ลด
8. เปิด Activity History/PDF export แล้วต้องใช้ saved report เดิม ไม่ regenerate

## ข้อห้าม

- ห้าม commit `.env`
- ห้าม commit API key หรือ secret
- ห้าม upload `node_modules`
- ห้ามเปลี่ยน Render Build Command เป็นคำสั่งที่มีชื่อโฟลเดอร์นำหน้า
