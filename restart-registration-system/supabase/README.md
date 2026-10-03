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
   - Legacy shirt add-on implementation retained only for migration compatibility

4. `004_event_store.sql`
   - Replaces shirt-only add-ons with a generic Event Store
   - Store is fully separate from race registration
   - Generic products: bag, shirt, hat, souvenir, etc.
   - Arbitrary choices/variants such as color, size, model, Limited edition
   - Each variant has independent SKU, final price, stock and badge
   - Separate cart, order, payment, delivery/pickup and order-status workflow
   - Server-authoritative quote and atomic stock reservation
   - Admin slip review, preparing/ready/fulfilled/shipped/cancelled states
   - Cancellation returns reserved stock
   - Public order lookup by SHOP order code + phone
   - Registration RPC explicitly rejects store items

5. `005_multi_store_marketplace.sql`
   - Multiple stores per Event
   - Unique store slug and direct link per store
   - Products, stock, orders and payment methods isolated by `store_id`
   - Event-level store directory plus store-specific storefronts
   - Server quote/create/lookup/payment RPCs require `store_slug`
   - Cross-store product/order access is rejected server-side
   - Existing single store is migrated to `official-store` automatically

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
