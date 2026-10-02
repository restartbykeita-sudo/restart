const db=App.db;
const state={events:[],event:null,tab:'overview'};
const langs=['th','en','zh','ja','ru'];
const baseFieldLabels={title:'คำนำหน้า',first_name:'ชื่อ',last_name:'นามสกุล',birth_date:'วันเกิด',age:'อายุ',gender:'เพศ',id_document:'บัตรประชาชน / Passport',phone:'เบอร์โทรศัพท์',blood_group:'กรุ๊ปเลือด',shirt_size:'ขนาดเสื้อ',address:'ที่อยู่',emergency_phone:'เบอร์โทรฉุกเฉิน',emergency_relation:'ความสัมพันธ์ผู้ติดต่อฉุกเฉิน'};const reservedBaseKeys=new Set(['title','prefix','first_name','last_name','birth_date','age','gender','id_document','phone','blood_group','shirt_size','address','emergency_phone','emergency_relation']);
const featureLabels={event_preview:'หน้าพรีวิว Event',showcase_media:'เสื้อ / เหรียญ / ถ้วย',route_animation:'GPX Route Animation',basic_info:'ข้อมูลพื้นฐาน',insurance:'ข้อมูลประกัน',beneficiaries_multiple:'ผู้รับผลประโยชน์หลายคน',beneficiary_total_100:'บังคับรวม 100%',competition_categories:'รุ่นการแข่งขัน',auto_category:'คำนวณรุ่นอัตโนมัติ',self_select_category:'ผู้สมัครเลือกรุ่นเอง',category_pricing:'ราคาแยกตามรุ่น',distances:'ระยะการแข่งขัน',packages:'Package',followers:'ผู้ติดตาม',shirts:'ไซส์เสื้อ',early_bird:'Early Bird',promotions:'Promotion',discount_codes:'Discount Code',full_payment:'จ่ายเต็ม',installments:'ผ่อนชำระ',promptpay:'PromptPay',bank_transfer:'บัญชีธนาคาร',payment_qr:'QR ชำระเงิน',slip_upload:'อัปโหลดสลิป',admin_slip_review:'Admin ตรวจสลิป',pdpa:'PDPA / Consent',multilingual:'หลายภาษา',logo:'Logo',banner:'Banner',media:'รูปภาพเพิ่มเติม',sponsor_logos:'Sponsor Logo',capacity:'จำกัดจำนวน',waitlist:'Waitlist',pair_registration:'สมัครคู่',team_registration:'สมัครทีม',edit_after_submit:'แก้หลังสมัคร',cancellation:'ยกเลิกใบสมัคร',transfer_registration:'โอนสิทธิ์',export:'Export',notifications:'แจ้งเตือน'};
const eventStatusOptions=[
  {value:'DRAFT',label:'แบบร่าง · ไม่แสดงหน้า Event'},
  {value:'PUBLISHED',label:'เร็ว ๆ นี้'},
  {value:'OPEN',label:'เปิดรับสมัครแล้ว'},
  {value:'CLOSED',label:'ปิดรับสมัครแล้ว'},
  {value:'ARCHIVED',label:'เก็บถาวร'}
];
const esc=App.esc;
function t(v,l='th'){return typeof v==='object'?(v?.[l]||v?.th||v?.en||''):v||''}
function money(v){return Number(v||0).toLocaleString('th-TH',{minimumFractionDigits:0,maximumFractionDigits:2})}
function card(title,body,actions=''){return '<section class="rr-card"><div class="row space"><div><h2>'+title+'</h2></div><div class="row">'+actions+'</div></div>'+body+'</section>'}
const imageSpecs={
  logo:{label:'Logo Event',size:'1000 × 1000 px',ratio:'1:1',ratioValue:1,minW:600,minH:600,maxMB:2,format:'PNG / WebP แนะนำพื้นหลังโปร่งใส'},
  banner:{label:'Banner Event',size:'1920 × 1080 px',ratio:'16:9',ratioValue:16/9,minW:1280,minH:720,maxMB:3,format:'JPG / WebP'},
  background:{label:'ภาพพื้นหลัง Hero',size:'1920 × 1080 px',ratio:'16:9',ratioValue:16/9,minW:1280,minH:720,maxMB:3,format:'JPG / WebP'},
  square:{label:'ภาพสินค้า / รางวัล',size:'1200 × 1200 px',ratio:'1:1',ratioValue:1,minW:800,minH:800,maxMB:2,format:'JPG / PNG / WebP'},
  courseMap:{label:'แผนที่เส้นทาง',size:'1600 × 1200 px',ratio:'4:3',ratioValue:4/3,minW:1200,minH:900,maxMB:3,format:'JPG / PNG / WebP'},
  gallery:{label:'รูป Gallery',size:'1600 × 1200 px',ratio:'4:3',ratioValue:4/3,minW:1200,minH:900,maxMB:3,format:'JPG / WebP'},
  routePoint:{label:'รูป CP / จุดบริการ',size:'1200 × 900 px',ratio:'4:3',ratioValue:4/3,minW:800,minH:600,maxMB:2,format:'JPG / WebP'}
};
function imageHint(specKey,statusId=''){
  const s=imageSpecs[specKey];
  return '<small class="muted" style="display:block;margin-top:6px;line-height:1.55"><b>แนะนำ:</b> '+s.size+' · '+s.ratio+' · '+s.format+' · ไม่เกิน '+s.maxMB+' MB</small>'+(statusId?'<small id="'+statusId+'" style="display:block;margin-top:4px"></small>':'')
}
function imageGuide(){
  return '<div class="paybox" style="margin:14px 0"><b>คู่มือขนาดรูป</b><div class="muted" style="margin-top:6px;line-height:1.7">Logo: 1000×1000 (1:1) · Banner/Hero: 1920×1080 (16:9) · เสื้อ/เหรียญ/ถ้วย: 1200×1200 (1:1) · แผนที่/Gallery: 1600×1200 (4:3) · รูป CP: 1200×900 (4:3)<br>ระบบจะตรวจขนาดและสัดส่วนทันทีเมื่อเลือกไฟล์ แต่ยังอนุญาตให้อัปโหลดได้หากต้องการ</div></div>'
}
function inspectImageFile(file,specKey,statusEl){
  if(!file||!statusEl)return;
  const s=imageSpecs[specKey];
  if(!file.type?.startsWith('image/')){statusEl.innerHTML='<span style="color:#b42318">ไฟล์นี้ไม่ใช่รูปภาพ</span>';return}
  const mb=file.size/1024/1024,url=URL.createObjectURL(file),img=new Image();
  img.onload=()=>{
    const ratio=img.width/img.height,diff=Math.abs(ratio-s.ratioValue)/s.ratioValue;
    const issues=[];
    if(img.width<s.minW||img.height<s.minH)issues.push('ความละเอียดต่ำกว่าที่แนะนำ');
    if(diff>.12)issues.push('สัดส่วนต่างจาก '+s.ratio);
    if(mb>s.maxMB)issues.push('ไฟล์ใหญ่กว่า '+s.maxMB+' MB');
    statusEl.innerHTML=issues.length
      ?'<span style="color:#b54708">⚠ '+img.width+'×'+img.height+' px · '+mb.toFixed(2)+' MB · '+issues.join(' / ')+'</span>'
      :'<span style="color:#067647">✓ '+img.width+'×'+img.height+' px · '+mb.toFixed(2)+' MB · เหมาะกับตำแหน่งนี้</span>';
    URL.revokeObjectURL(url);
  };
  img.onerror=()=>{statusEl.innerHTML='<span style="color:#b42318">อ่านขนาดรูปไม่ได้</span>';URL.revokeObjectURL(url)};
  img.src=url;
}
function bindImageInspector(inputId,specKey,statusId,multiple=false){
  const input=document.getElementById(inputId),status=document.getElementById(statusId);if(!input||!status)return;
  input.addEventListener('change',()=>{
    const files=Array.from(input.files||[]);
    if(!files.length){status.textContent='';return}
    if(!multiple)return inspectImageFile(files[0],specKey,status);
    Promise.all(files.map(file=>new Promise(resolve=>{
      const s=imageSpecs[specKey],mb=file.size/1024/1024,url=URL.createObjectURL(file),img=new Image();
      img.onload=()=>{const ratio=img.width/img.height,diff=Math.abs(ratio-s.ratioValue)/s.ratioValue,issues=[];if(img.width<s.minW||img.height<s.minH)issues.push('เล็ก');if(diff>.12)issues.push('สัดส่วน');if(mb>s.maxMB)issues.push('ไฟล์ใหญ่');URL.revokeObjectURL(url);resolve({name:file.name,w:img.width,h:img.height,mb,issues})};
      img.onerror=()=>{URL.revokeObjectURL(url);resolve({name:file.name,issues:['อ่านไม่ได้']})};img.src=url;
    }))).then(rows=>{const bad=rows.filter(x=>x.issues.length);status.innerHTML=(bad.length?'<span style="color:#b54708">⚠ ':'<span style="color:#067647">✓ ')+files.length+' รูป · '+(bad.length?bad.length+' รูปควรปรับ':'ทุกภาพเหมาะสม')+'</span>'})
  });
}
async function init(){await App.init();document.getElementById('logoutBtn').onclick=()=>App.logout();document.getElementById('newEventBtn').onclick=createEvent;document.getElementById('eventSelect').onchange=e=>selectEvent(e.target.value);document.getElementById('nav').onclick=e=>{const b=e.target.closest('button[data-tab]');if(!b)return;state.tab=b.dataset.tab;document.querySelectorAll('#nav button').forEach(x=>x.classList.toggle('active',x===b));render()};await loadEvents();}
async function loadEvents(preferredId=null){const{data,error}=await db.from('restart_events').select('*').order('created_at',{ascending:false});if(error){Swal.fire('ไม่มีสิทธิ์เข้าถึง',error.message,'error');return}state.events=data||[];const sel=document.getElementById('eventSelect');sel.innerHTML='<option value="">-- เลือก Event --</option>'+state.events.map(e=>'<option value="'+e.id+'">'+esc(e.name)+'</option>').join('');const next=(preferredId&&state.events.find(e=>e.id===preferredId))||state.events[0]||null;state.event=next;if(next){sel.value=next.id;render()}else{sel.value='';document.getElementById('content').innerHTML='<section class="rr-card rr-empty">ยังไม่มี Event · กด “สร้าง Event ใหม่” เพื่อเริ่มต้น</section>'}}
async function selectEvent(id){state.event=state.events.find(x=>x.id===id)||null;render()}
async function createEvent(){const r=await Swal.fire({title:'สร้าง Event ใหม่',html:'<input id="e-name" class="swal2-input" placeholder="ชื่อ Event"><input id="e-slug" class="swal2-input" placeholder="slug เช่น restart-phuket-2027"><input id="e-date" type="date" class="swal2-input">',showCancelButton:true,confirmButtonText:'สร้าง',preConfirm:()=>({name:document.getElementById('e-name').value.trim(),slug:document.getElementById('e-slug').value.trim(),date:document.getElementById('e-date').value})});if(!r.isConfirmed)return;const x=r.value;if(!x.name||!x.slug)return Swal.fire('ข้อมูลไม่ครบ','','warning');const{error}=await db.from('restart_events').insert({name:x.name,slug:x.slug,event_date_start:x.date||null,status:'DRAFT'});if(error)return Swal.fire('สร้างไม่สำเร็จ',error.message,'error');await loadEvents();Swal.fire({icon:'success',title:'สร้าง Event แล้ว',timer:1200,showConfirmButton:false})}
function needEvent(){if(!state.event){document.getElementById('content').innerHTML='<section class="rr-card rr-empty">สร้างหรือเลือก Event ก่อนเริ่มตั้งค่า</section>';return false}return true}
function render(){if(!needEvent())return;({overview:renderOverview,features:renderFeatures,categories:renderCategories,packages:renderPackages,installments:renderInstallments,payments:renderPayments,telegram:renderTelegram,showcase:renderShowcase,routes:renderRoutes,form:renderForm,theme:renderTheme,registrations:renderRegistrations}[state.tab]||renderOverview)()}
function renderOverview(){const e=state.event;document.getElementById('content').innerHTML=card('แก้ไข Event','<p class="muted">แก้ไขรายละเอียด Event ได้ทุกครั้ง แล้วกด “บันทึกการแก้ไข”</p><div class="grid2"><label>ชื่อ Event<input id="evName" value="'+esc(e.name)+'"></label><label>Slug<input id="evSlug" value="'+esc(e.slug)+'"></label><label>วันที่เริ่ม<input id="evStart" type="date" value="'+(e.event_date_start||'')+'"></label><label>วันที่สิ้นสุด<input id="evEnd" type="date" value="'+(e.event_date_end||'')+'"></label><label>สถานที่<input id="evLoc" value="'+esc(e.location_name||'')+'"></label><label>จำนวนรับสูงสุด<input id="evCap" type="number" value="'+(e.capacity??'')+'"></label><label>เปิดรับสมัคร<input id="evOpen" type="datetime-local" value="'+localDT(e.registration_opens_at)+'"></label><label>ปิดรับสมัคร<input id="evClose" type="datetime-local" value="'+localDT(e.registration_closes_at)+'"></label><label>สถานะที่แสดงบน Event Card<select id="evStatus">'+eventStatusOptions.map(o=>'<option value="'+o.value+'" '+(e.status===o.value?'selected':'')+'>'+o.label+'</option>').join('')+'</select><small class="muted">หน้า Event จะดึงสถานะนี้จากหลังบ้านโดยตรง</small></label><label>ภาษาเริ่มต้น<select id="evLang">'+langs.map(l=>'<option '+(e.default_language===l?'selected':'')+'>'+l+'</option>').join('')+'</select></label></div><div style="margin-top:14px"><label>รายละเอียด<textarea id="evDesc" rows="4">'+esc(e.description||'')+'</textarea></label></div>','<a class="btn soft" target="_blank" href="../public/?event='+encodeURIComponent(e.slug)+'">Preview</a><button class="btn primary" onclick="saveOverview()">บันทึกการแก้ไข</button><button class="btn danger" onclick="deleteEvent()">ลบ Event</button>')}
function localDT(v){if(!v)return'';const d=new Date(v);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)}
async function saveOverview(){
  const name=evName.value.trim(),slug=evSlug.value.trim();
  if(!name||!slug)return Swal.fire('ข้อมูลไม่ครบ','กรุณาระบุชื่อ Event และ Slug','warning');
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))return Swal.fire('Slug ไม่ถูกต้อง','ใช้เฉพาะ a-z, 0-9 และขีดกลาง (-) เช่น restart-phuket-2027','warning');
  if(evStart.value&&evEnd.value&&evEnd.value<evStart.value)return Swal.fire('วันที่ไม่ถูกต้อง','วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม','warning');
  if(evOpen.value&&evClose.value&&new Date(evClose.value)<=new Date(evOpen.value))return Swal.fire('ช่วงรับสมัครไม่ถูกต้อง','เวลาปิดรับสมัครต้องอยู่หลังเวลาเปิดรับสมัคร','warning');
  if(evCap.value&&Number(evCap.value)<1)return Swal.fire('จำนวนรับไม่ถูกต้อง','จำนวนรับสูงสุดต้องมากกว่า 0','warning');
  const u={name,slug,event_date_start:evStart.value||null,event_date_end:evEnd.value||null,location_name:evLoc.value.trim()||null,capacity:evCap.value?Number(evCap.value):null,registration_opens_at:evOpen.value?new Date(evOpen.value).toISOString():null,registration_closes_at:evClose.value?new Date(evClose.value).toISOString():null,status:evStatus.value,default_language:evLang.value,description:evDesc.value.trim()||null};
  Swal.fire({title:'กำลังบันทึกการแก้ไข…',allowOutsideClick:false,didOpen:()=>Swal.showLoading()});
  const{data,error}=await db.from('restart_events').update(u).eq('id',state.event.id).select().single();
  if(error)return Swal.fire('บันทึกไม่สำเร็จ',error.message,'error');
  state.event=data;state.events=state.events.map(x=>x.id===data.id?data:x);
  const sel=document.getElementById('eventSelect'),opt=sel.querySelector('option[value="'+data.id+'"]');if(opt)opt.textContent=data.name;
  Swal.fire({icon:'success',title:'บันทึกการแก้ไขแล้ว',timer:1100,showConfirmButton:false});
  renderOverview();
}

async function eventDeleteSummary(eventId){
  const queries=[
    db.from('restart_registrations').select('id',{count:'exact',head:true}).eq('event_id',eventId),
    db.from('restart_participants').select('id',{count:'exact',head:true}).eq('event_id',eventId),
    db.from('restart_race_categories').select('id',{count:'exact',head:true}).eq('event_id',eventId),
    db.from('restart_packages').select('id',{count:'exact',head:true}).eq('event_id',eventId),
    db.from('restart_form_fields').select('id',{count:'exact',head:true}).eq('event_id',eventId)
  ];
  const [regs,participants,categories,packages,fields]=await Promise.all(queries);
  const firstError=[regs,participants,categories,packages,fields].find(x=>x.error)?.error;
  if(firstError)throw firstError;
  return{registrations:regs.count||0,participants:participants.count||0,categories:categories.count||0,packages:packages.count||0,fields:fields.count||0};
}
async function collectEventSlipPaths(eventId){
  const{data,error}=await db.from('restart_registrations').select('restart_payment_schedule(restart_payment_attempts(slip_path))').eq('event_id',eventId);
  if(error)return[];
  const out=[];(data||[]).forEach(r=>(r.restart_payment_schedule||[]).forEach(s=>(s.restart_payment_attempts||[]).forEach(a=>{if(a.slip_path)out.push(a.slip_path)})));
  return[...new Set(out)];
}
async function listStorageFilesRecursive(bucketName,prefix){
  const bucket=db.storage.from(bucketName),files=[];
  async function walk(path){
    let offset=0;
    while(true){
      const{data,error}=await bucket.list(path,{limit:1000,offset,sortBy:{column:'name',order:'asc'}});
      if(error)throw error;
      const items=data||[];
      for(const item of items){
        if(!item?.name||item.name==='.emptyFolderPlaceholder')continue;
        const full=path?path+'/'+item.name:item.name;
        if(item.id===null)await walk(full);
        else files.push(full);
      }
      if(items.length<1000)break;
      offset+=items.length;
    }
  }
  await walk(prefix);
  return files;
}
async function removeStorageFiles(bucketName,paths,label,warnings){
  const unique=[...new Set((paths||[]).filter(Boolean))];
  for(let i=0;i<unique.length;i+=1000){
    const chunk=unique.slice(i,i+1000);
    const{error}=await db.storage.from(bucketName).remove(chunk);
    if(error){warnings.push(label+': '+error.message);return}
  }
}
async function cleanupEventStorage(eventId,slipPaths=[]){
  const warnings=[];
  try{
    const mediaPaths=await listStorageFilesRecursive('restart-event-media',eventId);
    await removeStorageFiles('restart-event-media',mediaPaths,'รูป Event / Logo / Banner / รูป CP',warnings);
  }catch(e){warnings.push('รูป Event / Logo / Banner / รูป CP: '+(e.message||e))}
  try{
    const routePaths=await listStorageFilesRecursive('restart-route-files',eventId);
    await removeStorageFiles('restart-route-files',routePaths,'ไฟล์ GPX Route',warnings);
  }catch(e){warnings.push('ไฟล์ GPX Route: '+(e.message||e))}
  try{
    await removeStorageFiles('restart-slips',slipPaths,'สลิปชำระเงิน',warnings);
  }catch(e){warnings.push('สลิปชำระเงิน: '+(e.message||e))}
  return warnings;
}
async function deleteEvent(){
  const e=state.event;if(!e)return;
  let summary;
  try{
    Swal.fire({title:'กำลังตรวจข้อมูล Event…',allowOutsideClick:false,didOpen:()=>Swal.showLoading()});
    summary=await eventDeleteSummary(e.id);
  }catch(err){return Swal.fire('ตรวจข้อมูลไม่สำเร็จ',err.message||String(err),'error')}
  const html='<div style="text-align:left;line-height:1.7"><b>การลบนี้ถาวรและกู้คืนไม่ได้</b><br>Event: <b>'+esc(e.name)+'</b><hr style="border:0;border-top:1px solid #eee"><div>ใบสมัคร: <b>'+summary.registrations+'</b></div><div>ผู้เข้าแข่งขัน: <b>'+summary.participants+'</b></div><div>รุ่นการแข่งขัน: <b>'+summary.categories+'</b></div><div>Package: <b>'+summary.packages+'</b></div><div>Custom Field: <b>'+summary.fields+'</b></div><br><span class="muted">ข้อมูลที่ผูกกับ Event เช่น แผนผ่อน ช่องทางชำระเงิน ผู้รับผลประโยชน์ และรายการชำระเงิน จะถูกลบตามด้วย</span><br><br>พิมพ์ชื่อ Event เพื่อยืนยัน:</div>';
  const r=await Swal.fire({title:'ลบ Event?',html,input:'text',inputPlaceholder:e.name,icon:'warning',showCancelButton:true,confirmButtonText:'ลบ Event ถาวร',cancelButtonText:'ยกเลิก',confirmButtonColor:'#d92d20',reverseButtons:true,preConfirm:v=>{if(String(v||'').trim()!==e.name)return Swal.showValidationMessage('กรุณาพิมพ์ชื่อ Event ให้ตรง: '+e.name);return v}});
  if(!r.isConfirmed)return;
  Swal.fire({title:'กำลังลบ Event…',html:'กำลังลบข้อมูลที่เกี่ยวข้อง กรุณาอย่าปิดหน้านี้',allowOutsideClick:false,allowEscapeKey:false,didOpen:()=>Swal.showLoading()});
  const slipPaths=await collectEventSlipPaths(e.id);
  const{data,error}=await db.from('restart_events').delete().eq('id',e.id).select('id');
  if(error)return Swal.fire('ลบ Event ไม่สำเร็จ',error.message,'error');
  if(!data?.length)return Swal.fire('ลบ Event ไม่สำเร็จ','ระบบไม่พบ Event หรือบัญชีนี้ไม่มีสิทธิ์ลบ','error');
  const storageWarnings=await cleanupEventStorage(e.id,slipPaths);
  state.event=null;
  await loadEvents();
  if(storageWarnings.length)return Swal.fire({icon:'warning',title:'ลบ Event แล้ว',html:'ข้อมูล Event ถูกลบเรียบร้อย แต่มีไฟล์บางรายการใน Storage ที่ลบไม่สำเร็จ:<br><small>'+storageWarnings.map(esc).join('<br>')+'</small>'});
  Swal.fire({icon:'success',title:'ลบ Event เรียบร้อย',text:e.name,timer:1500,showConfirmButton:false});
}

function renderFeatures(){
  const f=state.event.feature_flags||{},teamCount=Math.max(2,Math.min(100,Number(f.team_members_count||f.team_min_members||3)));
  const groupSettings='<div class="paybox" style="margin-top:16px"><h3>ตั้งค่าการสมัครคู่ / ทีม</h3><div class="grid2">'+
    '<label>สมัครคู่<small class="muted">เมื่อเปิด ระบบจะบังคับผู้แข่งขัน 2 คนต่อใบสมัคร</small><input value="2 คน" disabled></label>'+
    '<label>จำนวนสมาชิกต่อทีม<small class="muted">Admin เป็นผู้กำหนด · ผู้สมัครเปลี่ยนจำนวนเองไม่ได้</small><input id="teamMembersCount" type="number" min="2" max="100" value="'+teamCount+'"></label>'+
    '<label>ชื่อทีมบังคับหรือไม่<select id="teamNameRequired"><option value="true" '+(f.team_name_required===false?'':'selected')+'>บังคับชื่อทีม</option><option value="false" '+(f.team_name_required===false?'selected':'')+'>ไม่บังคับ</option></select></label>'+
    '</div><p class="muted" style="margin-top:10px">เมื่อเปิดสมัครทีม ระบบจะสร้างฟอร์มสมาชิกตามจำนวนที่กำหนดนี้พอดี และฝั่ง Server จะไม่รับใบสมัครที่จำนวนสมาชิกไม่ตรง · Package ที่ใช้กับทีมต้องตั้ง runner_count ให้เท่ากับจำนวนสมาชิกต่อทีม</p></div>';
  document.getElementById('content').innerHTML=card('เปิด / ปิดฟังก์ชัน','<p class="muted">ทุก Event ตั้งค่าแยกกันได้</p><div class="toggle-grid">'+Object.entries(featureLabels).map(([k,l])=>'<label class="toggle"><span>'+l+'</span><input type="checkbox" data-feature="'+k+'" '+(f[k]?'checked':'')+'></label>').join('')+'</div>'+groupSettings,'<button class="btn soft" onclick="setAllFeatures(true)">เปิดทั้งหมด</button><button class="btn soft" onclick="setAllFeatures(false)">ปิดทั้งหมด</button><button class="btn primary" onclick="saveFeatures()">บันทึก</button>')
}
function setAllFeatures(v){document.querySelectorAll('[data-feature]').forEach(x=>x.checked=v)}
async function saveFeatures(){
  const f={...state.event.feature_flags};document.querySelectorAll('[data-feature]').forEach(x=>f[x.dataset.feature]=x.checked);
  const teamCount=Math.max(2,Math.min(100,Number(teamMembersCount.value||3)));
  f.team_members_count=teamCount;delete f.team_min_members;delete f.team_max_members;f.team_name_required=teamNameRequired.value!=='false';
  const{data,error}=await db.from('restart_events').update({feature_flags:f}).eq('id',state.event.id).select().single();
  if(error)return Swal.fire('บันทึกไม่สำเร็จ',error.message,'error');state.event=data;state.events=state.events.map(x=>x.id===data.id?data:x);Swal.fire({icon:'success',title:'บันทึกฟังก์ชันแล้ว',text:'ทีมละ '+teamCount+' คน',timer:1200,showConfirmButton:false});renderFeatures()
}
async function renderCategories(){
  document.getElementById('content').innerHTML=card('รุ่นการแข่งขัน & ราคา','<p class="muted">ข้อมูลระยะ ราคา เวลา Start และ Cutoff จะถูกนำไปแสดงในหน้า Preview Event อัตโนมัติ</p><div id="catBox">กำลังโหลด…</div>','<button class="btn primary" onclick="categoryDialog()">+ เพิ่มรุ่น</button>');
  const{data,error}=await db.from('restart_race_categories').select('*').eq('event_id',state.event.id).order('sort_order');
  if(error)return catBox.innerHTML=esc(error.message);
  catBox.innerHTML=data?.length
    ?'<div class="table-wrap"><table><thead><tr><th>รหัส</th><th>รุ่น</th><th>ระยะ</th><th>Start</th><th>Cutoff</th><th>เวลาคาดหมาย</th><th>ราคา</th><th>สถานะ</th><th></th></tr></thead><tbody>'+
      data.map(x=>'<tr><td>'+esc(x.code)+'</td><td>'+esc(t(x.name))+'</td><td>'+(x.distance_km??'—')+' km</td><td>'+(x.start_time?esc(String(x.start_time).slice(0,5)):'—')+'</td><td>'+(x.cutoff_minutes?formatMinutes(x.cutoff_minutes):'—')+'</td><td>'+(x.expected_duration_minutes?formatMinutes(x.expected_duration_minutes):'—')+'</td><td>฿'+money(x.base_price_thb)+'</td><td><span class="badge '+(x.is_active?'ok':'')+'">'+(x.is_active?'เปิด':'ปิด')+'</span></td><td><div class="row"><button class="btn sm soft" onclick="editCategory(\''+x.id+'\')">แก้ไข</button><button class="btn sm soft" onclick="toggleRow(\'restart_race_categories\',\''+x.id+'\',\'is_active\','+(!x.is_active)+',renderCategories)">'+(x.is_active?'ปิด':'เปิด')+'</button><button class="btn sm danger" onclick="delRow(\'restart_race_categories\',\''+x.id+'\',renderCategories)">ลบ</button></div></td></tr>').join('')+
      '</tbody></table></div>'
    :'<div class="rr-empty">ยังไม่มีรุ่นการแข่งขัน</div>';
}
function formatMinutes(v){const n=Number(v||0);if(!n)return'—';const h=Math.floor(n/60),m=n%60;return h?(h+' ชม.'+(m?' '+m+' นาที':'')):(m+' นาที')}
async function categoryDialog(){
  const r=await Swal.fire({
    title:'เพิ่มรุ่นการแข่งขัน',width:820,
    html:'<div class="grid2" style="text-align:left">'+
      '<label>รหัส<input id="cCode" class="swal2-input" style="margin:0"></label>'+
      '<label>ชื่อรุ่น<input id="cName" class="swal2-input" style="margin:0"></label>'+
      '<label>ระยะ km<input id="cDist" type="number" step=".1" class="swal2-input" style="margin:0"></label>'+
      '<label>เพศ<select id="cGender" class="swal2-select" style="margin:0;width:100%"><option>ANY</option><option>MALE</option><option>FEMALE</option></select></label>'+
      '<label>อายุต่ำสุด<input id="cMin" type="number" class="swal2-input" style="margin:0"></label>'+
      '<label>อายุสูงสุด<input id="cMax" type="number" class="swal2-input" style="margin:0"></label>'+
      '<label>ราคา<input id="cPrice" type="number" class="swal2-input" style="margin:0"></label>'+
      '<label>Early Bird<input id="cEarly" type="number" class="swal2-input" style="margin:0"></label>'+
      '<label>เวลา Start<input id="cStart" type="time" class="swal2-input" style="margin:0"></label>'+
      '<label>Cutoff (นาที)<input id="cCutoff" type="number" min="1" class="swal2-input" style="margin:0"></label>'+
      '<label>เวลาคาดหมาย (นาที)<input id="cDuration" type="number" min="1" class="swal2-input" style="margin:0"></label>'+
      '<label>Elevation Gain (เมตร)<input id="cElev" type="number" min="0" class="swal2-input" style="margin:0"></label>'+
    '</div>',
    showCancelButton:true,confirmButtonText:'เพิ่ม',
    preConfirm:()=>({
      code:cCode.value.trim(),name:cName.value.trim(),distance:cDist.value?Number(cDist.value):null,
      gender:cGender.value,min:cMin.value?Number(cMin.value):null,max:cMax.value?Number(cMax.value):null,
      price:Number(cPrice.value)||0,early:cEarly.value?Number(cEarly.value):null,
      start:cStart.value||null,cutoff:cCutoff.value?Number(cCutoff.value):null,
      duration:cDuration.value?Number(cDuration.value):null,elev:cElev.value?Number(cElev.value):null
    })
  });
  if(!r.isConfirmed)return;
  const x=r.value;
  if(!x.code||!x.name)return Swal.fire('ข้อมูลไม่ครบ','กรุณาระบุรหัสและชื่อรุ่น','warning');
  const{error}=await db.from('restart_race_categories').insert({
    event_id:state.event.id,code:x.code,name:{th:x.name,en:x.name},distance_km:x.distance,
    gender_rule:x.gender,min_age:x.min,max_age:x.max,base_price_thb:x.price,early_bird_price_thb:x.early,
    start_time:x.start,cutoff_minutes:x.cutoff,expected_duration_minutes:x.duration,elevation_gain_m:x.elev
  });
  if(error)return Swal.fire('เพิ่มไม่สำเร็จ',error.message,'error');
  renderCategories();
}
async function renderPackages(){document.getElementById('content').innerHTML=card('Package','<div id="pkgBox">กำลังโหลด…</div>','<button class="btn primary" onclick="packageDialog()">+ เพิ่ม Package</button>');const{data,error}=await db.from('restart_packages').select('*,restart_race_categories(name)').eq('event_id',state.event.id).order('sort_order');if(error)return pkgBox.innerHTML=esc(error.message);pkgBox.innerHTML=data?.length?'<div class="table-wrap"><table><thead><tr><th>รหัส</th><th>Package</th><th>รุ่น</th><th>ราคา</th><th>ผู้แข่งขัน</th><th>ผู้ติดตาม</th><th>สถานะ</th><th></th></tr></thead><tbody>'+data.map(x=>'<tr><td>'+esc(x.code)+'</td><td>'+esc(t(x.name))+'</td><td>'+esc(t(x.restart_race_categories?.name)||'ทุกรุ่น')+'</td><td>'+esc(x.price_mode)+' ฿'+money(x.price_value_thb)+'</td><td>'+x.runner_count+'</td><td>'+x.follower_count+'</td><td><span class="badge '+(x.is_active?'ok':'')+'">'+(x.is_active?'เปิด':'ปิด')+'</span></td><td><div class="row"><button class="btn sm soft" onclick="editPackage(\''+x.id+'\')">แก้ไข</button><button class="btn sm soft" onclick="toggleRow(\'restart_packages\',\''+x.id+'\',\'is_active\','+(!x.is_active)+',renderPackages)">'+(x.is_active?'ปิด':'เปิด')+'</button><button class="btn sm danger" onclick="delRow(\'restart_packages\',\''+x.id+'\',renderPackages)">ลบ</button></div></td></tr>').join('')+'</tbody></table></div>':'<div class="rr-empty">ยังไม่มี Package</div>'}
async function packageDialog(){const{data:cats}=await db.from('restart_race_categories').select('id,name').eq('event_id',state.event.id).eq('is_active',true);const opts='<option value="">ทุก รุ่น</option>'+(cats||[]).map(x=>'<option value="'+x.id+'">'+esc(t(x.name))+'</option>').join('');const r=await Swal.fire({title:'เพิ่ม Package',width:700,html:'<div class="grid2" style="text-align:left"><label>รหัส<input id="pCode" class="swal2-input" style="margin:0"></label><label>ชื่อ<input id="pName" class="swal2-input" style="margin:0"></label><label>ผูกกับรุ่น<select id="pCat" class="swal2-select" style="margin:0;width:100%">'+opts+'</select></label><label>รูปแบบราคา<select id="pMode" class="swal2-select" style="margin:0;width:100%"><option value="ADD">บวกเพิ่มจากราคารุ่น</option><option value="REPLACE">ใช้ราคานี้แทน</option></select></label><label>ราคา<input id="pPrice" type="number" class="swal2-input" style="margin:0"></label><label>จำนวนผู้แข่งขัน<input id="pRun" type="number" value="1" class="swal2-input" style="margin:0"></label><label>จำนวนผู้ติดตาม<input id="pFollow" type="number" value="0" class="swal2-input" style="margin:0"></label></div>',showCancelButton:true,preConfirm:()=>({code:pCode.value.trim(),name:pName.value.trim(),cat:pCat.value||null,mode:pMode.value,price:Number(pPrice.value)||0,runners:Number(pRun.value)||1,followers:Number(pFollow.value)||0})});if(!r.isConfirmed)return;const x=r.value;const{error}=await db.from('restart_packages').insert({event_id:state.event.id,category_id:x.cat,code:x.code,name:{th:x.name,en:x.name},price_mode:x.mode,price_value_thb:x.price,runner_count:x.runners,follower_count:x.followers});if(error)return Swal.fire('เพิ่มไม่สำเร็จ',error.message,'error');renderPackages()}
async function renderInstallments(){document.getElementById('content').innerHTML=card('การผ่อนชำระ','<p class="muted">กำหนดแผนได้ตาม Event / รุ่น / Package และกำหนดแต่ละงวดได้เอง</p><div id="insBox">กำลังโหลด…</div>','<button class="btn primary" onclick="installmentDialog()">+ เพิ่มแผนผ่อน</button>');const{data,error}=await db.from('restart_installment_plans').select('*,restart_installment_steps(*)').eq('event_id',state.event.id).order('priority',{ascending:false});if(error)return insBox.innerHTML=esc(error.message);insBox.innerHTML=data?.length?data.map(p=>'<div class="paybox" style="margin-top:10px"><div class="row space"><strong>'+esc(t(p.name))+'</strong><button class="btn sm danger" onclick="delPlan(\''+p.id+'\')">ลบ</button></div><div class="muted">จำนวน '+p.installment_count+' งวด · งวดแรก '+money(p.first_payment_thb||0)+' บาท</div><div style="margin-top:8px">'+(p.restart_installment_steps||[]).sort((a,b)=>a.installment_no-b.installment_no).map(s=>'<span class="badge" style="margin:3px">งวด '+s.installment_no+': '+(s.amount_mode==='FIXED'?money(s.amount_value):'AUTO')+'</span>').join('')+'</div></div>').join(''):'<div class="rr-empty">ยังไม่มีแผนผ่อน</div>'}
async function installmentDialog(){const r=await Swal.fire({title:'เพิ่มแผนผ่อน',html:'<input id="iName" class="swal2-input" placeholder="ชื่อแผน"><input id="iCount" type="number" min="2" value="3" class="swal2-input" placeholder="จำนวนงวด"><input id="iFirst" type="number" value="3000" class="swal2-input" placeholder="งวดแรก">',showCancelButton:true,preConfirm:()=>({name:iName.value.trim(),count:Number(iCount.value),first:Number(iFirst.value)})});if(!r.isConfirmed)return;const x=r.value;const{data:p,error}=await db.from('restart_installment_plans').insert({event_id:state.event.id,name:{th:x.name,en:x.name},installment_count:x.count,first_payment_thb:x.first}).select().single();if(error)return Swal.fire('เพิ่มไม่สำเร็จ',error.message,'error');const steps=Array.from({length:x.count},(_,i)=>({plan_id:p.id,installment_no:i+1,amount_mode:i===0?'FIXED':'AUTO',amount_value:i===0?x.first:null}));await db.from('restart_installment_steps').insert(steps);renderInstallments()}
async function delPlan(id){await db.from('restart_installment_steps').delete().eq('plan_id',id);await db.from('restart_installment_plans').delete().eq('id',id);renderInstallments()}
async function renderPayments(){document.getElementById('content').innerHTML=card('ช่องทางชำระเงิน','<div id="payBox">กำลังโหลด…</div>','<button class="btn primary" onclick="paymentDialog()">+ เพิ่มช่องทาง</button>');const{data,error}=await db.from('restart_payment_methods').select('*').eq('event_id',state.event.id).order('sort_order');if(error)return payBox.innerHTML=esc(error.message);payBox.innerHTML=data?.length?'<div class="grid2">'+data.map(x=>'<div class="paybox"><div class="row space"><strong>'+esc(x.label||x.kind)+'</strong><span class="badge '+(x.is_enabled?'ok':'')+'">'+(x.is_enabled?'เปิด':'ปิด')+'</span></div><div class="muted" style="margin-top:8px">'+(x.kind==='PROMPTPAY'?esc(x.promptpay_id||''):esc((x.bank_name||'')+' '+(x.account_number||'')))+'</div><div class="row" style="margin-top:10px"><button class="btn sm soft" onclick="editPayment(\''+x.id+'\')">แก้ไข</button><button class="btn sm soft" onclick="toggleRow(\'restart_payment_methods\',\''+x.id+'\',\'is_enabled\','+(!x.is_enabled)+',renderPayments)">'+(x.is_enabled?'ปิด':'เปิด')+'</button><button class="btn sm danger" onclick="delRow(\'restart_payment_methods\',\''+x.id+'\',renderPayments)">ลบ</button></div></div>').join('')+'</div>':'<div class="rr-empty">ยังไม่มีช่องทางชำระเงิน</div>'}
async function paymentDialog(){
  const r=await Swal.fire({
    title:'เพิ่มช่องทางชำระเงิน',
    width:720,
    html:'<div class="grid2" style="text-align:left">'+
      '<label>ประเภท<select id="mKind" class="swal2-select" style="margin:0;width:100%"><option value="BANK">บัญชีธนาคาร</option><option value="PROMPTPAY">PromptPay</option></select></label>'+
      '<label>ชื่อแสดง<input id="mLabel" class="swal2-input" style="margin:0"></label>'+
      '<div id="mBankBox" style="display:contents"><label>ธนาคาร<input id="mBank" class="swal2-input" style="margin:0"></label><label>ชื่อบัญชี<input id="mAccName" class="swal2-input" style="margin:0"></label><label>เลขบัญชี<input id="mAccNo" class="swal2-input" style="margin:0"></label></div>'+
      '<div id="mPPBox" style="display:none;grid-column:1/-1"><div class="grid2"><label>ประเภท PromptPay<select id="mPPType" class="swal2-select" style="margin:0;width:100%"><option value="PHONE">เบอร์โทรศัพท์</option><option value="NATIONAL_ID">เลขบัตรประชาชน / เลขผู้เสียภาษี</option><option value="EWALLET">E-Wallet ID</option></select></label><label>PromptPay ID<input id="mPP" class="swal2-input" style="margin:0" inputmode="numeric"></label></div></div>'+
      '</div>',
    showCancelButton:true,
    confirmButtonText:'เพิ่ม',
    didOpen:()=>{
      const kind=document.getElementById('mKind'),bank=document.getElementById('mBankBox'),pp=document.getElementById('mPPBox');
      const sync=()=>{const isPP=kind.value==='PROMPTPAY';bank.style.display=isPP?'none':'contents';pp.style.display=isPP?'block':'none'};
      kind.addEventListener('change',sync);sync();
    },
    preConfirm:()=>{
      const kind=document.getElementById('mKind').value;
      const label=document.getElementById('mLabel').value.trim();
      const ppType=document.getElementById('mPPType').value;
      const pp=document.getElementById('mPP').value.replace(/\D/g,'');
      if(!label)return Swal.showValidationMessage('กรุณาระบุชื่อแสดง');
      if(kind==='BANK'&&!document.getElementById('mAccNo').value.trim())return Swal.showValidationMessage('กรุณาระบุเลขบัญชี');
      if(kind==='PROMPTPAY'){
        if(!pp)return Swal.showValidationMessage('กรุณาระบุ PromptPay ID');
        if(ppType==='PHONE'&&pp.length!==10)return Swal.showValidationMessage('เบอร์โทร PromptPay ต้องมี 10 หลัก');
        if(ppType==='NATIONAL_ID'&&pp.length!==13)return Swal.showValidationMessage('เลขบัตรประชาชน / เลขผู้เสียภาษี ต้องมี 13 หลัก');
      }
      return{
        kind,label,
        bank:document.getElementById('mBank').value.trim(),
        an:document.getElementById('mAccName').value.trim(),
        no:document.getElementById('mAccNo').value.trim(),
        ppType,pp
      };
    }
  });
  if(!r.isConfirmed)return;
  const x=r.value;
  const payload=x.kind==='PROMPTPAY'
    ?{event_id:state.event.id,kind:'PROMPTPAY',label:x.label,bank_name:null,account_name:null,account_number:null,promptpay_type:x.ppType,promptpay_id:x.pp,qr_enabled:true,is_enabled:true}
    :{event_id:state.event.id,kind:'BANK',label:x.label,bank_name:x.bank||null,account_name:x.an||null,account_number:x.no||null,promptpay_type:null,promptpay_id:null,qr_enabled:false,is_enabled:true};
  const{error}=await db.from('restart_payment_methods').insert(payload);
  if(error)return Swal.fire('เพิ่มไม่สำเร็จ',error.message,'error');
  Swal.fire({icon:'success',title:'เพิ่มช่องทางชำระเงินแล้ว',timer:900,showConfirmButton:false});
  renderPayments();
}

async function telegramApi(action,payload={}){
  const{data:{session},error:sessionError}=await db.auth.getSession();
  if(sessionError||!session?.access_token)throw new Error('Session หมดอายุ กรุณาเข้าสู่ระบบใหม่');
  const res=await fetch(App.cfg.SUPABASE_URL+'/functions/v1/restart-registration-api?action='+encodeURIComponent(action),{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'apikey':App.cfg.SUPABASE_PUBLISHABLE_KEY,
      'authorization':'Bearer '+session.access_token
    },
    body:JSON.stringify(payload)
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(data.error||('HTTP '+res.status));
  return data;
}
async function renderTelegram(){
  document.getElementById('content').innerHTML=card('Telegram แจ้งเตือน','<div class="rr-empty">กำลังโหลดการตั้งค่า Telegram…</div>');
  let x;
  try{x=await telegramApi('telegram-settings',{event_id:state.event.id})}
  catch(e){return document.getElementById('content').innerHTML=card('Telegram แจ้งเตือน','<div class="badge danger">'+esc(e.message||String(e))+'</div>')}
  const tokenStatus=x.has_bot_token
    ?'<span class="badge ok">ตั้งค่า Bot Token แล้ว</span>'
    :'<span class="badge warn">ยังไม่ได้ตั้ง Bot Token</span>';
  const notifyStatus=x.notifications_enabled
    ?'<span class="badge ok">Notifications เปิดอยู่</span>'
    :'<span class="badge warn">Notifications ปิดอยู่</span>';
  document.getElementById('content').innerHTML=card(
    'Telegram แจ้งเตือน',
    '<div class="row" style="margin-bottom:16px">'+tokenStatus+notifyStatus+'</div>'+
    '<div class="rr-card" style="box-shadow:none;background:var(--soft);margin-bottom:16px">'+
      '<h3 style="margin-top:0">แจ้ง Admin เมื่อมีผู้สมัครใหม่</h3>'+
      '<p class="muted">หลังระบบบันทึกใบสมัครสำเร็จ จะส่งชื่อ Event, รหัสสมัคร, ชื่อผู้สมัคร, รุ่น, Package, ยอดชำระ และสถานะสลิปไป Telegram โดยอัตโนมัติ</p>'+
      '<label style="display:flex;align-items:center;gap:10px"><input id="tgEnabled" type="checkbox" style="width:auto" '+(x.enabled?'checked':'')+'> เปิดใช้งาน Telegram สำหรับ Event นี้</label>'+
    '</div>'+
    '<div class="grid2">'+
      '<label>Bot Token'+
        '<input id="tgToken" type="password" autocomplete="new-password" placeholder="'+(x.has_bot_token?'ตั้งค่าแล้ว · เว้นว่างเพื่อใช้ Token เดิม':'เช่น 123456789:AA...')+'">'+
        '<small class="muted">Token จะถูกส่งไปเก็บฝั่ง Server และจะไม่ถูกดึงกลับมาแสดงบนหน้าเว็บ</small>'+
      '</label>'+
      '<label>Chat ID'+
        '<input id="tgChatId" value="'+esc(x.chat_id||'')+'" placeholder="-100xxxxxxxxxx หรือ @channelname">'+
        '<small class="muted">รองรับ Chat ID ของผู้ใช้/กลุ่ม และ @username ของ Channel</small>'+
      '</label>'+
    '</div>'+
    '<div class="rr-card" style="box-shadow:none;margin-top:16px">'+
      '<h3 style="margin-top:0">ตัวอย่างข้อความ</h3>'+
      '<pre style="white-space:pre-wrap;margin:0;font-family:inherit;line-height:1.65">🔔 มีผู้สมัครใหม่\n🏁 Event: '+esc(state.event.name)+'\n🎟 รหัสสมัคร: RST-...\n👤 ผู้สมัคร: ชื่อ นามสกุล\n🏷 รุ่น / Package\n💰 ยอดรวม / ยอดงวดแรก\n📎 สลิป: แนบแล้ว · รอตรวจสอบ</pre>'+
    '</div>',
    '<button class="btn soft" onclick="testTelegram()">ทดสอบส่งข้อความ</button><button class="btn primary" onclick="saveTelegramSettings()">บันทึก Telegram</button>'
  );
}
async function saveTelegramSettings(silent=false){
  const payload={
    event_id:state.event.id,
    enabled:document.getElementById('tgEnabled').checked,
    bot_token:document.getElementById('tgToken').value.trim(),
    chat_id:document.getElementById('tgChatId').value.trim()
  };
  if(!silent)Swal.fire({title:'กำลังบันทึก Telegram…',allowOutsideClick:false,didOpen:()=>Swal.showLoading()});
  try{
    const data=await telegramApi('telegram-settings-save',payload);
    state.event.feature_flags={...(state.event.feature_flags||{}),notifications:!!data.enabled};
    state.events=state.events.map(e=>e.id===state.event.id?{...e,feature_flags:state.event.feature_flags}:e);
    if(!silent)Swal.fire({icon:'success',title:'บันทึก Telegram แล้ว',timer:1100,showConfirmButton:false});
    return true;
  }catch(e){
    Swal.fire('บันทึก Telegram ไม่สำเร็จ',e.message||String(e),'error');
    return false;
  }
}
async function testTelegram(){
  const ok=await saveTelegramSettings(true);if(!ok)return;
  Swal.fire({title:'กำลังทดสอบ Telegram…',allowOutsideClick:false,didOpen:()=>Swal.showLoading()});
  try{
    await telegramApi('telegram-test',{event_id:state.event.id});
    Swal.fire({icon:'success',title:'ส่งข้อความทดสอบแล้ว',text:'ตรวจ Telegram ที่ตั้งค่าไว้ได้เลย'});
    renderTelegram();
  }catch(e){Swal.fire('ทดสอบไม่สำเร็จ',e.message||String(e),'error')}
}
function lineArray(v){return String(v||'').split(/\n+/).map(x=>x.trim()).filter(Boolean)}
function localizedText(v){return typeof v==='object'?(v?.th||v?.en||''):String(v||'')}
function mediaCard(m){
  return '<div class="paybox" style="margin:0"><img src="'+esc(m.url)+'" alt="" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:12px"><div class="row space" style="margin-top:8px"><b>'+esc(m.media_type)+'</b><button class="btn sm danger" onclick="deleteShowcaseMedia(\''+m.id+'\',\''+esc(m.url)+'\')">ลบ</button></div></div>';
}
async function renderShowcase(){
  document.getElementById('content').innerHTML=card('พรีวิว Event','<div class="rr-empty">กำลังโหลด…</div>');
  const [showRes,mediaRes]=await Promise.all([
    db.from('restart_event_showcase').select('*').eq('event_id',state.event.id).maybeSingle(),
    db.from('restart_event_media').select('*').eq('event_id',state.event.id).eq('is_active',true).order('sort_order')
  ]);
  if(showRes.error)return document.getElementById('content').innerHTML=card('พรีวิว Event','<div class="badge danger">'+esc(showRes.error.message)+'</div>');
  if(mediaRes.error)return document.getElementById('content').innerHTML=card('พรีวิว Event','<div class="badge danger">'+esc(mediaRes.error.message)+'</div>');
  const x=showRes.data||{}, media=mediaRes.data||[];
  const gallery=media.filter(m=>['SHIRT','MEDAL','TROPHY','COURSE_MAP','AWARD','GALLERY','BACKGROUND'].includes(m.media_type));
  document.getElementById('content').innerHTML=card(
    'พรีวิว Event',
    '<p class="muted">หน้านี้คือข้อมูลที่ผู้สมัครจะเห็นหลังจากกด Event Card ก่อนเข้าสู่ฟอร์มสมัครจริง</p>'+
    '<div class="grid2">'+
      '<label>Tagline<input id="scTagline" value="'+esc(localizedText(x.tagline))+'" placeholder="เช่น Run with heart. Finish with purpose."></label>'+
      '<label>รายละเอียดสถานที่<input id="scVenue" value="'+esc(localizedText(x.venue_details))+'" placeholder="จุดปล่อยตัว / ที่จอดรถ / การเดินทาง"></label>'+
      '<label style="grid-column:1/-1">ภาพรวม Event<textarea id="scOverview" rows="5">'+esc(localizedText(x.overview))+'</textarea></label>'+
      '<label>Highlight · 1 บรรทัดต่อ 1 ข้อ<textarea id="scHighlights" rows="7">'+esc(Array.isArray(x.highlights)?x.highlights.join('\n'):'')+'</textarea></label>'+
      '<label>สิ่งที่นักวิ่งได้รับ · 1 บรรทัดต่อ 1 ข้อ<textarea id="scInclusions" rows="7">'+esc(Array.isArray(x.inclusions)?x.inclusions.join('\n'):'')+'</textarea></label>'+
      '<label>ข้อมูลรางวัล / ถ้วย<textarea id="scAwards" rows="5">'+esc(localizedText(x.awards_text))+'</textarea></label>'+
      '<label>ข้อมูลเส้นทาง<textarea id="scCourse" rows="5">'+esc(localizedText(x.course_notes))+'</textarea></label>'+
      '<label>กติกาสำคัญ · 1 บรรทัดต่อ 1 ข้อ<textarea id="scRules" rows="7">'+esc(Array.isArray(x.rules)?x.rules.join('\n'):'')+'</textarea></label>'+
      '<label>ข้อมูลติดต่อ<textarea id="scContact" rows="7">'+esc(localizedText(x.contact_details))+'</textarea></label>'+
    '</div>'+
    '<hr style="border:0;border-top:1px solid var(--line);margin:22px 0">'+
    '<h3>รูปสำหรับหน้า Preview</h3>'+imageGuide()+
    '<div class="grid3">'+
      '<label>ภาพพื้นหลัง Hero<input id="scBackground" type="file" accept="image/*">'+imageHint('background','scBackgroundStatus')+'</label>'+
      '<label>เสื้อแข่งขัน<input id="scShirt" type="file" accept="image/*">'+imageHint('square','scShirtStatus')+'</label>'+
      '<label>เหรียญ<input id="scMedal" type="file" accept="image/*">'+imageHint('square','scMedalStatus')+'</label>'+
      '<label>ถ้วยรางวัล<input id="scTrophy" type="file" accept="image/*">'+imageHint('square','scTrophyStatus')+'</label>'+
      '<label>แผนที่เส้นทาง<input id="scMap" type="file" accept="image/*">'+imageHint('courseMap','scMapStatus')+'</label>'+
      '<label>รูป Gallery เพิ่มเติม<input id="scGallery" type="file" accept="image/*" multiple>'+imageHint('gallery','scGalleryStatus')+'</label>'+
    '</div>'+
    '<div class="grid3" style="margin-top:16px">'+(gallery.length?gallery.map(mediaCard).join(''):'<div class="rr-empty" style="grid-column:1/-1">ยังไม่มีรูป Preview</div>')+'</div>',
    '<a class="btn soft" target="_blank" href="../public/?event='+encodeURIComponent(state.event.slug)+'">เปิด Preview</a><button class="btn primary" onclick="saveShowcase()">บันทึก Preview</button>'
  );
  bindImageInspector('scBackground','background','scBackgroundStatus');bindImageInspector('scShirt','square','scShirtStatus');bindImageInspector('scMedal','square','scMedalStatus');bindImageInspector('scTrophy','square','scTrophyStatus');bindImageInspector('scMap','courseMap','scMapStatus');bindImageInspector('scGallery','gallery','scGalleryStatus',true);
}
async function saveShowcase(){
  try{
    Swal.fire({title:'กำลังบันทึกหน้า Preview…',allowOutsideClick:false,didOpen:()=>Swal.showLoading()});
    const {data:{user}}=await db.auth.getUser();
    const row={
      event_id:state.event.id,
      tagline:{th:scTagline.value.trim(),en:scTagline.value.trim()},
      overview:{th:scOverview.value.trim(),en:scOverview.value.trim()},
      highlights:lineArray(scHighlights.value),
      inclusions:lineArray(scInclusions.value),
      rules:lineArray(scRules.value),
      awards_text:{th:scAwards.value.trim(),en:scAwards.value.trim()},
      course_notes:{th:scCourse.value.trim(),en:scCourse.value.trim()},
      venue_details:{th:scVenue.value.trim(),en:scVenue.value.trim()},
      contact_details:{th:scContact.value.trim(),en:scContact.value.trim()},
      updated_by:user?.id||null,updated_at:new Date().toISOString()
    };
    const{error}=await db.from('restart_event_showcase').upsert(row,{onConflict:'event_id'});
    if(error)throw error;
    const singles=[
      ['BACKGROUND',scBackground.files[0]],['SHIRT',scShirt.files[0]],['MEDAL',scMedal.files[0]],
      ['TROPHY',scTrophy.files[0]],['COURSE_MAP',scMap.files[0]]
    ];
    for(const [type,file] of singles)if(file)await replaceShowcaseMedia(type,file);
    for(const file of Array.from(scGallery.files||[]))await addShowcaseMedia('GALLERY',file);
    Swal.fire({icon:'success',title:'บันทึกหน้า Preview แล้ว',timer:1100,showConfirmButton:false});
    renderShowcase();
  }catch(e){Swal.fire('บันทึกไม่สำเร็จ',e.message||String(e),'error')}
}
async function addShowcaseMedia(type,file){
  const url=await uploadMedia(file,type.toLowerCase());
  const{error}=await db.from('restart_event_media').insert({event_id:state.event.id,media_type:type,url,alt_text:{th:type,en:type},sort_order:0,is_active:true});
  if(error)throw error;
}
async function replaceShowcaseMedia(type,file){
  const{error:delError}=await db.from('restart_event_media').delete().eq('event_id',state.event.id).eq('media_type',type);
  if(delError)throw delError;
  await addShowcaseMedia(type,file);
}
async function deleteShowcaseMedia(id,url){
  const r=await Swal.fire({title:'ลบรูปนี้?',icon:'warning',showCancelButton:true,confirmButtonText:'ลบ'});
  if(!r.isConfirmed)return;
  const{error}=await db.from('restart_event_media').delete().eq('id',id);
  if(error)return Swal.fire('ลบไม่ได้',error.message,'error');
  try{
    const marker='/restart-event-media/';
    const i=String(url||'').indexOf(marker);
    if(i>=0){const path=decodeURIComponent(String(url).slice(i+marker.length));await db.storage.from('restart-event-media').remove([path])}
  }catch(e){}
  renderShowcase();
}

function routeTypeText(v){
  const x={CP:'Checkpoint',CP_WATER:'น้ำ + CP',WATER:'จุดให้น้ำ',INFO:'จุดข้อมูล',FOOD:'อาหาร',MEDICAL:'แพทย์ / ปฐมพยาบาล',VIEWPOINT:'จุดชมวิว',CUSTOM:'จุดพิเศษ'};
  return x[v]||v||'CP';
}
function routeFmtMinutes(v){
  if(v==null||v==='')return'—';
  const n=Number(v)||0,h=Math.floor(n/60),m=n%60;
  return (h?h+' ชม. ':'')+(m?m+' นาที':(!h?'0 นาที':''));
}
function routeHaversine(a,b){
  const R=6371000,rad=x=>x*Math.PI/180,dLat=rad(b.lat-a.lat),dLon=rad(b.lon-a.lon);
  const q=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2;
  return 2*R*Math.atan2(Math.sqrt(q),Math.sqrt(1-q));
}
async function analyzeRouteGpx(file){
  const xml=new DOMParser().parseFromString(await file.text(),'application/xml');
  if(xml.querySelector('parsererror'))throw new Error('ไฟล์ GPX ไม่ถูกต้อง');
  let nodes=[...xml.getElementsByTagNameNS('*','trkpt')];
  if(!nodes.length)nodes=[...xml.getElementsByTagNameNS('*','rtept')];
  if(nodes.length<2)throw new Error('GPX ต้องมีพิกัดอย่างน้อย 2 จุด');
  const pts=nodes.map(n=>{
    const eleNode=n.getElementsByTagNameNS('*','ele')[0];
    return{lat:Number(n.getAttribute('lat')),lon:Number(n.getAttribute('lon')),ele:eleNode?Number(eleNode.textContent):0}
  }).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Number.isFinite(p.ele));
  if(pts.length<2)throw new Error('ไม่พบพิกัดที่ใช้งานได้ใน GPX');
  let distance=0,asc=0,desc=0;
  for(let i=1;i<pts.length;i++){
    distance+=routeHaversine(pts[i-1],pts[i]);
    const d=pts[i].ele-pts[i-1].ele;if(d>0)asc+=d;else desc-=d;
  }
  const es=pts.map(x=>x.ele);
  return{
    distance_km:Number((distance/1000).toFixed(3)),
    total_ascent_m:Number(asc.toFixed(1)),
    total_descent_m:Number(desc.toFixed(1)),
    min_elevation_m:Number(Math.min(...es).toFixed(1)),
    max_elevation_m:Number(Math.max(...es).toFixed(1)),
    point_count:pts.length
  };
}
async function uploadRouteGpx(file){
  if(!file)throw new Error('กรุณาเลือกไฟล์ GPX');
  if(!/\.gpx$/i.test(file.name))throw new Error('รองรับเฉพาะไฟล์ .gpx');
  const safe=(file.name||'route.gpx').replace(/[^a-zA-Z0-9._-]+/g,'-');
  const path=state.event.id+'/routes/'+Date.now()+'-'+safe;
  const{error}=await db.storage.from('restart-route-files').upload(path,file,{contentType:'application/gpx+xml',upsert:false});
  if(error)throw error;
  return{path,url:db.storage.from('restart-route-files').getPublicUrl(path).data.publicUrl};
}
async function uploadRoutePointImage(file){
  if(!file)return null;
  const ext=(file.name.split('.').pop()||'jpg').toLowerCase();
  const path=state.event.id+'/route-points/'+Date.now()+'-'+Math.random().toString(36).slice(2,7)+'.'+ext;
  const{error}=await db.storage.from('restart-event-media').upload(path,file,{contentType:file.type||'image/jpeg',upsert:false});
  if(error)throw error;
  return{path,url:db.storage.from('restart-event-media').getPublicUrl(path).data.publicUrl};
}
function routeCategoryNames(route){
  const names=[];
  (route.restart_route_categories||[]).forEach(x=>{
    const c=x.restart_race_categories;if(c?.name)names.push(t(c.name));
  });
  return [...new Set(names.filter(Boolean))];
}
function routePointRows(route){
  const pts=(route.restart_route_points||[]).sort((a,b)=>Number(a.distance_km)-Number(b.distance_km));
  if(!pts.length)return'<div class="rr-empty" style="margin-top:12px">ยังไม่มี CP / Water · Start และ Finish จะอ่านจาก GPX อัตโนมัติ</div>';
  return '<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>จุด</th><th>กม.</th><th>ชื่อ</th><th>Cutoff</th><th>รูป</th><th></th></tr></thead><tbody>'+
    pts.map(p=>'<tr><td><span class="badge">'+routeTypeText(p.point_type)+'</span></td><td>'+Number(p.distance_km).toLocaleString('th-TH',{maximumFractionDigits:3})+'</td><td>'+esc(t(p.name)||p.code||'—')+'</td><td>'+esc(routeFmtMinutes(p.cutoff_minutes))+'</td><td>'+(p.image_url?'<img src="'+esc(p.image_url)+'" alt="" style="width:60px;height:44px;object-fit:cover;border-radius:9px">':'—')+'</td><td><div class="row"><button class="btn sm soft" onclick="routePointDialog(\''+route.id+'\',\''+p.id+'\')">แก้ไข</button><button class="btn sm danger" onclick="deleteRoutePoint(\''+p.id+'\')">ลบ</button></div></td></tr>').join('')+
  '</tbody></table></div>';
}
async function renderRoutes(){
  document.getElementById('content').innerHTML=card('GPX Route Animation','<div class="rr-empty">กำลังโหลดเส้นทาง…</div>');
  const{data,error}=await db.from('restart_event_routes')
    .select('*,restart_route_categories(category_id,restart_race_categories!restart_route_categories_category_id_fkey(name,distance_km)),restart_route_points(*)')
    .eq('event_id',state.event.id).order('sort_order');
  if(error)return document.getElementById('content').innerHTML=card('GPX Route Animation','<div class="badge danger">'+esc(error.message)+'</div>');
  const rows=data||[];
  const body='<p class="muted">นำเข้าไฟล์ GPX แล้วระบบจะแสดงเส้นทางจริง สร้าง Start / Finish คำนวณระยะทาง Elevation และ Animation ให้อัตโนมัติ · Route เดียวผูกได้หลายรุ่น · CP/Water วางตามกิโลเมตรบนเส้นทางได้</p>'+
    (rows.length?rows.map(r=>{
      const cats=routeCategoryNames(r);
      const stats=[
        r.distance_km!=null?Number(r.distance_km).toFixed(2)+' km':null,
        r.total_ascent_m!=null?'↑ '+Math.round(r.total_ascent_m)+' m':null,
        r.point_count?'GPX '+Number(r.point_count).toLocaleString()+' จุด':null
      ].filter(Boolean).join(' · ');
      return '<div class="rr-card" style="box-shadow:none;margin-top:14px">'+
        '<div class="row space"><div><div class="row"><strong>'+esc(t(r.name)||'เส้นทางการแข่งขัน')+'</strong>'+
        cats.map(x=>'<span class="badge">'+esc(x)+'</span>').join('')+
        '<span class="badge '+(r.is_active?'ok':'')+'">'+(r.is_active?'เปิด':'ปิด')+'</span></div>'+
        '<div class="muted" style="margin-top:5px">'+esc(t(r.description)||'')+'</div>'+
        '<div class="muted" style="margin-top:5px">'+esc(stats||'ยังไม่มีสถิติ GPX')+' · Animation '+r.animation_duration_seconds+' วินาที · หมุด กม. '+(r.show_km_markers?'เปิด':'ปิด')+'</div></div>'+
        '<div class="row"><a class="btn sm soft" target="_blank" href="../public/?event='+encodeURIComponent(state.event.slug)+'#routeSection">Preview</a><button class="btn sm primary" onclick="routePointDialog(\''+r.id+'\')">+ จุดบนเส้นทาง</button><button class="btn sm soft" onclick="routeDialog(\''+r.id+'\')">แก้ไข GPX</button><button class="btn sm danger" onclick="deleteRoute(\''+r.id+'\')">ลบ</button></div></div>'+
        routePointRows(r)+'</div>';
    }).join(''):'<div class="rr-empty">ยังไม่มีเส้นทาง GPX สำหรับ Event นี้</div>');
  document.getElementById('content').innerHTML=card('GPX Route Animation',body,'<button class="btn primary" onclick="routeDialog()">+ นำเข้าไฟล์ GPX</button>');
}
async function routeDialog(id=null){
  let current=null,linked=[];
  if(id){
    const{data,error}=await db.from('restart_event_routes').select('*,restart_route_categories(category_id)').eq('id',id).single();
    if(error)return Swal.fire('โหลดเส้นทางไม่ได้',error.message,'error');
    current=data;linked=(data.restart_route_categories||[]).map(x=>x.category_id);
  }
  const{data:cats,error:catErr}=await db.from('restart_race_categories').select('id,name,distance_km').eq('event_id',state.event.id).order('sort_order');
  if(catErr)return Swal.fire('โหลดรุ่นไม่ได้',catErr.message,'error');
  const opts=(cats||[]).map(c=>'<option value="'+c.id+'" '+(linked.includes(c.id)?'selected':'')+'>'+esc(t(c.name))+(c.distance_km!=null?' · '+c.distance_km+' km':'')+'</option>').join('');
  const r=await Swal.fire({
    title:id?'แก้ไข GPX Route':'นำเข้าไฟล์ GPX',width:820,
    html:'<div class="grid2" style="text-align:left">'+
      '<label>ชื่อเส้นทาง<input id="rtName" class="swal2-input" style="margin:0" value="'+esc(t(current?.name)||'เส้นทางการแข่งขัน')+'"></label>'+
      '<label style="grid-column:1/-1">รายละเอียดเส้นทาง<textarea id="rtDesc" class="swal2-textarea" style="margin:0;width:100%" placeholder="ข้อความนี้จะแสดงในหน้า Event Preview">'+esc(t(current?.description)||'')+'</textarea></label>'+
      '<label>ผูกกับรุ่น (เลือกได้หลายรุ่น)<select id="rtCats" multiple size="5" class="swal2-select" style="margin:0;width:100%">'+opts+'</select><small class="muted">กด Ctrl/Cmd เพื่อเลือกหลายรุ่นบนคอมพิวเตอร์</small></label>'+
      '<label>ความยาว Animation (วินาที)<input id="rtDuration" type="number" min="10" max="600" class="swal2-input" style="margin:0" value="'+(current?.animation_duration_seconds||48)+'"></label>'+
      '<label>ไฟล์ GPX<input id="rtFile" type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" class="swal2-file" style="margin:0;width:100%"><small class="muted">'+(current?'ไม่เลือกไฟล์ = ใช้ GPX เดิม':'ต้องเลือกไฟล์ .gpx')+'</small></label>'+
      '<label style="display:flex;align-items:center;gap:8px"><input id="rtKm" type="checkbox" style="width:auto" '+(current?.show_km_markers===false?'':'checked')+'> แสดงหมุดทุก 1 กม.</label>'+
      '<label style="display:flex;align-items:center;gap:8px"><input id="rtActive" type="checkbox" style="width:auto" '+(current?.is_active===false?'':'checked')+'> เปิดแสดงเส้นทางนี้</label>'+
    '</div>',
    showCancelButton:true,confirmButtonText:id?'บันทึก':'นำเข้า GPX',
    preConfirm:()=>({
      name:rtName.value.trim(),
      description:rtDesc.value.trim(),
      category_ids:[...rtCats.selectedOptions].map(o=>o.value),
      duration:Number(rtDuration.value)||48,
      show_km_markers:rtKm.checked,is_active:rtActive.checked,file:rtFile.files[0]||null
    })
  });
  if(!r.isConfirmed)return;
  if(!r.value.name)return Swal.fire('ข้อมูลไม่ครบ','กรุณาระบุชื่อเส้นทาง','warning');
  if(!current&&!r.value.file)return Swal.fire('ยังไม่ได้เลือก GPX','กรุณาเลือกไฟล์ .gpx','warning');
  try{
    Swal.fire({title:'กำลังอ่านและนำเข้า GPX…',allowOutsideClick:false,didOpen:()=>Swal.showLoading()});
    let fileInfo=null,stats=null;
    if(r.value.file){stats=await analyzeRouteGpx(r.value.file);fileInfo=await uploadRouteGpx(r.value.file)}
    const row={
      event_id:state.event.id,
      name:{th:r.value.name,en:r.value.name},
      description:{th:r.value.description,en:r.value.description},
      animation_duration_seconds:r.value.duration,
      show_km_markers:r.value.show_km_markers,
      is_active:r.value.is_active,
      updated_at:new Date().toISOString()
    };
    if(fileInfo){row.gpx_url=fileInfo.url;row.gpx_storage_path=fileInfo.path}
    if(stats)Object.assign(row,stats);
    let saved,error;
    if(current)({data:saved,error}=await db.from('restart_event_routes').update(row).eq('id',current.id).select().single());
    else({data:saved,error}=await db.from('restart_event_routes').insert(row).select().single());
    if(error)throw error;
    const{error:clearErr}=await db.from('restart_route_categories').delete().eq('route_id',saved.id);if(clearErr)throw clearErr;
    if(r.value.category_ids.length){
      const{error:linkErr}=await db.from('restart_route_categories').insert(r.value.category_ids.map(category_id=>({route_id:saved.id,category_id})));
      if(linkErr)throw linkErr;
    }
    if(current&&fileInfo&&current.gpx_storage_path)await db.storage.from('restart-route-files').remove([current.gpx_storage_path]).catch(()=>{});
    Swal.fire({icon:'success',title:'บันทึก GPX แล้ว',text:stats?'ระยะ '+stats.distance_km.toFixed(2)+' km · '+stats.point_count.toLocaleString()+' จุด':'',timer:1500,showConfirmButton:false});
    renderRoutes();
  }catch(e){Swal.fire('บันทึก GPX ไม่สำเร็จ',e.message||String(e),'error')}
}
async function routePointDialog(routeId,id=null){
  const{data:route,error:routeError}=await db.from('restart_event_routes').select('id,distance_km').eq('id',routeId).single();
  if(routeError)return Swal.fire('โหลดเส้นทางไม่ได้',routeError.message,'error');
  let p=null;
  if(id){const{data,error}=await db.from('restart_route_points').select('*').eq('id',id).single();if(error)return Swal.fire('โหลดจุดไม่ได้',error.message,'error');p=data}
  const types=[
    ['CP','Checkpoint'],['CP_WATER','น้ำ + Checkpoint'],['WATER','จุดให้น้ำ'],['FOOD','อาหาร'],
    ['MEDICAL','แพทย์ / ปฐมพยาบาล'],['VIEWPOINT','จุดชมวิว'],['INFO','จุดข้อมูล'],['CUSTOM','จุดพิเศษ']
  ];
  const r=await Swal.fire({
    title:id?'แก้ไขจุดบนเส้นทาง':'เพิ่มจุดบนเส้นทาง',width:800,
    html:'<div class="grid2" style="text-align:left">'+
      '<label>ประเภท<select id="rpType" class="swal2-select" style="margin:0;width:100%">'+types.map(x=>'<option value="'+x[0]+'">'+x[1]+'</option>').join('')+'</select></label>'+
      '<label>รหัส เช่น CP1 / MED1<input id="rpCode" class="swal2-input" style="margin:0" value="'+esc(p?.code||'')+'"></label>'+
      '<label>ตำแหน่ง กม.<input id="rpKm" type="number" step=".01" min="0" '+(route.distance_km!=null?'max="'+route.distance_km+'"':'')+' class="swal2-input" style="margin:0" value="'+(p?.distance_km??'')+'"><small class="muted">'+(route.distance_km!=null?'เส้นทางยาว '+Number(route.distance_km).toFixed(2)+' km':'')+'</small></label>'+
      '<label>Cutoff จากเวลา Start (นาที)<input id="rpCutoff" type="number" min="0" step="1" class="swal2-input" style="margin:0" value="'+(p?.cutoff_minutes??'')+'" placeholder="เช่น 180 = 3 ชั่วโมง"></label>'+
      '<label>ชื่อจุด<input id="rpName" class="swal2-input" style="margin:0" value="'+esc(t(p?.name)||'')+'"></label>'+
      '<label>หยุด Animation เมื่อถึงจุด (วินาที)<input id="rpPause" type="number" min="0" max="30" step=".5" class="swal2-input" style="margin:0" value="'+(p?.pause_seconds??1.5)+'"></label>'+
      '<label style="grid-column:1/-1">รายละเอียด<textarea id="rpDesc" class="swal2-textarea" style="margin:0;width:100%">'+esc(t(p?.description)||'')+'</textarea></label>'+
      '<label style="grid-column:1/-1">รูปประกอบจุด CP / จุดบริการ<input id="rpImage" type="file" accept="image/*" class="swal2-file" style="margin:0;width:100%">'+imageHint('routePoint','rpImageStatus')+(p?.image_url?'<small class="muted">มีรูปเดิมแล้ว · ไม่เลือกไฟล์ใหม่ = ใช้รูปเดิม</small>':'<small class="muted">ไม่บังคับ · ใช้แสดงใน Popup ตอน Animation ถึงจุดนี้</small>')+'</label>'+

      '<label style="display:flex;align-items:center;gap:8px"><input id="rpPopup" type="checkbox" style="width:auto" '+(p?.popup_enabled===false?'':'checked')+'> แสดง Popup เมื่อ Animation ถึงจุดนี้</label>'+
    '</div>',
    didOpen:()=>{rpType.value=p?.point_type||'CP';bindImageInspector('rpImage','routePoint','rpImageStatus')},
    showCancelButton:true,confirmButtonText:'บันทึก',
    preConfirm:()=>({
      type:rpType.value,code:rpCode.value.trim(),km:Number(rpKm.value),name:rpName.value.trim(),
      desc:rpDesc.value.trim(),cutoff:rpCutoff.value===''?null:Number(rpCutoff.value),
      pause:Number(rpPause.value)||0,popup:rpPopup.checked,file:rpImage.files[0]||null
    })
  });
  if(!r.isConfirmed)return;
  if(!Number.isFinite(r.value.km)||r.value.km<0)return Swal.fire('กิโลเมตรไม่ถูกต้อง','','warning');
  if(route.distance_km!=null&&r.value.km>Number(route.distance_km)+.01)return Swal.fire('ตำแหน่งเกินระยะ GPX','เส้นทางนี้ยาว '+Number(route.distance_km).toFixed(2)+' km','warning');
  try{
    Swal.fire({title:'กำลังบันทึกจุด…',allowOutsideClick:false,didOpen:()=>Swal.showLoading()});
    let image=null;
    if(r.value.file)image=await uploadRoutePointImage(r.value.file);
    const row={
      route_id:routeId,point_type:r.value.type,code:r.value.code||null,
      name:{th:r.value.name,en:r.value.name},description:{th:r.value.desc,en:r.value.desc},
      distance_km:r.value.km,cutoff_minutes:r.value.cutoff,pause_seconds:r.value.pause,
      popup_enabled:r.value.popup,sort_order:Math.round(r.value.km*1000),is_active:true,updated_at:new Date().toISOString()
    };
    if(image){row.image_url=image.url;row.image_storage_path=image.path}
    const{error}=p?await db.from('restart_route_points').update(row).eq('id',p.id):await db.from('restart_route_points').insert(row);
    if(error)throw error;
    if(p&&image&&p.image_storage_path)await db.storage.from('restart-event-media').remove([p.image_storage_path]).catch(()=>{});
    Swal.fire({icon:'success',title:'บันทึกจุดแล้ว',timer:900,showConfirmButton:false});renderRoutes();
  }catch(e){Swal.fire('บันทึกจุดไม่สำเร็จ',e.message||String(e),'error')}
}
async function deleteRoutePoint(id){
  const{data:p,error}=await db.from('restart_route_points').select('image_storage_path').eq('id',id).single();
  if(error)return Swal.fire('ลบไม่ได้',error.message,'error');
  const r=await Swal.fire({title:'ลบจุดนี้?',icon:'warning',showCancelButton:true,confirmButtonText:'ลบ'});if(!r.isConfirmed)return;
  const{error:del}=await db.from('restart_route_points').delete().eq('id',id);if(del)return Swal.fire('ลบไม่ได้',del.message,'error');
  if(p?.image_storage_path)await db.storage.from('restart-event-media').remove([p.image_storage_path]).catch(()=>{});
  renderRoutes();
}
async function deleteRoute(id){
  const{data:rte,error}=await db.from('restart_event_routes').select('gpx_storage_path,restart_route_points(image_storage_path)').eq('id',id).single();
  if(error)return Swal.fire('ลบไม่ได้',error.message,'error');
  const r=await Swal.fire({title:'ลบ GPX Route?',text:'CP / Water / รูปประกอบ และการผูกรุ่นของเส้นทางนี้จะถูกลบด้วย',icon:'warning',showCancelButton:true,confirmButtonText:'ลบ'});
  if(!r.isConfirmed)return;
  const{error:del}=await db.from('restart_event_routes').delete().eq('id',id);if(del)return Swal.fire('ลบไม่ได้',del.message,'error');
  if(rte?.gpx_storage_path)await db.storage.from('restart-route-files').remove([rte.gpx_storage_path]).catch(()=>{});
  const imgs=(rte?.restart_route_points||[]).map(x=>x.image_storage_path).filter(Boolean);if(imgs.length)await db.storage.from('restart-event-media').remove(imgs).catch(()=>{});
  renderRoutes();
}
async function renderForm(){document.getElementById('content').innerHTML=card('Form Builder','<div id="baseFieldBox"></div><div id="formBox" style="margin-top:16px">กำลังโหลด…</div>','<button class="btn soft" onclick="sectionDialog()">+ Section</button><button class="btn primary" onclick="fieldDialog()">+ Field</button>');renderBaseFieldSettings();const[{data:ss},{data:ff}]=await Promise.all([db.from('restart_form_sections').select('*').eq('event_id',state.event.id).order('sort_order'),db.from('restart_form_fields').select('*').eq('event_id',state.event.id).order('sort_order')]);formBox.innerHTML=(ss||[]).map(s=>'<div class="paybox" style="margin-top:10px"><div class="row space"><strong>'+esc(t(s.label))+'</strong><span class="badge">'+esc(s.section_key)+'</span></div>'+(ff||[]).filter(f=>f.section_id===s.id&&!reservedBaseKeys.has(String(f.field_key||'').toLowerCase())).map(f=>'<div class="row space" style="padding:10px 0;border-top:1px solid #eee"><span>'+esc(t(f.label))+' <small class="muted">('+esc(f.field_type)+')</small></span><span><span class="badge '+(f.is_required?'warn':'')+'">'+(f.is_required?'จำเป็น':'ไม่บังคับ')+'</span> <span class="badge '+(f.is_active?'ok':'')+'">'+(f.is_active?'เปิด':'ปิด')+'</span> <button class="btn sm soft" onclick="editField(\''+f.id+'\')">แก้ไข</button> <button class="btn sm soft" onclick="toggleRow(\'restart_form_fields\',\''+f.id+'\',\'is_active\','+(!f.is_active)+',renderForm)">'+(f.is_active?'ปิด':'เปิด')+'</button> <button class="btn sm danger" onclick="delRow(\'restart_form_fields\',\''+f.id+'\',renderForm)">ลบ</button></span></div>').join('')+'</div>').join('')||'<div class="rr-empty">ยังไม่มี Custom Field</div>'}
function renderBaseFieldSettings(){const fs=state.event.field_settings||{};baseFieldBox.innerHTML='<div class="paybox"><div class="row space"><div><strong>ข้อมูลพื้นฐานของผู้สมัคร</strong><div class="muted">เปิด/ปิดและกำหนดบังคับกรอกได้รายช่อง</div></div><button class="btn primary sm" onclick="saveBaseFields()">บันทึกข้อมูลพื้นฐาน</button></div><div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>ช่องข้อมูล</th><th>แสดง</th><th>บังคับกรอก</th></tr></thead><tbody>'+Object.entries(baseFieldLabels).map(([k,l])=>{const s=fs[k]||{enabled:true,required:false};return '<tr><td>'+l+'</td><td><input type="checkbox" data-base-enabled="'+k+'" '+(s.enabled!==false?'checked':'')+'></td><td><input type="checkbox" data-base-required="'+k+'" '+(s.required?'checked':'')+'></td></tr>'}).join('')+'</tbody></table></div></div>'}
async function saveBaseFields(){const fs={...state.event.field_settings};Object.keys(baseFieldLabels).forEach(k=>{const enabled=document.querySelector('[data-base-enabled="'+k+'"]').checked;const required=document.querySelector('[data-base-required="'+k+'"]').checked;fs[k]={enabled,required:enabled&&required}});const{data,error}=await db.from('restart_events').update({field_settings:fs}).eq('id',state.event.id).select().single();if(error)return Swal.fire('บันทึกไม่สำเร็จ',error.message,'error');state.event=data;state.events=state.events.map(x=>x.id===data.id?data:x);renderBaseFieldSettings();Swal.fire({icon:'success',title:'บันทึกข้อมูลพื้นฐานแล้ว',timer:1000,showConfirmButton:false})}
async function sectionDialog(){const r=await Swal.fire({title:'เพิ่ม Section',html:'<input id="sKey" class="swal2-input" placeholder="key เช่น personal"><input id="sLabel" class="swal2-input" placeholder="ชื่อ Section">',showCancelButton:true,preConfirm:()=>({k:sKey.value.trim(),l:sLabel.value.trim()})});if(!r.isConfirmed)return;const{error}=await db.from('restart_form_sections').insert({event_id:state.event.id,section_key:r.value.k,label:{th:r.value.l,en:r.value.l}});if(error)return Swal.fire('เพิ่มไม่สำเร็จ',error.message,'error');renderForm()}
async function fieldDialog(){const{data:ss}=await db.from('restart_form_sections').select('id,label').eq('event_id',state.event.id).eq('is_active',true).order('sort_order');if(!ss?.length)return Swal.fire('สร้าง Section ก่อน','','warning');const r=await Swal.fire({title:'เพิ่ม Field',width:700,html:'<div class="grid2" style="text-align:left"><label>Section<select id="fSec" class="swal2-select" style="margin:0;width:100%">'+ss.map(s=>'<option value="'+s.id+'">'+esc(t(s.label))+'</option>').join('')+'</select></label><label>Field Key<input id="fKey" class="swal2-input" style="margin:0"></label><label>ชื่อ Field<input id="fLabel" class="swal2-input" style="margin:0"></label><label>ประเภท<select id="fType" class="swal2-select" style="margin:0;width:100%"><option>text</option><option>number</option><option>date</option><option>tel</option><option>textarea</option><option>select</option><option>radio</option><option>checkbox</option><option>file</option></select></label><label style="display:flex;align-items:center;gap:8px"><input id="fReq" type="checkbox" style="width:auto"> บังคับกรอก</label></div>',showCancelButton:true,preConfirm:()=>{const key=fKey.value.trim().toLowerCase();if(!key)return Swal.showValidationMessage('กรุณาระบุ Field Key');if(reservedBaseKeys.has(key))return Swal.showValidationMessage('Field Key นี้เป็นข้อมูลพื้นฐานของระบบ ให้ตั้งค่าที่ตารางข้อมูลพื้นฐานด้านบน');return{sec:fSec.value,key,label:fLabel.value.trim(),type:fType.value,req:fReq.checked}}});if(!r.isConfirmed)return;const x=r.value;const{error}=await db.from('restart_form_fields').insert({event_id:state.event.id,section_id:x.sec,field_key:x.key,field_type:x.type,label:{th:x.label,en:x.label},is_required:x.req});if(error)return Swal.fire('เพิ่มไม่สำเร็จ',error.message,'error');renderForm()}
async function toggleRow(table,id,column,value,cb){const{error}=await db.from(table).update({[column]:value}).eq('id',id);if(error)return Swal.fire('บันทึกไม่สำเร็จ',error.message,'error');cb()}
async function editCategory(id){
  const{data:x,error}=await db.from('restart_race_categories').select('*').eq('id',id).single();
  if(error)return Swal.fire('โหลดข้อมูลไม่ได้',error.message,'error');
  const r=await Swal.fire({
    title:'แก้ไขรุ่นการแข่งขัน',width:820,
    html:'<div class="grid2" style="text-align:left">'+
      '<label>รหัส<input id="ecCode" class="swal2-input" style="margin:0" value="'+esc(x.code)+'"></label>'+
      '<label>ชื่อรุ่น<input id="ecName" class="swal2-input" style="margin:0" value="'+esc(t(x.name))+'"></label>'+
      '<label>ระยะ km<input id="ecDist" type="number" step=".1" class="swal2-input" style="margin:0" value="'+(x.distance_km??'')+'"></label>'+
      '<label>เพศ<select id="ecGender" class="swal2-select" style="margin:0;width:100%"><option '+(x.gender_rule==='ANY'?'selected':'')+'>ANY</option><option '+(x.gender_rule==='MALE'?'selected':'')+'>MALE</option><option '+(x.gender_rule==='FEMALE'?'selected':'')+'>FEMALE</option></select></label>'+
      '<label>อายุต่ำสุด<input id="ecMin" type="number" class="swal2-input" style="margin:0" value="'+(x.min_age??'')+'"></label>'+
      '<label>อายุสูงสุด<input id="ecMax" type="number" class="swal2-input" style="margin:0" value="'+(x.max_age??'')+'"></label>'+
      '<label>ราคา<input id="ecPrice" type="number" class="swal2-input" style="margin:0" value="'+Number(x.base_price_thb||0)+'"></label>'+
      '<label>Early Bird<input id="ecEarly" type="number" class="swal2-input" style="margin:0" value="'+(x.early_bird_price_thb??'')+'"></label>'+
      '<label>เวลา Start<input id="ecStart" type="time" class="swal2-input" style="margin:0" value="'+(x.start_time?String(x.start_time).slice(0,5):'')+'"></label>'+
      '<label>Cutoff (นาที)<input id="ecCutoff" type="number" min="1" class="swal2-input" style="margin:0" value="'+(x.cutoff_minutes??'')+'"></label>'+
      '<label>เวลาคาดหมาย (นาที)<input id="ecDuration" type="number" min="1" class="swal2-input" style="margin:0" value="'+(x.expected_duration_minutes??'')+'"></label>'+
      '<label>Elevation Gain (เมตร)<input id="ecElev" type="number" min="0" class="swal2-input" style="margin:0" value="'+(x.elevation_gain_m??'')+'"></label>'+
      '<label>จ่ายเต็ม<select id="ecFull" class="swal2-select" style="margin:0;width:100%"><option value="" '+(x.full_payment_enabled==null?'selected':'')+'>ตาม Event</option><option value="true" '+(x.full_payment_enabled===true?'selected':'')+'>เปิด</option><option value="false" '+(x.full_payment_enabled===false?'selected':'')+'>ปิด</option></select></label>'+
      '<label>การผ่อน<select id="ecInstall" class="swal2-select" style="margin:0;width:100%"><option value="" '+(x.installment_enabled==null?'selected':'')+'>ตาม Event</option><option value="true" '+(x.installment_enabled===true?'selected':'')+'>เปิด</option><option value="false" '+(x.installment_enabled===false?'selected':'')+'>ปิด</option></select></label>'+
    '</div>',
    showCancelButton:true,confirmButtonText:'บันทึก',
    preConfirm:()=>({
      code:ecCode.value.trim(),name:ecName.value.trim(),distance:ecDist.value?Number(ecDist.value):null,
      gender:ecGender.value,min:ecMin.value?Number(ecMin.value):null,max:ecMax.value?Number(ecMax.value):null,
      price:Number(ecPrice.value)||0,early:ecEarly.value?Number(ecEarly.value):null,
      start:ecStart.value||null,cutoff:ecCutoff.value?Number(ecCutoff.value):null,
      duration:ecDuration.value?Number(ecDuration.value):null,elev:ecElev.value?Number(ecElev.value):null,
      full:ecFull.value===''?null:ecFull.value==='true',install:ecInstall.value===''?null:ecInstall.value==='true'
    })
  });
  if(!r.isConfirmed)return;
  const v=r.value;
  const{error:e}=await db.from('restart_race_categories').update({
    code:v.code,name:{...(x.name||{}),th:v.name,en:v.name},distance_km:v.distance,gender_rule:v.gender,
    min_age:v.min,max_age:v.max,base_price_thb:v.price,early_bird_price_thb:v.early,
    start_time:v.start,cutoff_minutes:v.cutoff,expected_duration_minutes:v.duration,elevation_gain_m:v.elev,
    full_payment_enabled:v.full,installment_enabled:v.install
  }).eq('id',id);
  if(e)return Swal.fire('บันทึกไม่สำเร็จ',e.message,'error');
  renderCategories();
}
async function editPackage(id){const{data:x,error}=await db.from('restart_packages').select('*').eq('id',id).single();if(error)return Swal.fire('โหลดข้อมูลไม่ได้',error.message,'error');const{data:cats}=await db.from('restart_race_categories').select('id,name').eq('event_id',state.event.id).eq('is_active',true);const opts='<option value="">ทุกรุ่น</option>'+(cats||[]).map(c=>'<option value="'+c.id+'" '+(x.category_id===c.id?'selected':'')+'>'+esc(t(c.name))+'</option>').join('');const r=await Swal.fire({title:'แก้ไข Package',width:700,html:'<div class="grid2" style="text-align:left"><label>รหัส<input id="epCode" class="swal2-input" style="margin:0" value="'+esc(x.code)+'"></label><label>ชื่อ<input id="epName" class="swal2-input" style="margin:0" value="'+esc(t(x.name))+'"></label><label>ผูกกับรุ่น<select id="epCat" class="swal2-select" style="margin:0;width:100%">'+opts+'</select></label><label>รูปแบบราคา<select id="epMode" class="swal2-select" style="margin:0;width:100%"><option value="ADD" '+(x.price_mode==='ADD'?'selected':'')+'>บวกเพิ่ม</option><option value="REPLACE" '+(x.price_mode==='REPLACE'?'selected':'')+'>ใช้ราคานี้แทน</option></select></label><label>ราคา<input id="epPrice" type="number" class="swal2-input" style="margin:0" value="'+Number(x.price_value_thb||0)+'"></label><label>ผู้แข่งขัน<input id="epRun" type="number" class="swal2-input" style="margin:0" value="'+x.runner_count+'"></label><label>ผู้ติดตาม<input id="epFollow" type="number" class="swal2-input" style="margin:0" value="'+x.follower_count+'"></label></div>',showCancelButton:true,confirmButtonText:'บันทึก',preConfirm:()=>({code:epCode.value.trim(),name:epName.value.trim(),cat:epCat.value||null,mode:epMode.value,price:Number(epPrice.value)||0,runners:Number(epRun.value)||1,followers:Number(epFollow.value)||0})});if(!r.isConfirmed)return;const v=r.value;const{error:e}=await db.from('restart_packages').update({code:v.code,name:{...(x.name||{}),th:v.name,en:v.name},category_id:v.cat,price_mode:v.mode,price_value_thb:v.price,runner_count:v.runners,follower_count:v.followers}).eq('id',id);if(e)return Swal.fire('บันทึกไม่สำเร็จ',e.message,'error');renderPackages()}
async function editPayment(id){
  const{data:x,error}=await db.from('restart_payment_methods').select('*').eq('id',id).single();
  if(error)return Swal.fire('โหลดข้อมูลไม่ได้',error.message,'error');
  const r=await Swal.fire({
    title:'แก้ไขช่องทางชำระเงิน',
    width:720,
    html:'<div class="grid2" style="text-align:left">'+
      '<label>ประเภท<select id="emKind" class="swal2-select" style="margin:0;width:100%"><option value="BANK" '+(x.kind==='BANK'?'selected':'')+'>บัญชีธนาคาร</option><option value="PROMPTPAY" '+(x.kind==='PROMPTPAY'?'selected':'')+'>PromptPay</option></select></label>'+
      '<label>ชื่อแสดง<input id="emLabel" class="swal2-input" style="margin:0" value="'+esc(x.label||'')+'"></label>'+
      '<div id="emBankBox" style="display:contents"><label>ธนาคาร<input id="emBank" class="swal2-input" style="margin:0" value="'+esc(x.bank_name||'')+'"></label><label>ชื่อบัญชี<input id="emAccName" class="swal2-input" style="margin:0" value="'+esc(x.account_name||'')+'"></label><label>เลขบัญชี<input id="emAccNo" class="swal2-input" style="margin:0" value="'+esc(x.account_number||'')+'"></label></div>'+
      '<div id="emPPBox" style="display:none;grid-column:1/-1"><div class="grid2"><label>ประเภท PromptPay<select id="emPPType" class="swal2-select" style="margin:0;width:100%"><option value="PHONE" '+(x.promptpay_type==='PHONE'?'selected':'')+'>เบอร์โทรศัพท์</option><option value="NATIONAL_ID" '+(x.promptpay_type==='NATIONAL_ID'?'selected':'')+'>เลขบัตรประชาชน / เลขผู้เสียภาษี</option><option value="EWALLET" '+(x.promptpay_type==='EWALLET'?'selected':'')+'>E-Wallet ID</option></select></label><label>PromptPay ID<input id="emPP" class="swal2-input" style="margin:0" inputmode="numeric" value="'+esc(x.promptpay_id||'')+'"></label></div><label style="display:flex;align-items:center;gap:8px;margin-top:12px"><input id="emQr" type="checkbox" style="width:auto" '+(x.qr_enabled?'checked':'')+'> เปิด QR</label></div>'+
      '</div>',
    showCancelButton:true,
    confirmButtonText:'บันทึก',
    didOpen:()=>{
      const kind=document.getElementById('emKind'),bank=document.getElementById('emBankBox'),pp=document.getElementById('emPPBox');
      const sync=()=>{const isPP=kind.value==='PROMPTPAY';bank.style.display=isPP?'none':'contents';pp.style.display=isPP?'block':'none'};
      kind.addEventListener('change',sync);sync();
    },
    preConfirm:()=>{
      const kind=document.getElementById('emKind').value;
      const label=document.getElementById('emLabel').value.trim();
      const ppType=document.getElementById('emPPType').value;
      const pp=document.getElementById('emPP').value.replace(/\D/g,'');
      if(!label)return Swal.showValidationMessage('กรุณาระบุชื่อแสดง');
      if(kind==='BANK'&&!document.getElementById('emAccNo').value.trim())return Swal.showValidationMessage('กรุณาระบุเลขบัญชี');
      if(kind==='PROMPTPAY'){
        if(!pp)return Swal.showValidationMessage('กรุณาระบุ PromptPay ID');
        if(ppType==='PHONE'&&pp.length!==10)return Swal.showValidationMessage('เบอร์โทร PromptPay ต้องมี 10 หลัก');
        if(ppType==='NATIONAL_ID'&&pp.length!==13)return Swal.showValidationMessage('เลขบัตรประชาชน / เลขผู้เสียภาษี ต้องมี 13 หลัก');
      }
      return{
        kind,label,
        bank:document.getElementById('emBank').value.trim(),
        an:document.getElementById('emAccName').value.trim(),
        no:document.getElementById('emAccNo').value.trim(),
        ppType,pp,
        qr:document.getElementById('emQr').checked
      };
    }
  });
  if(!r.isConfirmed)return;
  const v=r.value;
  const payload=v.kind==='PROMPTPAY'
    ?{kind:'PROMPTPAY',label:v.label,bank_name:null,account_name:null,account_number:null,promptpay_type:v.ppType,promptpay_id:v.pp,qr_enabled:v.qr}
    :{kind:'BANK',label:v.label,bank_name:v.bank||null,account_name:v.an||null,account_number:v.no||null,promptpay_type:null,promptpay_id:null,qr_enabled:false};
  const{error:e}=await db.from('restart_payment_methods').update(payload).eq('id',id);
  if(e)return Swal.fire('บันทึกไม่สำเร็จ',e.message,'error');
  Swal.fire({icon:'success',title:'บันทึกช่องทางชำระเงินแล้ว',timer:900,showConfirmButton:false});
  renderPayments();
}
async function editField(id){const{data:x,error}=await db.from('restart_form_fields').select('*').eq('id',id).single();if(error)return Swal.fire('โหลดข้อมูลไม่ได้',error.message,'error');const r=await Swal.fire({title:'แก้ไข Field',html:'<input id="efLabel" class="swal2-input" value="'+esc(t(x.label))+'" placeholder="ชื่อ Field"><label style="display:flex;align-items:center;gap:8px;justify-content:center"><input id="efReq" type="checkbox" style="width:auto" '+(x.is_required?'checked':'')+'> บังคับกรอก</label>',showCancelButton:true,confirmButtonText:'บันทึก',preConfirm:()=>({label:efLabel.value.trim(),req:efReq.checked})});if(!r.isConfirmed)return;const{error:e}=await db.from('restart_form_fields').update({label:{...(x.label||{}),th:r.value.label,en:r.value.label},is_required:r.value.req}).eq('id',id);if(e)return Swal.fire('บันทึกไม่สำเร็จ',e.message,'error');renderForm()}
function renderTheme(){const th=state.event.theme||{};document.getElementById('content').innerHTML=card('Theme / Logo / Banner',imageGuide()+'<div class="grid2"><div class="grid2"><label>Primary<input id="thPrimary" type="color" value="'+(th.primary||'#6d4aff')+'"></label><label>Secondary<input id="thSecondary" type="color" value="'+(th.secondary||'#e96d96')+'"></label><label>Background<input id="thBg" type="color" value="'+(th.background||'#100d1d')+'"></label><label>Text<input id="thText" type="color" value="'+(th.text||'#f7f3ff')+'"></label><label>Template<select id="thTemplate"><option>luxury</option><option>minimal</option><option>sport</option><option>dark</option><option>tropical</option></select></label><label>Logo<input id="logoFile" type="file" accept="image/*">'+imageHint('logo','logoFileStatus')+'</label><label>Banner<input id="bannerFile" type="file" accept="image/*">'+imageHint('banner','bannerFileStatus')+'</label></div><div class="preview" id="themePreview"><h3>'+esc(state.event.name)+'</h3><span>RESTART Registration</span><button class="btn primary" style="width:max-content">สมัครเลย</button></div></div>','<button class="btn primary" onclick="saveTheme()">บันทึก Theme</button>');thTemplate.value=th.template||'luxury';['thPrimary','thSecondary','thBg','thText'].forEach(id=>document.getElementById(id).oninput=updatePreview);bindImageInspector('logoFile','logo','logoFileStatus');bindImageInspector('bannerFile','banner','bannerFileStatus');updatePreview()}
function updatePreview(){themePreview.style.background='linear-gradient(135deg,'+thBg.value+','+thSecondary.value+')';themePreview.style.color=thText.value;themePreview.querySelector('button').style.background=thPrimary.value}
async function uploadMedia(file,type){if(!file)return null;const ext=(file.name.split('.').pop()||'jpg').toLowerCase();const path=state.event.id+'/'+type+'-'+Date.now()+'.'+ext;const{error}=await db.storage.from('restart-event-media').upload(path,file,{upsert:false});if(error)throw error;return db.storage.from('restart-event-media').getPublicUrl(path).data.publicUrl}
async function saveTheme(){try{Swal.fire({title:'กำลังบันทึก',allowOutsideClick:false,didOpen:()=>Swal.showLoading()});const [logo,banner]=await Promise.all([uploadMedia(logoFile.files[0],'logo'),uploadMedia(bannerFile.files[0],'banner')]);const theme={...state.event.theme,primary:thPrimary.value,secondary:thSecondary.value,background:thBg.value,text:thText.value,template:thTemplate.value};const upd={theme};if(logo)upd.logo_url=logo;if(banner)upd.banner_url=banner;const{data,error}=await db.from('restart_events').update(upd).eq('id',state.event.id).select().single();if(error)throw error;state.event=data;Swal.fire({icon:'success',title:'บันทึก Theme แล้ว',timer:1100,showConfirmButton:false})}catch(e){Swal.fire('บันทึกไม่สำเร็จ',e.message,'error')}}
function registrationTypeText(v){return v==='PAIR'?'คู่':v==='TEAM'?'ทีม':'เดี่ยว'}
async function renderRegistrations(){
  document.getElementById('content').innerHTML=card('ผู้สมัคร / ตรวจสลิป','<div class="grid4" id="regStats"></div><div id="regBox" style="margin-top:14px">กำลังโหลด…</div>','<button class="btn soft" onclick="exportRegistrations()">Export CSV</button>');
  const{data,error}=await db.from('restart_registrations').select('*,restart_race_categories(code,name),restart_packages(code,name),restart_participants(runner_index,first_name,last_name,id_document,phone,gender,shirt_size),restart_payment_schedule(*,restart_payment_attempts(*))').eq('event_id',state.event.id).order('created_at',{ascending:false});
  if(error)return regBox.innerHTML=esc(error.message);
  const rows=data||[],pending=[];rows.forEach(r=>(r.restart_payment_schedule||[]).forEach(s=>(s.restart_payment_attempts||[]).filter(a=>a.status==='PENDING_REVIEW').forEach(a=>pending.push({...a,reg:r,schedule:s}))));
  const runnerTotal=rows.reduce((s,r)=>s+(r.restart_participants||[]).length,0);
  regStats.innerHTML='<div class="paybox"><small>ใบสมัคร</small><div class="price">'+rows.length+'</div></div><div class="paybox"><small>ผู้แข่งขันทั้งหมด</small><div class="price">'+runnerTotal+'</div></div><div class="paybox"><small>รอตรวจสลิป</small><div class="price">'+pending.length+'</div></div><div class="paybox"><small>ยอดสมัคร</small><div class="price">฿'+money(rows.reduce((s,x)=>s+Number(x.total_amount_thb||0),0))+'</div></div>';
  regBox.innerHTML=rows.length?'<div class="table-wrap"><table><thead><tr><th>เลขสมัคร</th><th>ประเภท</th><th>คู่ / ทีม</th><th>ผู้แข่งขัน</th><th>รุ่น / Package</th><th>ยอด</th><th>สถานะ</th><th></th></tr></thead><tbody>'+rows.map(r=>{const ps=(r.restart_participants||[]).sort((a,b)=>a.runner_index-b.runner_index);return '<tr><td>'+esc(r.registration_code)+'</td><td><span class="badge">'+registrationTypeText(r.registration_type)+'</span></td><td>'+esc(r.group_name||'—')+'</td><td><b>'+ps.length+' คน</b><div class="muted">'+esc(ps.map(p=>(p.first_name||'')+' '+(p.last_name||'')).join(', '))+'</div></td><td>'+esc(t(r.restart_race_categories?.name)||'—')+'<div class="muted">'+esc(t(r.restart_packages?.name)||'')+'</div></td><td>฿'+money(r.total_amount_thb)+'</td><td><span class="badge">'+esc(r.status)+'</span></td><td><button class="btn sm soft" onclick="showRegistrationDetail(\''+r.id+'\')">รายละเอียด</button></td></tr>'}).join('')+'</tbody></table></div>':'<div class="rr-empty">ยังไม่มีผู้สมัคร</div>';
  if(pending.length){regBox.insertAdjacentHTML('beforebegin','<div class="rr-card" style="box-shadow:none;border-style:dashed"><h3>สลิปรอตรวจ</h3>'+pending.map(a=>'<div class="row space" style="padding:8px 0;border-bottom:1px solid #eee"><span>'+esc(a.reg.registration_code)+' · '+registrationTypeText(a.reg.registration_type)+' · งวด '+a.schedule.installment_no+' · ฿'+money(a.claimed_amount_thb)+'</span><span><button class="btn sm soft" onclick="openSlip(\''+esc(a.slip_path)+'\')">ดูสลิป</button> <button class="btn sm primary" onclick="reviewPay(\''+a.id+'\',true)">อนุมัติ</button> <button class="btn sm danger" onclick="reviewPay(\''+a.id+'\',false)">ปฏิเสธ</button></span></div>').join('')+'</div>')}
}
async function showRegistrationDetail(id){
  const{data:r,error}=await db.from('restart_registrations').select('*,restart_participants(*),restart_beneficiaries(*)').eq('id',id).single();if(error)return Swal.fire('โหลดรายละเอียดไม่ได้',error.message,'error');
  const ps=(r.restart_participants||[]).sort((a,b)=>a.runner_index-b.runner_index),bs=r.restart_beneficiaries||[];
  const html='<div style="text-align:left"><p><b>'+esc(r.registration_code)+'</b> · '+registrationTypeText(r.registration_type)+(r.group_name?' · '+esc(r.group_name):'')+'</p>'+ps.map(p=>'<div class="paybox" style="margin:8px 0"><b>ผู้แข่งขัน '+p.runner_index+' · '+esc((p.first_name||'')+' '+(p.last_name||''))+'</b><div class="muted">ID/Passport: '+esc(p.id_document||'—')+' · โทร: '+esc(p.phone||'—')+' · เสื้อ: '+esc(p.shirt_size||'—')+'</div>'+(bs.filter(b=>b.runner_index===p.runner_index).length?'<div style="margin-top:6px"><small>ผู้รับผลประโยชน์: '+esc(bs.filter(b=>b.runner_index===p.runner_index).map(b=>b.full_name+' '+b.percentage+'%').join(', '))+'</small></div>':'')+'</div>').join('')+'</div>';
  Swal.fire({title:'รายละเอียดใบสมัคร',html,width:900,confirmButtonText:'ปิด'})
}
function csvCell(v){const s=String(v??'');return '"'+s.replaceAll('"','""')+'"'}
async function exportRegistrations(){
  Swal.fire({title:'กำลังสร้าง CSV…',allowOutsideClick:false,didOpen:()=>Swal.showLoading()});
  const{data,error}=await db.from('restart_registrations').select('*,restart_race_categories(code,name),restart_packages(code,name),restart_participants(*),restart_beneficiaries(*),restart_registration_answers(*)').eq('event_id',state.event.id).order('created_at');
  if(error)return Swal.fire('Export ไม่สำเร็จ',error.message,'error');
  const head=['registration_code','registration_type','group_name','runner_count','contact_runner_index','runner_index','first_name','last_name','id_document','phone','birth_date','gender','shirt_size','blood_group','address','emergency_phone','emergency_relation','category','package','beneficiaries','custom_answers','total_amount_thb','payment_mode','status','created_at'];
  const lines=[head.map(csvCell).join(',')];
  (data||[]).forEach(r=>{
    const beneficiaries=r.restart_beneficiaries||[],answers=r.restart_registration_answers||[];
    (r.restart_participants||[]).sort((a,b)=>a.runner_index-b.runner_index).forEach(p=>{
      const beneText=beneficiaries.filter(b=>b.runner_index===p.runner_index).map(b=>[b.full_name,b.relationship,b.percentage+'%',b.id_document].filter(Boolean).join(' | ')).join(' ; ');
      const answerObj={};answers.filter(a=>a.runner_index===p.runner_index).forEach(a=>answerObj[a.field_key]=a.value);
      lines.push([r.registration_code,r.registration_type,r.group_name||'',r.runner_count||r.restart_participants.length,r.contact_runner_index||1,p.runner_index,p.first_name,p.last_name,p.id_document,p.phone,p.birth_date,p.gender,p.shirt_size,p.blood_group,p.address,p.emergency_phone,p.emergency_relation,t(r.restart_race_categories?.name),t(r.restart_packages?.name),beneText,JSON.stringify(answerObj),r.total_amount_thb,r.payment_mode,r.status,r.created_at].map(csvCell).join(','))
    })
  });
  const blob=new Blob(['\ufeff'+lines.join('\n')],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(state.event.slug||'event')+'-registrations.csv';document.body.appendChild(a);a.click();URL.revokeObjectURL(a.href);a.remove();Swal.close()
}
async function openSlip(path){const{data,error}=await db.storage.from('restart-slips').createSignedUrl(path,120);if(error)return Swal.fire('เปิดสลิปไม่ได้',error.message,'error');window.open(data.signedUrl,'_blank')}
async function reviewPay(id,ok){let note='';if(!ok){const r=await Swal.fire({title:'เหตุผลที่ปฏิเสธ',input:'text',showCancelButton:true});if(!r.isConfirmed)return;note=r.value||''}const{error}=await db.rpc('restart_admin_review_payment',{p_attempt_id:id,p_approve:ok,p_note:note||null});if(error)return Swal.fire('ทำรายการไม่สำเร็จ',error.message,'error');Swal.fire({icon:'success',title:ok?'อนุมัติแล้ว':'ปฏิเสธแล้ว',timer:1000,showConfirmButton:false});renderRegistrations()}
async function delRow(table,id,cb){const r=await Swal.fire({title:'ยืนยันการลบ?',icon:'warning',showCancelButton:true,confirmButtonText:'ลบ'});if(!r.isConfirmed)return;const{error}=await db.from(table).delete().eq('id',id);if(error)return Swal.fire('ลบไม่ได้',error.message,'error');cb()}
Object.assign(window,{saveOverview,setAllFeatures,saveFeatures,renderCategories,categoryDialog,renderPackages,packageDialog,renderInstallments,installmentDialog,delPlan,renderPayments,paymentDialog,renderShowcase,saveShowcase,deleteShowcaseMedia,renderRoutes,routeDialog,routePointDialog,deleteRoutePoint,deleteRoute,renderForm,sectionDialog,fieldDialog,saveBaseFields,toggleRow,editCategory,editPackage,editPayment,editField,saveTheme,renderRegistrations,showRegistrationDetail,exportRegistrations,openSlip,reviewPay,delRow});
init().catch(e=>Swal.fire('เกิดข้อผิดพลาด',e.message,'error'));