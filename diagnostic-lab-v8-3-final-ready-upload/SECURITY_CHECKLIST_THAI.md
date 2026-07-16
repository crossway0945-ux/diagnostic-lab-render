# Security Checklist - IELTS Writing 7+ Diagnostic Lab

เช็กลิสต์นี้ใช้สำหรับก่อน launch และหลัง deploy ทุกครั้ง เพื่อกันข้อมูลลับหลุดและกันนักเรียน bypass quota จากหน้าเว็บ

## Repository

- ตั้ง GitHub repo เป็น Private
- ห้าม commit `.env`
- ห้าม commit OpenAI API key
- ห้าม commit `SESSION_SECRET`
- ห้าม commit `ADMIN_SECRET`
- ห้าม commit users database จาก `DATA_DIR`
- ห้าม commit usage/audit logs จาก `DATA_DIR`
- ห้าม commit report/history data จริงของนักเรียน
- ตรวจว่า `.gitignore` กันไฟล์ data/log/secret แล้ว

## Render Environment Variables

- เก็บ `OPENAI_API_KEY` เฉพาะใน Render Environment Variables
- เก็บ `SESSION_SECRET` เฉพาะใน Render Environment Variables
- เก็บ `ADMIN_SECRET` เฉพาะใน Render Environment Variables ถ้ายังใช้กับ endpoint ภายใน
- อย่าใส่ secret ใด ๆ ใน frontend HTML/CSS/JS
- Optional: ตั้ง `TEACHER_DAILY_SAFETY_LIMIT` หากต้องการปรับ daily safety limit ของ teacher/admin account
- ถ้าไม่ตั้ง `TEACHER_DAILY_SAFETY_LIMIT` ระบบจะใช้ค่า default 50 analyses/day

## Render Deployment

- Build Command ต้องเป็น `npm install`
- Start Command ต้องเป็น `npm start`
- อย่าเปลี่ยน domain configuration ถ้า live domain ใช้งานอยู่แล้ว
- ตรวจว่า `DATA_DIR` ชี้ไป persistent disk หรือพื้นที่เก็บข้อมูลถาวรตาม deployment ที่เลือก
- หลัง deploy ให้ทดสอบ `/api/health` ก่อนเปิดให้ใช้งานจริง

## Account And Quota Tests

- ทดสอบ student account ที่ quota เหลือว่าส่งวิเคราะห์ได้
- ทดสอบ student account ที่ quota เป็น 0 ว่าส่งวิเคราะห์ไม่ได้
- ทดสอบ student account ที่หมดอายุว่าส่งวิเคราะห์ไม่ได้
- ทดสอบ teacher/Kru Pom account ว่าใช้งานได้โดยไม่หัก student quota
- ทดสอบ teacher/Kru Pom account ว่ายังถูกจำกัดด้วย daily safety limit
- ทดสอบ admin account ว่าเปิด `/admin` ได้
- ทดสอบ student account ว่าเปิด `/admin` ไม่ได้
- ทดสอบ student account ว่าเรียก `/api/admin/users` ไม่ได้

## Admin User Management

- สร้าง student account ใหม่จาก `/admin`
- ตรวจว่า generated password ยาวอย่างน้อย 10 ตัวและมีตัวอักษรกับตัวเลข
- ตรวจว่า password แสดงเฉพาะตอนสร้างหรือ reset เท่านั้น
- ตรวจว่า API ไม่ส่ง `passwordHash` กลับไป frontend
- Reset password แล้วลอง login ด้วย password ใหม่
- Disable account แล้วต้อง login หรือ analyze ไม่ได้
- Enable account แล้วต้องกลับมาใช้งานได้ตาม quota/expiry

## Backend Protection

- `/api/analyze` ต้องเช็ก session ฝั่ง backend ทุกครั้ง
- `/api/analyze` ต้องเช็ก status/expiry/quota/role ก่อนเรียก provider
- ห้ามเชื่อค่า role/quota/remaining/expiry จาก frontend
- ถ้า provider analysis fail ต้องไม่หัก quota
- ถ้า duplicate cache return report เดิม ต้องไม่หัก quota
- ถ้า analysis ใหม่สำเร็จสำหรับ student ต้องหัก quota 1 credit
- ถ้า analysis ใหม่สำเร็จสำหรับ teacher/admin unlimited ต้องไม่หัก student quota แต่ต้องลง audit log

## Browser Inspection Reality

- อย่าพยายามปิด inspect/right click เพราะไม่ใช่ security จริง
- ให้เก็บ secret ทั้งหมดไว้ server-side เท่านั้น
- ให้ backend เป็นตัวตัดสิน quota และสิทธิ์ทั้งหมด
- ให้ frontend แสดงได้เฉพาะข้อมูลที่ปลอดภัย เช่น remaining quota, expiry, account status

## Future Enhancement Note

- Future enhancement: add optional mini trend line for estimated band over time, while keeping Task 1 and Task 2 separated.
- ยังไม่ควรเปลี่ยน progress toggle เดิมใน task นี้
