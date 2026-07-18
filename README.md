# Trail Scan Web V2

เว็บชุดใหม่ทั้งหมดสำหรับระบบสแกนงานวิ่ง โดยไม่ใช้ Vercel, Python, Node.js หรือระบบ Build

## ขอบเขต

- Login / Supabase Auth
- หลายองค์กร
- หลาย Event
- ประเภทการแข่งขัน
- เวลาปล่อยตามกำหนดและเวลาปล่อยจริง
- นักวิ่งและ QR Token
- Start
- CP เพิ่มได้ไม่จำกัด
- Finish
- มอบหมายเจ้าหน้าที่ประจำจุด
- Dashboard
- ผลการแข่งขัน
- Rapid Scanner
- IndexedDB Offline Queue
- Sync ผ่าน RPC `record_scan()` และ `sync_scan_batch()`

## 1. ใส่ค่า Supabase

แก้ไฟล์ `assets/config.js`

```javascript
window.TRAIL_SCAN_CONFIG = Object.freeze({
  APP_NAME: 'Trail Scan',
  SUPABASE_URL: 'https://YOUR_PROJECT_ID.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR_PUBLISHABLE_OR_ANON_KEY',
  DEFAULT_TIMEZONE: 'Asia/Bangkok',
  SCANNER: { FPS: 18, DUPLICATE_LOCK_MS: 4000, RESULT_MS: 1200, BATCH_SIZE: 30 }
});
```

ใช้เฉพาะ Publishable Key หรือ Legacy Anon Key

ห้ามใส่:
- service_role key
- database password
- secret key
- Telegram Bot Token

## 2. รัน SQL ใน Supabase

ไฟล์อยู่ในโฟลเดอร์ `supabase/`

1. `001_trail_scan_core_schema.sql`
2. `002_trail_scan_security_rls.sql`
3. `003_trail_scan_rpc.sql`
4. `004_verify_trail_scan_installation.sql` สำหรับตรวจสอบ

## 3. อัปโหลดขึ้น Hosting

อัปโหลดไฟล์ทั้งหมดไปยัง `public_html` หรือโฟลเดอร์ Subdomain ของคุณ เช่น

`https://trail.yourdomain.com`

ต้องใช้ HTTPS เพื่อให้กล้องและ PWA ทำงาน

## 4. ลำดับใช้งาน

1. เปิด `login.html`
2. สมัครหรือ Login
3. สร้างองค์กร
4. สร้าง Event
5. สร้างประเภทการแข่งขัน
6. สร้าง START, CP และ FINISH
7. เพิ่มหรือนำเข้านักวิ่ง
8. มอบหมายเจ้าหน้าที่
9. เปิด `scanner/index.html`
10. กดดาวน์โหลดข้อมูล Offline ก่อนออกไปประจำ CP

## Offline

ทุกการสแกนถูกเก็บลง IndexedDB ในมือถือก่อน เมื่ออินเทอร์เน็ตกลับมา ระบบ Sync เข้า Supabase อัตโนมัติ โดยใช้ `offline_id` ป้องกันรายการซ้ำ


## เวอร์ชัน V3: เพิ่มระบบลบครบทุกหน้าจัดการ

เพิ่มปุ่มลบใน:
- องค์กร
- Event
- ประเภทการแข่งขัน
- Start / CP / Finish
- นักวิ่ง
- เจ้าหน้าที่
- อุปกรณ์ Scanner

### หลักการป้องกันข้อมูลเสียหาย

- ลบองค์กรหรือ Event ต้องพิมพ์ชื่อยืนยัน และแสดงจำนวนข้อมูลที่จะถูกลบ
- ประเภทที่มีนักวิ่ง/สแกน/ผลแล้ว จะไม่ให้ลบ แต่ปิดใช้งานแทน
- จุดสแกนที่มีประวัติแล้ว จะไม่ให้ลบ แต่ปิดใช้งานแทน
- นักวิ่งที่มีประวัติแล้ว จะไม่ให้ลบ แต่เปลี่ยนเป็น CANCELLED แทน
- เจ้าหน้าที่และอุปกรณ์ที่ไม่ต้องใช้สามารถลบได้
- หน้าผลการแข่งขันไม่มีปุ่มลบ เพราะเป็นข้อมูลที่ระบบคำนวณจาก Scan Logs
