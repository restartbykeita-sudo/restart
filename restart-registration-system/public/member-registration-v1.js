(()=>{
const memberDb=supabase.createClient(RESTART_REG_CONFIG.SUPABASE_URL,RESTART_REG_CONFIG.SUPABASE_PUBLISHABLE_KEY);
let MEMBER_SESSION=null,MEMBER_PROFILE=null,applyQueued=false;
const e=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
function memberUrl(){return 'member.html?return='+encodeURIComponent(location.href)}
function injectMemberNav(){
  const host=document.querySelector('.rr-public-actions');if(!host)return;
  let a=document.getElementById('memberNavLink');
  if(!a){a=document.createElement('a');a.id='memberNavLink';host.prepend(a)}
  a.className=MEMBER_SESSION?'btn soft':'btn primary';
  a.href=MEMBER_SESSION?'member.html':memberUrl();
  a.textContent=MEMBER_SESSION?'Member Card':'สมาชิก / Login'
}
function profileAge(v){if(!v)return'';const d=new Date(v+'T00:00:00'),ref=(typeof E!=='undefined'&&E?.event_date_start)?new Date(E.event_date_start+'T00:00:00'):new Date();let y=ref.getFullYear()-d.getFullYear();const m=ref.getMonth()-d.getMonth();if(m<0||(m===0&&ref.getDate()<d.getDate()))y--;return Math.max(0,y)}
function ownerIndex(){return 1}
function setValue(id,value){
  const el=document.getElementById(id);if(!el||value==null||value==='')return;
  if(el.dataset.memberTouched==='1')return;
  el.value=String(value);
  el.dispatchEvent(new Event('change',{bubbles:true}))
}
function markTouchListeners(card){
  card.querySelectorAll('input,select,textarea').forEach(el=>{
    if(el.dataset.memberTouchBound)return;el.dataset.memberTouchBound='1';
    el.addEventListener('input',()=>el.dataset.memberTouched='1');
    el.addEventListener('change',()=>{if(!applyQueued)el.dataset.memberTouched='1'})
  })
}
function applyMemberProfile(){
  const form=document.getElementById('regForm');if(!form||!MEMBER_SESSION||!MEMBER_PROFILE)return;
  const i=ownerIndex(),card=document.querySelector('[data-runner-card="'+i+'"]');if(!card)return;
  document.querySelectorAll('[data-runner-card] .member-owner-badge').forEach(x=>x.remove());
  const head=card.querySelector('.row.space');if(head&&!head.querySelector('.member-owner-badge')){const b=document.createElement('span');b.className='badge ok member-owner-badge';b.textContent='เจ้าของ Member ID';head.append(b)}
  if(card.dataset.memberProfileApplied===MEMBER_SESSION.user.id){markTouchListeners(card);return}
  applyQueued=true;
  const p=MEMBER_PROFILE;
  setValue('title_'+i,p.title);
  setValue('firstName_'+i,p.first_name);
  setValue('lastName_'+i,p.last_name);
  setValue('birthDate_'+i,p.birth_date);
  setValue('phone_'+i,p.phone);
  setValue('blood_'+i,p.blood_group);
  setValue('address_'+i,p.address);
  setValue('emergencyName_'+i,p.emergency_contact_name);
  setValue('emergencyPhone_'+i,p.emergency_phone);
  setValue('emergencyRelation_'+i,p.emergency_relation);
  const age=document.getElementById('age_'+i);if(age&&p.birth_date)age.value=profileAge(p.birth_date);
  card.dataset.memberProfileApplied=MEMBER_SESSION.user.id;
  applyQueued=false;markTouchListeners(card)
}
function renderGate(){
  injectMemberNav();
  const form=document.getElementById('regForm');if(!form)return;
  let gate=document.getElementById('memberRegistrationGate');
  if(!gate){gate=document.createElement('section');gate.id='memberRegistrationGate';gate.className='rr-card';form.prepend(gate)}
  const submit=form.querySelector('button[type=submit]');
  if(!MEMBER_SESSION){
    gate.innerHTML='<div class="row space" style="gap:12px;flex-wrap:wrap"><div><h3 style="margin:0">เข้าสู่ระบบสมาชิกก่อนสมัคร</h3><div class="muted">สมัครสมาชิกครั้งเดียว ระบบจะเติมข้อมูลส่วนตัวให้ทุก Event และสะสมคะแนน RESTART Points</div></div><a class="btn primary" href="'+e(memberUrl())+'">Login / สมัครสมาชิก</a></div>';
    if(submit){submit.disabled=true;submit.title='กรุณาเข้าสู่ระบบสมาชิกก่อน'}
    return
  }
  const name=[MEMBER_PROFILE?.first_name,MEMBER_PROFILE?.last_name].filter(Boolean).join(' ');
  gate.innerHTML='<div class="row space" style="gap:12px;flex-wrap:wrap"><div><div class="muted">MEMBER</div><h3 style="margin:2px 0">'+e(name||MEMBER_SESSION.user.email||'RESTART Member')+'</h3><div class="muted">'+e(MEMBER_PROFILE?.member_code||'')+' · '+Number(MEMBER_PROFILE?.points_balance||0).toLocaleString('th-TH')+' Points</div></div><a class="btn soft" href="member.html">ดู Member Card</a></div><div class="paybox" style="margin-top:10px">ข้อมูลของเจ้าของบัญชีจะเติมอัตโนมัติ แต่แก้ใน Form ได้ เมื่อสมัครสำเร็จข้อมูลที่แก้จะบันทึกกลับ Member Profile</div>';
  if(submit){submit.disabled=false;submit.title=''}
  setTimeout(applyMemberProfile,0)
}
async function loadMember(){
  const{data:{session}}=await memberDb.auth.getSession();MEMBER_SESSION=session||null;MEMBER_PROFILE=null;
  if(session?.user){
    const{data}=await memberDb.from('restart_member_profiles').select('*').eq('user_id',session.user.id).maybeSingle();MEMBER_PROFILE=data||null
  }
  injectMemberNav();renderGate()
}
const observer=new MutationObserver(()=>{
  injectMemberNav();
  const form=document.getElementById('regForm');
  if(form&&!document.getElementById('memberRegistrationGate'))renderGate();
  if(form)setTimeout(applyMemberProfile,0)
});
const start=()=>{
  injectMemberNav();
  observer.observe(document.getElementById('app')||document.body,{childList:true,subtree:true});
  loadMember()
};
memberDb.auth.onAuthStateChange((_event,session)=>{MEMBER_SESSION=session||null;loadMember()});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();