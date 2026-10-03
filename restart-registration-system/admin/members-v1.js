(()=>{
const db=supabase.createClient(RESTART_REG_CONFIG.SUPABASE_URL,RESTART_REG_CONFIG.SUPABASE_PUBLISHABLE_KEY);
const app=document.getElementById('crmApp');
let MEMBERS=[],REGS=[],ORDERS=[],WAITLIST=[],EVENTS=[];
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money=v=>Number(v||0).toLocaleString('th-TH',{maximumFractionDigits:2});
function age(v){if(!v)return'—';const d=new Date(v+'T00:00:00'),n=new Date();let y=n.getFullYear()-d.getFullYear();const m=n.getMonth()-d.getMonth();if(m<0||(m===0&&n.getDate()<d.getDate()))y--;return Math.max(0,y)+' ปี'}
function title(v){return v==='mr'?'นาย':v==='ms'?'นางสาว':v==='mrs'?'นาง':''}
async function guard(){
 const{data:{session}}=await db.auth.getSession();if(!session?.user){location.href='./';return null}
 const{data:a}=await db.from('restart_admin_users').select('user_id').eq('user_id',session.user.id).eq('active',true).maybeSingle();
 if(!a){location.href='./';return null}return session.user
}
async function load(){
 const user=await guard();if(!user)return;
 const [m,r,o,w,e]=await Promise.all([
  db.from('restart_member_profiles').select('*').order('created_at',{ascending:false}),
  db.from('restart_registrations').select('id,member_user_id,registration_code,status,total_amount_thb,event_id,created_at').not('member_user_id','is',null),
  db.from('restart_store_orders').select('id,member_user_id,total_amount_thb,status,points_redeemed,store_id,created_at').not('member_user_id','is',null),
  db.from('restart_waitlist').select('id,member_user_id,event_id,status,registration_type,group_name,runner_count,created_at').not('member_user_id','is',null),
  db.from('restart_events').select('id,name,event_date_start,member_points_award,status').order('event_date_start',{ascending:false})
 ]);
 const err=[m,r,o,w,e].find(x=>x.error)?.error;if(err)return app.innerHTML='<section class="rr-card rr-empty">'+esc(err.message)+'</section>';
 MEMBERS=m.data||[];REGS=r.data||[];ORDERS=o.data||[];WAITLIST=w.data||[];EVENTS=e.data||[];render()
}
function counts(uid){return{regs:REGS.filter(x=>x.member_user_id===uid).length,wait:WAITLIST.filter(x=>x.member_user_id===uid&&['WAITING','INVITED'].includes(x.status)).length,orders:ORDERS.filter(x=>x.member_user_id===uid).length,spent:ORDERS.filter(x=>x.member_user_id===uid&&x.status!=='CANCELLED').reduce((s,x)=>s+Number(x.total_amount_thb||0),0)}}
function render(){
 const totalPoints=MEMBERS.reduce((s,x)=>s+Number(x.points_balance||0),0),linkedRegs=REGS.length;
 app.innerHTML=
 '<section class="rr-card"><div class="crm-toolbar"><div><h2 style="margin:0">Member CRM</h2><div class="muted">ฐานสมาชิกกลางของ RESTART</div></div><label>ค้นหาสมาชิก<input id="crmSearch" placeholder="รหัสสมาชิก / ชื่อ / นามสกุล / เบอร์โทร"></label></div>'+
 '<div class="crm-stats" style="margin-top:16px"><div class="paybox"><small>สมาชิก</small><div class="price">'+MEMBERS.length+'</div></div><div class="paybox"><small>แต้มคงเหลือรวม</small><div class="price">'+totalPoints.toLocaleString('th-TH')+'</div></div><div class="paybox"><small>ใบสมัครที่เชื่อมสมาชิก</small><div class="price">'+linkedRegs+'</div></div><div class="paybox"><small>Waiting List</small><div class="price">'+WAITLIST.filter(x=>['WAITING','INVITED'].includes(x.status)).length+'</div></div><div class="paybox"><small>ออเดอร์สมาชิก</small><div class="price">'+ORDERS.length+'</div></div></div></section>'+
 '<section class="rr-card"><div class="row space" style="gap:12px;flex-wrap:wrap"><div><h3 style="margin:0">คะแนนต่อ Event</h3><div class="muted">คะแนนจะเข้าบัญชีเมื่อใบสมัครเป็น CONFIRMED และคืนอัตโนมัติเมื่อยกเลิก</div></div></div><div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Event</th><th>วันแข่ง</th><th>แต้มเมื่อสมัครสำเร็จ</th><th></th></tr></thead><tbody>'+EVENTS.map(x=>'<tr><td><b>'+esc(x.name)+'</b><div class="muted">'+esc(x.status)+'</div></td><td>'+esc(x.event_date_start||'—')+'</td><td><input id="eventPoint_'+x.id+'" type="number" min="0" step="1" value="'+Number(x.member_points_award||0)+'" style="max-width:150px"></td><td><button class="btn sm primary" onclick="saveEventPoints(\''+x.id+'\')">บันทึก</button></td></tr>').join('')+'</tbody></table></div></section>'+
 '<section class="rr-card"><div class="row space"><h3 style="margin:0">สมาชิกทั้งหมด</h3><div id="crmCount" class="muted"></div></div><div id="crmCards" class="crm-grid" style="margin-top:14px"></div></section>';
 crmSearch.addEventListener('input',renderCards);renderCards()
}
function renderCards(){
 const q=(document.getElementById('crmSearch')?.value||'').trim().toLowerCase();
 const rows=MEMBERS.filter(m=>!q||[m.member_code,m.first_name,m.last_name,m.phone,m.email].some(v=>String(v||'').toLowerCase().includes(q)));
 crmCount.textContent=rows.length+' ราย';
 crmCards.innerHTML=rows.length?rows.map(m=>{const c=counts(m.user_id),name=[title(m.title),m.first_name,m.last_name].filter(Boolean).join(' ');return '<article class="crm-card"><div class="crm-code">'+esc(m.member_code)+'</div><div class="crm-name">'+esc(name||m.email||'Member')+'</div><div class="crm-points">'+Number(m.points_balance||0).toLocaleString('th-TH')+' <small>PTS</small></div><div class="crm-meta"><div><small>โทรศัพท์</small><br>'+esc(m.phone||'—')+'</div><div><small>อายุ</small><br>'+age(m.birth_date)+'</div><div><small>Event</small><br>'+c.regs+'</div><div><small>Waitlist</small><br>'+c.wait+'</div><div><small>Orders</small><br>'+c.orders+'</div><div><small>ยอดซื้อ</small><br>฿'+money(c.spent)+'</div></div><div class="row" style="margin-top:14px;gap:8px;flex-wrap:wrap"><button class="btn sm soft" onclick="memberDetail(\''+m.user_id+'\')">รายละเอียด</button><button class="btn sm primary" onclick="adjustPoints(\''+m.user_id+'\')">ปรับแต้ม</button></div></article>'}).join(''):'<div class="rr-empty" style="grid-column:1/-1">ไม่พบสมาชิก</div>'
}
async function saveEventPoints(id){
 const el=document.getElementById('eventPoint_'+id),v=Math.max(0,Math.floor(Number(el?.value||0)));
 const{error}=await db.from('restart_events').update({member_points_award:v,updated_at:new Date().toISOString()}).eq('id',id);
 if(error)return Swal.fire('บันทึกไม่ได้',error.message,'error');
 const e=EVENTS.find(x=>x.id===id);if(e)e.member_points_award=v;Swal.fire({icon:'success',title:'บันทึกแต้ม Event แล้ว',timer:900,showConfirmButton:false})
}
async function memberDetail(uid){
 const m=MEMBERS.find(x=>x.user_id===uid);if(!m)return;
 const [l,r,o,w]=await Promise.all([
  db.from('restart_member_points_ledger').select('*').eq('user_id',uid).order('created_at',{ascending:false}).limit(100),
  db.from('restart_registrations').select('registration_code,status,total_amount_thb,created_at,event_id,restart_events(name,event_date_start)').eq('member_user_id',uid).order('created_at',{ascending:false}),
  db.from('restart_store_orders').select('order_code,status,total_amount_thb,points_redeemed,points_discount_thb,created_at,store_id,restart_stores(name)').eq('member_user_id',uid).order('created_at',{ascending:false}).limit(50),
  db.from('restart_waitlist').select('status,registration_type,group_name,runner_count,created_at,event_id,restart_events(name,event_date_start)').eq('member_user_id',uid).order('created_at',{ascending:false}).limit(50)
 ]);
 const name=[title(m.title),m.first_name,m.last_name].filter(Boolean).join(' ');
 const ledger=(l.data||[]).map(x=>'<div class="row space" style="border-bottom:1px solid rgba(127,127,127,.16);padding:7px 0"><div>'+esc(x.description||x.transaction_type)+'<div class="muted">'+new Date(x.created_at).toLocaleString('th-TH')+'</div></div><b>'+(x.points>0?'+':'')+x.points+'</b></div>').join('')||'ยังไม่มีแต้ม';
 const regs=(r.data||[]).map(x=>'<div style="padding:5px 0"><b>'+esc(x.restart_events?.name||'Event')+'</b> · '+esc(x.registration_code)+' · '+esc(x.status)+'</div>').join('')||'ยังไม่มี';
 const orders=(o.data||[]).map(x=>'<div style="padding:5px 0"><b>'+esc(x.restart_stores?.name?.th||x.restart_stores?.name?.en||'Store')+'</b> · '+esc(x.order_code)+' · ฿'+money(x.total_amount_thb)+(Number(x.points_redeemed)>0?' · '+x.points_redeemed+' pts':'')+'</div>').join('')||'ยังไม่มี';
 const waits=(w.data||[]).map(x=>'<div style="padding:5px 0"><b>'+esc(x.restart_events?.name||'Event')+'</b> · '+esc(x.registration_type)+(x.group_name?' · '+esc(x.group_name):'')+' · '+Number(x.runner_count||1)+' คน · '+esc(x.status)+'</div>').join('')||'ยังไม่มี';
 Swal.fire({title:esc(name||m.member_code),width:920,showCloseButton:true,showConfirmButton:false,html:'<div style="text-align:left"><div class="paybox"><b>'+esc(m.member_code)+'</b> · '+esc(m.email||'')+'<br>'+esc(m.phone||'—')+' · กรุ๊ป '+esc(m.blood_group||'—')+' · '+age(m.birth_date)+'<br>'+esc(m.address||'—')+'<br><b>ฉุกเฉิน:</b> '+esc(m.emergency_contact_name||'—')+' · '+esc(m.emergency_phone||'—')+' · '+esc(m.emergency_relation||'—')+'</div><div class="paybox"><b>คะแนนคงเหลือ '+Number(m.points_balance||0).toLocaleString('th-TH')+'</b>'+ledger+'</div><div class="paybox"><b>Event</b>'+regs+'</div><div class="paybox"><b>Waiting List</b>'+waits+'</div><div class="paybox"><b>Store Orders</b>'+orders+'</div></div>'})
}
async function adjustPoints(uid){
 const m=MEMBERS.find(x=>x.user_id===uid);if(!m)return;
 const r=await Swal.fire({title:'ปรับคะแนน '+m.member_code,width:620,showCancelButton:true,confirmButtonText:'บันทึก',html:'<div style="text-align:left"><div class="paybox">คงเหลือ <b>'+Number(m.points_balance||0).toLocaleString('th-TH')+' Points</b></div><label>จำนวนแต้ม <small class="muted">บวกเพิ่ม / ติดลบเพื่อลด</small><input id="adjPoints" type="number" step="1" class="swal2-input" style="margin:0"></label><label>เหตุผล<input id="adjNote" class="swal2-input" style="margin:0"></label></div>',preConfirm:()=>{const p=Math.trunc(Number(adjPoints.value||0)),note=adjNote.value.trim();if(!p)return Swal.showValidationMessage('กรุณาระบุจำนวนแต้ม');if(!note)return Swal.showValidationMessage('กรุณาระบุเหตุผล');return{p,note}}});
 if(!r.isConfirmed)return;
 const{data,error}=await db.rpc('restart_admin_adjust_member_points',{p_user_id:uid,p_points:r.value.p,p_note:r.value.note});
 if(error)return Swal.fire('ปรับแต้มไม่ได้',error.message,'error');
 m.points_balance=Number(data?.balance??m.points_balance);Swal.fire({icon:'success',title:'ปรับแต้มแล้ว',text:'คงเหลือ '+Number(m.points_balance).toLocaleString('th-TH')+' Points'});renderCards()
}
logoutBtn.onclick=async()=>{await db.auth.signOut();location.href='./'};
Object.assign(window,{saveEventPoints,memberDetail,adjustPoints});
load()
})();