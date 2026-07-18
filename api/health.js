export default function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  response.status(200).json({
    ok: true,
    service: 'trail-scan-admin',
    configured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
    time: new Date().toISOString()
  });
}
