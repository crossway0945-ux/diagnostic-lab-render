# วิธีอัปโหลด V8.3 เข้า GitHub และ Render

ไฟล์ ZIP ชุดนี้เตรียมเป็นโฟลเดอร์เดียวสำหรับอัปโหลด ชื่อโฟลเดอร์คือ:

```text
diagnostic-lab-v8-3-task2-taxonomy-final-upload
```

## 1. อัปโหลดเข้า GitHub

1. แตกไฟล์ ZIP
2. จะเห็นโฟลเดอร์ `diagnostic-lab-v8-3-task2-taxonomy-final-upload`
3. เปิด repository `diagnostic-lab-render` ใน GitHub
4. เลือก `Add file` > `Upload files`
5. ลากโฟลเดอร์ `diagnostic-lab-v8-3-task2-taxonomy-final-upload` เข้าไปทั้งโฟลเดอร์
6. รอให้อัปโหลดครบ 72 files แล้วกด `Commit changes`

ไม่ต้องย้ายหรือลบไฟล์ภายในโฟลเดอร์

## 2. ตั้งค่า Render

ไปที่ Render service > `Settings` แล้วกำหนดดังนี้:

```text
Root Directory: diagnostic-lab-v8-3-task2-taxonomy-final-upload
Build Command: npm install
Start Command: npm start
```

จากนั้นกดบันทึก แล้วเลือก `Manual Deploy` > `Clear build cache & deploy`

ไม่ต้องแก้ Environment Variables เดิม ไม่ต้องสร้าง API key ใหม่ และไม่ต้องเปลี่ยนราคา จำนวนครั้ง วันหมดอายุ หรือข้อมูลผู้ใช้

## 3. ตรวจหลัง Deploy

1. เปิดเว็บแล้วกด hard refresh (`Ctrl+Shift+R`)
2. Essay Type ต้องเริ่มที่ `Not Sure / Auto-detect`
3. รายการที่ผู้ใช้เห็นต้องมีเพียง 5 ประเภทหลัก: `Opinion Essay`, `Discuss Both Views`, `Problem & Solution`, `Advantages & Disadvantages`, `Direct Question`
4. Login, student profiles, quota, ราคา, จำนวนครั้ง, วันหมดอายุ และ Task 1 ต้องทำงานเหมือนเดิม

หาก GitHub แสดง 72 files หมายถึงจำนวนถูกต้องสำหรับ V8.3 ชุดนี้: ไฟล์เดิม 69 ไฟล์, เพิ่ม test 1 ไฟล์ และคู่มือ/audit 2 ไฟล์ โดยไม่มีไฟล์เดิมถูกลบ
