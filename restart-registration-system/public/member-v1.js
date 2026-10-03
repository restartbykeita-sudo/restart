(()=>{
const db=supabase.createClient(RESTART_REG_CONFIG.SUPABASE_URL,RESTART_REG_CONFIG.SUPABASE_PUBLISHABLE_KEY);
const app=document.getElementById('memberApp'),logoutBtn=document.getElementById('memberLogout');
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money=v=>Number(v||0).toLocaleString(RestartI18n.locale(),{maximumFractionDigits:2});
const fmtDate=v=>v?new Intl.DateTimeFormat(RestartI18n.locale(),{dateStyle:'medium'}).format(new Date(v+(String(v).length===10?'T00:00:00':''))):'—';
function ageFromBirth(v){if(!v)return'';const d=new Date(v+'T00:00:00'),n=new Date();let y=n.getFullYear()-d.getFullYear();const m=n.getMonth()-d.getMonth();if(m<0||(m===0&&n.getDate()<d.getDate()))y--;return Math.max(0,y)}
function api(action,body={}){
  return fetch(RESTART_REG_CONFIG.SUPABASE_URL+'/functions/v1/restart-registration-api?action='+encodeURIComponent(action),{
    method:'POST',headers:{'content-type':'application/json','apikey':RESTART_REG_CONFIG.SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify(body)
  }).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||('HTTP '+r.status));return d})
}
function normalizeMemberId(v){return String(v||'').trim().toUpperCase().replace(/[\s-]/g,'')}
function profileFields(prefix='',p={}){
  const id=x=>prefix+x;
  return '<div class="member-profile-grid">'+
    RestartI18n.t('<label>คำนำหน้า<select id="')+id('Title')+'" required><option value="">—</option><option value="mr" '+(p.title==='mr'?'selected':'')+RestartI18n.t('>นาย</option><option value="ms" ')+(p.title==='ms'?'selected':'')+RestartI18n.t('>นางสาว</option><option value="mrs" ')+(p.title==='mrs'?'selected':'')+RestartI18n.t('>นาง</option></select></label>')+
    RestartI18n.t('<label>ชื่อ<input id="')+id('First')+'" required value="'+esc(p.first_name||'')+'"></label>'+
    RestartI18n.t('<label>นามสกุล<input id="')+id('Last')+'" required value="'+esc(p.last_name||'')+'"></label>'+
    RestartI18n.t('<label class="wide">เลขบัตรประชาชน / Passport<input id="')+id('IdDocument')+'" type="text" minlength="6" maxlength="30" required autocomplete="off" spellcheck="false" value="'+esc(p.id_document||'')+RestartI18n.t('" placeholder="เลขบัตรประชาชน 13 หลัก หรือหมายเลข Passport"></label>')+
    RestartI18n.t('<label>วันเกิด<input id="')+id('Birth')+'" type="date" required value="'+esc(p.birth_date||'')+'"></label>'+
    RestartI18n.t('<label>อายุ<input id="')+id('Age')+'" readonly value="'+esc(p.birth_date?ageFromBirth(p.birth_date):'')+RestartI18n.t('" placeholder="คำนวณอัตโนมัติ"></label>')+
    RestartI18n.t('<label>เบอร์โทรศัพท์<input id="')+id('Phone')+'" type="tel" required value="'+esc(p.phone||'')+'"></label>'+
    RestartI18n.t('<label>กรุ๊ปเลือด<select id="')+id('Blood')+'" required><option value="">—</option>'+['A','B','AB','O','UNKNOWN'].map(x=>'<option value="'+x+'" '+(p.blood_group===x?'selected':'')+'>'+(x==='UNKNOWN'?RestartI18n.t('ไม่ทราบ'):x)+'</option>').join('')+'</select></label>'+
    RestartI18n.t('<label class="wide">ที่อยู่<textarea id="')+id('Address')+'" rows="3" required>'+esc(p.address||'')+'</textarea></label>'+
    RestartI18n.t('<label>ชื่อ-นามสกุลผู้ติดต่อฉุกเฉิน<input id="')+id('EmergencyName')+'" required value="'+esc(p.emergency_contact_name||'')+'"></label>'+
    RestartI18n.t('<label>เบอร์โทรฉุกเฉิน<input id="')+id('EmergencyPhone')+'" type="tel" required value="'+esc(p.emergency_phone||'')+'"></label>'+
    RestartI18n.t('<label>ความสัมพันธ์กับผู้ติดต่อฉุกเฉิน<input id="')+id('EmergencyRelation')+'" required value="'+esc(p.emergency_relation||'')+'"></label>'+
  '</div>'
}
function bindAge(prefix=''){const b=document.getElementById(prefix+'Birth'),a=document.getElementById(prefix+'Age');if(!b||!a)return;const run=()=>a.value=b.value?ageFromBirth(b.value):'';b.addEventListener('change',run);b.addEventListener('input',run);run()}
function collectProfile(prefix=''){
  const v=x=>document.getElementById(prefix+x)?.value?.trim()||'';
  return{title:v('Title'),first_name:v('First'),last_name:v('Last'),id_document:normalizeMemberId(v('IdDocument')),birth_date:v('Birth'),phone:v('Phone'),blood_group:v('Blood'),address:v('Address'),emergency_contact_name:v('EmergencyName'),emergency_phone:v('EmergencyPhone'),emergency_relation:v('EmergencyRelation')}
}
function validateProfile(p){
  for(const [k,v] of Object.entries(p))if(!v)throw new Error(RestartI18n.t('กรุณากรอกข้อมูลสมาชิกให้ครบ'));
  if(!/^[0-9A-Z]{6,30}$/.test(p.id_document))throw new Error(RestartI18n.t('เลขบัตรประชาชน / Passport ต้องมี 6–30 ตัวอักษร ใช้ตัวอักษรอังกฤษและตัวเลขเท่านั้น'));
  return p;
}
function returnUrl(){
  const q=new URLSearchParams(location.search).get('return');if(!q)return null;
  try{
    const target=new URL(q,location.href),base=new URL('./',location.href);
    return target.origin===location.origin&&target.pathname.startsWith(base.pathname)&&target.pathname!==location.pathname?target.href:null;
  }catch{return null}
}
function memberPageUrl(){return location.origin+location.pathname}
async function resendSignupEmail(email){
  if(!email)return;
  const{error}=await db.auth.resend({type:'signup',email,options:{emailRedirectTo:memberPageUrl()}});
  if(error)throw error;
  await Swal.fire({icon:'success',title:RestartI18n.t('ส่ง Email ยืนยันอีกครั้งแล้ว'),text:RestartI18n.t('กรุณาตรวจ Inbox และ Junk/Spam')})
}
async function forgotPassword(){
  const initial=document.getElementById('loginEmail')?.value?.trim()||'';
  const r=await Swal.fire({title:RestartI18n.t('ลืมรหัสผ่าน'),input:'email',inputLabel:RestartI18n.t('อีเมล'),inputValue:initial,inputPlaceholder:'name@example.com',showCancelButton:true,confirmButtonText:RestartI18n.t('ส่งลิงก์ตั้งรหัสใหม่'),preConfirm:v=>v.trim()||Swal.showValidationMessage(RestartI18n.t('กรุณากรอก Email'))});
  if(!r.isConfirmed)return;
  const redirectTo=memberPageUrl()+'?recovery=1';
  const{error}=await db.auth.resetPasswordForEmail(r.value.trim(),{redirectTo});
  if(error)return Swal.fire(RestartI18n.t('ส่ง Email ไม่สำเร็จ'),error.message,'error');
  Swal.fire({icon:'success',title:RestartI18n.t('ส่ง Email แล้ว'),text:RestartI18n.t('เปิดลิงก์ใน Email เพื่อตั้งรหัสผ่านใหม่')})
}
async function promptNewPassword(){
  const r=await Swal.fire({title:RestartI18n.t('ตั้งรหัสผ่านใหม่'),html:RestartI18n.t('<div style="text-align:left"><label>รหัสผ่านใหม่<input id="newPassword" type="password" minlength="8" class="swal2-input" style="margin:0" autocomplete="new-password"></label><label>ยืนยันรหัสผ่าน<input id="newPassword2" type="password" minlength="8" class="swal2-input" style="margin:0" autocomplete="new-password"></label></div>'),allowOutsideClick:false,allowEscapeKey:false,confirmButtonText:RestartI18n.t('บันทึกรหัสผ่าน'),preConfirm:()=>{const a=newPassword.value,b=newPassword2.value;if(a.length<8)return Swal.showValidationMessage(RestartI18n.t('รหัสผ่านต้องอย่างน้อย 8 ตัวอักษร'));if(a!==b)return Swal.showValidationMessage(RestartI18n.t('รหัสผ่านไม่ตรงกัน'));return a}});
  if(!r.isConfirmed)return;
  const{error}=await db.auth.updateUser({password:r.value});
  if(error)return Swal.fire(RestartI18n.t('เปลี่ยนรหัสผ่านไม่สำเร็จ'),error.message,'error');
  history.replaceState(null,'',memberPageUrl());
  await Swal.fire({icon:'success',title:RestartI18n.t('เปลี่ยนรหัสผ่านแล้ว')});
  const{data:{session}}=await db.auth.getSession();if(session?.user)renderMember(session.user);else renderAuth()
}
let memberUser=null,authTab='login';
async function renderAuth(){
  memberUser=null;
  document.getElementById('memberEventsLink').hidden=true;
  logoutBtn.hidden=true;
  app.innerHTML='<section class="member-auth-grid">'+
    RestartI18n.t('<div class="rr-card"><div class="member-login-tabs"><button id="tabLogin" class="btn soft active">เข้าสู่ระบบ</button><button id="tabSignup" class="btn soft">สมัครนักแข่งใหม่</button></div><div id="authPanel"></div></div>')+
  '</section>';
  const login=()=>{authTab='login';tabLogin.classList.add('active');tabSignup.classList.remove('active');authPanel.innerHTML=RestartI18n.t('<h2>เข้าสู่ระบบนักแข่ง</h2><label>อีเมล<input id="loginEmail" type="email" autocomplete="email"></label><label>รหัสผ่าน<input id="loginPassword" type="password" autocomplete="current-password"></label><button id="loginBtn" class="btn primary" style="width:100%;margin-top:12px">เข้าสู่ระบบ</button><button id="forgotBtn" class="btn soft" type="button" style="width:100%;margin-top:8px">ลืมรหัสผ่าน</button>');loginBtn.onclick=doLogin;forgotBtn.onclick=forgotPassword};
  const signup=()=>{authTab='signup';tabSignup.classList.add('active');tabLogin.classList.remove('active');authPanel.innerHTML=RestartI18n.t('<h2>สมัครบัญชีนักแข่ง</h2><div class="member-profile-grid"><label class="wide">อีเมล<input id="suEmail" type="email" required autocomplete="email"></label><label class="wide">รหัสผ่าน <small class="muted">อย่างน้อย 8 ตัวอักษร</small><input id="suPassword" type="password" minlength="8" required autocomplete="new-password"></label></div>')+profileFields('su')+RestartI18n.t('<button id="signupBtn" class="btn primary" style="width:100%;margin-top:14px">สมัครนักแข่ง</button>');bindAge('su');signupBtn.onclick=doSignup};
  tabLogin.onclick=login;tabSignup.onclick=signup;authTab==='signup'?signup():login()
}
async function doLogin(){
  const email=loginEmail.value.trim(),password=loginPassword.value;
  if(!email||!password)return Swal.fire(RestartI18n.t('กรอกข้อมูลไม่ครบ'),RestartI18n.t('กรุณากรอก Email และ Password'),'warning');
  Swal.fire({title:RestartI18n.t('กำลังเข้าสู่ระบบ…'),allowOutsideClick:false,didOpen:()=>Swal.showLoading()});
  const{data,error}=await db.auth.signInWithPassword({email,password});
  if(error){
    const msg=String(error.message||'');
    if(/email.*confirm|confirm.*email/i.test(msg)){
      const r=await Swal.fire({icon:'warning',title:RestartI18n.t('Email ยังไม่ได้ยืนยัน'),text:RestartI18n.t('กรุณายืนยัน Email ก่อนเข้าสู่ระบบ'),showDenyButton:true,denyButtonText:RestartI18n.t('ส่ง Email ยืนยันอีกครั้ง'),confirmButtonText:RestartI18n.t('ตกลง')});
      if(r.isDenied){try{await resendSignupEmail(email)}catch(e){Swal.fire(RestartI18n.t('ส่ง Email ไม่สำเร็จ'),e.message||String(e),'error')}}return
    }
    return Swal.fire(RestartI18n.t('เข้าสู่ระบบไม่สำเร็จ'),msg,'error')
  }
  const ret=returnUrl()||new URL('./',location.href).href;return location.replace(ret);
  Swal.close();renderMember(data.user)
}
async function doSignup(){
  try{
    const email=suEmail.value.trim(),password=suPassword.value,profile=validateProfile(collectProfile('su'));
    if(!email)throw new Error(RestartI18n.t('กรุณากรอก Email'));
    if(password.length<8)throw new Error(RestartI18n.t('Password ต้องอย่างน้อย 8 ตัวอักษร'));
    const token=crypto.randomUUID()+crypto.randomUUID().replaceAll('-','');
    Swal.fire({title:RestartI18n.t('กำลังสร้างบัญชี…'),allowOutsideClick:false,didOpen:()=>Swal.showLoading()});
    const redirectTo=location.origin+location.pathname;
    const{data,error}=await db.auth.signUp({email,password,options:{emailRedirectTo:redirectTo,data:{restart_signup_token:token}}});
    if(error)throw error;if(!data.user)throw new Error(RestartI18n.t('สร้างบัญชีไม่สำเร็จ'));
    const saved=await api('member-complete-signup',{user_id:data.user.id,signup_token:token,profile});
    if(data.session){
      const ret=returnUrl()||new URL('./',location.href).href;return location.replace(ret);
    }
    const confirm=await Swal.fire({icon:'success',title:RestartI18n.t('สร้างบัญชีแล้ว'),html:RestartI18n.t('กรุณาตรวจ <b>')+esc(email)+RestartI18n.t('</b> เพื่อยืนยันบัญชี'),showDenyButton:true,denyButtonText:RestartI18n.t('ส่ง Email ยืนยันอีกครั้ง'),confirmButtonText:RestartI18n.t('เข้าใจแล้ว')});
    if(confirm.isDenied){try{await resendSignupEmail(email)}catch(e){await Swal.fire(RestartI18n.t('ส่ง Email ไม่สำเร็จ'),e.message||String(e),'error')}}
    renderAuth()
  }catch(e){Swal.fire(RestartI18n.t('สมัครสมาชิกไม่สำเร็จ'),e.message||String(e),'error')}
}
async function ensureProfile(user){
  const{data,error}=await db.from('restart_member_profiles').select('*').eq('user_id',user.id).maybeSingle();
  if(error)throw error;
  if(data)return data;
  const{data:made,error:ie}=await db.from('restart_member_profiles').insert({user_id:user.id,email:user.email||null}).select('*').single();
  if(ie)throw ie;return made
}
async function renderMember(user){
  memberUser=user;
  document.getElementById('memberEventsLink').hidden=false;
  logoutBtn.hidden=false;
  let profile;try{profile=await ensureProfile(user)}catch(e){return app.innerHTML='<section class="rr-card rr-empty">'+esc(e.message)+'</section>'}
  const [regs,ledger,orders,waitlist]=await Promise.all([
    db.from('restart_registrations').select('id,registration_code,status,registration_type,group_name,total_amount_thb,created_at,event_id,restart_events(name,event_date_start,slug)').eq('member_user_id',user.id).order('created_at',{ascending:false}),
    db.from('restart_member_points_ledger').select('*').eq('user_id',user.id).order('created_at',{ascending:false}).limit(100),
    db.from('restart_store_orders').select('id,order_code,status,payment_status,total_amount_thb,points_redeemed,points_discount_thb,created_at,store_id,restart_stores(name,slug)').eq('member_user_id',user.id).order('created_at',{ascending:false}).limit(50),
    db.from('restart_waitlist').select('id,status,registration_type,group_name,runner_count,contact_name,created_at,event_id,restart_events(name,event_date_start,slug)').eq('member_user_id',user.id).order('created_at',{ascending:false}).limit(50)
  ]);
  const regRows=regs.data||[],pointRows=ledger.data||[],orderRows=orders.data||[],waitRows=waitlist.data||[];
  const full=[profile.title==='mr'?RestartI18n.t('นาย'):profile.title==='ms'?RestartI18n.t('นางสาว'):profile.title==='mrs'?RestartI18n.t('นาง'):'',profile.first_name,profile.last_name].filter(Boolean).join(' ')||RestartI18n.t('นักแข่ง');
  app.innerHTML=
    RestartI18n.t('<section class="rr-card"><h2 style="margin:0 0 12px">ข้อมูลส่วนตัว / แต้มของฉัน</h2><nav class="row" aria-label="บัญชีนักแข่ง" style="gap:8px;flex-wrap:wrap"><a class="btn soft" href="#myProfile">ข้อมูลส่วนตัว</a><a class="btn soft" href="#myPoints">แต้มของฉัน</a><a class="btn soft" href="#myRegistrations">ประวัติสมัครแข่ง</a><a class="btn primary" href="./">เลือกงานวิ่ง / สมัครแข่ง</a></nav></section>')+
    '<section class="member-card-hero"><div class="member-card-code">'+esc(profile.member_code)+'</div><div class="member-card-name">'+esc(full)+'</div><div class="member-points">'+Number(profile.points_balance||0).toLocaleString(RestartI18n.locale())+RestartI18n.t(' <small>แต้ม</small></div><div class="member-stat-grid"><div><small>อายุ</small><div class="member-age">')+(profile.birth_date?ageFromBirth(profile.birth_date)+RestartI18n.t(' ปี'):'—')+RestartI18n.t('</div></div><div><small>รายการที่สมัคร</small><div class="member-age">')+regRows.length+RestartI18n.t('</div></div><div><small>คิวรอ</small><div class="member-age">')+waitRows.filter(x=>['WAITING','INVITED'].includes(x.status)).length+RestartI18n.t('</div></div><div><small>ออเดอร์ร้านค้า</small><div class="member-age">')+orderRows.length+'</div></div></div></section>'+
    RestartI18n.t('<section id="myProfile" class="rr-card" style="scroll-margin-top:100px"><div class="member-section-head"><div><h2 style="margin:0">ข้อมูลส่วนตัว</h2></div><button id="editProfileBtn" class="btn primary">แก้ไขข้อมูล</button></div><div class="member-profile-grid"><div><small>ชื่อ</small><div><b>')+esc(full)+RestartI18n.t('</b></div></div><div class="wide"><small>เลขบัตรประชาชน / Passport</small><div>')+esc(profile.id_document||RestartI18n.t('ยังไม่ได้ระบุ'))+RestartI18n.t('</div></div><div><small>วันเกิด / อายุ</small><div>')+fmtDate(profile.birth_date)+' · '+(profile.birth_date?ageFromBirth(profile.birth_date)+RestartI18n.t(' ปี'):'—')+RestartI18n.t('</div></div><div><small>โทรศัพท์</small><div>')+esc(profile.phone||'—')+RestartI18n.t('</div></div><div><small>กรุ๊ปเลือด</small><div>')+esc(profile.blood_group||'—')+RestartI18n.t('</div></div><div class="wide"><small>ที่อยู่</small><div>')+esc(profile.address||'—')+RestartI18n.t('</div></div><div><small>ผู้ติดต่อฉุกเฉิน</small><div>')+esc(profile.emergency_contact_name||'—')+RestartI18n.t('</div></div><div><small>เบอร์ฉุกเฉิน</small><div>')+esc(profile.emergency_phone||'—')+RestartI18n.t('</div></div><div><small>ความสัมพันธ์</small><div>')+esc(profile.emergency_relation||'—')+'</div></div></div></section>'+
    RestartI18n.t('<section id="myRegistrations" class="rr-card" style="scroll-margin-top:100px"><div class="member-section-head"><div><h2 style="margin:0">ประวัติสมัครแข่ง</h2></div></div><div class="member-history">')+(regRows.length?regRows.map(r=>'<div class="member-history-row"><div><b>'+esc(r.restart_events?.name||'Event')+'</b><div class="muted">'+esc(r.registration_code)+' · '+esc(RestartI18n.status(r.registration_type))+(r.group_name?' · '+esc(r.group_name):'')+'<br>'+fmtDate(r.restart_events?.event_date_start)+'</div></div><div style="text-align:right"><b>'+esc(RestartI18n.status(r.status))+RestartI18n.t('</b><div>฿')+money(r.total_amount_thb)+'</div></div></div>').join(''):RestartI18n.t('<div class="rr-empty">ยังไม่มีประวัติสมัครแข่ง</div>'))+'</div></section>'+    RestartI18n.t('<section class="rr-card"><div class="member-section-head"><div><h2 style="margin:0">คิวรอ</h2></div></div><div class="member-history">')+(waitRows.length?waitRows.map(w=>'<div class="member-history-row"><div><b>'+esc(w.restart_events?.name||'Event')+'</b><div class="muted">'+esc(RestartI18n.status(w.registration_type))+(w.group_name?' · '+esc(w.group_name):'')+' · '+Number(w.runner_count||1)+RestartI18n.t(' คน<br>เข้าคิว ')+new Date(w.created_at).toLocaleString(RestartI18n.locale())+'</div></div><div style="text-align:right"><b>'+esc(RestartI18n.status(w.status))+'</b><div>'+fmtDate(w.restart_events?.event_date_start)+'</div></div></div>').join(''):RestartI18n.t('<div class="rr-empty">ยังไม่มีรายการ คิวรอ</div>'))+'</div></section>'+
    RestartI18n.t('<section id="myPoints" class="rr-card" style="scroll-margin-top:100px"><div class="member-section-head"><div><h2 style="margin:0">แต้มของฉัน</h2></div></div><div class="member-history">')+(pointRows.length?pointRows.map(x=>'<div class="member-history-row"><div><b>'+esc(x.description||x.transaction_type)+'</b><div class="muted">'+new Date(x.created_at).toLocaleString(RestartI18n.locale())+'</div></div><div class="'+(x.points>0?'member-ledger-positive':'member-ledger-negative')+'">'+(x.points>0?'+':'')+x.points+'</div></div>').join(''):RestartI18n.t('<div class="rr-empty">ยังไม่มีคะแนนสะสม</div>'))+'</div></section>'+
    RestartI18n.t('<section class="rr-card"><div class="member-section-head"><div><h2 style="margin:0">ประวัติร้านค้า</h2></div></div><div class="member-history">')+(orderRows.length?orderRows.map(o=>{const sn=o.restart_stores?.name||{},store=sn[RestartI18n.language()]||sn.th||sn.en||o.restart_stores?.slug||RestartI18n.t('ร้านค้า');return '<div class="member-history-row"><div><b>'+esc(store)+'</b><div class="muted">'+esc(o.order_code)+' · '+new Date(o.created_at).toLocaleString(RestartI18n.locale())+(Number(o.points_redeemed)>0?RestartI18n.t('<br>ใช้ ')+Number(o.points_redeemed).toLocaleString(RestartI18n.locale())+RestartI18n.t(' Points · ลด ฿')+money(o.points_discount_thb):'')+'</div></div><div style="text-align:right"><b>'+esc(RestartI18n.status(o.status))+RestartI18n.t('</b><div>฿')+money(o.total_amount_thb)+'</div></div></div>'}).join(''):RestartI18n.t('<div class="rr-empty">ยังไม่มีประวัติซื้อสินค้า</div>'))+'</div></section>';
  editProfileBtn.onclick=()=>editProfile(profile,user)
}
async function editProfile(profile,user){
  const r=await Swal.fire({title:RestartI18n.t('แก้ไขข้อมูลสมาชิก'),width:860,showCancelButton:true,confirmButtonText:RestartI18n.t('บันทึก'),html:'<div style="text-align:left">'+profileFields('ep',profile)+'</div>',didOpen:()=>bindAge('ep'),preConfirm:()=>{try{return validateProfile(collectProfile('ep'))}catch(e){return Swal.showValidationMessage(e.message)}}});
  if(!r.isConfirmed)return;
  const{error}=await db.from('restart_member_profiles').update({...r.value,email:user.email||null,updated_at:new Date().toISOString()}).eq('user_id',user.id);
  if(error)return Swal.fire(RestartI18n.t('บันทึกไม่สำเร็จ'),error.message,'error');
  Swal.fire({icon:'success',title:RestartI18n.t('บันทึกข้อมูลแล้ว'),timer:900,showConfirmButton:false});renderMember(user)
}
RestartI18n.mount();
RestartI18n.onChange(async()=>{const draft=RestartI18n.capture(app);if(memberUser)await renderMember(memberUser);else await renderAuth();RestartI18n.restore(app,draft)});
logoutBtn.onclick=async()=>{await db.auth.signOut();renderAuth()};
let recoveryPromptOpen=false;
db.auth.onAuthStateChange((event,session)=>{
  if(!session?.user)logoutBtn.hidden=true;
  if(event==='PASSWORD_RECOVERY'&&!recoveryPromptOpen){
    recoveryPromptOpen=true;
    setTimeout(()=>promptNewPassword().finally(()=>{recoveryPromptOpen=false}),0)
  }
});
(async()=>{
  const{data:{session}}=await db.auth.getSession();
  if(session?.user){
    if(new URLSearchParams(location.search).get('recovery')==='1'&&!recoveryPromptOpen){
      recoveryPromptOpen=true;await promptNewPassword().finally(()=>{recoveryPromptOpen=false})
    }else{const ret=returnUrl();if(ret)location.replace(ret);else renderMember(session.user)}
  }else renderAuth()
})()
})();
