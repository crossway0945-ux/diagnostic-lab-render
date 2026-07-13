# ค่าอัปโหลดและ Render สำหรับ V6.3

ใช้คู่มือฉบับเต็มใน `DEPLOY_THIS_VERSION_THAI.md`

ค่าที่ถูกต้องสำหรับชุดนี้มีเพียงชุดเดียว:

```text
Root Directory: diagnostic-lab-v6-3-parser-mapping-recovery-20260713
Build Command: npm install
Start Command: npm start
```

หลังแตก ZIP ต้องเห็น `package.json` อยู่ตรงชั้นแรกของโฟลเดอร์ V6.3 หากพบโฟลเดอร์ชื่อ V6.3 ซ้อนอีกชั้น ห้าม deploy เพราะ Render จะหา `package.json` ไม่พบ

อัปโหลดโฟลเดอร์ V6.3 ทั้งก้อนเข้า repository เดิม จากนั้นกด Save Changes และเลือก Manual Deploy > Clear build cache & deploy
