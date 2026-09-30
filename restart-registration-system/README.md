# RESTART Registration System

ระบบรับสมัครงานวิ่งของ RESTART แยกจาก Trail Scan เดิมอย่างชัดเจน

## โครงสร้าง
- `admin/` — หน้า Admin, Event Builder, Form Builder, รุ่นการแข่งขัน, ราคา, Package, ผ่อนชำระ, Payment, Theme และตรวจสลิป
- `public/` — หน้าสมัครสำหรับผู้ใช้งาน
- `assets/` — CSS, config และ admin core เฉพาะระบบนี้
- `supabase/` — SQL/เอกสารฐานข้อมูลของระบบรับสมัคร

## หลักการ
- ไม่ใช้ CSS/JS ของ Trail Scan
- ไม่แก้หน้า Trail Scan เพื่อให้ระบบนี้ทำงาน
- ใช้ตารางฐานข้อมูล prefix `restart_`
- ใช้ Supabase publishable key ฝั่ง Browser
- ข้อมูลสำคัญและราคาถูกตรวจซ้ำที่ Database RPC
