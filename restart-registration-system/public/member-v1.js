(()=>{
const db=supabase.createClient(RESTART_REG_CONFIG.SUPABASE_URL,RESTART_REG_CONFIG.SUPABASE_PUBLISHABLE_KEY);
const app=document.getElementById('memberApp'),logoutBtn=document.getElementById('memberLogout');
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money=v=>Number(v||0).toLocaleString('th-TH',{maximumFractionDigits:2});
const fmtDate=v=>v?new Intl.DateTimeFormat('th-TH',{dateStyle:'medium'}).format(new Date(v+(String(v).length===10?'T00:00:00':''))):'—';
function ageFromBirth(v){if(!v)return'';const d=new Date(v+'T00:00:00'),n=new Date();let y=n.getFullYear()-d.getFullYear();const m=n.getMonth()-d.getMonth();if(m<0||(m===0&&n.getDate()<d.getDate()))y--;return Math.max(0,y)}
function api(action,body={}){
  return fetch(RESTART_REG_CONFIG.SUPABASE_URL+'/functions/v1/restart-registration-api?action='+encodeURIComponent(action),{
    method:'POST',headers:{'content-type':'application/json','apikey':RESTART_REG_CONFIG.SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify(body)
  }).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||('HTTP '+r.status));return d})
}
function profileFields(prefix='',p={}){
  const id=x=>prefix+x;
  return '<div class="member-profile-grid">'+
    '<label>คำนำหน้า<select id="'+id('Title')+'" required><option value="">—</option><option value="mr" '+(p.title==='mr'?'selected':'')+'>นาย</option><option value="ms" '+(p.title==='ms'?'selected':'')+'>นางสาว</option><option value="mrs" '+(p.title==='mrs'?'selected':'')+'>นาง</option></select></label>'+
    '<label>ชื่อ<input id="'+id('First')+'" required value="'+esc(p.first_name||'')+'"></label>'+
    '<label>นามสกุล<input id="'+id('Last')+'" required value="'+esc(p.last_name||'')+'"></label>'+
    '<label>วันเกิด<input id="'+id('Birth')+'" type="date" required value="'+esc(p.birth_date||'')+'"></label>'+
    '<label>อายุ<input id="'+id('Age')+'" readonly value="'+esc(p.birth_date?ageFromBirth(p.birth_date):'')+'" placeholder="คำนวณอัตโนมัติ"></label>'+
    '<label>เบอร์โทรศัพท์<input id="'+id('Phone')+'" type="tel" required value="'+esc(p.phone||'')+'"></label>'+
    '<label>กรุ๊ปเลือด<select id="'+id('Blood')+'" required><option value="">—</option>'+['A','B','AB','O','UNKNOWN'].map(x=>'<option value="'+x+'" '+(p.blood_group===x?'selected':'')+'>'+(x==='UNKNOWN'?'ไม่ทราบ':x)+'</option>').join('')+'</select></label>'+
    '<label class="wide">ที่อยู่<textarea id="'+id('Address')+'" rows="3" required>'+esc(p.address||'')+'</textarea></label>'+
    '<label>ชื่อ-นามสกุลผู้ติดต่อฉุกเฉิน<input id="'+id('EmergencyName')+'" required value="'+esc(p.emergency_contact_name||'')+'"></label>'+
    '<label>เบอร์โทรฉุกเฉิน<input id="'+id('EmergencyPhone')+'" type="tel" required value="'+esc(p.emergency_phone||'')+'"></label>'+
    '<label>ความสัมพันธ์กับผู้ติดต่อฉุกเฉิน<input id="'+id('EmergencyRelation')+'" required value="'+esc(p.emergency_relation||'')+'"></label>'+
  '</div>'
}
function bindAge(prefix=''){const b=document.getElementById(prefix+'Birth'),a=document.getElementById(prefix+'Age');if(!b||!a)return;const run=()=>a.value=b.value?ageFromBirth(b.value):'';b.addEventListener('change',run);b.addEventListener('input',run);run()}
function collectProfile(prefix=''){
  const v=x=>document.getElementById(prefix+x)?.value?.trim()||'';
  return{title:v('Title'),first_name:v('First'),last_name:v('Last'),birth_date:v('Birth'),phone:v('Phone'),blood_group:v('Blood'),address:v('Address'),emergency_contact_name:v('EmergencyName'),emergency_phone:v('EmergencyPhone'),emergency_relation:v('EmergencyRelation')}
}
function validateProfile(p){for(const [k,v] of Object.entries(p))if(!v)throw new Error('กรุณากรอกข้อมูลสมาชิกให้ครบ');return p}
function returnUrl(){const q=new URLSearchParams(location.search).get('return');return q&&q.startsWith(location.origin)?q:null}
function memberPageUrl(){return location.origin+location.pathname}
async function resendSignupEmail(email){
  if(!email)return;
  const{error}=await db.auth.resend({type:'signup',email,options:{emailRedirectTo:memberPageUrl()}});
  if(error)throw error;
  await Swal.fire({icon:'success',title:'ส่ง Email ยืนยันอีกครั้งแล้ว',text:'กรุณาตรวจ Inbox และ Junk/Spam'})
}
async function forgotPassword(){
  const initial=document.getElementById('loginEmail')?.value?.trim()||'';
  const r=await Swal.fire({title:'ลืมรหัสผ่าน',input:'email',inputLabel:'Email สมาชิก',inputValue:initial,inputPlaceholder:'name@example.com',showCancelButton:true,confirmButtonText:'ส่งลิงก์ตั้งรหัสใหม่',preConfirm:v=>v.trim()||Swal.showValidationMessage('กรุณากรอก Email')});
  if(!r.isConfirmed)return;
  const redirectTo=memberPageUrl()+'?recovery=1';
  const{error}=await db.auth.resetPasswordForEmail(r.value.trim(),{redirectTo});
  if(error)return Swal.fire('ส่ง Email ไม่สำเร็จ',error.message,'error');
  Swal.fire({icon:'success',title:'ส่ง Email แล้ว',text:'เปิดลิงก์ใน Email เพื่อตั้งรหัสผ่านใหม่'})
}
async function promptNewPassword(){
  const r=await Swal.fire({title:'ตั้งรหัสผ่านใหม่',html:'<div style="text-align:left"><label>รหัสผ่านใหม่<input id="newPassword" type="password" minlength="8" class="swal2-input" style="margin:0" autocomplete="new-password"></label><label>ยืนยันรหัสผ่าน<input id="newPassword2" type="password" minlength="8" class="swal2-input" style="margin:0" autocomplete="new-password"></label></div>',allowOutsideClick:false,allowEscapeKey:false,confirmButtonText:'บันทึกรหัสผ่าน',preConfirm:()=>{const a=newPassword.value,b=newPassword2.value;if(a.length<8)return Swal.showValidationMessage('รหัสผ่านต้องอย่างน้อย 8 ตัวอักษร');if(a!==b)return Swal.showValidationMessage('รหัสผ่านไม่ตรงกัน');return a}});
  if(!r.isConfirmed)return;
  const{error}=await db.auth.updateUser({password:r.value});
  if(error)return Swal.fire('เปลี่ยนรหัสผ่านไม่สำเร็จ',error.message,'error');
  history.replaceState(null,'',memberPageUrl());
  await Swal.fire({icon:'success',title:'เปลี่ยนรหัสผ่านแล้ว'});
  const{data:{session}}=await db.auth.getSession();if(session?.user)renderMember(session.user);else renderAuth()
}
async function renderAuth(){
  logoutBtn.hidden=true;
  app.innerHTML='<section class="member-auth-grid">'+
    '<div class="rr-card"><div class="member-login-tabs"><button id="tabLogin" class="btn soft active">เข้าสู่ระบบ</button><button id="tabSignup" class="btn soft">สมัครสมาชิก</button></div><div id="authPanel"></div></div>'+
    '<div class="member-card-hero"><div class="member-card-code">RESTART MEMBER</div><div class="member-card-name">สมัครครั้งเดียว<br>ใช้ข้อมูลได้ทุก Event</div><p>โปรไฟล์กลางจะเติมข้อมูลในฟอร์มสมัครให้อัตโนมัติ แก้ในฟอร์มได้ และบันทึกกลับมาใช้ครั้งต่อไป</p><div class="member-stat-grid"><div><b>CRM</b><div>ประวัติสมาชิก</div></div><div><b>POINTS</b><div>สะสมจาก Event</div></div><div><b>STORE</b><div>ใช้แต้มเป็นส่วนลด</div></div></div></div>'+
  '</section>';
  const login=()=>{tabLogin.classList.add('active');tabSignup.classList.remove('active');authPanel.innerHTML='<h2>เข้าสู่ระบบสมาชิก</h2><label>Email<input id="loginEmail" type="email" autocomplete="email"></label><label>Password<input id="loginPassword" type="password" autocomplete="current-password"></label><button id="loginBtn" class="btn primary" style="width:100%;margin-top:12px">เข้าสู่ระบบ</button><button id="forgotBtn" class="btn soft" type="button" style="width:100%;margin-top:8px">ลืมรหัสผ่าน</button>';loginBtn.onclick=doLogin;forgotBtn.onclick=forgotPassword};
  const signup=()=>{tabSignup.classList.add('active');tabLogin.classList.remove('active');authPanel.innerHTML='<h2>สมัครสมาชิก RESTART</h2><div class="member-profile-grid"><label class="wide">Email สำหรับ Login<input id="suEmail" type="email" required autocomplete="email"></label><label class="wide">Password <small class="muted">อย่างน้อย 8 ตัวอักษร</small><input id="suPassword" type="password" minlength="8" required autocomplete="new-password"></label></div>'+profileFields('su')+'<div class="member-form-note">Email ใช้สำหรับเข้าสู่ระบบ ส่วนข้อมูลส่วนตัวเก็บใน Member Profile และไม่ใส่ข้อมูลสุขภาพไว้ใน Auth token</div><button id="signupBtn" class="btn primary" style="width:100%;margin-top:14px">สร้างบัญชีสมาชิก</button>';bindAge('su');signupBtn.onclick=doSignup};
  tabLogin.onclick=login;tabSignup.onclick=signup;login()
}
async function doLogin(){
  const email=loginEmail.value.trim(),password=loginPassword.value;
  if(!email||!password)return Swal.fire('กรอกข้อมูลไม่ครบ','กรุณากรอก Email และ Password','warning');
  Swal.fire({title:'กำลังเข้าสู่ระบบ…',allowOutsideClick:false,didOpen:()=>Swal.showLoading()});
  const{data,error}=await db.auth.signInWithPassword({email,password});
  if(error){
    const msg=String(error.message||'');
    if(/email.*confirm|confirm.*email/i.test(msg)){
      const r=await Swal.fire({icon:'warning',title:'Email ยังไม่ได้ยืนยัน',text:'กรุณายืนยัน Email ก่อนเข้าสู่ระบบ',showDenyButton:true,denyButtonText:'ส่ง Email ยืนยันอีกครั้ง',confirmButtonText:'ตกลง'});
      if(r.isDenied){try{await resendSignupEmail(email)}catch(e){Swal.fire('ส่ง Email ไม่สำเร็จ',e.message||String(e),'error')}}return
    }
    return Swal.fire('เข้าสู่ระบบไม่สำเร็จ',msg,'error')
  }
  const ret=returnUrl();if(ret)return location.href=ret;
  Swal.close();renderMember(data.user)
}
async function doSignup(){
  try{
    const email=suEmail.value.trim(),password=suPassword.value,profile=validateProfile(collectProfile('su'));
    if(!email)throw new Error('กรุณากรอก Email');
    if(password.length<8)throw new Error('Password ต้องอย่างน้อย 8 ตัวอักษร');
    const token=crypto.randomUUID()+crypto.randomUUID().replaceAll('-','');
    Swal.fire({title:'กำลังสร้างบัญชี…',allowOutsideClick:false,didOpen:()=>Swal.showLoading()});
    const redirectTo=location.origin+location.pathname;
    const{data,error}=await db.auth.signUp({email,password,options:{emailRedirectTo:redirectTo,data:{restart_signup_token:token}}});
    if(error)throw error;if(!data.user)throw new Error('สร้างบัญชีไม่สำเร็จ');
    const saved=await api('member-complete-signup',{user_id:data.user.id,signup_token:token,profile});
    if(data.session){
      const ret=returnUrl();if(ret)return location.href=ret;
      await Swal.fire({icon:'success',title:'สมัครสมาชิกสำเร็จ',html:'รหัสสมาชิก <b>'+esc(saved.member_code)+'</b>'});return renderMember(data.user)
    }
    const confirm=await Swal.fire({icon:'success',title:'สร้างบัญชีแล้ว',html:'กรุณาตรวจ <b>'+esc(email)+'</b> เพื่อยืนยันบัญชี<br><small>หากกดลิงก์แล้วไม่ได้กลับมาหน้านี้ ให้เปิดหน้า Member แล้ว Login ได้ตามปกติ</small>',showDenyButton:true,denyButtonText:'ส่ง Email ยืนยันอีกครั้ง',confirmButtonText:'เข้าใจแล้ว'});
    if(confirm.isDenied){try{await resendSignupEmail(email)}catch(e){await Swal.fire('ส่ง Email ไม่สำเร็จ',e.message||String(e),'error')}}
    renderAuth()
  }catch(e){Swal.fire('สมัครสมาชิกไม่สำเร็จ',e.message||String(e),'error')}
}
async function ensureProfile(user){
  const{data,error}=await db.from('restart_member_profiles').select('*').eq('user_id',user.id).maybeSingle();
  if(error)throw error;
  if(data)return data;
  const{data:made,error:ie}=await db.from('restart_member_profiles').insert({user_id:user.id,email:user.email||null}).select('*').single();
  if(ie)throw ie;return made
}
async function renderMember(user){
  logoutBtn.hidden=false;
  let profile;try{profile=await ensureProfile(user)}catch(e){return app.innerHTML='<section class="rr-card rr-empty">'+esc(e.message)+'</section>'}
  const [regs,ledger,orders]=await Promise.all([
    db.from('restart_registrations').select('id,registration_code,status,registration_type,group_name,total_amount_thb,created_at,event_id,restart_events(name,event_date_start,slug)').eq('member_user_id',user.id).order('created_at',{ascending:false}),
    db.from('restart_member_points_ledger').select('*').eq('user_id',user.id).order('created_at',{ascending:false}).limit(100),
    db.from('restart_store_orders').select('id,order_code,status,payment_status,total_amount_thb,points_redeemed,points_discount_thb,created_at,store_id,restart_stores(name,slug)').eq('member_user_id',user.id).order('created_at',{ascending:false}).limit(50)
  ]);
  const regRows=regs.data||[],pointRows=ledger.data||[],orderRows=orders.data||[];
  const full=[profile.title==='mr'?'นาย':profile.title==='ms'?'นางสาว':profile.title==='mrs'?'นาง':'',profile.first_name,profile.last_name].filter(Boolean).join(' ')||'RESTART Member';
  app.innerHTML=
    '<section class="member-card-hero"><div class="member-card-code">'+esc(profile.member_code)+'</div><div class="member-card-name">'+esc(full)+'</div><div class="member-points">'+Number(profile.points_balance||0).toLocaleString('th-TH')+' <small>POINTS</small></div><div class="member-stat-grid"><div><small>อายุ</small><div class="member-age">'+(profile.birth_date?ageFromBirth(profile.birth_date)+' ปี':'—')+'</div></div><div><small>Event ที่สมัคร</small><div class="member-age">'+regRows.length+'</div></div><div><small>ออเดอร์ร้านค้า</small><div class="member-age">'+orderRows.length+'</div></div></div></section>'+
    '<section class="rr-card"><div class="member-section-head"><div><h2 style="margin:0">ข้อมูลสมาชิก</h2><div class="muted">แก้ครั้งเดียว ใช้เป็นข้อมูลตั้งต้นในฟอร์มสมัครครั้งต่อไป</div></div><button id="editProfileBtn" class="btn primary">แก้ไขข้อมูล</button></div><div class="member-profile-grid"><div><small>ชื่อ</small><div><b>'+esc(full)+'</b></div></div><div><small>วันเกิด / อายุ</small><div>'+fmtDate(profile.birth_date)+' · '+(profile.birth_date?ageFromBirth(profile.birth_date)+' ปี':'—')+'</div></div><div><small>โทรศัพท์</small><div>'+esc(profile.phone||'—')+'</div></div><div><small>กรุ๊ปเลือด</small><div>'+esc(profile.blood_group||'—')+'</div></div><div class="wide"><small>ที่อยู่</small><div>'+esc(profile.address||'—')+'</div></div><div><small>ผู้ติดต่อฉุกเฉิน</small><div>'+esc(profile.emergency_contact_name||'—')+'</div></div><div><small>เบอร์ฉุกเฉิน</small><div>'+esc(profile.emergency_phone||'—')+'</div></div><div><small>ความสัมพันธ์</small><div>'+esc(profile.emergency_relation||'—')+'</div></div></div></section>'+
    '<section class="rr-card"><div class="member-section-head"><div><h2 style="margin:0">ประวัติ Event</h2><div class="muted">ใบสมัครที่เชื่อมกับบัญชีนี้</div></div></div><div class="member-history">'+(regRows.length?regRows.map(r=>'<div class="member-history-row"><div><b>'+esc(r.restart_events?.name||'Event')+'</b><div class="muted">'+esc(r.registration_code)+' · '+esc(r.registration_type)+(r.group_name?' · '+esc(r.group_name):'')+'<br>'+fmtDate(r.restart_events?.event_date_start)+'</div></div><div style="text-align:right"><b>'+esc(r.status)+'</b><div>฿'+money(r.total_amount_thb)+'</div></div></div>').join(''):'<div class="rr-empty">ยังไม่มีประวัติสมัคร Event</div>')+'</div></section>'+
    '<section class="rr-card"><div class="member-section-head"><div><h2 style="margin:0">คะแนนสะสม</h2><div class="muted">ตรวจสอบที่มาของแต้มย้อนหลังได้</div></div></div><div class="member-history">'+(pointRows.length?pointRows.map(x=>'<div class="member-history-row"><div><b>'+esc(x.description||x.transaction_type)+'</b><div class="muted">'+new Date(x.created_at).toLocaleString('th-TH')+'</div></div><div class="'+(x.points>0?'member-ledger-positive':'member-ledger-negative')+'">'+(x.points>0?'+':'')+x.points+'</div></div>').join(''):'<div class="rr-empty">ยังไม่มีคะแนนสะสม</div>')+'</div></section>'+
    '<section class="rr-card"><div class="member-section-head"><div><h2 style="margin:0">ประวัติร้านค้า</h2><div class="muted">ออเดอร์ที่ซื้อด้วย Member ID นี้</div></div></div><div class="member-history">'+(orderRows.length?orderRows.map(o=>{const sn=o.restart_stores?.name||{},store=sn.th||sn.en||o.restart_stores?.slug||'ร้านค้า';return '<div class="member-history-row"><div><b>'+esc(store)+'</b><div class="muted">'+esc(o.order_code)+' · '+new Date(o.created_at).toLocaleString('th-TH')+(Number(o.points_redeemed)>0?'<br>ใช้ '+Number(o.points_redeemed).toLocaleString('th-TH')+' Points · ลด ฿'+money(o.points_discount_thb):'')+'</div></div><div style="text-align:right"><b>'+esc(o.status)+'</b><div>฿'+money(o.total_amount_thb)+'</div></div></div>'}).join(''):'<div class="rr-empty">ยังไม่มีประวัติซื้อสินค้า</div>')+'</div></section>';
  editProfileBtn.onclick=()=>editProfile(profile,user)
}
async function editProfile(profile,user){
  const r=await Swal.fire({title:'แก้ไขข้อมูลสมาชิก',width:860,showCancelButton:true,confirmButtonText:'บันทึก',html:'<div style="text-align:left">'+profileFields('ep',profile)+'</div>',didOpen:()=>bindAge('ep'),preConfirm:()=>{try{return validateProfile(collectProfile('ep'))}catch(e){return Swal.showValidationMessage(e.message)}}});
  if(!r.isConfirmed)return;
  const{error}=await db.from('restart_member_profiles').update({...r.value,email:user.email||null,updated_at:new Date().toISOString()}).eq('user_id',user.id);
  if(error)return Swal.fire('บันทึกไม่สำเร็จ',error.message,'error');
  Swal.fire({icon:'success',title:'บันทึกข้อมูลแล้ว',timer:900,showConfirmButton:false});renderMember(user)
}
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
    }else renderMember(session.user)
  }else renderAuth()
})()
})();