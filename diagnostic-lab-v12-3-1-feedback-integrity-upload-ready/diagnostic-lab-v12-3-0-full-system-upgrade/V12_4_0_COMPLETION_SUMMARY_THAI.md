# สรุปงาน V12.4.0 (ภาษาไทย) — Global Diagnostic Engine Stabilisation + ย้ายโมเดลเป็น gpt-5.6-sol

คำตัดสินรวม: **CONDITIONAL PASS** — โค้ดและ regression ในเครื่องเสร็จครบ แต่
**ยังไม่พร้อมขาย** จนกว่าครูปอมจะรันผลจริงจาก `gpt-5.6-sol` ด้วยบัญชี OpenAI ของตัวเอง
เพราะในเครื่องที่ผมทำงานไม่มี API key และไม่มีสิทธิ์เข้าถึงโมเดลนี้ — ผมจะไม่กุผลปลอมให้เด็ดขาด

> รอบนี้ผมไม่รับผลว่า "เสร็จ" เพียงเพราะ test ผ่าน ผมจึงแยกให้ชัดว่าอะไนคือ "ทำเสร็จและพิสูจน์แล้ว"
> กับอะไรที่ "ต้องรอครูปอมรันจริงก่อน"

---

## ปัญหาจากรายงาน Sun 14 ที่แก้แล้ว (แก้ที่ระดับ engine ไม่ได้ hardcode)

1. **SAR ใช้คำว่า Analysis** → แก้เป็น **Action** เสมอ (มี sanitizer + test ที่ใช้ประโยคจริงจาก Sun 14)
2. **Revision ของ Body 1** ("Families live in different locations, which…") อ้างถึงตัวเองผิด →
   ระบบ **ไม่แสดง** revision ที่ไม่ปลอดภัย แต่ให้ Student Action แทน และขึ้นสถานะ "Revision Unavailable"
3. **Revision ของ Conclusion** ที่เปลี่ยนประธานนโยบายเป็น "facilities…should not be divided" →
   ถูกตรวจจับว่าเปลี่ยนความหมายของโจทย์ และ **ไม่แสดง**
4. **Body 2 ถูกจัดเป็น Collocation** ทั้งที่แกนคือ causal mechanism → ตอนนี้ primary เป็น
   **Explanation and Example Development** (Collocation เป็น secondary ได้)
5. **Paragraph Coverage ขัดกับ Framework** → ใช้สถานะแบบแยกมิติ เช่น Body 2 =
   "Route Aligned - Development Moderate", Body 1 = "Function Controlled - Language Repair Needed"

## การย้ายโมเดล (ทำในโค้ดแล้ว)

- โมเดลอ่านจาก `OPENAI_MODEL` เท่านั้น ไม่ hardcode ในโค้ด และไม่โผล่ใน frontend
- รองรับ reasoning effort ระดับ `max` แล้ว (ไม่ลดเป็น medium เงียบ ๆ)
- ตรวจจับ response ที่ถูกตัด/ถูกปฏิเสธ/ไม่สมบูรณ์ และ retry แบบปลอดภัยโดย **ไม่ตัดโควตาซ้ำ**
- ทุกรายงานบันทึก `providerModel` และ `providerReasoningEffort` ไว้ตรวจสอบย้อนหลังได้ (ไม่เปิดเผย key)
- มี `scripts/provider-preflight.mjs` สำหรับเช็คสิทธิ์เข้าถึงโมเดลจริงก่อนเปลี่ยน production

## ผลทดสอบในเครื่อง

- `node scripts/build-static-preview.mjs && node scripts/run-tests.mjs` → **ผ่านทั้งหมด 21 ไฟล์**
- Sun (engine 12.4.0): Band 6.0-6.5 · strongly disagree · Route = Aligned ·
  B1S2 revision ถูก withhold · SAR = Action · Body 2 = Explanation and Example Development ·
  ไม่มี AI meta-language · ไม่มี Unicode เพี้ยน

---

## รายการส่งมอบตามที่ครูปอมขอ 9 ข้อ

1. **ZIP V12.4.0** — `diagnostic-lab-v12-4-0-engine-stabilisation-model-migration.zip` (ในโฟลเดอร์ Downloads)
2. **Completion summary** — ไฟล์นี้
3. **Release manifest** — `V12_4_0_ENGINE_STABILISATION_RELEASE_MANIFEST.md` (อยู่ใน ZIP)
4. **รายงาน Sun ฉบับใหม่** — ตรวจแล้วตามเกณฑ์ §32 (สรุปด้านบน) จาก engine 12.4.0 ในเครื่อง
   *(รายงานฉบับ "จริง" จาก gpt-5.6-sol ต้องให้ครูปอมรันเอง — ดูข้อจำกัดด้านล่าง)*
5. **Control cases อ่อน/กลาง/สูง + Task 1 chart/map/process/mixed** — โครง fixture และ property test
   มีครบใน `tests/v8-sale-readiness.test.mjs` และ suite (30 Task 2 + 21 Task 1) แต่ยัง **เป็น
   local deterministic** ยังไม่ใช่ผลจาก gpt-5.6-sol จริง
6. **(รวมในข้อ 5)**
7. **ผล provider health ที่แสดง `gpt-5.6-sol`** — **ยังรันไม่ได้ในเครื่องนี้** (ไม่มี key) ให้ครูปอมรัน
   `OPENAI_API_KEY=… OPENAI_MODEL=gpt-5.6-sol node scripts/provider-preflight.mjs` — ยืนยันแล้วว่า
   ถ้าตั้ง env นี้ `/api/health` จะรายงาน `modelName: "gpt-5.6-sol"`
8. **ผล regression และ repeatability** — regression ในเครื่องผ่าน 21 ไฟล์; repeatability กับ
   provider จริงต้องรันด้วยบัญชีครูปอม
9. **ยืนยันว่าไม่ได้แตะระบบที่ทำงานดีอยู่แล้ว** — ✅ ไม่แก้ pricing (2,999 บาท/10 ครั้ง/60 วัน),
   auth, quota, frontend bootstrap (V12.3.6) และ PDF layout

---

## ยังไม่ได้ตรวจ (ครูปอมต้องทำก่อนขายจริง)

ในเครื่องนี้ **ไม่มี OPENAI_API_KEY และไม่มีสิทธิ์ gpt-5.6-sol** ผมจึงรันของจริงไม่ได้ และจะไม่กุผล:

1. Preflight เช็คสิทธิ์ `gpt-5.6-sol` (§3.1)
2. รายงานจริงจาก provider: Task 2 อ่อน/กลาง/สูง, 3 essay types, Task 1 chart/map/process, mixed graph, Sun, repeatability (§33)
3. Benchmark high กับ max: ความแม่น/latency/token/อัตราถูกตัด (§3.2)
4. Manual audit รายงานจริงโดยครู (§36)
5. ตรวจ PDF จากรายงาน `gpt-5.6-sol` จริง

**ห้ามเปลี่ยน production เป็น gpt-5.6-sol จนกว่า preflight จะขึ้น PREFLIGHT PASS**

## ลำดับการอัปโหลด GitHub (อย่าเพิ่งขึ้นก่อนรีวิว)

1. แตก ZIP
2. เข้าโฟลเดอร์ที่ใช้งานจริง:
   `diagnostic-lab-v12-3-1-feedback-integrity-upload-ready/diagnostic-lab-v12-3-0-full-system-upgrade`
3. อัปโหลด **เนื้อหาข้างใน ZIP** ทับไฟล์เดิม — อย่าอัปตัว ZIP, อย่าสร้างโฟลเดอร์เวอร์ชันซ้อน,
   อย่าลบโฟลเดอร์แม่ commit ขึ้น `main` หลังรีวิวเท่านั้น
4. รัน preflight ด้วย key production → ถ้า PASS ค่อยตั้ง `OPENAI_MODEL=gpt-5.6-sol` บน Render แล้ว deploy
5. เช็ค `/api/health` และ `/api/readiness` ว่าได้ `gpt-5.6-sol` และ frontend ผ่าน

## Rollback

เก็บ deploy เดิมไว้ ถ้าโมเดลมีปัญหา แค่ตั้งค่า `OPENAI_MODEL` กลับเป็นค่าเดิมบน Render แล้ว deploy
โค้ดไม่มี fallback ซ่อน — โมเดลที่ใช้จะตรงกับค่า env เสมอ
