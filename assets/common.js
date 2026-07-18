(() => {
  const cfg = window.APP_CONFIG || {};
  const configError = cfg.CONFIG_ERROR || (
    !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY
      ? 'ระบบยังไม่ได้ตั้งค่าการเชื่อมต่อ Supabase'
      : ''
  );

  function showFatal(message) {
    document.documentElement.lang = 'th';
    document.body.innerHTML = `
      <main style="max-width:680px;margin:64px auto;padding:24px;font-family:system-ui,sans-serif">
        <section style="border:1px solid #fecaca;background:#fff7f7;border-radius:16px;padding:24px">
          <h1 style="margin-top:0;color:#991b1b">เปิดระบบไม่ได้</h1>
          <p style="line-height:1.7">${String(message).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}</p>
          <p style="line-height:1.7;color:#475569">กรุณาตั้งค่า Environment Variables ชื่อ <strong>SUPABASE_URL</strong> และ <strong>SUPABASE_ANON_KEY</strong> แล้ว Redeploy เว็บไซต์</p>
        </section>
      </main>`;
  }

  if (configError) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => showFatal(configError), { once: true });
    } else {
      showFatal(configError);
    }
    return;
  }

  const client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce'
    }
  });

  function toast(message, type = '') {
    let wrap = document.querySelector('.toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'toast-wrap';
      document.body.appendChild(wrap);
    }
    const node = document.createElement('div');
    node.className = `toast ${type}`;
    node.textContent = message;
    wrap.appendChild(node);
    setTimeout(() => node.remove(), 4200);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function toIso(localValue) {
    if (!localValue) return null;
    const d = new Date(localValue);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  function toLocalInput(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  function dateTimeText(iso) {
    if (!iso) return '-';
    return new Intl.DateTimeFormat('th-TH', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok'
    }).format(new Date(iso));
  }

  async function requireSession() {
    const { data, error } = await client.auth.getSession();
    if (error || !data.session) {
      window.location.replace('/login.html');
      throw new Error('AUTH_REQUIRED');
    }
    return data.session;
  }

  async function signOut() {
    await client.auth.signOut();
    window.location.replace('/login.html');
  }

  window.TrailApp = {
    supabase: client,
    toast,
    escapeHtml,
    toIso,
    toLocalInput,
    dateTimeText,
    requireSession,
    signOut
  };
})();
