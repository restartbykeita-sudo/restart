# RESTART Member CRM + Loyalty — Handoff 2026-10-03

สถานะ: **Core Member CRM / Points / Store Loyalty / Pair-Team integration ทำงานครบใน Backend และ deploy หน้าเว็บแล้ว**

## Production
- Supabase project: `tnvwdseomwzosjeemapd`
- Edge `restart-registration-api`: **v18 ACTIVE**
- Migration: `supabase/006_member_crm_loyalty.sql`
- Migration latest commit: `ed34dedcbde0ae5f2e2cbe4304faef177ad59d98`
- Migration rerun idempotent สำเร็จ
- Security Advisor relevant findings: **0**
- Performance: เหลือ unused_index INFO เท่านั้น
- GitHub Pages latest checked run `37100392490`: **completed / success**

## Member Master Profile
Table: `restart_member_profiles`

เก็บ:
- member_code
- email
- คำนำหน้า
- ชื่อ / นามสกุล
- วันเกิด
- อายุคำนวณ ไม่เก็บซ้ำ
- ที่อยู่
- เบอร์โทร
- กรุ๊ปเลือด A/B/AB/O/UNKNOWN
- ชื่อผู้ติดต่อฉุกเฉิน
- เบอร์ฉุกเฉิน
- ความสัมพันธ์
- points_balance

ข้อมูลสุขภาพ/CRM ไม่ใส่ใน JWT metadata

## Login / Member Card
Files:
- `public/member.html`
- `public/member-v1.css`
- `public/member-v1.js`

รองรับ:
- สมัครสมาชิก Email + Password
- Email confirmation UX + resend confirmation
- Login / Logout
- ลืมรหัสผ่าน
- PASSWORD_RECOVERY + ตั้งรหัสใหม่
- แก้ไข Member Profile
- Member Card
- คะแนนคงเหลือ + Ledger
- ประวัติ Event
- Waiting List ของตัวเอง
- ประวัติ Store Orders / Points discount

URL:
https://restartbykeita-sudo.github.io/restart/restart-registration-system/public/member.html

หมายเหตุ:
- Supabase hosted projectsโดยทั่วไปเปิด email confirmation เป็น default ตาม docs
- ยัง **ไม่ได้ verify Auth Redirect URL configuration ของ project ผ่าน connector** เพราะไม่มี action สำหรับอ่าน setting นี้
- ต้องเช็ก live callback เมื่อ Browser automation พร้อม

## Registration + Member
Files:
- `public/member-registration-v1.js`
- `public/app-luxury-mobile-v1.1.js`
- `public/full-system-v1.js`

กติกา:
1. ต้อง Login Member ก่อนสมัคร
2. Runner #1 = เจ้าของ Member ID เสมอ
3. Runner #1 = ผู้ติดต่อหลักเสมอสำหรับ PAIR/TEAM
4. ดึง Profile มาเติม Runner #1 อัตโนมัติ
5. แก้ข้อมูลใน Form ได้
6. สมัครสำเร็จแล้วข้อมูล Runner #1 sync กลับ Master Profile
7. Field ที่ Event ปิด/ไม่แสดงจะ **ไม่ล้างข้อมูลเดิมใน Profile**
8. member binding ทำใน transaction เดียวกับ create registration
9. ไม่เชื่อ `member_user_id` ที่ส่งจาก Browser — Edge inject จาก verified Access Token

## Pair / Team
กติกาล่าสุด:
- SINGLE: Runner #1 ข้อมูลเต็ม
- PAIR/TEAM: Runner #1 เจ้าของ Member ID ข้อมูลเต็ม
- Runner #2+ กรอก **ชื่อ + นามสกุลเท่านั้น**
- Runner #2+ ไม่ต้องมี Member ID
- Category eligibility อายุ/เพศอิง Runner #1
- Insurance/beneficiary อิง Runner #1
- Server บังคับ contact_runner_index = 1
- Server sanitize Runner #2+:
  - `restart_participants`: เก็บแค่ชื่อ/นามสกุล
  - `participant_snapshot`: เก็บ runner_index + ชื่อ + นามสกุล
  - Waitlist payload: เก็บ runner_index + ชื่อ + นามสกุล
- ต่อให้แก้ request เอง ข้อมูลส่วนตัว teammate จะไม่ถูก persist

Backend tests (transaction + rollback) ผ่าน:
- Team quote owner-only = yes
- Team registration = yes
- Primary contact forced owner = yes
- Teammate name-only = yes
- Teammate beneficiary not saved = yes
- Pair created = yes
- Pair contact owner = yes
- Pair teammate name-only = yes
- Snapshot sanitization = yes
- Waitlist payload sanitization = yes

## Atomic Member Registration
`restart_create_registration` รับ member_user_id ที่ Edge inject หลัง verify session แล้ว bind ใน RPC transaction เดียว

Test ผ่าน:
- registration_member_bound = yes
- profile_synced_in_rpc = yes
- points_awarded_in_rpc = yes
- points_ledger_once = yes

## Member Profile Sync
Trigger: `private.restart_sync_registration_member`

ใช้ COALESCE ตอน upsert:
- field ที่ Form มีค่า -> อัปเดต Master Profile
- field ที่ Event ซ่อน / ไม่ส่ง -> เก็บค่าเดิม

Test ผ่าน:
- name updated
- phone updated
- address updated
- title/birth/blood/emergency hidden fields preserved

## Waiting List + Member CRM
เพิ่ม:
- `restart_waitlist.member_user_id`
- index `restart_waitlist_member_user_idx`

`restart_join_waitlist`:
- ต้องมี Member ID
- Edge `requireMember()`
- Member ID มาจาก verified token
- PAIR/TEAM contact = Runner #1
- ทุก runner ต้องมีชื่อ/นามสกุล
- payload teammate sanitized name-only

RLS:
- Member อ่าน Waitlist ของตัวเองเท่านั้น
- Admin อ่าน/จัดการทั้งหมด
- RLS test ผ่าน: visible_count=1, only_own=true

หมายเหตุ:
- ระบบเดิมยังไม่มี automatic function “Waitlist -> Registration conversion”
- Member ID ถูกเก็บใน Waitlist พร้อมสำหรับ flow conversion ในอนาคต

## Points
Table: `restart_member_points_ledger`
Types:
- EARN_REGISTRATION
- REVERSE_REGISTRATION
- REDEEM_STORE
- REFUND_STORE
- ADMIN_ADJUSTMENT

กติกา:
- Event กำหนด `member_points_award`
- Registration CONFIRMED -> ได้แต้ม
- CANCELLED -> reverse แต้ม
- dedupe_key กันแจก/คืนซ้ำ
- Admin ปรับแต้มได้พร้อมเหตุผล

## Store Loyalty
ต่อ Store:
- points_redemption_enabled
- points_per_thb
- min_redeem_points
- max_redeem_points_per_order

Checkout:
- Member login แล้วใช้ Points เป็นส่วนลดได้
- Server quote authoritative
- หักแต้มใน transaction ตอนสร้าง Order
- Order CANCELLED -> คืนแต้มอัตโนมัติ

Backend test ผ่าน:
- 200 points @ 10 points/บาท -> ลด 20 บาท
- points deducted correctly
- points refunded on cancel

## Admin Member CRM
Files:
- `admin/members.html`
- `admin/members-v1.js`

มี:
- Search member
- Member Card / ข้อมูลฉุกเฉิน
- จำนวน Event
- Waiting List
- Store Orders / ยอดซื้อ
- Points balance / Ledger
- ตั้ง Points ต่อ Event
- Admin manual adjustment + เหตุผล

URL:
https://restartbykeita-sudo.github.io/restart/restart-registration-system/admin/members.html

## Public RLS after Login
Audit แล้ว:
- Events/Categories/Packages/Form/Media/Routes อนุญาต public read สำหรับ anon + authenticated
- Stores/Products/Variants/Store payment methods มี authenticated public-read policies อยู่แล้ว
ดังนั้น Login Member แล้วไม่ทำให้หน้า Event/Store หาย

## Edge
Latest source commit:
`2130336a82f1713f020288cb7147e283fcf12d8a`

Production:
- `restart-registration-api` v18 ACTIVE
- create-registration requires Member
- join-waitlist requires Member
- Store order optionally links Member
- member_user_id from browser is ignored/replaced by verified Auth user

## Key commits this continuation
- Pair/Team UI name-only: `c9a7a48244bbaf3cf08e91ac2a7db3b097ee3b0f`
- UNKNOWN blood option: `52fd53ebae6e3f868039e36c571b3e4d84b60a92`
- Edge atomic member binding: `5590da6f15027ffdd9ebcc9f551bfd77e6bd5c2b`
- Edge waitlist member: `2130336a82f1713f020288cb7147e283fcf12d8a`
- Member Waitlist UI: `01311fcc56774cb0488aafca75172741a264c9fb`
- Admin CRM Waitlist: `9ea5c7a609898823dbbbeb82303303aa4e69d8f9`
- Member Card pin: `06f8c230ce3eced2939384b0f91d87beab4b9956`
- CRM pin: `b2c7dcce1d788c1277e424e8ff81df5bca90beef`
- Migration current: `ed34dedcbde0ae5f2e2cbe4304faef177ad59d98`

## Tests Passed
1. Existing Member Profile sync
2. Event-hidden field preservation
3. Pair name-only
4. Team name-only
5. Owner-only category eligibility
6. Owner-only insurance
7. Owner forced primary contact
8. Teammate DB sanitization
9. Teammate registration snapshot sanitization
10. Teammate Waitlist payload sanitization
11. Atomic registration/member/profile/points
12. Registration points earn/reverse
13. Store points discount/deduct/refund
14. Waitlist requires Member
15. Waitlist Member linkage
16. Waitlist owner RLS isolation
17. Migration rerun idempotent
18. Security Advisor relevant findings = 0
19. JS syntax checks all Member/Registration/Store/CRM files = OK

## Remaining / Next
1. **Live browser UI test**:
   - Member signup
   - Email confirmation callback
   - Login / forgot password
   - Member Card responsive layout
   - Pair/Team UI
   - Store Points checkout
   - Admin Member CRM
   Currently blocked because TinyFish wallet balance is negative.
2. Verify Supabase Auth Redirect URL for:
   `https://restartbykeita-sudo.github.io/restart/restart-registration-system/public/member.html`
3. Optional future feature: Admin flow to invite/convert Waitlist -> Registration while preserving member_user_id.
4. Optional CRM expansion: tiers/badges, point expiry, campaign segmentation, LINE account binding.

## Core rules to preserve
- Master Profile is authoritative reusable CRM profile.
- Age is calculated, not stored.
- Runner #1 is Member owner.
- PAIR/TEAM Runner #2+ are name-only.
- Never trust browser-provided member_user_id.
- Form edits update owner profile, hidden fields never erase profile.
- Points use auditable ledger + idempotent dedupe.
- CONFIRMED awards points; CANCELLED reverses/refunds.
- Store point settings are per-store.
- Member health/emergency info protected by RLS.
