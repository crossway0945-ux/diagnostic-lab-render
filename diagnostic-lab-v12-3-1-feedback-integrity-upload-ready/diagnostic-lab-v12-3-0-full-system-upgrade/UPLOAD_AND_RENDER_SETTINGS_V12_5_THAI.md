# คู่มือการติดตั้ง V12.5.0 (ภาษาไทย) — ระบบวิเคราะห์แบบ Async บน Render

รุ่นนี้แก้ปัญหา **PROVIDER_TIMEOUT** ที่หน้าจอจริง โดยเปลี่ยนสถาปัตยกรรมการวิเคราะห์ให้เป็นแบบ
**อะซิงโครนัส (async-render)** — เบราว์เซอร์ไม่ต้องรอคำขอเดียวยาว ๆ อีกต่อไป ระบบจะรับงานทันที
(HTTP 202) แล้วประมวลผลเบื้องหลัง จากนั้นหน้าเว็บจะถาม (poll) สถานะจนเสร็จ

> **ห้าม deploy อัตโนมัติ** และ **ยังไม่ประกาศว่าพร้อมขาย** จนกว่าจะรันการทดสอบกับ provider จริง
> (gpt-5.6-sol), ทดสอบ PDF และ smoke test บนโปรดักชันครบ (ดูหัวข้อ 6)

---

## 1. สิ่งที่เปลี่ยน (สรุป)
- โหมดการวิเคราะห์ใหม่: `DIAGNOSTIC_ANALYSIS_MODE=async-render`
- งานวิเคราะห์เก็บถาวรแบบไฟล์ต่อ 1 งาน ที่ `/var/data/analysis-jobs/` (เขียนแบบ atomic ปลอดภัยเมื่อรีสตาร์ท)
- มี worker ในตัวเซิร์ฟเวอร์ + กู้คืนงานเมื่อรีสตาร์ท + ไม่ตัดเครดิตซ้ำ
- แยกรหัสหมดเวลาให้ชัด: `PROVIDER_TIMEOUT`, `ASYNC_JOB_TIMEOUT`, `ASYNC_JOB_EXPIRED`
- เวอร์ชันแอป → **12.5.0** (คะแนน/รูบริก/พรอมป์/สคีมา/แท็กโซโนมี **ไม่เปลี่ยน** รายงานเก่ายังอ่านได้)

## 2. อัปโหลดขึ้น GitHub (Root Directory เดิม ห้ามเปลี่ยน)
1. แตกไฟล์ ZIP
2. เข้าโฟลเดอร์แอปเดิมบน GitHub:
   `diagnostic-lab-v12-3-1-feedback-integrity-upload-ready/diagnostic-lab-v12-3-0-full-system-upgrade`
3. อัปโหลด **เนื้อหาข้างใน ZIP** ทับไฟล์ที่ชื่อตรงกัน
4. **อย่า** อัปโหลดตัวไฟล์ ZIP, **อย่า** สร้างโฟลเดอร์เวอร์ชันซ้อน, **อย่า** ลบโฟลเดอร์แม่, **อย่า** เปลี่ยน Root Directory
5. ตรวจทานแล้วจึง commit เข้าสาขา `main`

> ZIP นี้มี **85 ไฟล์** (ต่ำกว่าลิมิต 100 ไฟล์ของ GitHub) จึงลากอัปโหลดครั้งเดียวได้ทั้งหมด
> เอกสารรุ่นเก่า (V11.7–V12.4.1) ไม่ได้ใส่มาใน ZIP โดยตั้งใจ — มันยังอยู่ใน repo อยู่แล้ว และการอัปโหลดทับ **ไม่ลบ** ไฟล์เดิม

## 3. ตั้งค่า Environment Variables บน Render (Settings → Environment)
ค่าที่ต้องตั้ง/แก้:
```
DIAGNOSTIC_ANALYSIS_MODE=async-render
DIAGNOSTIC_JOB_CONCURRENCY=1
DIAGNOSTIC_JOB_TIMEOUT_MS=900000
DIAGNOSTIC_JOB_LEASE_MS=120000
DIAGNOSTIC_JOB_STALE_MS=1200000
DATA_DIR=/var/data
OPENAI_TIMEOUT_MS=600000
OPENAI_MAX_OUTPUT_TOKENS=16000
OPENAI_RETRY_MAX_OUTPUT_TOKENS=24000
OPENAI_REASONING_EFFORT=high
```
ตั้งเฉพาะบน Dashboard เท่านั้น (ห้าม commit ลงโค้ด):
```
OPENAI_API_KEY=<คีย์ลับใหม่ ใส่ใน Render เท่านั้น>
OPENAI_MODEL=gpt-5.6-sol
```
> โมเดลที่ใช้จะเท่ากับ `OPENAI_MODEL` เสมอ ไม่มีการสลับไปโมเดลอื่นแบบเงียบ ๆ

## 4. Deploy
1. ที่ Render กด **Manual Deploy → Deploy commit** ที่ตรวจแล้ว
2. รอจน build/health ผ่าน (`/api/health` ต้องได้ `"appVersion":"12.5.0"` และ `"analysisMode":"async-render"`)
3. **เก็บ deploy เดิมไว้สำหรับ rollback**

## 5. ตรวจก่อนใช้จริง (แอดมิน)
เข้า `/admin` → หัวข้อ **System Diagnostics** แล้วกดตามลำดับ:
1. **Test Provider Connectivity** — ต้องผ่าน (ยืนยันคีย์ + เข้าถึง gpt-5.6-sol ได้)
2. **Test Production Output Contract** — ต้องได้ `stage: complete`
3. **Test Storage** — ต้องผ่าน
4. **Job Queue Status** — ดูสถานะคิวงาน
5. **Stale Job Recovery Test** — ต้อง `ok: true`
6. **Duplicate / Idempotency Test** — ต้อง `ok: true` (ตัดเครดิตครั้งเดียว)

## 6. ทดสอบก่อนประกาศขาย (สำคัญ — ต้องใช้คีย์จริงของคุณ)
รันบนเครื่อง/เซิร์ฟเวอร์ที่มีคีย์:
```
$env:OPENAI_API_KEY="sk-..."; $env:OPENAI_MODEL="gpt-5.6-sol"; $env:OPENAI_REASONING_EFFORT="high"
node scripts/provider-preflight.mjs
node scripts/provider-matrix.mjs
```
จากนั้นบนโปรดักชันจริง:
1. ล็อกอินนักเรียน/ครู/แอดมิน — เปิดหน้าเว็บ (hard refresh + incognito) ต้องไม่จอเขียวเปล่า
2. ส่งวิเคราะห์จริง 1 ครั้ง → ต้องได้ **202 ทันที** แล้วขึ้นสถานะเป็นระยะจนเสร็จ
3. **รีเฟรชหน้าระหว่างวิเคราะห์** → งานต้องเชื่อมต่อกลับและทำต่อจนเสร็จ
4. ยืนยันตัดเครดิต **ครั้งเดียว**, ครูเพิ่มลิมิตรายวัน **ครั้งเดียว**
5. เปิดซ้ำงานเดิม (duplicate) → ไม่เรียก provider ซ้ำ ไม่ตัดเครดิต
6. Export PDF → เทียบกับหน้าเว็บ (ต้องตรงกัน ตัวอักษรไทยครบ ไม่ทับซ้อน)
7. จำลอง timeout → ต้องขึ้นรหัสถูกต้องและ **ไม่ตัดเครดิต**

## 7. Rollback (ถ้าจำเป็น)
- ย้อนโค้ด: Deploy commit เดิมที่ Render
- ย้อนเฉพาะโหมด (ไม่แตะโค้ด): ตั้ง `DIAGNOSTIC_ANALYSIS_MODE=sync` (โหมดเดิมยังอยู่ครบ)
- รายงาน/งาน/เครดิตเดิมยังอ่านได้ตามปกติ ไม่มีการสลับโมเดลแบบซ่อน

---
ติดปัญหาขั้นตอนไหน ให้ดู Reference ID / Error code ที่หน้าจอ แล้วเทียบกับ **View Recent Analysis Failures** ใน `/admin`
