import { createClient } from 'npm:@supabase/supabase-js@2.117.1';

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const allowedOrigins = new Set([
  'https://restartbykeita-sudo.github.io',
]);

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
const fail = (status: number, message: string): never => { throw new ApiError(status, message); };
const text = (value: unknown) => String(value ?? '').trim();
const normalizeId = (value: unknown) => text(value).toUpperCase().replace(/[^0-9A-Z]/g, '');
const cors = (origin: string) => ({
  'access-control-allow-origin': origin || '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'vary': 'Origin',
});
const json = (value: unknown, status = 200, origin = '') => new Response(JSON.stringify(value), {
  status,
  headers: { ...cors(origin), 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const asBool = (obj: Record<string, unknown>, key: string, fallback = false) =>
  typeof obj?.[key] === 'boolean' ? obj[key] as boolean : fallback;

const telegramEscape = (value: unknown) => text(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const displayLabel = (value: unknown) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const v = value as Record<string, unknown>;
    return text(v.th || v.en || Object.values(v)[0] || '');
  }
  return text(value);
};
const moneyTHB = (value: unknown) => Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });

async function requireAdmin(req: Request) {
  const auth = req.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) fail(401, 'กรุณาเข้าสู่ระบบ Admin');
  const token = auth.slice(7).trim();
  const { data: authData, error: authError } = await db.auth.getUser(token);
  const user = authData?.user;
  if (authError || !user) fail(401, 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่');
  const { data: admin, error: adminError } = await db.from('restart_admin_users')
    .select('user_id,active,role').eq('user_id', user.id).eq('active', true).maybeSingle();
  if (adminError || !admin) fail(403, 'ไม่มีสิทธิ์ Admin');
  return user;
}

async function optionalMember(req: Request) {
  const auth = req.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

async function requireMember(req: Request) {
  const user = await optionalMember(req);
  if (!user) fail(401, 'กรุณาเข้าสู่ระบบสมาชิกก่อนทำรายการ');
  return user;
}

function cleanProfile(input: Record<string, unknown>) {
  const blood = text(input.blood_group).toUpperCase();
  if (blood && !['A','B','AB','O','UNKNOWN'].includes(blood)) fail(400, 'กรุ๊ปเลือดไม่ถูกต้อง');
  const birth = text(input.birth_date);
  if (birth && !/^\d{4}-\d{2}-\d{2}$/.test(birth)) fail(400, 'วันเกิดไม่ถูกต้อง');
  const out = {
    title: text(input.title) || null,
    first_name: text(input.first_name) || null,
    last_name: text(input.last_name) || null,
    birth_date: birth || null,
    address: text(input.address) || null,
    phone: text(input.phone) || null,
    blood_group: blood || null,
    emergency_contact_name: text(input.emergency_contact_name) || null,
    emergency_phone: text(input.emergency_phone) || null,
    emergency_relation: text(input.emergency_relation) || null,
  };
  if (!out.title || !out.first_name || !out.last_name || !out.birth_date || !out.address || !out.phone ||
      !out.blood_group || !out.emergency_contact_name || !out.emergency_phone || !out.emergency_relation) {
    fail(400, 'กรุณากรอกข้อมูลสมาชิกให้ครบ');
  }
  return out;
}

async function completeMemberSignup(req: Request, origin: string) {
  await limit(req, 'member-complete-signup', 5);
  const body = await req.json();
  const userId = text(body.user_id);
  const signupToken = text(body.signup_token);
  if (!/^[0-9a-f-]{36}$/i.test(userId) || signupToken.length < 24) fail(400, 'ข้อมูลสมัครสมาชิกไม่ถูกต้อง');

  const { data: userData, error: userError } = await db.auth.admin.getUserById(userId);
  const user = userData?.user;
  if (userError || !user) fail(404, 'ไม่พบบัญชีสมาชิก');
  if (text(user.user_metadata?.restart_signup_token) !== signupToken) fail(403, 'Token สมัครสมาชิกไม่ถูกต้อง');

  const profile = cleanProfile((body.profile || {}) as Record<string, unknown>);
  const { data: saved, error: saveError } = await db.from('restart_member_profiles').upsert({
    user_id: user.id,
    email: user.email || null,
    ...profile,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' }).select('member_code,user_id').single();
  if (saveError) fail(503, 'บันทึกข้อมูลสมาชิกไม่สำเร็จ');

  const metadata = { ...(user.user_metadata || {}) };
  delete metadata.restart_signup_token;
  await db.auth.admin.updateUserById(user.id, { user_metadata: metadata }).catch(() => {});

  return json({ ok: true, member_code: saved.member_code }, 201, origin);
}

function validateTelegramChatId(value: string) {
  return /^-?\d{2,30}$/.test(value) || /^@[A-Za-z0-9_]{5,64}$/.test(value);
}
function validateTelegramToken(value: string) {
  return /^\d{5,20}:[A-Za-z0-9_-]{20,220}$/.test(value);
}

async function sendTelegramMessage(botToken: string, chatId: string, message: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch('https://api.telegram.org/bot' + encodeURIComponent(botToken) + '/sendMessage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message.slice(0, 4000),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) throw new Error(text(data?.description || ('Telegram HTTP ' + res.status)));
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function getTelegramSetting(eventId: string) {
  const { data, error } = await db.from('restart_event_telegram_settings')
    .select('event_id,enabled,bot_token,chat_id,updated_at').eq('event_id', eventId).maybeSingle();
  if (error) throw error;
  return data as Record<string, unknown> | null;
}

async function telegramSettingsGet(req: Request, origin: string) {
  await requireAdmin(req);
  const body = await req.json();
  const eventId = text(body.event_id);
  if (!eventId) fail(400, 'ไม่พบ Event');
  const { data: event, error: eventError } = await db.from('restart_events')
    .select('id,name,feature_flags').eq('id', eventId).single();
  if (eventError || !event) fail(404, 'ไม่พบ Event');
  const setting = await getTelegramSetting(eventId);
  return json({
    event_id: eventId,
    event_name: event.name,
    enabled: !!setting?.enabled,
    chat_id: text(setting?.chat_id),
    has_bot_token: !!text(setting?.bot_token),
    notifications_enabled: asBool((event.feature_flags || {}) as Record<string, unknown>, 'notifications', false),
    updated_at: setting?.updated_at || null,
  }, 200, origin);
}

async function telegramSettingsSave(req: Request, origin: string) {
  const user = await requireAdmin(req);
  const body = await req.json();
  const eventId = text(body.event_id);
  const enabled = body.enabled === true;
  const chatId = text(body.chat_id);
  const newToken = text(body.bot_token);
  if (!eventId) fail(400, 'ไม่พบ Event');
  const { data: event, error: eventError } = await db.from('restart_events')
    .select('id,name,feature_flags').eq('id', eventId).single();
  if (eventError || !event) fail(404, 'ไม่พบ Event');

  const existing = await getTelegramSetting(eventId);
  const token = newToken || text(existing?.bot_token);
  if (newToken && !validateTelegramToken(newToken)) fail(400, 'Bot Token ไม่ถูกต้อง');
  if (chatId && !validateTelegramChatId(chatId)) fail(400, 'Chat ID ไม่ถูกต้อง');
  if (enabled && (!token || !chatId)) fail(400, 'กรุณาตั้ง Bot Token และ Chat ID ก่อนเปิดใช้งาน');

  const { error: saveError } = await db.from('restart_event_telegram_settings').upsert({
    event_id: eventId,
    enabled,
    bot_token: token || null,
    chat_id: chatId || null,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'event_id' });
  if (saveError) fail(503, 'บันทึกการตั้งค่า Telegram ไม่สำเร็จ');

  const flags = { ...((event.feature_flags || {}) as Record<string, unknown>), notifications: enabled };
  const { error: flagError } = await db.from('restart_events').update({ feature_flags: flags }).eq('id', eventId);
  if (flagError) fail(503, 'อัปเดตสถานะการแจ้งเตือนไม่สำเร็จ');

  return json({ ok: true, enabled, chat_id: chatId, has_bot_token: !!token }, 200, origin);
}

async function telegramTest(req: Request, origin: string) {
  await requireAdmin(req);
  const body = await req.json();
  const eventId = text(body.event_id);
  if (!eventId) fail(400, 'ไม่พบ Event');
  const { data: event, error: eventError } = await db.from('restart_events').select('id,name').eq('id', eventId).single();
  if (eventError || !event) fail(404, 'ไม่พบ Event');
  const setting = await getTelegramSetting(eventId);
  const token = text(setting?.bot_token), chatId = text(setting?.chat_id);
  if (!token || !chatId) fail(400, 'กรุณาบันทึก Bot Token และ Chat ID ก่อนทดสอบ');
  try {
    await sendTelegramMessage(token, chatId,
      '✅ <b>RESTART Telegram Test</b>\n' +
      'Event: <b>' + telegramEscape(event.name) + '</b>\n' +
      'เชื่อมต่อ Telegram สำเร็จ');
  } catch (error) {
    fail(502, 'Telegram ส่งไม่สำเร็จ: ' + text(error instanceof Error ? error.message : error));
  }
  return json({ ok: true }, 200, origin);
}

async function notifyNewRegistration(args: {
  event: Record<string, unknown>;
  flags: Record<string, unknown>;
  code: string;
  runners: Array<Record<string, unknown>>;
  category: Record<string, unknown> | null;
  pkg: Record<string, unknown> | null;
  total: number;
  paymentMode: string;
  firstDue: number;
  slipPath: string | null;
  merchandise?: Array<Record<string, unknown>>;
}) {
  if (!asBool(args.flags, 'notifications', false)) return;
  const eventId = text(args.event.id);
  const setting = await getTelegramSetting(eventId);
  if (!setting?.enabled) return;
  const token = text(setting.bot_token), chatId = text(setting.chat_id);
  if (!token || !chatId) return;

  const names = args.runners.map((r, i) =>
    (i + 1) + '. ' + telegramEscape(text(r.first_name) + ' ' + text(r.last_name))
  ).join('\n');
  const categoryName = displayLabel(args.category?.name) || '-';
  const packageName = displayLabel(args.pkg?.name) || '-';
  const paymentText = args.paymentMode === 'INSTALLMENT' ? 'ผ่อนชำระ' : 'ชำระเต็มจำนวน';
  const merchLines=(args.merchandise||[]).map(m =>
    '• '+telegramEscape(displayLabel(m.product_name_snapshot)||text(m.product_code_snapshot)||'เสื้อ')+
    ' · '+telegramEscape(text(m.size_label_snapshot))+' × '+Number(m.qty||0)
  ).join('\n');
  const now = new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date());

  const message =
    '🔔 <b>มีผู้สมัครใหม่</b>\n' +
    '🏁 <b>Event:</b> ' + telegramEscape(args.event.name) + '\n' +
    '🎟 <b>รหัสสมัคร:</b> <code>' + telegramEscape(args.code) + '</code>\n\n' +
    '👤 <b>ผู้สมัคร</b>\n' + names + '\n\n' +
    '🏷 <b>รุ่น:</b> ' + telegramEscape(categoryName) + '\n' +
    '📦 <b>Package:</b> ' + telegramEscape(packageName) + '\n' +
    '💰 <b>ยอดรวม:</b> ฿' + moneyTHB(args.total) + '\n' +
    (merchLines ? '👕 <b>เสื้อซื้อเพิ่ม</b>\n' + merchLines + '\n' : '') +
    '💳 <b>การชำระ:</b> ' + paymentText + '\n' +
    '🧾 <b>ยอดงวดแรก:</b> ฿' + moneyTHB(args.firstDue) + '\n' +
    '📎 <b>สลิป:</b> ' + (args.slipPath ? 'แนบแล้ว · รอตรวจสอบ' : 'ไม่มีสลิป') + '\n' +
    '🕒 ' + telegramEscape(now);
  await sendTelegramMessage(token, chatId, message);
}

async function limit(req: Request, action: string, maximum = 12) {
  const ip = (req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  try {
    const bytes = new TextEncoder().encode(ip);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const key = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
    const { data, error } = await db.rpc('rrih_limit_request', { p_action: 'restart:' + action, p_key: key, p_limit: maximum });
    if (!error && data === false) fail(429, 'มีการส่งคำขอหลายครั้ง กรุณารอสักครู่แล้วลองใหม่');
  } catch (error) {
    if (error instanceof ApiError) throw error;
  }
}

async function loadEvent(slug: string, allowDraft = false) {
  if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(slug)) fail(400, 'Event ไม่ถูกต้อง');
  let q = db.from('restart_events').select('*').eq('slug', slug);
  if (!allowDraft) q = q.in('status', ['PUBLISHED', 'OPEN', 'CLOSED']);
  const { data, error } = await q.single();
  if (error || !data) fail(404, 'ไม่พบ Event');
  return data as Record<string, unknown>;
}

async function publicConfig(slug: string) {
  const event = await loadEvent(slug);
  const eventId = String(event.id);
  const [sections, fields, categories, packages, methods, plans, translations, media] = await Promise.all([
    db.from('restart_form_sections').select('*').eq('event_id', eventId).eq('is_active', true).order('sort_order'),
    db.from('restart_form_fields').select('*').eq('event_id', eventId).eq('is_active', true).order('sort_order'),
    db.from('restart_race_categories').select('*').eq('event_id', eventId).eq('is_active', true).order('sort_order'),
    db.from('restart_packages').select('*').eq('event_id', eventId).eq('is_active', true).order('sort_order'),
    db.from('restart_payment_methods').select('*').eq('event_id', eventId).eq('is_enabled', true).order('sort_order'),
    db.from('restart_installment_plans').select('*').eq('event_id', eventId).eq('is_active', true).order('priority', { ascending: false }),
    db.from('restart_event_translations').select('language,name,description,location_name').eq('event_id', eventId),
    db.from('restart_event_media').select('id,media_type,url,alt_text,sort_order').eq('event_id', eventId).eq('is_active', true).order('sort_order'),
  ]);
  for (const result of [sections, fields, categories, packages, methods, plans, translations, media]) if (result.error) fail(503, 'โหลดการตั้งค่า Event ไม่สำเร็จ');
  const planIds = (plans.data || []).map(p => p.id);
  const steps = planIds.length
    ? await db.from('restart_installment_steps').select('*').in('plan_id', planIds).order('installment_no')
    : { data: [], error: null };
  if (steps.error) fail(503, 'โหลดแผนผ่อนไม่สำเร็จ');

  return {
    event: {
      id: event.id, slug: event.slug, event_code: event.event_code, name: event.name,
      description: event.description, location_name: event.location_name,
      event_date_start: event.event_date_start, event_date_end: event.event_date_end,
      registration_opens_at: event.registration_opens_at, registration_closes_at: event.registration_closes_at,
      status: event.status, capacity: event.capacity, default_language: event.default_language,
      languages: event.languages, logo_url: event.logo_url, banner_url: event.banner_url,
      feature_flags: event.feature_flags, theme: event.theme,
    },
    sections: sections.data || [],
    fields: fields.data || [],
    categories: categories.data || [],
    packages: packages.data || [],
    payment_methods: methods.data || [],
    installment_plans: plans.data || [],
    installment_steps: steps.data || [],
    translations: translations.data || [],
    media: media.data || [],
    server_now: new Date().toISOString(),
  };
}

function isOpen(event: Record<string, unknown>) {
  if (event.status !== 'OPEN') return false;
  const now = Date.now();
  const opens = event.registration_opens_at ? new Date(String(event.registration_opens_at)).getTime() : null;
  const closes = event.registration_closes_at ? new Date(String(event.registration_closes_at)).getTime() : null;
  return (!opens || now >= opens) && (!closes || now <= closes);
}

function currentCategoryPrice(category: Record<string, unknown>, earlyBirdEnabled: boolean) {
  const base = Number(category.base_price_thb || 0);
  if (!earlyBirdEnabled || category.early_bird_price_thb == null) return base;
  const now = Date.now();
  const starts = category.early_bird_starts_at ? new Date(String(category.early_bird_starts_at)).getTime() : null;
  const ends = category.early_bird_ends_at ? new Date(String(category.early_bird_ends_at)).getTime() : null;
  if ((!starts || now >= starts) && (!ends || now <= ends)) return Number(category.early_bird_price_thb);
  return base;
}

function distributeSchedule(total: number, plan: Record<string, unknown>, steps: Array<Record<string, unknown>>) {
  const count = Math.max(2, Math.min(12, Number(plan.installment_count || 3)));
  const rows = Array.from({ length: count }, (_, i) => {
    const source = steps.find(s => Number(s.installment_no) === i + 1) || {};
    let mode = String(source.amount_mode || 'AUTO');
    let value = source.amount_value == null ? null : Number(source.amount_value);
    if (i === 0 && Number(plan.first_payment_thb || 0) > 0 && mode === 'AUTO') {
      mode = 'FIXED'; value = Number(plan.first_payment_thb);
    }
    return { installment_no: i + 1, mode, value, due_at: source.due_at || null, amount_due_thb: 0 };
  });
  let assigned = 0;
  let remainderIndex = -1;
  const autoIndexes: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.mode === 'FIXED') { r.amount_due_thb = Math.max(0, Math.round(Number(r.value || 0) * 100) / 100); assigned += r.amount_due_thb; }
    else if (r.mode === 'PERCENT') { r.amount_due_thb = Math.round(total * Math.max(0, Number(r.value || 0)) / 100 * 100) / 100; assigned += r.amount_due_thb; }
    else if (r.mode === 'REMAINDER' && remainderIndex < 0) remainderIndex = i;
    else autoIndexes.push(i);
  }
  if (assigned > total + 0.001) fail(400, 'แผนผ่อนมียอดรวมเกินราคาสมัคร');
  let remaining = Math.round((total - assigned) * 100) / 100;
  if (remainderIndex >= 0) {
    rows[remainderIndex].amount_due_thb = remaining;
    remaining = 0;
  } else if (autoIndexes.length) {
    const cents = Math.round(remaining * 100);
    const base = Math.floor(cents / autoIndexes.length);
    let left = cents - base * autoIndexes.length;
    autoIndexes.forEach((idx) => {
      rows[idx].amount_due_thb = (base + (left-- > 0 ? 1 : 0)) / 100;
    });
    remaining = 0;
  }
  if (Math.abs(remaining) > 0.001) rows[rows.length - 1].amount_due_thb += remaining;
  const check = Math.round(rows.reduce((n, r) => n + r.amount_due_thb, 0) * 100) / 100;
  if (Math.abs(check - total) > 0.001) fail(400, 'แผนผ่อนคำนวณยอดไม่ครบ');
  if (rows.some(r => r.amount_due_thb < 0)) fail(400, 'แผนผ่อนไม่ถูกต้อง');
  return rows.map(r => ({ installment_no: r.installment_no, amount_due_thb: r.amount_due_thb, due_at: r.due_at }));
}

async function checkedSlip(form: FormData, required: boolean) {
  const file = form.get('slip');
  if (!(file instanceof File)) {
    if (required) fail(400, 'กรุณาแนบสลิปชำระเงิน');
    return null;
  }
  const permitted: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf',
  };
  const ext = permitted[file.type];
  if (!ext || file.size < 100 || file.size > 10 * 1024 * 1024) fail(400, 'สลิปต้องเป็น JPG, PNG, WEBP หรือ PDF ขนาดไม่เกิน 10 MB');
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const bytes = (a: number[]) => a.every((v, i) => head[i] === v);
  const valid = ext === 'jpg' ? bytes([0xff, 0xd8, 0xff]) :
    ext === 'png' ? bytes([0x89, 0x50, 0x4e, 0x47]) :
    ext === 'pdf' ? bytes([0x25, 0x50, 0x44, 0x46]) :
    bytes([0x52, 0x49, 0x46, 0x46]) && head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50;
  if (!valid) fail(400, 'ชนิดไฟล์สลิปไม่ตรงกับเนื้อไฟล์');
  return { file, ext };
}

async function uploadSlip(file: File, ext: string, eventId: string) {
  const path = eventId + '/' + new Date().getUTCFullYear() + '/' + crypto.randomUUID() + '.' + ext;
  const { error } = await db.storage.from('restart-slips').upload(path, file, { contentType: file.type, upsert: false, cacheControl: '0' });
  if (error) fail(503, 'อัปโหลดสลิปไม่สำเร็จ');
  return path;
}

async function register(req: Request, origin: string) {
  await limit(req, 'register', 6);
  const form = await req.formData();
  const raw = String(form.get('data') || '');
  if (!raw || raw.length > 150000) fail(400, 'ข้อมูลใบสมัครไม่ถูกต้อง');
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { fail(400, 'รูปแบบใบสมัครไม่ถูกต้อง'); }

  const event = await loadEvent(text(body.event_slug));
  if (!isOpen(event)) fail(409, 'Event นี้ยังไม่เปิดรับสมัครหรือปิดรับสมัครแล้ว');
  const eventId = String(event.id);
  const flags = (event.feature_flags || {}) as Record<string, unknown>;

  let category: Record<string, unknown> | null = null;
  let categoryRows: Array<Record<string, unknown>> = [];
  const categoryId = text(body.category_id);
  if (asBool(flags, 'competition_categories', true)) {
    const categoryQuery = await db.from('restart_race_categories').select('*')
      .eq('event_id', eventId).eq('is_active', true).order('sort_order');
    if (categoryQuery.error) fail(503, 'โหลดรุ่นการแข่งขันไม่สำเร็จ');
    categoryRows = (categoryQuery.data || []) as Array<Record<string, unknown>>;
    if (categoryRows.length) {
      category = categoryRows.find(c => c.id === categoryId) || null;
      if (!category && !asBool(flags, 'auto_category', false)) fail(400, 'กรุณาเลือกรุ่นการแข่งขัน');
    }
  }

  let pkg: Record<string, unknown> | null = null;
  const packageId = text(body.package_id);
  if (asBool(flags, 'packages', true)) {
    const { data: packages } = await db.from('restart_packages').select('*').eq('event_id', eventId).eq('is_active', true);
    if ((packages || []).length) {
      pkg = (packages || []).find(p => p.id === packageId) || null;
      if (!pkg) fail(400, 'กรุณาเลือก Package');
    }
  }

  let total = 0;

  const runners = Array.isArray(body.runners) ? body.runners as Array<Record<string, unknown>> : [];
  const runnerCount = pkg ? Number(pkg.runner_count || 1) : 1;
  if (runners.length !== runnerCount) fail(400, 'จำนวนผู้สมัครไม่ตรงกับ Package');

  const { data: requiredFields, error: fieldError } = await db.from('restart_form_fields')
    .select('field_key,is_required').eq('event_id', eventId).eq('is_active', true).eq('is_required', true);
  if (fieldError) fail(503, 'ตรวจแบบฟอร์มไม่สำเร็จ');
  const ids: string[] = [];
  const cleanedRunners: Array<Record<string, unknown>> = [];
  for (let i = 0; i < runners.length; i++) {
    const r = runners[i];
    const answers = (r.answers && typeof r.answers === 'object') ? r.answers as Record<string, unknown> : {};
    for (const field of requiredFields || []) {
      const value = answers[field.field_key];
      if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) fail(400, 'กรุณากรอกข้อมูลผู้สมัครให้ครบ');
    }
    const firstName = text(answers.first_name), lastName = text(answers.last_name), idDocument = text(answers.id_document);
    const idNormalized = normalizeId(idDocument);
    if (!firstName || !lastName || idNormalized.length < 5 || idNormalized.length > 30) fail(400, 'ชื่อหรือเลขบัตร/Passport ไม่ถูกต้อง');
    if (ids.includes(idNormalized)) fail(400, 'เลขบัตร/Passport ผู้แข่งขันซ้ำกัน');
    ids.push(idNormalized);

    const beneficiaries = Array.isArray(r.beneficiaries) ? r.beneficiaries as Array<Record<string, unknown>> : [];
    if (asBool(flags, 'insurance', true)) {
      if (!beneficiaries.length) fail(400, 'กรุณาระบุผู้รับผลประโยชน์');
      let totalPct = 0;
      const beneIds = new Set<string>();
      for (const b of beneficiaries) {
        const beneId = normalizeId(b.id_document);
        const pct = Number(b.percentage);
        if (!text(b.full_name) || !text(b.relationship) || beneId.length < 5 || ids.includes(beneId) || beneIds.has(beneId) || !(pct > 0 && pct <= 100)) fail(400, 'ข้อมูลผู้รับผลประโยชน์ไม่ถูกต้องหรือเลขซ้ำ');
        beneIds.add(beneId);
        totalPct += Math.round(pct * 100);
      }
      if (asBool(flags, 'beneficiary_total_100', true) && totalPct !== 10000) fail(400, 'ผู้รับผลประโยชน์ของแต่ละผู้แข่งขันต้องรวม 100%');
    }
    cleanedRunners.push({
      runner_index: i + 1,
      first_name: firstName, last_name: lastName, id_document: idDocument, id_normalized: idNormalized,
      phone: text(answers.phone), birth_date: text(answers.birth_date) || null, gender: text(answers.gender) || null,
      shirt_size: text(answers.shirt_size) || null, blood_group: text(answers.blood_group) || null,
      answers, beneficiaries,
    });
  }


  const ageOn = (birth: string, eventDate: string) => {
    const b = new Date(birth + 'T00:00:00Z');
    const d = new Date(eventDate + 'T00:00:00Z');
    if (Number.isNaN(b.getTime()) || Number.isNaN(d.getTime())) return null;
    let age = d.getUTCFullYear() - b.getUTCFullYear();
    const m = d.getUTCMonth() - b.getUTCMonth();
    if (m < 0 || (m === 0 && d.getUTCDate() < b.getUTCDate())) age--;
    return age;
  };
  const normalizedGender = (value: unknown) => {
    const v = text(value).toUpperCase();
    if (['M','MALE','MAN','ชาย','ผู้ชาย'].includes(v)) return 'MALE';
    if (['F','FEMALE','WOMAN','หญิง','ผู้หญิง'].includes(v)) return 'FEMALE';
    return v;
  };
  const runnerEligible = (runner: Record<string, unknown>, cat: Record<string, unknown>) => {
    const answers = runner.answers as Record<string, unknown>;
    if (cat.min_age != null || cat.max_age != null) {
      const birth = text(answers.birth_date);
      const eventDate = text(event.event_date_start);
      if (!birth || !eventDate) return false;
      const age = ageOn(birth, eventDate);
      if (age == null || (cat.min_age != null && age < Number(cat.min_age)) ||
          (cat.max_age != null && age > Number(cat.max_age))) return false;
    }
    const rule = String(cat.gender_rule || 'ANY');
    if (rule === 'MALE' || rule === 'FEMALE') {
      if (normalizedGender(answers.gender) !== rule) return false;
    }
    return true;
  };

  if (categoryRows.length) {
    if (!category && asBool(flags, 'auto_category', false)) {
      const matches = categoryRows.filter(c => cleanedRunners.every(r => runnerEligible(r, c)));
      if (!matches.length) fail(400, 'ไม่พบรุ่นการแข่งขันที่ตรงกับอายุ/เพศของผู้สมัคร');
      category = matches[0];
    }
    if (category && !cleanedRunners.every(r => runnerEligible(r, category!))) {
      fail(400, 'อายุหรือเพศของผู้สมัครไม่ตรงกับรุ่นการแข่งขันที่เลือก');
    }
  }

  if (pkg?.category_id && (!category || pkg.category_id !== category.id)) {
    fail(400, 'Package นี้ไม่ตรงกับรุ่นการแข่งขัน');
  }

  const categoryPrice = category ? currentCategoryPrice(category, asBool(flags, 'early_bird', false)) : 0;
  total = pkg
    ? (pkg.price_mode === 'OVERRIDE' ? Number(pkg.price_value_thb || 0) : categoryPrice + Number(pkg.price_value_thb || 0))
    : categoryPrice;
  if (!Number.isFinite(total) || total < 0) fail(400, 'ราคาสมัครไม่ถูกต้อง');

  if (ids.length) {
    const existing = await db.from('restart_participants').select('id_normalized').eq('event_id', eventId).in('id_normalized', ids);
    if (existing.error) fail(503, 'ตรวจสอบผู้สมัครเดิมไม่สำเร็จ');
    if ((existing.data || []).length) fail(409, 'เลขบัตรหรือ Passport นี้สมัคร Event นี้แล้ว');
  }

  const paymentMode = text(body.payment_mode || 'FULL');
  let schedule: Array<Record<string, unknown>>;
  if (paymentMode === 'FULL') {
    if (!asBool(flags, 'full_payment', true)) fail(400, 'Event นี้ไม่เปิดชำระเต็มจำนวน');
    schedule = [{ installment_no: 1, amount_due_thb: total, due_at: new Date().toISOString() }];
  } else if (paymentMode === 'INSTALLMENT') {
    if (!asBool(flags, 'installments', false) || category?.installment_enabled === false) fail(400, 'Event หรือรุ่นนี้ไม่เปิดผ่อนชำระ');
    const { data: plans, error: planError } = await db.from('restart_installment_plans').select('*').eq('event_id', eventId).eq('is_active', true).order('priority', { ascending: false });
    if (planError || !plans?.length) fail(400, 'ยังไม่ได้ตั้งค่าแผนผ่อน');
    const matching = plans.filter(p =>
      (!p.category_id || p.category_id === category?.id) &&
      (!p.package_id || p.package_id === pkg?.id)
    ).sort((a, b) => {
      const specA = Number(!!a.category_id) + Number(!!a.package_id);
      const specB = Number(!!b.category_id) + Number(!!b.package_id);
      return specB - specA || Number(b.priority || 0) - Number(a.priority || 0);
    });
    const plan = matching[0];
    if (!plan) fail(400, 'ไม่มีแผนผ่อนสำหรับรุ่น/Package นี้');
    const { data: steps, error: stepError } = await db.from('restart_installment_steps').select('*').eq('plan_id', plan.id).order('installment_no');
    if (stepError) fail(503, 'โหลดแผนผ่อนไม่สำเร็จ');
    schedule = distributeSchedule(total, plan, (steps || []) as Array<Record<string, unknown>>);
  } else fail(400, 'รูปแบบการชำระเงินไม่ถูกต้อง');

  const firstDue = Number(schedule[0]?.amount_due_thb || 0);
  if (Number(body.amount_confirmed_thb) !== firstDue) fail(409, 'ยอดชำระเปลี่ยนแล้ว กรุณารีเฟรชหน้าและตรวจยอดอีกครั้ง');

  const slipRequired = total > 0 && asBool(flags, 'slip_upload', true);
  const checked = await checkedSlip(form, slipRequired);
  let slipPath: string | null = null;
  if (checked) slipPath = await uploadSlip(checked.file, checked.ext, eventId);

  const random = crypto.getRandomValues(new Uint8Array(4));
  const suffix = Array.from(random).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  const code = 'RST-' + new Date().toISOString().slice(2,10).replaceAll('-', '') + '-' + suffix;
  const payload = {
    event_id: eventId,
    category_id: category?.id || null,
    package_id: pkg?.id || null,
    registration_code: code,
    language: text(body.language || event.default_language || 'th'),
    payment_mode: paymentMode,
    total_amount_thb: total,
    runners: cleanedRunners,
    schedule,
    slip_path: slipPath,
  };
  const { data: created, error: createError } = await db.rpc('restart_create_registration', { p_payload: payload });
  if (createError) {
    if (slipPath) await db.storage.from('restart-slips').remove([slipPath]);
    if (createError.code === '23505') fail(409, 'เลขบัตรหรือ Passport นี้สมัคร Event นี้แล้ว');
    console.error(createError);
    fail(503, 'บันทึกใบสมัครไม่สำเร็จ กรุณาลองใหม่');
  }
  try {
    await notifyNewRegistration({
      event, flags, code, runners: cleanedRunners, category, pkg,
      total, paymentMode, firstDue, slipPath,
    });
  } catch (notifyError) {
    console.error('Telegram new-registration notification failed', notifyError);
  }
  return json({ ...created, total_amount_thb: total, first_payment_thb: firstDue, schedule }, 201, origin);
}


const masked = (value: unknown) => {
  const chars = [...text(value)];
  return chars.length ? chars[0] + '•'.repeat(Math.min(3, Math.max(0, chars.length - 1))) : '';
};

async function registrationLookup(req: Request, origin: string) {
  await limit(req, 'lookup', 10);
  const body = await req.json();
  const event = await loadEvent(text(body.event_slug));
  const eventId = String(event.id);
  const id = normalizeId(body.id_document);
  const code = text(body.registration_code).toUpperCase();
  if (id.length < 5 || !code) fail(400, 'กรุณาระบุเลขบัตร/Passport และรหัสสมัคร');

  const participant = await db.from('restart_participants')
    .select('registration_id,first_name,last_name')
    .eq('event_id', eventId).eq('id_normalized', id).limit(1);
  if (participant.error || !participant.data?.length) fail(404, 'ไม่พบใบสมัคร');

  const reg = await db.from('restart_registrations').select('*')
    .eq('id', participant.data[0].registration_id).eq('registration_code', code).single();
  if (reg.error || !reg.data) fail(404, 'ไม่พบใบสมัคร');

  const schedules = await db.from('restart_payment_schedule').select('*')
    .eq('registration_id', reg.data.id).order('installment_no');
  if (schedules.error) fail(503, 'อ่านสถานะการชำระไม่สำเร็จ');

  const rows = schedules.data || [];
  const next = rows.find(s => !['PAID','WAIVED'].includes(s.status));
  return json({
    registration_code: reg.data.registration_code,
    participant_name: masked(participant.data[0].first_name) + ' ' + masked(participant.data[0].last_name),
    total_amount_thb: reg.data.total_amount_thb,
    registration_status: reg.data.status,
    payment_mode: reg.data.payment_mode,
    schedules: rows.map(s => ({
      id:s.id, installment_no:s.installment_no, amount_due_thb:s.amount_due_thb,
      due_at:s.due_at, status:s.status
    })),
    next_schedule_id: next?.id || null,
    can_submit: !!next && next.status !== 'PENDING_REVIEW',
    event_slug: event.slug,
  }, 200, origin);
}

async function fullSystemRpc(req: Request, origin: string, action: string) {
  const limits: Record<string, number> = {
    'create-registration': 6,
    'join-waitlist': 6,
    'next-payment-lookup': 10,
    'next-payment-submit': 8,
    'manage-lookup': 10,
    'manage-action': 8,
    'price-quote': 20,
    'store-quote': 20,
    'store-create-order': 6,
    'store-lookup': 12,
    'store-submit-payment': 8,
    'member-complete-signup': 5,
  };
  await limit(req, action, limits[action] || 8);
  const body = await req.json();
  let result: { data: any; error: any };

  if (action === 'store-quote') {
    const member = await optionalMember(req);
    const payload = { ...(body || {}) };
    delete payload.member_user_id;
    if (member) payload.member_user_id = member.id;
    result = await db.rpc('restart_store_quote', {
      p_payload: payload,
    });
  } else if (action === 'store-create-order') {
    const member = await optionalMember(req);
    const payload = { ...(body?.payload || {}) };
    delete payload.member_user_id;
    if (member) payload.member_user_id = member.id;
    result = await db.rpc('restart_create_store_order', {
      p_payload: payload,
    });
    if (!result.error && member && result.data?.id) {
      await db.from('restart_store_orders').update({
        member_user_id: member.id,
        updated_at: new Date().toISOString(),
      }).eq('id', result.data.id);
    }
  } else if (action === 'store-lookup') {
    result = await db.rpc('restart_lookup_store_order', {
      p_event_slug: text(body.event_slug),
      p_store_slug: text(body.store_slug),
      p_order_code: text(body.order_code),
      p_phone: text(body.phone),
    });
  } else if (action === 'store-submit-payment') {
    result = await db.rpc('restart_submit_store_payment', {
      p_event_slug: text(body.event_slug),
      p_store_slug: text(body.store_slug),
      p_order_code: text(body.order_code),
      p_phone: text(body.phone),
      p_slip_path: text(body.slip_path),
    });
  } else if (action === 'price-quote') {
    const q = body || {};
    result = await db.rpc('restart_price_quote', {
      p_event_id: text(q.event_id),
      p_category_id: text(q.category_id) || null,
      p_package_id: text(q.package_id) || null,
      p_registration_type: text(q.registration_type || 'SINGLE'),
      p_runner_count: Number(q.runner_count || 1),
      p_discount_code: text(q.discount_code) || null,
      p_runners: Array.isArray(q.runners) ? q.runners : [],
    });
  } else if (action === 'create-registration') {
    const member = await requireMember(req);
    const payload = { ...(body.payload || {}) };
    delete payload.member_user_id;
    result = await db.rpc('restart_create_registration', { p_payload: payload });
    if (!result.error && result.data?.id) {
      const memberRunnerIndex = Math.max(1, Number(payload.member_runner_index || payload.contact_runner_index || 1));
      const linked = await db.from('restart_registrations').update({
        member_user_id: member.id,
        member_runner_index: memberRunnerIndex,
        updated_at: new Date().toISOString(),
      }).eq('id', result.data.id).select('id').maybeSingle();
      if (linked.error || !linked.data) {
        fail(503, 'เชื่อมใบสมัครกับสมาชิกไม่สำเร็จ');
      }
    }
  } else if (action === 'join-waitlist') {
    result = await db.rpc('restart_join_waitlist', { p_payload: body.payload || {} });
  } else if (action === 'next-payment-lookup') {
    result = await db.rpc('restart_lookup_next_payment', {
      p_event_slug: text(body.event_slug),
      p_id_document: text(body.id_document),
    });
  } else if (action === 'next-payment-submit') {
    result = await db.rpc('restart_submit_next_payment_public', {
      p_event_slug: text(body.event_slug),
      p_id_document: text(body.id_document),
      p_slip_path: text(body.slip_path),
    });
  } else if (action === 'manage-lookup') {
    result = await db.rpc('restart_manage_registration_lookup', {
      p_event_slug: text(body.event_slug),
      p_registration_code: text(body.registration_code),
      p_id_document: text(body.id_document),
    });
  } else if (action === 'member-complete-signup') {
    return await completeMemberSignup(req, origin);
  } else if (action === 'manage-action') {
    result = await db.rpc('restart_manage_registration_action', {
      p_event_slug: text(body.event_slug),
      p_registration_code: text(body.registration_code),
      p_id_document: text(body.id_document),
      p_action: text(body.manage_action),
      p_payload: body.payload || {},
    });
  } else {
    fail(404, 'ไม่พบคำสั่ง');
  }

  if (result.error) {
    const slipPath = action === 'create-registration'
      ? text(body?.payload?.slip_path)
      : action === 'store-create-order'
        ? text(body?.payload?.slip_path)
        : action === 'next-payment-submit' || action === 'store-submit-payment'
          ? text(body?.slip_path)
          : '';
    if (slipPath) await db.storage.from('restart-slips').remove([slipPath]).catch(() => {});
    const knownStatus = /NOT_FOUND|DISABLED|REQUIRED|INVALID|MISMATCH|EXCEEDED|CLOSED|NOT_OPEN|ALREADY|WRONG|DUPLICATE|FULL|WAITLIST|ELIGIBLE|PAID|PENDING|LIMIT|SHIRT|STORE|PICKUP|DELIVERY/.test(text(result.error.message)) ? 409 : 400;
    fail(knownStatus, text(result.error.message || 'ทำรายการไม่สำเร็จ'));
  }
  if (action === 'create-registration' && result.data?.id && result.data?.registration_code) {
    try {
      await notifyRegistrationRecord(text(result.data.id), text(result.data.registration_code).toUpperCase());
    } catch (notifyError) {
      console.error('Telegram post-registration notification failed', notifyError);
    }
  }
  return json(result.data, action === 'create-registration' ? 201 : 200, origin);
}

async function publicSlipUpload(req: Request, origin: string) {
  await limit(req, 'upload-slip', 8);
  const form = await req.formData();
  const event = await loadEvent(text(form.get('event_slug')));
  const checked = await checkedSlip(form, true);
  const path = await uploadSlip(checked!.file, checked!.ext, String(event.id));
  return json({ path }, 201, origin);
}

async function notifyRegistrationRecord(registrationId: string, registrationCode: string) {
  if (!registrationId || !registrationCode) throw new ApiError(400, 'ข้อมูลแจ้งเตือนไม่ครบ');

  const { data: reg, error: regError } = await db.from('restart_registrations')
    .select('*').eq('id', registrationId).eq('registration_code', registrationCode).maybeSingle();
  if (regError || !reg) throw new ApiError(404, 'ไม่พบใบสมัคร');

  const { data: event, error: eventError } = await db.from('restart_events')
    .select('id,name,feature_flags').eq('id', reg.event_id).single();
  if (eventError || !event) throw new ApiError(404, 'ไม่พบ Event');
  const flags = (event.feature_flags || {}) as Record<string, unknown>;
  if (!asBool(flags, 'notifications', false)) return { ok: true, skipped: true };

  const claimed = await db.from('restart_registrations')
    .update({ notified_at: new Date().toISOString() })
    .eq('id', registrationId).is('notified_at', null).select('id').maybeSingle();
  if (claimed.error) throw new ApiError(503, 'ล็อกการแจ้งเตือนไม่สำเร็จ');
  if (!claimed.data) return { ok: true, already_sent: true };

  try {
    const [participants, category, pkg, schedules, merchandise] = await Promise.all([
      db.from('restart_participants').select('first_name,last_name').eq('registration_id', registrationId).order('runner_index'),
      reg.category_id ? db.from('restart_race_categories').select('name').eq('id', reg.category_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      reg.package_id ? db.from('restart_packages').select('name').eq('id', reg.package_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      db.from('restart_payment_schedule').select('id,amount_due_thb').eq('registration_id', registrationId).order('installment_no').limit(1),
      db.from('restart_merch_order_items').select('product_name_snapshot,product_code_snapshot,size_label_snapshot,qty').eq('registration_id', registrationId).neq('status','CANCELLED').order('created_at'),
    ]);
    if (participants.error || category.error || pkg.error || schedules.error || merchandise.error) throw new Error('โหลดข้อมูลแจ้งเตือนไม่สำเร็จ');

    const firstScheduleId = schedules.data?.[0]?.id || null;
    const firstDue = Number(schedules.data?.[0]?.amount_due_thb || 0);
    let slipPath: string | null = null;
    if (firstScheduleId) {
      const attempt = await db.from('restart_payment_attempts')
        .select('slip_path').eq('schedule_id', firstScheduleId).order('submitted_at', { ascending: false }).limit(1).maybeSingle();
      if (!attempt.error) slipPath = text(attempt.data?.slip_path) || null;
    }

    await notifyNewRegistration({
      event, flags, code: reg.registration_code,
      runners: (participants.data || []) as Array<Record<string, unknown>>,
      category: category.data as Record<string, unknown> | null,
      pkg: pkg.data as Record<string, unknown> | null,
      total: Number(reg.total_amount_thb || 0),
      paymentMode: String(reg.payment_mode || 'FULL'),
      firstDue,
      slipPath,
      merchandise: (merchandise.data || []) as Array<Record<string, unknown>>,
    });
    return { ok: true };
  } catch (error) {
    await db.from('restart_registrations').update({ notified_at: null }).eq('id', registrationId);
    throw error;
  }
}

async function notifyRegistrationById(req: Request, origin: string) {
  await requireAdmin(req);
  const body = await req.json();
  const result = await notifyRegistrationRecord(text(body.registration_id), text(body.registration_code).toUpperCase());
  return json(result, 200, origin);
}

async function submitNextPayment(req: Request, origin: string) {
  await limit(req, 'submit-payment', 8);
  const form = await req.formData();
  const event = await loadEvent(text(form.get('event_slug')));
  const eventId = String(event.id);
  const id = normalizeId(form.get('id_document'));
  const code = text(form.get('registration_code')).toUpperCase();
  const scheduleId = text(form.get('schedule_id'));
  if (id.length < 5 || !code || !scheduleId) fail(400, 'ข้อมูลชำระงวดไม่ครบ');

  const participant = await db.from('restart_participants').select('registration_id')
    .eq('event_id', eventId).eq('id_normalized', id).limit(1);
  if (participant.error || !participant.data?.length) fail(404, 'ไม่พบใบสมัคร');

  const reg = await db.from('restart_registrations').select('id,registration_code')
    .eq('id', participant.data[0].registration_id).eq('registration_code', code).single();
  if (reg.error || !reg.data) fail(404, 'ไม่พบใบสมัคร');

  const schedule = await db.from('restart_payment_schedule').select('*')
    .eq('id', scheduleId).eq('registration_id', reg.data.id).single();
  if (schedule.error || !schedule.data) fail(404, 'ไม่พบงวดชำระ');
  if (schedule.data.status === 'PENDING_REVIEW') fail(409, 'งวดนี้มีสลิปรอตรวจอยู่แล้ว');
  if (['PAID','WAIVED'].includes(schedule.data.status)) fail(409, 'งวดนี้ชำระแล้ว');

  const checked = await checkedSlip(form, true);
  const path = await uploadSlip(checked!.file, checked!.ext, eventId);
  const result = await db.rpc('restart_submit_next_payment', {
    p_registration_id: reg.data.id,
    p_schedule_id: schedule.data.id,
    p_slip_path: path,
  });
  if (result.error) {
    await db.storage.from('restart-slips').remove([path]);
    const known: Record<string,string> = {
      WRONG_INSTALLMENT:'ต้องชำระงวดตามลำดับ',
      ALREADY_PENDING_REVIEW:'งวดนี้มีสลิปรอตรวจอยู่แล้ว',
      ALREADY_PAID:'งวดนี้ชำระแล้ว',
      NO_PAYMENT_DUE:'ชำระครบแล้ว',
    };
    fail(409, known[result.error.message] || 'ไม่สามารถส่งสลิปงวดนี้ได้');
  }
  return json(result.data, 201, origin);
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  if (origin && !allowedOrigins.has(origin) && !/^http:\/\/localhost:\d+$/.test(origin)) {
    return json({ error: 'Origin not allowed' }, 403, origin);
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || '';
  try {
    if (action === 'config' && req.method === 'GET') {
      await limit(req, action, 30);
      return json(await publicConfig(url.searchParams.get('slug') || ''), 200, origin);
    }
    if (action === 'register' && req.method === 'POST') return await register(req, origin);
    if (action === 'lookup' && req.method === 'POST') return await registrationLookup(req, origin);
    if (action === 'submit-payment' && req.method === 'POST') return await submitNextPayment(req, origin);
    if (action === 'notify-registration' && req.method === 'POST') return await notifyRegistrationById(req, origin);
    if (['price-quote','create-registration','join-waitlist','next-payment-lookup','next-payment-submit','manage-lookup','manage-action','store-quote','store-create-order','store-lookup','store-submit-payment','member-complete-signup'].includes(action) && req.method === 'POST') return await fullSystemRpc(req, origin, action);
    if (action === 'upload-slip' && req.method === 'POST') return await publicSlipUpload(req, origin);
    if (action === 'telegram-settings' && req.method === 'POST') return await telegramSettingsGet(req, origin);
    if (action === 'telegram-settings-save' && req.method === 'POST') return await telegramSettingsSave(req, origin);
    if (action === 'telegram-test' && req.method === 'POST') return await telegramTest(req, origin);
    fail(404, 'ไม่พบคำสั่ง');
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof ApiError ? error.message : 'ระบบขัดข้อง กรุณาลองใหม่';
    if (!(error instanceof ApiError)) console.error(error);
    return json({ error: message }, status, origin);
  }
});