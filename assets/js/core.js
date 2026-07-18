(() => {
  const cfg = window.TRAIL_SCAN_CONFIG;
  if (!cfg?.SUPABASE_URL || !cfg?.SUPABASE_ANON_KEY) {
    throw new Error('กรุณาใส่ SUPABASE_URL และ SUPABASE_ANON_KEY ใน assets/config.js');
  }
  if (!window.supabase?.createClient) throw new Error('โหลด Supabase Library ไม่สำเร็จ');
  const db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const App = {
    db, cfg, session:null, user:null, profile:null, orgs:[], activeOrg:null,
    esc(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')},
    fmt(v,time=true){if(!v)return '—';const d=new Date(v);if(Number.isNaN(d.getTime()))return String(v);return new Intl.DateTimeFormat('th-TH',time?{dateStyle:'medium',timeStyle:'short',timeZone:cfg.DEFAULT_TIMEZONE}:{dateStyle:'medium',timeZone:cfg.DEFAULT_TIMEZONE}).format(d)},
    localInput(v){if(!v)return '';const d=new Date(v),o=d.getTimezoneOffset();return new Date(d.getTime()-o*60000).toISOString().slice(0,16)},
    iso(v){return v?new Date(v).toISOString():null},
    slug(v){return String(v||'').trim().toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g,'').replace(/[\s_]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'')||`event-${Date.now()}`},
    token(n=18){const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',b=crypto.getRandomValues(new Uint8Array(n));return Array.from(b,x=>c[x%c.length]).join('')},
    uuid(){return crypto.randomUUID()},
    toast(msg,type=''){let box=document.querySelector('.toastbox');if(!box){box=document.createElement('div');box.className='toastbox';document.body.append(box)}const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=msg;box.append(el);setTimeout(()=>el.remove(),3500)},
    loading(on){let el=document.getElementById('loading');if(on&&!el){el=document.createElement('div');el.id='loading';el.className='loading';el.innerHTML='<div class="spin"></div>';document.body.append(el)}if(!on)el?.remove()},
    async auth(required=true){const{data,error}=await db.auth.getSession();if(error)throw error;this.session=data.session;this.user=data.session?.user||null;if(required&&!this.user){location.replace(location.pathname.includes('/admin/')||location.pathname.includes('/scanner/')?'../login.html':'login.html');throw new Error('AUTH_REQUIRED')}return this.session},
    async loadProfile(){if(!this.user)return;const{data}=await db.from('profiles').select('*').eq('id',this.user.id).maybeSingle();this.profile=data||{display_name:this.user.user_metadata?.display_name||this.user.email,platform_role:'USER'}},
    async loadOrgs(){if(!this.user)return[];let rows=[];if(this.profile?.platform_role==='SUPER_ADMIN'){const{data,error}=await db.from('organizations').select('*').order('name');if(error)throw error;rows=data||[]}else{const{data:m,error}=await db.from('organization_members').select('organization_id,role_code,status').eq('user_id',this.user.id).eq('status','ACTIVE');if(error)throw error;const ids=[...new Set((m||[]).map(x=>x.organization_id))];if(ids.length){const{data,error:e}=await db.from('organizations').select('*').in('id',ids).order('name');if(e)throw e;rows=data||[]}}this.orgs=rows;const saved=localStorage.getItem('trail_org');this.activeOrg=rows.find(x=>x.id===saved)||rows[0]||null;if(this.activeOrg)localStorage.setItem('trail_org',this.activeOrg.id);return rows},
    async init(){await this.auth(true);await this.loadProfile();await this.loadOrgs()},
    async events(orgId=this.activeOrg?.id){if(!orgId)return[];const{data,error}=await db.from('events').select('*').eq('organization_id',orgId).order('race_date',{ascending:false});if(error)throw error;return data||[]},
    async logout(){await db.auth.signOut();localStorage.clear();location.replace('../login.html')},
    download(name,text,type='text/plain;charset=utf-8'){const b=text instanceof Blob?text:new Blob([text],{type});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)},
    csv(v){return `"${String(v??'').replaceAll('"','""')}"`}
  };
  window.App=App;
  addEventListener('unhandledrejection',e=>{if(e.reason?.message==='AUTH_REQUIRED')return;console.error(e.reason);App.toast(e.reason?.message||'เกิดข้อผิดพลาด','error')});
})();
