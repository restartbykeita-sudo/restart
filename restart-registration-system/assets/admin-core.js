(() => {
  const cfg=window.RESTART_REG_CONFIG;
  if(!cfg) throw new Error('ไม่พบ RESTART_REG_CONFIG');
  if(!window.supabase?.createClient) throw new Error('โหลด Supabase ไม่สำเร็จ');
  const db=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_PUBLISHABLE_KEY,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
  });
  const App={
    db,cfg,user:null,session:null,
    esc(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;")},
    fmt(v){if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):new Intl.DateTimeFormat('th-TH',{dateStyle:'medium',timeStyle:'short',timeZone:cfg.DEFAULT_TIMEZONE}).format(d)},
    async init(){
      const {data,error}=await db.auth.getSession();
      if(error) throw error;
      this.session=data.session; this.user=data.session?.user||null;
      if(!this.user){location.replace('login.html');throw new Error('AUTH_REQUIRED')}
      const {data:ok,error:checkError}=await db.rpc('restart_admin_session_status');
      if(checkError) throw checkError;
      if(!ok){await db.auth.signOut();location.replace('login.html?denied=1');throw new Error('ADMIN_REQUIRED')}
      return this;
    },
    async logout(){await db.auth.signOut();location.replace('login.html')}
  };
  window.App=App;
})();
