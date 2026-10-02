# RESTART Registration System / Supabase

ฐานข้อมูลระบบนี้ใช้ตาราง prefix `restart_` ใน Supabase project เดิม เพื่อแยก namespace จากระบบอื่น

## Migration order

1. `001_registration_platform_patch.sql`
   - Dedicated RESTART Admin authorization
   - Base-field settings
   - Registration hardening groundwork

2. `002_full_registration_system.sql`
   - Server-authoritative price quote
   - Auto category / self-select category rules
   - Promotion + Discount Code
   - Followers
   - Capacity + Waitlist
   - PDPA consent snapshot
   - Edit / Cancel / Transfer registration
   - Next installment self-service
   - Registration audit log
   - Supporting indexes / RLS / grants
   - Public write RPCs restricted to `service_role`
   - Direct anonymous slip upload removed

3. `003_shirt_sales.sql`
   - Optional shirt add-on sales per Event
   - Product image, code, localized name/description and sale window
   - Size / SKU / stock / per-size price adjustment
   - Server-side stock validation and atomic stock reservation
   - Maximum quantity per registration
   - Shirt price included in registration total
   - Installment flow charges shirt add-ons with the first installment
   - Cancellation returns stock for shirts not yet fulfilled
   - Fulfillment status / shirt sales CSV / registration export integration
   - Public catalog read via RLS; all writes remain Admin/Server controlled

3. `003_shirt_sales_system.sql`
   - Optional shirt add-on sales per Event
   - Shirt products, images, sizes, SKU and stock
   - Per-size price adjustment
   - Server-side shirt quote + stock validation
   - Shirt amount included in registration/payment schedule
   - Shirt order snapshots for historical accuracy
   - Fulfillment status (waiting / handed out / cancelled)
   - Automatic stock return when an unfulfilled registration is cancelled

## Edge Function

Source of truth:
`supabase/functions/restart-registration-api/index.ts`

Public browser writes go through this Edge Function. It performs rate limiting, slip validation, registration actions, installment actions and Telegram notification. The browser must not call protected registration RPCs or upload slips directly to Storage.

## Frontend modules

- Admin: `admin/full-system-v1.js`
- Public: `public/full-system-v1.js`

These modules extend the existing registration UI without replacing GPX Route Animation, categories, payment methods, Form Builder or existing event preview functionality.

## Important

After changing database functions or the Edge Function, sync the deployed version back to this repository so GitHub remains the reproducible source of truth.
