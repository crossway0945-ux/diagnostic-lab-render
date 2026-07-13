# V6.5 Semantic Outweigh & Report Integrity

## เป้าหมายของรอบนี้

รอบนี้แก้ปัญหาจากรายงาน Evin ที่ต้องแก้ในระดับระบบ ไม่ใช่ hard-code ชื่อนักเรียนหรือ essay ฉบับเดียว โดยคง behavior ที่ผ่านแล้วของ Eva, Poon Poon, homeschooling และ Task 1

## สิ่งที่แก้แล้ว

1. Semantic position detection
   - อ่าน `economic benefits and the potential for innovation far outweigh these minor drawbacks` เป็น `advantages outweigh the disadvantages`
   - อ่าน `far greater national advantages` ใน conclusion เป็น final judgment ฝั่ง advantages
   - รองรับทิศทางกลับกัน เช่น `the disadvantages outweigh the advantages`

2. Body-route detection
   - ให้น้ำหนัก controlling sentence และ polarity ของ claim มากกว่าการนับ keyword ดิบ
   - Evin: Body 1 = employment disadvantage; Body 2 = economic/innovation advantages
   - Eva: Body 1 = ageing/retirement disadvantage; Body 2 = labour/tax/economic advantages

3. Band 7.0 vs secure Band 7.5
   - งานที่ position/structure ดีสามารถได้ Band 7.0
   - จะไม่ขึ้น `7.0-7.5` ถ้ายังมี example ที่ไม่เชื่อมผลระดับประเทศ, body paragraph ที่อัดหลายกลไก, thesis/body intensity mismatch หรือ precision/mechanical errors หลายจุด
   - Evin ถูก calibrate เป็น Overall 7.0 และทั้ง 4 criteria = 7.0

4. Executive Summary
   - ตัดข้อความ generic ที่ว่าไม่มี serious cap
   - ระบุ limiter จริง: national-level analysis หลัง example, Body 2 ที่แน่นเกินไป และ precision/mechanical slips

5. Top Issue ↔ Detailed Feedback integrity
   - Top Issue แต่ละข้อจำเป็นต้องอ้าง feedback card คนละใบ
   - issue title, category, paragraph location, exact sentence และ diagnosis ต้องมาจาก card เดียวกัน
   - Grammar/Punctuation issue ไม่สามารถดึง evidence/diagnosis จาก Development card มาซ้ำได้
   - ถ้า mapping ซ้ำหรือไม่ตรง ระบบจะไม่ finalize report และไม่หัก analysis credit

6. False-positive repair
   - `may exceed` ไม่ถูกจัดผิดเป็น modal + past-tense error
   - การ์ด Thesis ที่เขียนว่า “ปัญหานี้ไม่ใช่ grammar” ไม่ถูก classifier จัดเป็น Grammar อีก

## Regression matrix ที่ต้องผ่านก่อนส่งไฟล์

| Case | Expected result |
| --- | --- |
| Evin 309 words | Advantages outweigh; Body 1 disadvantage; Body 2 advantages; conclusion clear; Overall/criteria 7.0 |
| Eva 269 words | Route ถูก แต่ frequent language-error gate คง overall สูงสุด 6.5 |
| Poon Poon 190 words | 4-part structure, Body 2 short, conclusion unfinished, 4.0-4.5 |
| Homeschooling | Disadvantages outweigh; clean high-band caseยังคง 7.0-7.5 |
| Task 1 regression suite | ต้องผ่านเหมือน V6.4 |

## Student removal: แนวทางที่ควรทำต่อ

ควรมีหน้า `Manage Students` แต่ action หลักควรเป็น `Archive / Restore` ไม่ใช่ลบถาวรทันที เพราะ report, quota, activity history และ student snapshot เชื่อมกันอยู่ การ archive จะซ่อนนักเรียนจากตัวเลือกใน New Analysis โดยยังเปิด report เก่าได้ ส่วน hard delete ควรเป็น admin-only, มีการพิมพ์ชื่อยืนยัน และแสดงจำนวน report/history ที่จะถูกลบก่อนดำเนินการ

ฟังก์ชันนี้ยังไม่รวมใน V6.5 เพื่อไม่ให้การแก้ accuracy ไปเปลี่ยน schema ข้อมูลนักเรียนและ production history ในรอบเดียวกัน

## General Writing version: แนวทางที่ควรทำต่อ

ควรแยกเป็น product mode หรือเวอร์ชันใหม่ ไม่ควรใช้ IELTS band/rubric เดิมครอบงานทุกประเภท โดยให้เลือก rubric เช่น Academic Essay, School Writing, University Assignment หรือ Custom Rubric และสร้าง report schema ที่ไม่มี IELTS band หากผู้ใช้ไม่ได้เลือก IELTS

ฟังก์ชันนี้ยังไม่รวมใน V6.5 เพราะต้องออกแบบ scoring, report wording, quota/package และ prompt schema แยกจาก IELTS ก่อนจึงจะขายได้อย่างไม่ทำให้คำว่า “คะแนน” ชวนเข้าใจผิด
