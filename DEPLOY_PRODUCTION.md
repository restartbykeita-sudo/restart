# Trail Scan Admin — Production Deployment

ชุดนี้ออกแบบสำหรับ Vercel และไม่ต้องใช้ localhost ในการใช้งานจริง

## 1. เตรียม Supabase

รันไฟล์ SQL ตามลำดับใน Supabase SQL Editor:

1. `supabase/migrations/001_trail_scan_core_schema.sql`
2. `supabase/migrations/002_trail_scan_security_rls.sql`
3. `supabase/migrations/003_trail_scan_rpc.sql`
4. ใช้ `supabase/004_verify_trail_scan_installation.sql` ตรวจสอบ

## 2. Deploy ขึ้น Vercel

### วิธีผ่าน Git

1. อัปโหลดโฟลเดอร์นี้ไป GitHub repository
2. ไปที่ Vercel → Add New → Project
3. Import repository
4. Framework Preset เลือก `Other`
5. Root Directory ใช้โฟลเดอร์นี้
6. เพิ่ม Environment Variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
7. กด Deploy

### วิธีผ่านคำสั่ง Production

จากโฟลเดอร์นี้ใช้:

```bash
npx vercel --prod
```

จากนั้นตั้ง Environment Variables ใน Vercel Project Settings และ Redeploy

## 3. ตั้งค่า Supabase Auth หลังได้โดเมนจริง

Supabase Dashboard → Authentication → URL Configuration

- Site URL: `https://ชื่อโปรเจกต์.vercel.app`
- Redirect URLs: `https://ชื่อโปรเจกต์.vercel.app/**`

ควรใช้โดเมน Production แบบ exact URL เป็นหลัก

## 4. ตรวจระบบ

เปิด:

- `/api/health` ต้องได้ `ok: true` และ `configured: true`
- `/login.html` ต้องแสดงหน้า Login
- สมัครบัญชี Admin หรือ Login
- สร้างองค์กรและ Event

## ความปลอดภัย

- ห้ามใส่ Supabase `service_role` ใน Vercel Environment Variables สำหรับ Frontend
- ใช้เฉพาะ Anon/Public key
- การป้องกันข้อมูลจริงอยู่ที่ RLS และ RPC ในฐานข้อมูล
