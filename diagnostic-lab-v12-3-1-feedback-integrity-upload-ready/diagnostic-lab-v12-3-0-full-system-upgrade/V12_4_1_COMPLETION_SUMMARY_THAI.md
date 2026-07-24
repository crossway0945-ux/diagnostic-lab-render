# สรุปงาน V12.4.1 (ภาษาไทย) — แก้ปัญหา Analysis ล้มเหลว + เพิ่มระบบมองเห็นสาเหตุจริง

ขอบเขต: **Phase 1** ตามที่ตกลงกัน คือแก้อาการล้มเหลว + ทำให้ "เห็นสาเหตุจริง" ได้
ส่วนระบบ async-render job แบบเต็ม (ที่ต้องรื้อสถาปัตยกรรม) **เลื่อนไป 12.4.2** เพราะมันเปลี่ยนแค่วิธีส่งงาน
ไม่ได้แก้ต้นเหตุ (provider/token/schema) และการยัดทุกอย่างลง release เดียวคือความเสี่ยงที่เคยทำ production ล่มมาแล้ว

> ผมยังไม่มี OpenAI key ในเครื่องนี้ จึงยืนยันโค้ด failure จริงของ production เองไม่ได้ และจะไม่กุผล
> แต่รอบนี้ผมทำให้ครูปอม **กดปุ่มเดียวแล้วเห็นเองว่าพังตรงขั้นไหน** โดยไม่ต้องเปิด Render logs

## ต้นเหตุที่ยืนยันจากโค้ด 12.4.0

- **A) /api/health โกหก** — เดิมบอก "connected" แค่เพราะมี key+model ไม่ได้ยิงจริง → แก้ให้ขึ้น
  `providerConnectivityStatus: unknown` จนกว่าจะรัน check จริง
- **B) ทุก error กลายเป็นข้อความเดียว** — โค้ด error หลายตัว (incomplete/refusal/schema/validation)
  ไม่มีข้อความเฉพาะ เลยตกไปที่ "Analysis could not be completed..." ตรงกับหน้าจอที่ครูปอมเจอ →
  ตอนนี้มีข้อความเฉพาะทุกโค้ด + มี **Reference ID** ทุกครั้ง (teacher/admin เห็น error code + ขั้นที่พังด้วย)
- **D) จัดการ token ตัดบางเกินไป** — retry เดิมเพิ่มแค่ +2000 → แยก `OPENAI_RETRY_MAX_OUTPUT_TOKENS`
  และถ้า provider ตัดเพราะ max_output_tokens จะ retry ครั้งเดียวด้วยเพดานใหญ่ (24000) โดยไม่ตัดโควตาซ้ำ

**สาเหตุจริงที่น่าจะเป็นมากที่สุด (ยังต้องให้ครูปอมยืนยัน):** health โชว์ `maxOutputTokens: 8000` + `high`
บน gpt-5.6-sol การคิดแบบ high กิน token ไปก่อนจนรายงาน JSON ไม่จบ = ถูกตัด → รอบนี้ทั้ง **เพิ่มเพดาน**
(16000/24000) และ **ทำให้เห็นสาเหตุ** ผ่านปุ่ม Production Output Contract ในหน้า admin

## สิ่งที่เพิ่ม (มองเห็นสาเหตุได้จริง)

- หน้า `/admin` มีกล่อง **System Diagnostics** — ปุ่ม: Test Provider Connectivity, Test Production Output Contract,
  Test Storage, View Recent Analysis Failures, Clear Failure History (เข้าถึงได้เฉพาะ admin ที่ login แล้ว)
- **Production Output Contract** รันด้วย schema จริงและ pipeline จริงบน "เรียงความทดสอบสังเคราะห์" (ไม่ใช่ของนักเรียน)
  แล้วบอกตรง ๆ ว่าพังขั้นไหน: provider_request / provider_incomplete / provider_refusal / json_parse /
  report_validation / student_view_projection — ไม่ตัดโควตา ไม่บันทึกรายงาน
- **บันทึก failure ที่ปลอดภัย** (เก็บ 50 รายการล่าสุด) เก็บเฉพาะ metadata ที่ปลอดภัย ไม่มีเรียงความ/prompt/key/ผลดิบ
- ทุก analysis ที่ล้มเหลวมี **Reference ID** ให้ก็อปส่งมาถามได้

## ผลทดสอบ

- `node scripts/run-tests.mjs` → **ผ่านทั้งหมด 22 ไฟล์** (เพิ่มไฟล์ทดสอบ reliability ใหม่ 1 ไฟล์)
- ทดสอบ (จำลอง provider แบบ deterministic): token ตัด → PROVIDER_MAX_OUTPUT_TOKENS + retry ใหญ่ครั้งเดียว,
  incomplete ที่ไม่ใช่ token → ไม่ retry เพิ่ม token, refusal/schema แยกโค้ด, health พูดความจริง,
  admin diagnostics กัน 403 ถ้าไม่ได้ login

## ยังไม่ได้ตรวจ (ครูปอมต้องทำ)

ในเครื่องนี้ไม่มี key จริง จึงต้องให้ครูปอม:
1. Deploy 12.4.1 → เข้า `/admin` กด **Test Provider Connectivity** และ **Test Production Output Contract**
2. ถ้าขั้นที่พังคือ `provider_incomplete` (PROVIDER_MAX_OUTPUT_TOKENS) แปลว่า token ตัดจริง → เพดานใหม่ (16000/24000)
   น่าจะแก้ได้ กดตรวจซ้ำให้ขึ้น `stage: complete`
3. ลองวิเคราะห์จริง 1 ครั้งด้วย test account → รายงานเซฟได้ ตัดโควตา 1 ครั้ง PDF ตรงกัน

## ยืนยันไม่แตะระบบที่ดีอยู่แล้ว

✅ ไม่แก้ pricing, auth, quota, duplicate hashing, scoring/LFC-CPC/SAR/TEEL/taxonomy/revision-safety,
frontend bootstrap (12.3.6) และ PDF layout — และ **ไม่ deploy ให้อัตโนมัติ**

## ค่า Render ที่แนะนำ (blueprint อัปเดตแล้ว ปรับได้บน dashboard)

```
OPENAI_MODEL=gpt-5.6-sol            # ตั้งหลัง preflight ผ่านเท่านั้น
OPENAI_REASONING_EFFORT=high        # หรือ max ตามผล benchmark
OPENAI_MAX_OUTPUT_TOKENS=16000
OPENAI_RETRY_MAX_OUTPUT_TOKENS=24000
OPENAI_TIMEOUT_MS=240000
```

## อัปโหลด GitHub (root เดิม ห้ามเปลี่ยน)

แตก ZIP → เข้าโฟลเดอร์ `diagnostic-lab-v12-3-1-feedback-integrity-upload-ready/diagnostic-lab-v12-3-0-full-system-upgrade`
→ อัปโหลด **เนื้อหาข้างใน** ทับไฟล์เดิม (อย่าอัป ZIP, อย่าสร้างโฟลเดอร์ซ้อน, อย่าลบโฟลเดอร์แม่) → commit `main` หลังรีวิว

## Rollback

เก็บ deploy เดิมไว้ ถ้าต้องย้อน แค่ deploy commit เดิม หรือปรับค่า token/timeout กลับบน dashboard —
โมเดลที่ใช้ = ค่า `OPENAI_MODEL` เสมอ ไม่มี fallback ซ่อน
