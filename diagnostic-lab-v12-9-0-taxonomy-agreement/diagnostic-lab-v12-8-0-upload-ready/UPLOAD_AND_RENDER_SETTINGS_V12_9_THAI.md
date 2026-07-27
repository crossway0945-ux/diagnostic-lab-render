# คู่มือติดตั้ง V12.9.0 (ภาษาไทย)

## 1. แก้ค่า Environment บน Render ก่อน (สำคัญที่สุด — แก้ปัญหา PROVIDER_TIMEOUT)
ตอนนี้ production ยังเป็น `analysisMode: "sync"` + `timeoutMs: 180000` + `maxOutputTokens: 8000`
ทำให้วิเคราะห์ไม่ผ่านทุกครั้ง (และเว็บอยู่หลัง Cloudflare ที่ตัดที่ ~100 วินาที)

ไปที่ Render → Settings → Environment แล้วตั้ง:
```
DIAGNOSTIC_ANALYSIS_MODE=async-render
OPENAI_MAX_OUTPUT_TOKENS=16000
OPENAI_TIMEOUT_MS=600000
OPENAI_RETRY_MAX_OUTPUT_TOKENS=24000
```
กด Save (restart เอง ~1 นาที)

ตรวจ: `/api/health` ต้องได้ `"analysisMode":"async-render"` และ `"timeoutMs":600000`

## 2. อัปโหลดขึ้น GitHub
- แตก ZIP ลงโฟลเดอร์ว่าง
- อัปเนื้อหาในโฟลเดอร์ `diagnostic-lab-v12-8-0-upload-ready` ทับของเดิม
- ตำแหน่งที่ต้องมี: `/diagnostic-lab-v12-8-0-upload-ready/package.json`
- อย่าสร้างโฟลเดอร์เวอร์ชันซ้อน · อย่าอัปตัว ZIP
- commit เข้า `main`

## 3. Render settings (เดิม ไม่เปลี่ยน)
```
Root Directory : diagnostic-lab-v12-8-0-upload-ready
Build Command  : npm install
Start Command  : npm start
```
ตรวจ: `/api/health` → `"appVersion":"12.9.0"`

## 4. เข้า /admin ไม่ได้?
`/admin` ป้องกันที่ฝั่งเซิร์ฟเวอร์อยู่แล้ว (ต้องมี session ที่ role = admin)
ถ้าขึ้น `{"ok":false,"error":"Admin access is required."}` แปลว่า:
- ยังไม่ได้ล็อกอินในแท็บนั้น → ล็อกอินที่หน้าแรกก่อน แล้วค่อยเปิด /admin
- หรือบัญชีที่ใช้ role ไม่ใช่ `admin` → ต้องตั้ง role เป็น admin ในไฟล์ users

## 5. Rollback
Deploy commit เดิมที่ Render · รายงาน/ประวัติ/เครดิตเดิมไม่ถูกแตะ
