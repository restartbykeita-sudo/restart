(() => {
  const cfg = window.TRAIL_SCAN_CONFIG;
  if (!cfg) throw new Error('ไม่พบ window.TRAIL_SCAN_CONFIG: ตรวจ assets/config.js และลำดับ script');
  const supabaseUrl = String(cfg.SUPABASE_URL || '').trim();
  const supabaseAnonKey = String(cfg.SUPABASE_ANON_KEY || '').trim();
  if (!supabaseUrl || !supabaseAnonKey) throw new Error('SUPABASE_URL หรือ SUPABASE_ANON_KEY ว่างใน assets/config.js');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(supabaseUrl)) throw new Error('รูปแบบ SUPABASE_URL ไม่ถูกต้อง');
  if (!window.supabase?.createClient) throw new Error('โหลด Supabase JavaScript Library ไม่สำเร็จ');
  const db = window.supabase.createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const App = {
    db, cfg, session:null, user:null, profile:null, access:null, orgs:[], activeOrg:null,
    esc(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')},
    fmt(v,time=true){if(!v)return '—';const d=new Date(v);if(Number.isNaN(d.getTime()))return String(v);return new Intl.DateTimeFormat('th-TH',time?{dateStyle:'medium',timeStyle:'short',timeZone:cfg.DEFAULT_TIMEZONE}:{dateStyle:'medium',timeZone:cfg.DEFAULT_TIMEZONE}).format(d)},
    time(v){if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat('th-TH',{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:cfg.DEFAULT_TIMEZONE}).format(d)},
    duration(seconds){if(seconds==null||Number.isNaN(Number(seconds)))return '—';seconds=Number(seconds);const h=Math.floor(seconds/3600),m=Math.floor((seconds%3600)/60),s=Math.floor(seconds%60);return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`},
    localInput(v){if(!v)return '';const d=new Date(v),o=d.getTimezoneOffset();return new Date(d.getTime()-o*60000).toISOString().slice(0,16)},
    iso(v){return v?new Date(v).toISOString():null},
    slug(v){return String(v||'').trim().toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g,'').replace(/[\s_]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'')||`event-${Date.now()}`},
    token(n=18){const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',b=crypto.getRandomValues(new Uint8Array(n));return Array.from(b,x=>c[x%c.length]).join('')},
    uuid(){return crypto.randomUUID()},
    toast(msg,type=''){let box=document.querySelector('.toastbox');if(!box){box=document.createElement('div');box.className='toastbox';document.body.append(box)}const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=msg;box.append(el);setTimeout(()=>el.remove(),3500)},
    loading(on){let el=document.getElementById('loading');if(on&&!el){el=document.createElement('div');el.id='loading';el.className='loading';el.innerHTML='<div class="spin"></div>';document.body.append(el)}if(!on)el?.remove()},
    async auth(required=true){const{data,error}=await db.auth.getSession();if(error)throw error;this.session=data.session;this.user=data.session?.user||null;if(required&&!this.user){location.replace(location.pathname.includes('/admin/')||location.pathname.includes('/scanner/')?'../login.html':'login.html');throw new Error('AUTH_REQUIRED')}return this.session},
    async ensureProfile(){if(!this.user)return null;const{data,error}=await db.rpc('ensure_my_profile');if(error){console.warn('ensure_my_profile:',error);return null}return data},
    async loadProfile(retries=4){if(!this.user)return null;for(let i=0;i<retries;i++){const{data,error}=await db.from('profiles').select('*').eq('id',this.user.id).maybeSingle();if(error)throw error;if(data){this.profile=data;return data}if(i===0)await this.ensureProfile();await new Promise(r=>setTimeout(r,450))}throw new Error('ไม่พบข้อมูล profiles ของบัญชีนี้ กรุณารัน SQL 006 แล้วสมัครหรือ Login ใหม่')},
    async loadAccess(){const{data,error}=await db.rpc('get_my_access_context');if(error){console.warn('get_my_access_context:',error);this.access={profile:this.profile||{},memberships:[],event_assignments:[],scan_assignments:[],pages:[]}}else this.access=data||{};return this.access},
    isApproved(){return this.profile?.approval_status==='APPROVED'&&this.profile?.is_active===true},
    pageAllowed(page){return this.profile?.platform_role==='SUPER_ADMIN'||(this.access?.pages||[]).includes(page)},
    firstAllowedPage(){const p=this.access?.pages||[];const order=['dashboard','scanner','results','events','runners'];return order.find(x=>p.includes(x))||p[0]||null},
    async init(options={}){await this.auth(true);await this.loadProfile();if(!options.allowPending&&!this.isApproved()){const prefix=location.pathname.includes('/admin/')||location.pathname.includes('/scanner/')?'../':'';location.replace(`${prefix}pending.html`);throw new Error('ACCOUNT_NOT_APPROVED')}if(this.isApproved()){await this.loadAccess();await this.loadOrgs()}return this},
    async routeAfterLogin(){await this.auth(true);await this.loadProfile();if(!this.isApproved()){location.replace('pending.html');return}await this.loadAccess();await this.loadOrgs();const first=this.firstAllowedPage();if(first==='scanner'&&(this.access?.pages||[]).length===1)location.replace('scanner/index.html');else location.replace(`admin/index.html#${first||'dashboard'}`)},
    async loadOrgs(){if(!this.user)return[];let rows=[];if(this.profile?.platform_role==='SUPER_ADMIN'){const{data,error}=await db.from('organizations').select('*').order('name');if(error)throw error;rows=data||[]}else{const{data:m,error}=await db.from('organization_members').select('organization_id,role_code,status').eq('user_id',this.user.id).eq('status','ACTIVE');if(error)throw error;const ids=[...new Set((m||[]).map(x=>x.organization_id))];if(ids.length){const{data,error:e}=await db.from('organizations').select('*').in('id',ids).order('name');if(e)throw e;rows=data||[]}}this.orgs=rows;const saved=localStorage.getItem('trail_org');this.activeOrg=rows.find(x=>x.id===saved)||rows[0]||null;if(this.activeOrg)localStorage.setItem('trail_org',this.activeOrg.id);return rows},
    async events(orgId=this.activeOrg?.id){if(!orgId)return[];const{data,error}=await db.from('events').select('*').eq('organization_id',orgId).order('race_date',{ascending:false});if(error)throw error;return data||[]},
    async logout(){await db.auth.signOut();localStorage.clear();location.replace(location.pathname.includes('/admin/')||location.pathname.includes('/scanner/')?'../login.html':'login.html')},
    download(name,text,type='text/plain;charset=utf-8'){const b=text instanceof Blob?text:new Blob([text],{type});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)},
    csv(v){return `"${String(v??'').replaceAll('"','""')}"`}
  };
  window.App=App;
  addEventListener('unhandledrejection',e=>{if(['AUTH_REQUIRED','ACCOUNT_NOT_APPROVED'].includes(e.reason?.message))return;console.error(e.reason);App.toast(e.reason?.message||'เกิดข้อผิดพลาด','error')});
})();
