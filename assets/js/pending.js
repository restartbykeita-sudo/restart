(async()=>{
  const A=window.App,$=id=>document.getElementById(id);
  await A.init({allowPending:true});
  $('pendingName').textContent=A.profile?.display_name||'—';
  $('pendingEmail').textContent=A.profile?.email||A.user?.email||'—';
  $('pendingOrg').textContent=A.profile?.requested_org_code?`ขอเข้าร่วมองค์กร: ${A.profile.requested_org_code}`:'ยังไม่ได้ระบุรหัสองค์กร';

  let routing=false;
  async function render(){
    const s=A.profile?.approval_status||'PENDING';
    $('statusPill').textContent=s;document.body.dataset.status=s;
    $('statusTitle').textContent=s==='REJECTED'?'บัญชีไม่ได้รับการอนุมัติ':s==='SUSPENDED'?'บัญชีถูกระงับ':s==='APPROVED'?'บัญชีได้รับอนุมัติแล้ว':'บัญชีกำลังรอ Admin อนุมัติ';
    $('statusText').textContent=s==='REJECTED'?(A.profile?.rejected_reason||'กรุณาติดต่อผู้ดูแลระบบ'):s==='SUSPENDED'?(A.profile?.rejected_reason||'กรุณาติดต่อผู้ดูแลระบบ'):s==='APPROVED'?'กำลังเปิดเฉพาะหน้าที่คุณได้รับมอบหมาย':'บัญชีถูกสร้างแล้วโดยไม่ต้องยืนยันอีเมล แต่ Admin ต้องกำหนดองค์กร บทบาท Event และจุดสแกนก่อน';
    if(s==='APPROVED'&&!routing){routing=true;await A.routeAfterLogin()}
  }

  await render();
  const{data:can}=await A.db.rpc('can_bootstrap_first_admin');
  $('bootstrapBtn').hidden=!can;
  $('bootstrapBtn').onclick=async()=>{
    const{error}=await A.db.rpc('bootstrap_first_admin');
    if(error)return A.toast(error.message,'error');
    A.toast('ตั้งค่าผู้ดูแลระบบคนแรกแล้ว','ok');
    await A.loadProfile();await render();
  };
  $('checkAgain').onclick=async()=>{
    await A.loadProfile();await render();
    if(A.profile?.approval_status!=='APPROVED')A.toast('Admin ยังไม่ได้อนุมัติบัญชี','error');
  };
  $('pendingLogout').onclick=()=>A.logout();

  const channel=A.db.channel(`profile-approval-${A.user.id}`)
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'profiles',filter:`id=eq.${A.user.id}`},async()=>{await A.loadProfile();await render()})
    .subscribe();
  const timer=setInterval(async()=>{if(document.visibilityState==='visible'){try{await A.loadProfile();await render()}catch{}}},20000);
  addEventListener('beforeunload',()=>{clearInterval(timer);A.db.removeChannel(channel)});
})();
