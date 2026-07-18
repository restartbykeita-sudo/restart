export default function handler(request, response) {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

  response.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store, max-age=0');

  if (!supabaseUrl || !supabaseAnonKey) {
    response.status(503).send(`window.APP_CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
  CONFIG_ERROR: 'ยังไม่ได้ตั้งค่า SUPABASE_URL และ SUPABASE_ANON_KEY ใน Vercel'
};`);
    return;
  }

  response.status(200).send(`window.APP_CONFIG = ${JSON.stringify({
    SUPABASE_URL: supabaseUrl,
    SUPABASE_ANON_KEY: supabaseAnonKey
  })};`);
}
