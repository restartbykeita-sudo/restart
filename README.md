# Trail Scan Admin Production

ระบบ Admin รุ่นแรกสำหรับสร้าง Event, ประเภทการแข่งขัน และจุด START / CP ไม่จำกัด / FINISH

เปิดใช้งานจริงด้วย Vercel ตามไฟล์ `DEPLOY_PRODUCTION.md`

ระบบอ่านค่า Supabase จาก Vercel Environment Variables ผ่าน `/api/config` จึงไม่มีไฟล์ key ฝังอยู่ใน source code
