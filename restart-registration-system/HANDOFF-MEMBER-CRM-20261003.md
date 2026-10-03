# RESTART Member CRM + Loyalty — Handoff 2026-10-03

สถานะ: **งานใหญ่กำลังดำเนินการ — บันทึกก่อนผู้ใช้ปิดคอม**

## ทำเสร็จแล้ว

### 1. Member Master Profile
สร้างฐานสมาชิกกลาง `restart_member_profiles`
- Supabase Auth เป็นบัญชี Login
- member_code
- Email
- คำนำหน้า
- ชื่อ
- นามสกุล
- วันเกิด
- อายุคำนวณจากวันเกิด ไม่เก็บซ้ำ
- ที่อยู่
- เบอร์โทร
- กรุ๊ปเลือด
- ชื่อ-นามสกุลผู้ติดต่อฉุกเฉิน
- เบอร์โทรฉุกเฉิน
- ความสัมพันธ์
- points_balance

### 2. Member Points Ledger
สร้าง `restart_member_points_ledger`
รองรับ:
- EARN_REGISTRATION
- REVERSE_REGISTRATION
- REDEEM_STORE
- REFUND_STORE
- ADMIN_ADJUSTMENT

ใช้ dedupe_key ป้องกันแจก/คืนแต้มซ้ำ

### 3. Registration เชื่อม Member
เพิ่ม:
- `restart_registrations.member_user_id`
- `restart_registrations.member_runner_index`
- `restart_participants.member_user_id`
- `restart_participants.emergency_contact_name`

กติกาล่าสุด:
- เจ้าของ Member ID = ผู้แข่งขันคนที่ 1
- ข้อมูลที่แก้ในฟอร์มของเจ้าของ Member ID sync กลับ Member Profile
- ผู้แข่งขันคนอื่นห้ามไปทับ Profile เจ้าของบัญชี

### 4. Team / Group UX
ล่าสุดแก้ `public/app-luxury-mobile-v1.1.js`
commit:
`c9a7a48244bbaf3cf08e91ac2a7db3b097ee3b0f`

กติกาใหม่:
- SINGLE: เจ้าของ Member ID กรอก/ดึงข้อมูลเต็ม
- PAIR/TEAM: Runner #1 = เจ้าของ Member ID
- Runner #2 ขึ้นไป = สมาชิกทีม กรอก **ชื่อ + นามสกุลเท่านั้น**
- ไม่ต้องสมัคร Member ID ให้คนอื่นในทีม

**จุดนี้เพิ่งแก้ frontend และยังต้องปรับ server validation ให้รองรับ name-only runner #2+ ต่อ**

### 5. Member Card
สร้าง:
- `public/member.html`
- `public/member-v1.css`
- `public/member-v1.js`

มี:
- สมัครสมาชิก
- Login
- แก้ Profile
- Member Card
- คะแนนคงเหลือ
- ประวัติ Event
- ประวัติ Points
- จำนวน Store Order

### 6. Registration Autofill
สร้าง:
- `public/member-registration-v1.js`

พฤติกรรม:
- ยังไม่ Login -> แจ้งให้ Login/สมัครสมาชิกก่อนสมัครงาน
- Login แล้ว -> เติม Member Profile ลง Runner #1
- แก้ใน Form ได้
- หลังสมัครจะ sync กลับ Profile ผ่าน server
- Member owner ถูก fix เป็น Runner #1 แล้ว

commit สำคัญ:
- `ddeff7146de51af371a33857e3533d922f71f92a`
- `72621518e648de64c54cb5430d416fd6f475befb`
- public index pin: `4177dcf1dd849907df43ccd727590b306b8ecc59`

### 7. Emergency Contact Name
เพิ่มฟิลด์มาตรฐาน:
`emergency_contact_name`

ทั้ง:
- Event field_settings
- Participant
- Registration form
- create_registration
- Member Profile

### 8. Event Points
เพิ่ม:
`restart_events.member_points_award`

กติกา:
- ใบสมัครเป็น CONFIRMED -> ได้คะแนน Event
- CANCELLED หลังเคยได้ -> คืนคะแนนอัตโนมัติ
- dedupe ป้องกันได้/คืนซ้ำ

### 9. Store ใช้ Points
เพิ่มต่อร้าน:
- points_redemption_enabled
- points_per_thb
- min_redeem_points
- max_redeem_points_per_order

Store checkout:
- Login Member แล้วใช้แต้มได้
- Server quote คำนวณส่วนลด
- หักแต้มตอนสร้าง order
- CANCELLED -> คืนแต้มอัตโนมัติ

ทดสอบ backend แล้ว:
- quote 200 points @ 10 points/บาท => ลด 20 บาท
- หักแต้มถูก
- ยกเลิก order คืนแต้มถูก

### 10. Store Admin Points Settings
แก้:
`admin/store-system-v1.js`
commit:
`aef1072378ba0cbf45c9e41c238d87e26fad3f3e`

Admin ต่อร้านตั้ง:
- เปิด/ปิดแต้ม
- แต้มต่อ 1 บาท
- แต้มขั้นต่ำ
- แต้มสูงสุดต่อ order

### 11. Member CRM Admin
สร้าง:
- `admin/members.html`
- `admin/members-v1.js`

มี:
- รายชื่อสมาชิก
- Search
- Member Card
- คะแนน
- จำนวน Event
- Order
- ข้อมูลฉุกเฉิน
- ตั้งคะแนนต่อ Event
- Admin ปรับแต้มพร้อมเหตุผล

### 12. Edge Function
`restart-registration-api`
Production version: **v16**

เพิ่ม:
- member-complete-signup
- member token verification
- create-registration ต้องใช้ member session
- ไม่เชื่อ member_user_id จาก browser
- store quote/create ผูก authenticated member จาก token

GitHub edge source latest relevant commit:
`072f6c0c1e2a95954e765c13b20d685aa673c4af`

### 13. Migration
สร้าง:
`supabase/006_member_crm_loyalty.sql`

latest migration commit:
`c72f3b31d0986ff575ea2f0372f87d4f79adb56f`

Migration rerun บน production สำเร็จแบบ idempotent

### 14. Security / Performance
Supabase Security Advisor:
- relevant Member/Points findings = 0

RLS:
- รวม owner/admin SELECT policies แล้ว
- แก้ multiple permissive policy warning

Performance เหลือ:
- unused_index INFO เท่านั้น เพราะ index ใหม่ยังไม่มี usage

### 15. Backend Tests
transaction test + rollback ผ่านครบ:
- profile_synced = yes
- owner_link_only = yes
- registration_points_earned = yes
- registration_points_reversed = yes
- store_quote_discount = yes
- store_points_deducted = yes
- store_points_refunded = yes

## สิ่งที่ยังไม่เสร็จ / จุดต่อทันที

### A. สำคัญที่สุด: ปรับ server validation สำหรับ Team/Pair name-only runner
Frontend ล่าสุดทำให้ runner #2+ กรอกชื่อ/นามสกุลเท่านั้นแล้ว
แต่ `restart_create_registration` ยัง validate field_settings กับ runner ทุกคน

ต้องแก้ server:
- ถ้า registration_type != SINGLE และ runner_index > 1
  - require only first_name + last_name
  - skip title/birth/gender/id/phone/blood/address/emergency for member teammates
  - insurance/beneficiary สำหรับ runner #2+ ต้องตัดสินว่าจะไม่ใช้ หรือให้ Event override
- `restart_category_eligible` ต้องไม่ fail จาก runner #2+ ที่ไม่มี birth/gender
  - สำหรับ team name-only ให้ category eligibility อิง owner Runner #1
  - หรือออกแบบตามประเภท Event ถ้าต้องให้ทุกคนเข้าเกณฑ์

### B. ปรับ client validation full-system
`validateFullClient()` และ quoteReady อาจยังคาดหวังข้อมูลเต็มทุก runner
ต้องแก้ให้ runner #2+ name-only ผ่านได้

### C. Deploy Edge ใหม่หลังแก้ Team validation
Edge v16 ปัจจุบันยังใช้ create-registration RPC เวอร์ชันก่อน Team name-only server patch

### D. อัปเดต migration 006 หลัง server Team patch
ให้ migration snapshot ตรง production

### E. Live browser/UI test
ยังไม่ได้ทำ interactive browser validation ของ:
- member signup/login
- member card
- autofill registration
- team name-only flow
- points checkout
- member CRM Admin

### F. Auth email confirmation UX
ต้องตรวจ Supabase Auth project ว่า email confirmation เปิด/ปิด และ flow ยืนยัน Email ทำงานกับ GitHub Pages URL ตามต้องการ

### G. Store points live UI polish
Backend ใช้งานได้แล้ว แต่ควรทดสอบ:
- member login/out ใน shop
- slider/number points UX
- zero-total order after points
- slip requirement เมื่อยอดเหลือ 0

## URLs
Public:
https://restartbykeita-sudo.github.io/restart/restart-registration-system/public/

Member:
https://restartbykeita-sudo.github.io/restart/restart-registration-system/public/member.html

Admin:
https://restartbykeita-sudo.github.io/restart/restart-registration-system/admin/

Member CRM:
https://restartbykeita-sudo.github.io/restart/restart-registration-system/admin/members.html

## กฎที่ต้องรักษาต่อ
1. Member Profile เป็นข้อมูลกลาง
2. อายุคำนวณจากวันเกิด ไม่เก็บซ้ำ
3. Runner #1 = เจ้าของ Member ID
4. Team/Pair runner #2+ = ชื่อ/นามสกุลเท่านั้น ตามคำสั่งล่าสุด
5. การแก้ข้อมูล Runner #1 ในฟอร์มต้อง sync กลับ Member Profile
6. ห้ามข้อมูล teammate ไปทับ Profile เจ้าของ Member ID
7. Points ต้องเป็น Ledger ตรวจย้อนหลังได้
8. CONFIRMED เท่านั้นถึงได้แต้ม
9. CANCELLED ต้อง reverse/refund แต้มอย่าง idempotent
10. Store points settings แยกต่อร้าน
11. ต้องรักษา RLS และไม่เชื่อ user_id จาก browser


## Continuation update — 2026-10-03 Member CRM round 2

### Completed in this continuation

1. **PAIR/TEAM name-only teammates completed end-to-end**
   - Runner #1 = Member owner / primary contact.
   - Runner #2+ require only first_name + last_name.
   - Server no longer requires ID/phone/birth/blood/address/emergency/insurance for teammates.
   - Category age/gender eligibility for Pair/Team uses Runner #1 only.
   - Insurance/beneficiaries applies only to Runner #1 for Pair/Team.
   - Contact runner locked to #1 for group registrations.
   - Frontend + Server tests passed.

2. **Team backend test after migration rerun**
   - create_team_name_only = yes
   - owner_full_data = yes
   - insurance_owner_only = yes
   - teammates_only_names = yes

3. **Member Profile sync now preserves hidden CRM fields**
   - `private.restart_sync_registration_member()` uses COALESCE.
   - If an Event omits phone/address/blood/emergency fields, existing master CRM values are preserved.
   - If user edits a field that Event asks for, new non-null value updates the master profile.
   - Tests passed:
     - hidden_fields_preserved = yes
     - submitted_field_updates = yes

4. **Authenticated member storefront RLS fixed**
   - Logged-in members can now read open:
     - restart_stores
     - restart_store_payment_methods
     - restart_merch_products
     - restart_merch_variants
   - Admin still sees all rows including inactive/closed.
   - Authenticated test on Bangwad returned:
     - stores = 1
     - products = 2
     - variants = 5
     - payment_methods = 1

5. **Store order item RLS consolidated**
   - Removed duplicate permissive SELECT policies.
   - Member can read own order items; Admin can read all.
   - Final Security Advisor relevant findings = 0.
   - Performance relevant warnings = unused_index INFO only.

6. **Points zero-payment flow fully tested**
   - Redeem points until total = 0.
   - No payment method/slip required.
   - Order status = PAID / payment_status = APPROVED.
   - Points deducted.
   - Cancel order refunds points.
   - All tests = yes.

7. **Member Auth UX improved**
   - Forgot password.
   - resetPasswordForEmail recovery flow.
   - PASSWORD_RECOVERY new-password UI.
   - Resend signup confirmation email.
   - Login handles unconfirmed email with resend option.
   - Hosted Supabase email confirmations are normally enabled by default.
   - Redirect URL still must be allowed in Supabase Auth URL Configuration.

8. **Member Card improved**
   - Added Store Order history.
   - Shows redeemed points / discount used per order.

9. **Store Points UX improved**
   - Button: ใช้แต้มสูงสุด.
   - Server remains authoritative.
   - UI normalizes requested points to actual redeemable points based on:
     - balance
     - points_per_thb
     - min points
     - max per order
     - item subtotal

10. **Registration integration observer fixed**
    - Member login gate MutationObserver no longer repeatedly rewrites itself.

11. **Blood group UNKNOWN supported in registration form**
    - Member Profile already supports UNKNOWN.
    - Registration UI now includes ไม่ทราบ / Unknown.

12. **Edge production**
    - restart-registration-api production = v18.
    - Production source exactly matches GitHub latest.
    - Waitlist now requires Member session.
    - Store order no longer performs redundant member_user_id update.

13. **Migration**
    - `006_member_crm_loyalty.sql` contains:
      - team name-only behavior
      - owner-only category eligibility
      - CRM field preservation
      - authenticated storefront RLS
      - consolidated member/admin RLS
    - Duplicate `restart_sync_registration_member()` definition removed.
    - Migration rerun succeeds.

14. **GitHub Pages**
    - Pages build for commit `7cf3d1f59f0e04929d8515d202dc34a0e33feadc` completed success.
    - Member page cache refreshed after auth/order-history changes.

### Current important commits
- Final migration cleanup: `7cf3d1f59f0e04929d8515d202dc34a0e33feadc`
- Member page cache: `1446f597f2f920e17b0b44110a516e9565f9a035`
- Profile preservation migration: `bd3a27b4ab31dfba3cd6f7e52aa4ce2f3ecaa7e6`
- Store order-item RLS: `adc674411b3055e09cea06a4893f44bee0f0f19f`
- Member points storefront: `651b992957b95e19c24b7e420bdefb7f8245f596`
- Member Card order history: `2b3608e182e02a85dfd7a6e8f1c2438f14d394c1`
- Member auth recovery: `b00dbe95632198d1101a93e0008dd673b30d2778`
- Team validation frontend: `53433dc8d711f45893c4d7ac6148a364abb6f277`
- Team base UI: `575669b3e6ba51b68f473edbcd10b9de01ee947e`

### Remaining work

A. **Live browser test**
- Browser automation could not start because TinyFish wallet balance is negative.
- Do not claim UI browser flow was visually tested.
- When wallet is available, test:
  1. member.html Login tab
  2. Signup tab and all required fields
  3. Forgot password
  4. Event page Member/Login gate
  5. Pair/Team runner #2+ name-only UI
  6. Member autofill Runner #1
  7. Store points checkout and max-points button
  8. Member Card Event/Store history
  9. Admin Member CRM

B. **Supabase Auth URL configuration**
- Confirm GitHub Pages Member URL is in Auth Redirect URLs:
  `https://restartbykeita-sudo.github.io/restart/restart-registration-system/public/member.html`
- If not allowlisted, signup confirmation/password reset links may confirm successfully but not return to Member page.

C. **Optional next CRM enhancements**
- Member CSV export.
- CRM tags/segments.
- Member notes.
- Membership level/tier based on points or Event count.
- Expiring points rules if desired.
- Member merge/deduplicate workflow if legacy runners are later imported into Member accounts.
