# Trail Scan Web V6 Complete

ระบบจับเวลาและตรวจจุดงานวิ่งเทรลแบบ QR พร้อม Supabase

## สิ่งที่รวมใน V6

- สมัครด้วยอีเมลและรหัสผ่านโดยไม่ใช้ Email Confirmation
- ผู้สมัครใหม่เป็น `PENDING` และใช้งานไม่ได้จนกว่า Admin อนุมัติ
- Admin กำหนดองค์กร, บทบาท, Event และ Start/CP/Finish ที่รับผิดชอบ
- เมนูและข้อมูลแสดงตามสิทธิ์ พร้อม RLS/RPC ป้องกันการข้ามสิทธิ์
- Dashboard แสดงชื่อ, BIB, ประเภท, รุ่น, เวลาเช็กอิน, เริ่ม, ผ่านจุด, เข้าเส้น, เวลารวม และอันดับ
- หน้าสาธารณะ `results.html` ให้นักวิ่งเลือก Event และกรอก BIB ตรวจผลเอง
- ดาวน์โหลด QR รายคน/ZIP และสร้างป้าย BIB PDF
- Rapid Scanner, Manual BIB, Offline Queue และ Sync
- เพิ่ม/แก้ไข/ลบข้อมูลแบบ Safe Delete
- Service Worker ไม่ Cache `assets/config.js`
- RPC `ensure_my_profile()` ซ่อมกรณี Auth ถูกสร้างแต่ profiles ไม่ถูกบันทึก

## ติดตั้งใหม่

1. เปิด Supabase SQL Editor แล้วรัน `supabase/000_INSTALL_ALL_V6.sql`
2. ตั้ง Authentication > Email: Confirm email = OFF
3. อัปโหลดไฟล์ทั้งหมดขึ้น HTTPS Hosting
4. เปิด `login.html` สมัครบัญชีแรก
5. หน้า Pending กด `ตั้งเป็นผู้ดูแลระบบคนแรก`
6. สร้างองค์กรและเริ่มกำหนดสิทธิ์ผู้ใช้งาน

## อัปเกรดจาก V5

รัน `supabase/006_no_email_confirmation_signup_hardening.sql` แล้วอัปโหลดเว็บ V6 ทับชุดเดิม

## ข้อควรระวัง

- ใช้เฉพาะ Publishable/anon key ใน `assets/config.js`
- ห้ามนำ service_role key ใส่ในเว็บไซต์
- การปิด Confirm email ต้องทำใน Supabase Dashboard ไม่สามารถบังคับจากหน้าเว็บสาธารณะได้
- ก่อนใช้งานจริงให้ทดสอบกับ Supabase Project ของคุณครบทุกบทบาท


## V6.1 — แก้เมนูด้านข้างบนมือถือ

- ปุ่ม Hamburger จะเปลี่ยนเป็น X เมื่อเปิดเมนู
- ปุ่ม Hamburger/X อยู่เหนือ Sidebar จึงไม่ถูกบัง
- เพิ่มปุ่ม X ภายใน Sidebar
- แตะพื้นที่มืดด้านนอกเพื่อปิดได้
- กด Escape เพื่อปิดได้
- เลือกเมนูแล้ว Sidebar ปิดอัตโนมัติ
- ป้องกันหน้าเว็บด้านหลังเลื่อนขณะ Sidebar เปิด
- เปลี่ยน Cache เป็น 6.1.0 เพื่อให้ Browser โหลดไฟล์ใหม่


## V6.2 — ปุ่มดาวน์โหลดคู่มือในหน้าเว็บ

เพิ่มปุ่มดาวน์โหลดคู่มือใน:
- หน้า Admin เมนูด้านข้าง
- หน้า Login
- หน้ารอ Admin อนุมัติ
- หน้าตั้งค่า Rapid Scanner
- หน้าตรวจผลการแข่งขัน

ไฟล์คู่มือที่ใช้:
- manual/Trail_Scan_V6_User_Manual.pdf
- manual/Trail_Scan_V6_User_Manual.docx

ใช้ชื่อไฟล์ภาษาอังกฤษเพื่อป้องกันปัญหาลิงก์ภาษาไทยบน Hosting
