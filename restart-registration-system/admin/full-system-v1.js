(()=>{
const baseRender=render;
const baseRenderFeatures=renderFeatures;
const baseRenderShowcase=renderShowcase;
const baseRenderRegistrations=renderRegistrations;
const baseSaveFeatures=saveFeatures;
featureLabels.shirt_sales='ขายเสื้อเพิ่ม';

function addFullNav(){
  const nav=document.getElementById('nav');if(!nav||nav.querySelector('[data-tab="marketing"]'))return;
  const marketing=document.createElement('button');marketing.dataset.tab='marketing';marketing.textContent='Promotion / Discount';
  const shirts=document.createElement('button');shirts.dataset.tab='shirtsales';shirts.textContent='ขายเสื้อ';
  const wait=document.createElement('button');wait.dataset.tab='waitlist';wait.textContent='Waitlist / คิวรอ';
  const packagesBtn=nav.querySelector('[data-tab="packages"]');packagesBtn?.after(marketing);marketing.after(shirts);
  const regBtn=nav.querySelector('[data-tab="registrations"]');regBtn?.after(wait);
}
addFullNav();

render=function(){
  if(!needEvent())return;
  if(state.tab==='marketing')return renderMarketing();
  if(state.tab==='shirtsales')return renderShirtSalesAdmin();
  if(state.tab==='waitlist')return renderWaitlist();
  return baseRender();
};

renderFeatures=function(){
  baseRenderFeatures();
  const root=document.getElementById('content');if(!root||!state.event)return;
  const e=state.event,flags=e.feature_flags||{},langsNow=Array.isArray(e.languages)?e.languages:['th'];
  const wrap=document.createElement('section');wrap.className='rr-card';wrap.style.marginTop='16px';
  wrap.innerHTML=
    '<div class="row space"><div><h2>ตั้งค่าระบบเต็ม</h2><div class="muted">ค่าที่มีผลกับราคา ภาษา PDPA และการแสดงผลจริงของ Event</div></div><button class="btn primary" id="saveFullSystemSettings">บันทึกตั้งค่าระบบเต็ม</button></div>'+
    '<div class="grid2" style="margin-top:14px">'+
      '<label>ราคาพื้นฐานเมื่อปิด “ราคาแยกตามรุ่น”<input id="fullBasePrice" type="number" min="0" step="0.01" value="'+Number(e.base_registration_price_thb||0)+'"></label>'+
      '<label>PDPA Version<input id="fullPdpaVersion" value="'+esc(e.pdpa_version||'1.0')+'"></label>'+
      '<label style="grid-column:1/-1">ข้อความ PDPA / Consent<textarea id="fullPdpaText" rows="5" placeholder="ข้อความยินยอมก่อนส่งใบสมัคร">'+esc(e.pdpa_text||'')+'</textarea></label>'+
    '</div>'+
    '<div class="paybox" style="margin-top:14px"><b>ภาษาที่เปิดใช้ใน Event นี้</b><div class="row" style="margin-top:10px;flex-wrap:wrap">'+
      ['th','en','zh','ja','ru'].map(l=>'<label style="display:flex;align-items:center;gap:6px"><input type="checkbox" data-full-lang="'+l+'" style="width:auto" '+(langsNow.includes(l)?'checked':'')+'> '+l.toUpperCase()+'</label>').join('')+
    '</div><div class="muted" style="margin-top:8px">ถ้าปิดฟังก์ชัน “หลายภาษา” หน้า Public จะแสดงเฉพาะภาษาเริ่มต้น</div></div>'+
    '<div class="paybox" style="margin-top:14px"><div class="row space"><div><b>คำแปล Event</b><div class="muted">ชื่อ Event / รายละเอียด / สถานที่ แยกตามภาษา</div></div></div><div class="row" style="margin-top:10px;flex-wrap:wrap">'+
      ['th','en','zh','ja','ru'].map(l=>'<button class="btn sm soft" data-translate-lang="'+l+'">แก้ '+l.toUpperCase()+'</button>').join('')+
    '</div></div>';
  root.append(wrap);
  document.getElementById('saveFullSystemSettings').onclick=saveFullSystemSettings;
  wrap.querySelectorAll('[data-translate-lang]').forEach(b=>b.onclick=()=>translationDialog(b.dataset.translateLang));
};

saveFeatures=async function(){
  const getFlag=k=>document.querySelector('[data-feature="'+k+'"]');
  const competition=getFlag('competition_categories');
  const autoCategory=getFlag('auto_category');
  const selfSelect=getFlag('self_select_category');
  const fullPayment=getFlag('full_payment');
  const installments=getFlag('installments');
  const waitlist=getFlag('waitlist');
  const capacity=getFlag('capacity');

  if(competition?.checked&&selfSelect&&!selfSelect.checked&&autoCategory&&!autoCategory.checked){
    autoCategory.checked=true;
  }
  if(fullPayment&&installments&&!fullPayment.checked&&!installments.checked){
    fullPayment.checked=true;
  }
  if(waitlist?.checked&&capacity&&!capacity.checked){
    capacity.checked=true;
  }

  return baseSaveFeatures();
};

async function saveFullSystemSettings(){
  const languages=[...document.querySelectorAll('[data-full-lang]:checked')].map(x=>x.dataset.fullLang);
  if(!languages.length)return Swal.fire('ต้องมีอย่างน้อย 1 ภาษา','','warning');
  const u={
    base_registration_price_thb:Number(document.getElementById('fullBasePrice').value||0),
    pdpa_version:document.getElementById('fullPdpaVersion').value.trim()||'1.0',
    pdpa_text:document.getElementById('fullPdpaText').value.trim()||null,
    languages
  };
  const{data,error}=await db.from('restart_events').update(u).eq('id',state.event.id).select().single();
  if(error)return Swal.fire('บันทึกไม่สำเร็จ',error.message,'error');
  state.event=data;state.events=state.events.map(x=>x.id===data.id?data:x);
  Swal.fire({icon:'success',title:'บันทึกแล้ว',timer:900,showConfirmButton:false});
  renderFeatures();
}

async function translationDialog(lang){
  const{data}=await db.from('restart_event_translations').select('*').eq('event_id',state.event.id).eq('language',lang).maybeSingle();
  const r=await Swal.fire({
    title:'คำแปล '+lang.toUpperCase(),width:760,showCancelButton:true,
    html:'<div class="grid2" style="text-align:left">'+
      '<label style="grid-column:1/-1">ชื่อ Event<input id="trName" class="swal2-input" style="margin:0" value="'+esc(data?.name||'')+'"></label>'+
      '<label style="grid-column:1/-1">สถานที่<input id="trLocation" class="swal2-input" style="margin:0" value="'+esc(data?.location_name||'')+'"></label>'+
      '<label style="grid-column:1/-1">รายละเอียด<textarea id="trDesc" class="swal2-textarea" style="margin:0;width:100%">'+esc(data?.description||'')+'</textarea></label>'+
    '</div>',
    preConfirm:()=>({name:trName.value.trim()||null,location_name:trLocation.value.trim()||null,description:trDesc.value.trim()||null})
  });
  if(!r.isConfirmed)return;
  const{error}=await db.from('restart_event_translations').upsert({event_id:state.event.id,language:lang,...r.value},{onConflict:'event_id,language'});
  if(error)return Swal.fire('บันทึกไม่สำเร็จ',error.message,'error');
  Swal.fire({icon:'success',title:'บันทึกคำแปลแล้ว',timer:900,showConfirmButton:false});
}


function merchName(x){return t(x?.name)||x?.code||'เสื้อ'}
function merchDesc(x){return t(x?.description)||''}
function merchAvailable(v){return Math.max(0,Number(v.stock_qty||0)-Number(v.sold_qty||0))}
function merchStatusText(v){return v==='FULFILLED'?'รับเสื้อแล้ว':v==='CANCELLED'?'ยกเลิก':'รอรับเสื้อ'}
async function renderShirtSalesAdmin(){
  document.getElementById('content').innerHTML=card(
    'ระบบขายเสื้อ',
    '<div class="muted">เสื้อส่วนนี้เป็นสินค้า “ซื้อเพิ่ม” แยกจากไซส์เสื้อที่รวมอยู่กับค่าสมัคร</div>'+
    '<div class="grid4" id="shirtStats" style="margin-top:14px"></div>'+
    '<div id="shirtProductBox" style="margin-top:16px">กำลังโหลดสินค้า…</div>'+
    '<div id="shirtOrderBox" style="margin-top:20px">กำลังโหลดยอดขาย…</div>',
    '<button class="btn soft" onclick="exportShirtSales()">Export เสื้อ CSV</button><button class="btn primary" onclick="shirtProductDialog()">+ เพิ่มเสื้อ</button>'
  );
  const[{data:products,error:pe},{data:orders,error:oe}]=await Promise.all([
    db.from('restart_merch_products').select('*,restart_merch_variants(*)').eq('event_id',state.event.id).order('sort_order'),
    db.from('restart_merch_order_items').select('*,restart_registrations(registration_code,status,restart_participants(runner_index,first_name,last_name,phone))').eq('event_id',state.event.id).order('created_at',{ascending:false})
  ]);
  if(pe||oe)return Swal.fire('โหลดระบบเสื้อไม่สำเร็จ',(pe||oe).message,'error');
  window.__restartShirtProducts=products||[];window.__restartShirtOrders=orders||[];
  const activeOrders=(orders||[]).filter(x=>x.status!=='CANCELLED');
  const qty=activeOrders.reduce((s,x)=>s+Number(x.qty||0),0),revenue=activeOrders.reduce((s,x)=>s+Number(x.total_price_thb||0),0),waiting=activeOrders.filter(x=>x.status==='ACTIVE').reduce((s,x)=>s+Number(x.qty||0),0);
  shirtStats.innerHTML=
    '<div class="paybox"><small>สินค้า</small><div class="price">'+(products||[]).length+'</div></div>'+
    '<div class="paybox"><small>เสื้อจอง/ขาย</small><div class="price">'+qty+'</div></div>'+
    '<div class="paybox"><small>ยอดเสื้อในใบสมัคร</small><div class="price">฿'+money(revenue)+'</div></div>'+
    '<div class="paybox"><small>รอรับเสื้อ</small><div class="price">'+waiting+'</div></div>';

  shirtProductBox.innerHTML=(products||[]).length?'<div class="table-wrap"><table><thead><tr><th>สินค้า</th><th>ราคา</th><th>ไซส์ / สต๊อก</th><th>ช่วงขาย</th><th>สถานะ</th><th></th></tr></thead><tbody>'+
    (products||[]).map(p=>{
      const vars=(p.restart_merch_variants||[]).sort((a,b)=>a.sort_order-b.sort_order);
      const stocks=vars.map(v=>'<div><b>'+esc(v.size_label)+'</b> · '+merchAvailable(v)+' พร้อมขาย / '+Number(v.stock_qty||0)+' ทั้งหมด'+(Number(v.price_adjustment_thb||0)?' · '+(Number(v.price_adjustment_thb)>0?'+':'')+'฿'+money(v.price_adjustment_thb):'')+'</div>').join('');
      return '<tr><td><div class="row" style="gap:10px">'+(p.image_url?'<img src="'+esc(p.image_url)+'" style="width:62px;height:62px;object-fit:cover;border-radius:10px">':'')+'<div><b>'+esc(merchName(p))+'</b><div class="muted">'+esc(p.code)+' · '+esc(merchDesc(p))+'</div></div></div></td><td>฿'+money(p.price_thb)+'<div class="muted">สูงสุด '+p.max_per_registration+' ตัว/ใบสมัคร</div></td><td>'+stocks+'</td><td>'+(p.sale_starts_at?new Date(p.sale_starts_at).toLocaleString('th-TH'):'ทันที')+'<br>ถึง '+(p.sale_ends_at?new Date(p.sale_ends_at).toLocaleString('th-TH'):'ไม่กำหนด')+'</td><td><span class="badge '+(p.is_active?'ok':'')+'">'+(p.is_active?'เปิดขาย':'ปิด')+'</span></td><td><button class="btn sm soft" onclick="shirtProductDialog(\''+p.id+'\')">แก้ไข</button> <button class="btn sm danger" onclick="deleteShirtProduct(\''+p.id+'\')">ลบ</button></td></tr>'
    }).join('')+'</tbody></table></div>':'<div class="rr-empty">ยังไม่มีสินค้าเสื้อ · กด “+ เพิ่มเสื้อ”</div>';

  shirtOrderBox.innerHTML='<h3>รายการเสื้อจากใบสมัคร</h3>'+((orders||[]).length?'<div class="table-wrap"><table><thead><tr><th>เลขสมัคร</th><th>ผู้สมัคร</th><th>เสื้อ</th><th>ไซส์</th><th>จำนวน</th><th>ยอด</th><th>สถานะ</th><th></th></tr></thead><tbody>'+
    (orders||[]).map(o=>{
      const ps=(o.restart_registrations?.restart_participants||[]).sort((a,b)=>a.runner_index-b.runner_index),primary=ps[0];
      return '<tr><td>'+esc(o.restart_registrations?.registration_code||'—')+'</td><td>'+esc(primary?((primary.first_name||'')+' '+(primary.last_name||'')):'—')+'<div class="muted">'+esc(primary?.phone||'')+'</div></td><td>'+esc(t(o.product_name_snapshot)||o.product_code_snapshot||'เสื้อ')+'</td><td>'+esc(o.size_label_snapshot)+'</td><td>'+o.qty+'</td><td>฿'+money(o.total_price_thb)+'</td><td><span class="badge '+(o.status==='FULFILLED'?'ok':o.status==='CANCELLED'?'danger':'')+'">'+merchStatusText(o.status)+'</span></td><td>'+(o.status==='CANCELLED'?'—':'<button class="btn sm soft" onclick="toggleShirtFulfilled(\''+o.id+'\','+(o.status!=='FULFILLED')+')">'+(o.status==='FULFILLED'?'ย้อนเป็นรอรับ':'มอบเสื้อแล้ว')+'</button>')+'</td></tr>'
    }).join('')+'</tbody></table></div>':'<div class="rr-empty">ยังไม่มีรายการซื้อเสื้อ</div>');
}
function shirtVariantLines(variants){
  return (variants||[]).sort((a,b)=>a.sort_order-b.sort_order).map(v=>[v.size_label,v.sku||'',v.stock_qty||0,v.price_adjustment_thb||0].join('|')).join('\n')
}
function parseShirtVariants(textValue){
  const seen=new Set(),rows=[];
  String(textValue||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).forEach((line,i)=>{
    const parts=line.split('|').map(x=>x.trim()),size=parts[0],sku=parts[1]||null,stock=Number(parts[2]||0),adjust=Number(parts[3]||0);
    const key=size.toUpperCase();
    if(!size)throw new Error('บรรทัดไซส์ที่ '+(i+1)+' ไม่มีชื่อไซส์');
    if(seen.has(key))throw new Error('ไซส์ '+size+' ซ้ำ');
    if(!Number.isInteger(stock)||stock<0)throw new Error('สต๊อกไซส์ '+size+' ไม่ถูกต้อง');
    seen.add(key);rows.push({size_label:size,sku,stock_qty:stock,price_adjustment_thb:adjust,sort_order:i})
  });
  if(!rows.length)throw new Error('กรุณาระบุอย่างน้อย 1 ไซส์');
  return rows
}
async function shirtProductDialog(id=null){
  let p=null,variants=[];
  if(id){
    const{data,error}=await db.from('restart_merch_products').select('*,restart_merch_variants(*)').eq('id',id).eq('event_id',state.event.id).single();
    if(error)return Swal.fire('โหลดสินค้าไม่ได้',error.message,'error');
    p=data;variants=data.restart_merch_variants||[];
  }
  const r=await Swal.fire({
    title:id?'แก้ไขเสื้อ':'เพิ่มเสื้อ',width:900,showCancelButton:true,confirmButtonText:'บันทึก',
    html:'<div class="grid2" style="text-align:left">'+
      '<label>รหัสสินค้า<input id="shirtCode" class="swal2-input" style="margin:0" value="'+esc(p?.code||'')+'" placeholder="เช่น EVENT-TEE"></label>'+
      '<label>ราคาพื้นฐาน (บาท)<input id="shirtPrice" type="number" min="0" step="0.01" class="swal2-input" style="margin:0" value="'+Number(p?.price_thb||0)+'"></label>'+
      '<label>ชื่อเสื้อ TH<input id="shirtNameTh" class="swal2-input" style="margin:0" value="'+esc(p?.name?.th||t(p?.name)||'')+'"></label>'+
      '<label>ชื่อเสื้อ EN<input id="shirtNameEn" class="swal2-input" style="margin:0" value="'+esc(p?.name?.en||'')+'"></label>'+
      '<label style="grid-column:1/-1">รายละเอียด TH<textarea id="shirtDescTh" class="swal2-textarea" style="margin:0;width:100%">'+esc(p?.description?.th||t(p?.description)||'')+'</textarea></label>'+
      '<label style="grid-column:1/-1">รายละเอียด EN<textarea id="shirtDescEn" class="swal2-textarea" style="margin:0;width:100%">'+esc(p?.description?.en||'')+'</textarea></label>'+
      '<label>สูงสุดต่อใบสมัคร<input id="shirtMax" type="number" min="1" max="100" class="swal2-input" style="margin:0" value="'+Number(p?.max_per_registration||10)+'"></label>'+
      '<label>สถานะ<select id="shirtActive" class="swal2-select" style="margin:0;width:100%"><option value="true" '+(p?.is_active===false?'':'selected')+'>เปิดขาย</option><option value="false" '+(p?.is_active===false?'selected':'')+'>ปิดขาย</option></select></label>'+
      '<label>เริ่มขาย<input id="shirtStart" type="datetime-local" class="swal2-input" style="margin:0" value="'+(p?.sale_starts_at?localDT(p.sale_starts_at):'')+'"></label>'+
      '<label>ปิดขาย<input id="shirtEnd" type="datetime-local" class="swal2-input" style="margin:0" value="'+(p?.sale_ends_at?localDT(p.sale_ends_at):'')+'"></label>'+
      '<label style="grid-column:1/-1">รูปเสื้อ<input id="shirtImage" type="file" accept="image/*" class="swal2-file" style="margin:0;width:100%"><small class="muted">แนะนำ 1200×1200 px (1:1) · JPG/PNG/WebP · ไม่เกิน 2 MB</small><small id="shirtImageStatus" style="display:block;margin-top:5px"></small></label>'+
      '<label style="grid-column:1/-1">ไซส์ | SKU | สต๊อกทั้งหมด | บวก/ลดราคา<textarea id="shirtVariants" class="swal2-textarea" style="margin:0;width:100%;min-height:180px" placeholder="S|TEE-S|30|0\nM|TEE-M|50|0\nXXL|TEE-XXL|20|50">'+esc(shirtVariantLines(variants))+'</textarea><small class="muted">ตัวอย่าง XXL เพิ่ม 50 บาท: XXL|TEE-XXL|20|50 · สต๊อกต้องไม่ต่ำกว่าจำนวนที่ขาย/จองไปแล้ว</small></label>'+
    '</div>',
    didOpen:()=>{document.getElementById('shirtImage')?.addEventListener('change',e=>{const file=e.target.files?.[0],status=document.getElementById('shirtImageStatus');if(file&&status&&typeof inspectImageFile==='function')inspectImageFile(file,'square',status)})},
    preConfirm:()=>{
      try{
        const code=shirtCode.value.trim().toUpperCase(),nameTh=shirtNameTh.value.trim(),price=Number(shirtPrice.value||0);
        if(!code||!nameTh)return Swal.showValidationMessage('กรุณาระบุรหัสสินค้าและชื่อเสื้อ');
        if(price<0)return Swal.showValidationMessage('ราคาไม่ถูกต้อง');
        if(shirtStart.value&&shirtEnd.value&&new Date(shirtEnd.value)<=new Date(shirtStart.value))return Swal.showValidationMessage('เวลาปิดขายต้องอยู่หลังเวลาเริ่มขาย');
        return{code,price,nameTh,nameEn:shirtNameEn.value.trim(),descTh:shirtDescTh.value.trim(),descEn:shirtDescEn.value.trim(),max:Math.max(1,Math.min(100,Number(shirtMax.value||10))),active:shirtActive.value==='true',start:shirtStart.value||null,end:shirtEnd.value||null,variants:parseShirtVariants(shirtVariants.value),file:shirtImage.files?.[0]||null}
      }catch(e){return Swal.showValidationMessage(e.message)}
    }
  });
  if(!r.isConfirmed)return;
  const x=r.value;let imageUrl=p?.image_url||null,imagePath=p?.image_storage_path||null,newPath=null;
  try{
    Swal.fire({title:'กำลังบันทึกเสื้อ…',allowOutsideClick:false,didOpen:()=>Swal.showLoading()});
    if(x.file){
      if(x.file.size>2*1024*1024)throw new Error('รูปเสื้อต้องไม่เกิน 2 MB');
      const ext=(x.file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
      newPath=state.event.id+'/merch/'+Date.now()+'-'+Math.random().toString(36).slice(2,9)+'.'+ext;
      const up=await db.storage.from('restart-event-media').upload(newPath,x.file,{contentType:x.file.type,upsert:false});if(up.error)throw up.error;
      imageUrl=db.storage.from('restart-event-media').getPublicUrl(newPath).data.publicUrl;imagePath=newPath;
    }
    const row={event_id:state.event.id,code:x.code,name:{th:x.nameTh,en:x.nameEn||x.nameTh},description:{th:x.descTh,en:x.descEn||x.descTh},price_thb:x.price,image_url:imageUrl,image_storage_path:imagePath,max_per_registration:x.max,sale_starts_at:x.start?new Date(x.start).toISOString():null,sale_ends_at:x.end?new Date(x.end).toISOString():null,is_active:x.active,updated_at:new Date().toISOString()};
    let productId=id;
    if(id){
      const{error}=await db.from('restart_merch_products').update(row).eq('id',id).eq('event_id',state.event.id);if(error)throw error;
    }else{
      const{data,error}=await db.from('restart_merch_products').insert(row).select('id').single();if(error)throw error;productId=data.id;
    }
    const{data:existing,error:ve}=await db.from('restart_merch_variants').select('*').eq('product_id',productId);if(ve)throw ve;
    const map=new Map((existing||[]).map(v=>[String(v.size_label).toUpperCase(),v])),keep=new Set();
    for(const v of x.variants){
      const key=v.size_label.toUpperCase(),old=map.get(key);keep.add(key);
      if(old&&v.stock_qty<Number(old.sold_qty||0))throw new Error('สต๊อกไซส์ '+v.size_label+' ต่ำกว่าจำนวนที่ขาย/จองแล้ว '+Number(old.sold_qty||0)+' ตัว');
      if(old){
        const{error}=await db.from('restart_merch_variants').update({size_label:v.size_label,sku:v.sku,stock_qty:v.stock_qty,price_adjustment_thb:v.price_adjustment_thb,is_active:true,sort_order:v.sort_order,updated_at:new Date().toISOString()}).eq('id',old.id);if(error)throw error;
      }else{
        const{error}=await db.from('restart_merch_variants').insert({product_id:productId,...v,is_active:true});if(error)throw error;
      }
    }
    for(const old of existing||[]){
      if(keep.has(String(old.size_label).toUpperCase()))continue;
      if(Number(old.sold_qty||0)>0){
        const{error}=await db.from('restart_merch_variants').update({is_active:false,updated_at:new Date().toISOString()}).eq('id',old.id);if(error)throw error;
      }else{
        const{error}=await db.from('restart_merch_variants').delete().eq('id',old.id);if(error)throw error;
      }
    }
    if(newPath&&p?.image_storage_path&&p.image_storage_path!==newPath)await db.storage.from('restart-event-media').remove([p.image_storage_path]).catch(()=>{});
    Swal.fire({icon:'success',title:'บันทึกเสื้อแล้ว',timer:1000,showConfirmButton:false});renderShirtSalesAdmin()
  }catch(e){
    if(newPath)await db.storage.from('restart-event-media').remove([newPath]).catch(()=>{});
    Swal.fire('บันทึกเสื้อไม่สำเร็จ',e.message||String(e),'error')
  }
}
async function deleteShirtProduct(id){
  const p=(window.__restartShirtProducts||[]).find(x=>x.id===id);
  const r=await Swal.fire({title:'ลบสินค้าเสื้อนี้?',text:'ประวัติรายการที่เคยขายจะยังเก็บชื่อ/ไซส์/ราคาเดิมไว้',icon:'warning',showCancelButton:true,confirmButtonText:'ลบ'});
  if(!r.isConfirmed)return;
  const{error}=await db.from('restart_merch_products').delete().eq('id',id).eq('event_id',state.event.id);
  if(error)return Swal.fire('ลบไม่ได้',error.message,'error');
  if(p?.image_storage_path)await db.storage.from('restart-event-media').remove([p.image_storage_path]).catch(()=>{});
  renderShirtSalesAdmin()
}
async function toggleShirtFulfilled(id,fulfilled){
  const{error}=await db.from('restart_merch_order_items').update({status:fulfilled?'FULFILLED':'ACTIVE',fulfilled_at:fulfilled?new Date().toISOString():null}).eq('id',id).eq('event_id',state.event.id);
  if(error)return Swal.fire('บันทึกสถานะไม่ได้',error.message,'error');
  renderShirtSalesAdmin()
}
function shirtCsvCell(v){const s=String(v??'');return '"'+s.replaceAll('"','""')+'"'}
async function exportShirtSales(){
  const rows=window.__restartShirtOrders||[];
  const head=['registration_code','registration_status','customer','phone','product','product_code','size','sku','qty','unit_price_thb','total_price_thb','shirt_status','created_at'];
  const lines=[head.map(shirtCsvCell).join(',')];
  rows.forEach(o=>{
    const ps=(o.restart_registrations?.restart_participants||[]).sort((a,b)=>a.runner_index-b.runner_index),p=ps[0]||{};
    lines.push([o.restart_registrations?.registration_code,o.restart_registrations?.status,((p.first_name||'')+' '+(p.last_name||'')).trim(),p.phone,t(o.product_name_snapshot),o.product_code_snapshot,o.size_label_snapshot,o.sku_snapshot,o.qty,o.unit_price_thb,o.total_price_thb,o.status,o.created_at].map(shirtCsvCell).join(','))
  });
  const blob=new Blob(['\ufeff'+lines.join('\n')],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(state.event.slug||'event')+'-shirt-sales.csv';document.body.appendChild(a);a.click();URL.revokeObjectURL(a.href);a.remove()
}

async function renderMarketing(){
  document.getElementById('content').innerHTML=card(
    'Promotion / Discount Code',
    '<div class="grid2"><div id="promoBox">กำลังโหลด Promotion…</div><div id="discountBox">กำลังโหลด Discount Code…</div></div>',
    '<button class="btn soft" onclick="promotionDialog()">+ Promotion</button><button class="btn primary" onclick="discountDialog()">+ Discount Code</button>'
  );
  const[{data:promos,error:pe},{data:codes,error:ce}]=await Promise.all([
    db.from('restart_promotions').select('*,restart_race_categories(name),restart_packages(name)').eq('event_id',state.event.id).order('priority',{ascending:false}),
    db.from('restart_discount_codes').select('*,restart_race_categories(name),restart_packages(name)').eq('event_id',state.event.id).order('created_at',{ascending:false})
  ]);
  if(pe||ce)return document.getElementById('content').insertAdjacentHTML('beforeend','<div class="badge danger">'+esc((pe||ce).message)+'</div>');
  promoBox.innerHTML='<div class="paybox"><div class="row space"><b>Promotion อัตโนมัติ</b><span class="badge">'+(promos||[]).length+'</span></div>'+((promos||[]).length?(promos||[]).map(x=>
    '<div style="padding:10px 0;border-bottom:1px solid #eee"><div class="row space"><span><b>'+esc(x.name)+'</b><br><small class="muted">'+discountText(x)+' · '+scopeText(x)+'</small></span><span><button class="btn sm soft" onclick="promotionDialog(\''+x.id+'\')">แก้</button> <button class="btn sm danger" onclick="deleteMarketing(\'restart_promotions\',\''+x.id+'\')">ลบ</button></span></div></div>'
  ).join(''):'<div class="rr-empty">ยังไม่มี Promotion</div>')+'</div>';
  discountBox.innerHTML='<div class="paybox"><div class="row space"><b>Discount Code</b><span class="badge">'+(codes||[]).length+'</span></div>'+((codes||[]).length?(codes||[]).map(x=>
    '<div style="padding:10px 0;border-bottom:1px solid #eee"><div class="row space"><span><b>'+esc(x.code)+'</b> · '+esc(x.name||'')+'<br><small class="muted">'+discountText(x)+' · ใช้ '+x.used_count+(x.max_uses!=null?'/'+x.max_uses:'')+' · '+scopeText(x)+'</small></span><span><button class="btn sm soft" onclick="discountDialog(\''+x.id+'\')">แก้</button> <button class="btn sm danger" onclick="deleteMarketing(\'restart_discount_codes\',\''+x.id+'\')">ลบ</button></span></div></div>'
  ).join(''):'<div class="rr-empty">ยังไม่มี Discount Code</div>')+'</div>';
}
function discountText(x){return x.discount_type==='PERCENT'?Number(x.discount_value)+'%':'฿'+money(x.discount_value)}
function scopeText(x){return (x.restart_race_categories?('รุ่น '+esc(t(x.restart_race_categories.name))):'ทุกรุ่น')+' · '+(x.restart_packages?('Package '+esc(t(x.restart_packages.name))):'ทุก Package')}

async function marketingOptions(){
  const[{data:c},{data:p}]=await Promise.all([
    db.from('restart_race_categories').select('id,name').eq('event_id',state.event.id).eq('is_active',true).order('sort_order'),
    db.from('restart_packages').select('id,name').eq('event_id',state.event.id).eq('is_active',true).order('sort_order')
  ]);return{cats:c||[],pkgs:p||[]}
}
function marketingSelect(id,rows,current,label){
  return '<label>'+label+'<select id="'+id+'" class="swal2-select" style="margin:0;width:100%"><option value="">ทั้งหมด</option>'+rows.map(x=>'<option value="'+x.id+'" '+(current===x.id?'selected':'')+'>'+esc(t(x.name))+'</option>').join('')+'</select></label>'
}
async function promotionDialog(id=null){
  const opts=await marketingOptions();let x={discount_type:'PERCENT',discount_value:10,min_total_thb:0,priority:0,is_active:true};
  if(id){const{data,error}=await db.from('restart_promotions').select('*').eq('id',id).single();if(error)return Swal.fire('โหลดไม่ได้',error.message,'error');x=data}
  const r=await Swal.fire({title:id?'แก้ Promotion':'เพิ่ม Promotion',width:820,showCancelButton:true,
    html:'<div class="grid2" style="text-align:left">'+
      '<label style="grid-column:1/-1">ชื่อ<input id="mkName" class="swal2-input" style="margin:0" value="'+esc(x.name||'')+'"></label>'+
      '<label>ประเภท<select id="mkType" class="swal2-select" style="margin:0;width:100%"><option value="PERCENT" '+(x.discount_type==='PERCENT'?'selected':'')+'>เปอร์เซ็นต์</option><option value="FIXED" '+(x.discount_type==='FIXED'?'selected':'')+'>จำนวนเงิน</option></select></label>'+
      '<label>ส่วนลด<input id="mkValue" type="number" min="0.01" step="0.01" class="swal2-input" style="margin:0" value="'+Number(x.discount_value||0)+'"></label>'+
      marketingSelect('mkCat',opts.cats,x.category_id,'รุ่น')+marketingSelect('mkPkg',opts.pkgs,x.package_id,'Package')+
      '<label>ยอดขั้นต่ำ<input id="mkMin" type="number" min="0" step="0.01" class="swal2-input" style="margin:0" value="'+Number(x.min_total_thb||0)+'"></label>'+
      '<label>Priority<input id="mkPriority" type="number" class="swal2-input" style="margin:0" value="'+Number(x.priority||0)+'"></label>'+
      '<label>เริ่ม<input id="mkStart" type="datetime-local" class="swal2-input" style="margin:0" value="'+(x.starts_at?localDT(x.starts_at):'')+'"></label>'+
      '<label>สิ้นสุด<input id="mkEnd" type="datetime-local" class="swal2-input" style="margin:0" value="'+(x.ends_at?localDT(x.ends_at):'')+'"></label>'+
      '<label style="display:flex;align-items:center;gap:8px"><input id="mkActive" type="checkbox" style="width:auto" '+(x.is_active?'checked':'')+'> เปิดใช้งาน</label>'+
    '</div>',
    preConfirm:()=>{
      if(!mkName.value.trim())return Swal.showValidationMessage('กรุณาระบุชื่อ');
      if(Number(mkValue.value)<=0)return Swal.showValidationMessage('ส่วนลดต้องมากกว่า 0');
      if(mkType.value==='PERCENT'&&Number(mkValue.value)>100)return Swal.showValidationMessage('เปอร์เซ็นต์ต้องไม่เกิน 100');
      return{name:mkName.value.trim(),discount_type:mkType.value,discount_value:Number(mkValue.value),category_id:mkCat.value||null,package_id:mkPkg.value||null,min_total_thb:Number(mkMin.value||0),priority:Number(mkPriority.value||0),starts_at:mkStart.value?new Date(mkStart.value).toISOString():null,ends_at:mkEnd.value?new Date(mkEnd.value).toISOString():null,is_active:mkActive.checked}
    }});
  if(!r.isConfirmed)return;const row={event_id:state.event.id,...r.value};
  const{error}=id?await db.from('restart_promotions').update(row).eq('id',id):await db.from('restart_promotions').insert(row);
  if(error)return Swal.fire('บันทึกไม่ได้',error.message,'error');renderMarketing()
}
async function discountDialog(id=null){
  const opts=await marketingOptions();let x={discount_type:'PERCENT',discount_value:10,min_total_thb:0,is_active:true};
  if(id){const{data,error}=await db.from('restart_discount_codes').select('*').eq('id',id).single();if(error)return Swal.fire('โหลดไม่ได้',error.message,'error');x=data}
  const r=await Swal.fire({title:id?'แก้ Discount Code':'เพิ่ม Discount Code',width:820,showCancelButton:true,
    html:'<div class="grid2" style="text-align:left">'+
      '<label>Code<input id="dcCode" class="swal2-input" style="margin:0;text-transform:uppercase" value="'+esc(x.code||'')+'"></label>'+
      '<label>ชื่อ/คำอธิบาย<input id="dcName" class="swal2-input" style="margin:0" value="'+esc(x.name||'')+'"></label>'+
      '<label>ประเภท<select id="dcType" class="swal2-select" style="margin:0;width:100%"><option value="PERCENT" '+(x.discount_type==='PERCENT'?'selected':'')+'>เปอร์เซ็นต์</option><option value="FIXED" '+(x.discount_type==='FIXED'?'selected':'')+'>จำนวนเงิน</option></select></label>'+
      '<label>ส่วนลด<input id="dcValue" type="number" min="0.01" step="0.01" class="swal2-input" style="margin:0" value="'+Number(x.discount_value||0)+'"></label>'+
      marketingSelect('dcCat',opts.cats,x.category_id,'รุ่น')+marketingSelect('dcPkg',opts.pkgs,x.package_id,'Package')+
      '<label>ยอดขั้นต่ำ<input id="dcMin" type="number" min="0" step="0.01" class="swal2-input" style="margin:0" value="'+Number(x.min_total_thb||0)+'"></label>'+
      '<label>จำนวนครั้งสูงสุด<input id="dcMax" type="number" min="1" class="swal2-input" style="margin:0" value="'+(x.max_uses??'')+'" placeholder="ว่าง = ไม่จำกัด"></label>'+
      '<label>เริ่ม<input id="dcStart" type="datetime-local" class="swal2-input" style="margin:0" value="'+(x.starts_at?localDT(x.starts_at):'')+'"></label>'+
      '<label>สิ้นสุด<input id="dcEnd" type="datetime-local" class="swal2-input" style="margin:0" value="'+(x.ends_at?localDT(x.ends_at):'')+'"></label>'+
      '<label style="display:flex;align-items:center;gap:8px"><input id="dcActive" type="checkbox" style="width:auto" '+(x.is_active?'checked':'')+'> เปิดใช้งาน</label>'+
    '</div>',
    preConfirm:()=>{
      const code=dcCode.value.trim().toUpperCase();
      if(!/^[A-Z0-9_-]{2,30}$/.test(code))return Swal.showValidationMessage('Code ใช้ A-Z 0-9 _ - เท่านั้น');
      if(Number(dcValue.value)<=0)return Swal.showValidationMessage('ส่วนลดต้องมากกว่า 0');
      if(dcType.value==='PERCENT'&&Number(dcValue.value)>100)return Swal.showValidationMessage('เปอร์เซ็นต์ต้องไม่เกิน 100');
      return{code,name:dcName.value.trim()||null,discount_type:dcType.value,discount_value:Number(dcValue.value),category_id:dcCat.value||null,package_id:dcPkg.value||null,min_total_thb:Number(dcMin.value||0),max_uses:dcMax.value?Number(dcMax.value):null,starts_at:dcStart.value?new Date(dcStart.value).toISOString():null,ends_at:dcEnd.value?new Date(dcEnd.value).toISOString():null,is_active:dcActive.checked}
    }});
  if(!r.isConfirmed)return;const row={event_id:state.event.id,...r.value};
  const{error}=id?await db.from('restart_discount_codes').update(row).eq('id',id):await db.from('restart_discount_codes').insert(row);
  if(error)return Swal.fire('บันทึกไม่ได้',error.message,'error');renderMarketing()
}
async function deleteMarketing(table,id){
  const r=await Swal.fire({title:'ยืนยันการลบ?',icon:'warning',showCancelButton:true,confirmButtonText:'ลบ'});if(!r.isConfirmed)return;
  const{error}=await db.from(table).delete().eq('id',id);if(error)return Swal.fire('ลบไม่ได้',error.message,'error');renderMarketing()
}

async function renderWaitlist(){
  document.getElementById('content').innerHTML=card('Waitlist / คิวรอ','<div id="waitBox">กำลังโหลด…</div>');
  const{data,error}=await db.from('restart_waitlist').select('*,restart_race_categories(name),restart_packages(name)').eq('event_id',state.event.id).order('created_at');
  if(error)return waitBox.innerHTML='<div class="badge danger">'+esc(error.message)+'</div>';
  const rows=data||[];
  waitBox.innerHTML=rows.length?'<div class="table-wrap"><table><thead><tr><th>#</th><th>ผู้ติดต่อ</th><th>ประเภท</th><th>รุ่น/Package</th><th>สถานะ</th><th>เวลา</th><th></th></tr></thead><tbody>'+
    rows.map((x,i)=>'<tr><td>'+(i+1)+'</td><td><b>'+esc(x.contact_name)+'</b><div class="muted">'+esc(x.contact_phone||'')+'</div></td><td>'+esc(x.registration_type)+' · '+x.runner_count+' คน</td><td>'+esc(t(x.restart_race_categories?.name)||'—')+'<div class="muted">'+esc(t(x.restart_packages?.name)||'')+'</div></td><td><span class="badge">'+esc(x.status)+'</span></td><td>'+new Date(x.created_at).toLocaleString('th-TH')+'</td><td><button class="btn sm soft" onclick="setWaitStatus(\''+x.id+'\',\'INVITED\')">เชิญ</button> <button class="btn sm danger" onclick="setWaitStatus(\''+x.id+'\',\'CANCELLED\')">ยกเลิก</button></td></tr>').join('')+
    '</tbody></table></div>':'<div class="rr-empty">ยังไม่มีคิวรอ</div>';
}
async function setWaitStatus(id,status){
  const{error}=await db.from('restart_waitlist').update({status,updated_at:new Date().toISOString()}).eq('id',id);
  if(error)return Swal.fire('บันทึกไม่ได้',error.message,'error');renderWaitlist()
}

renderShowcase=async function(){
  await baseRenderShowcase();
  const root=document.getElementById('content');if(!root)return;
  const box=document.createElement('section');box.className='rr-card';box.style.marginTop='16px';
  box.innerHTML='<div class="row space"><div><h2>Sponsor Logo</h2><div class="muted">รองรับหลาย Logo · แนะนำ PNG/WebP พื้นหลังโปร่งใส 1000×1000 px</div></div><label class="btn soft" style="cursor:pointer">+ อัปโหลด Sponsor<input id="sponsorFiles" type="file" accept="image/*" multiple style="display:none"></label></div><div id="sponsorList" style="margin-top:14px"></div>';
  root.append(box);document.getElementById('sponsorFiles').onchange=uploadSponsors;renderSponsorList()
};
async function renderSponsorList(){
  const el=document.getElementById('sponsorList');if(!el)return;
  const{data,error}=await db.from('restart_event_media').select('*').eq('event_id',state.event.id).eq('media_type','SPONSOR').order('sort_order');
  if(error)return el.innerHTML='<div class="badge danger">'+esc(error.message)+'</div>';
  el.innerHTML=(data||[]).length?'<div class="row" style="flex-wrap:wrap">'+data.map(x=>'<div class="paybox" style="width:150px"><img src="'+esc(x.url)+'" style="width:100%;height:90px;object-fit:contain"><button class="btn sm danger" style="width:100%;margin-top:8px" onclick="deleteSponsor(\''+x.id+'\')">ลบ</button></div>').join('')+'</div>':'<div class="rr-empty">ยังไม่มี Sponsor Logo</div>'
}
async function uploadSponsors(e){
  const files=[...(e.target.files||[])];if(!files.length)return;
  Swal.fire({title:'กำลังอัปโหลด Sponsor…',allowOutsideClick:false,didOpen:()=>Swal.showLoading()});
  for(let i=0;i<files.length;i++){
    const file=files[i],ext=(file.name.split('.').pop()||'png').toLowerCase(),path=state.event.id+'/sponsors/'+Date.now()+'-'+i+'-'+crypto.randomUUID().slice(0,8)+'.'+ext;
    const{error:up}=await db.storage.from('restart-event-media').upload(path,file,{contentType:file.type,upsert:false});if(up){Swal.fire('อัปโหลดไม่ได้',up.message,'error');return}
    const{data:urlData}=db.storage.from('restart-event-media').getPublicUrl(path);
    const{error:ins}=await db.from('restart_event_media').insert({event_id:state.event.id,media_type:'SPONSOR',url:urlData.publicUrl,alt_text:{th:file.name,storage_path:path},sort_order:i,is_active:true});
    if(ins){Swal.fire('บันทึกไม่ได้',ins.message,'error');return}
  }
  Swal.close();renderSponsorList()
}
async function deleteSponsor(id){
  const{data:x}=await db.from('restart_event_media').select('*').eq('id',id).single();
  const{error}=await db.from('restart_event_media').delete().eq('id',id);if(error)return Swal.fire('ลบไม่ได้',error.message,'error');
  const p=x?.alt_text?.storage_path;if(p)await db.storage.from('restart-event-media').remove([p]).catch(()=>{});
  renderSponsorList()
}

renderRegistrations=async function(){
  await baseRenderRegistrations();
  if((state.event.feature_flags||{}).export===false){
    [...document.querySelectorAll('#content button')].filter(b=>/Export CSV/i.test(b.textContent)).forEach(b=>b.remove());
  }
};

showRegistrationDetail=async function(id){
  const{data:r,error}=await db.from('restart_registrations').select('*,restart_participants(*),restart_beneficiaries(*),restart_followers(*),restart_merch_order_items(*),restart_registration_audit(*)').eq('id',id).single();
  if(error)return Swal.fire('โหลดรายละเอียดไม่ได้',error.message,'error');
  const ps=(r.restart_participants||[]).sort((a,b)=>a.runner_index-b.runner_index),bs=r.restart_beneficiaries||[],fs=(r.restart_followers||[]).sort((a,b)=>a.follower_index-b.follower_index),ms=r.restart_merch_order_items||[];
  const html='<div style="text-align:left"><p><b>'+esc(r.registration_code)+'</b> · '+registrationTypeText(r.registration_type)+(r.group_name?' · '+esc(r.group_name):'')+'</p>'+
    '<div class="paybox"><b>ยอด</b><div>ก่อนส่วนลด ฿'+money(r.subtotal_amount_thb)+' · ส่วนลด ฿'+money(r.discount_amount_thb)+' · สุทธิ ฿'+money(r.total_amount_thb)+'</div></div>'+
    ps.map(p=>'<div class="paybox" style="margin:8px 0"><b>ผู้แข่งขัน '+p.runner_index+' · '+esc((p.first_name||'')+' '+(p.last_name||''))+'</b><div class="muted">ID/Passport: '+esc(p.id_document||'—')+' · โทร: '+esc(p.phone||'—')+' · เสื้อ: '+esc(p.shirt_size||'—')+'</div>'+(bs.filter(b=>b.runner_index===p.runner_index).length?'<div style="margin-top:6px"><small>ผู้รับผลประโยชน์: '+esc(bs.filter(b=>b.runner_index===p.runner_index).map(b=>b.full_name+' '+b.percentage+'%').join(', '))+'</small></div>':'')+'</div>').join('')+
    (fs.length?'<div class="paybox"><b>ผู้ติดตาม '+fs.length+' คน</b>'+fs.map(f=>'<div>'+f.follower_index+'. '+esc(f.full_name)+' · '+esc(f.id_document||'—')+' · '+esc(f.phone||'')+'</div>').join('')+'</div>':'')+
    (ms.length?'<div class="paybox"><b>เสื้อซื้อเพิ่ม · ฿'+money(r.merchandise_amount_thb||0)+'</b>'+ms.map(m=>'<div>'+esc(t(m.product_name_snapshot)||m.product_code_snapshot||'เสื้อ')+' · '+esc(m.size_label_snapshot)+' × '+m.qty+' · ฿'+money(m.total_price_thb)+' · '+merchStatusText(m.status)+'</div>').join('')+'</div>':'')+
    (r.cancelled_at?'<div class="badge danger">ยกเลิก '+new Date(r.cancelled_at).toLocaleString('th-TH')+' · '+esc(r.cancelled_reason||'')+'</div>':'')+
  '</div>';
  Swal.fire({title:'รายละเอียดใบสมัคร',html,width:960,confirmButtonText:'ปิด'})
};

exportRegistrations=async function(){
  Swal.fire({title:'กำลังสร้าง CSV…',allowOutsideClick:false,didOpen:()=>Swal.showLoading()});
  const{data,error}=await db.from('restart_registrations').select('*,restart_race_categories(code,name),restart_packages(code,name),restart_participants(*),restart_beneficiaries(*),restart_followers(*),restart_merch_order_items(*),restart_registration_answers(*)').eq('event_id',state.event.id).order('created_at');
  if(error)return Swal.fire('Export ไม่สำเร็จ',error.message,'error');
  const head=['registration_code','registration_type','group_name','runner_count','contact_runner_index','runner_index','first_name','last_name','id_document','phone','birth_date','gender','shirt_size','blood_group','address','emergency_phone','emergency_relation','category','package','followers','beneficiaries','shirt_addons','custom_answers','subtotal_amount_thb','discount_amount_thb','merchandise_amount_thb','total_amount_thb','payment_mode','status','created_at'];
  const lines=[head.map(csvCell).join(',')];
  (data||[]).forEach(r=>{
    const beneficiaries=r.restart_beneficiaries||[],answers=r.restart_registration_answers||[],followers=(r.restart_followers||[]).map(f=>[f.full_name,f.id_document,f.phone].filter(Boolean).join(' | ')).join(' ; '),shirtAddons=(r.restart_merch_order_items||[]).map(m=>[t(m.product_name_snapshot)||m.product_code_snapshot,m.size_label_snapshot,'x'+m.qty,'฿'+money(m.total_price_thb),m.status].filter(Boolean).join(' | ')).join(' ; ');
    (r.restart_participants||[]).sort((a,b)=>a.runner_index-b.runner_index).forEach(p=>{
      const beneText=beneficiaries.filter(b=>b.runner_index===p.runner_index).map(b=>[b.full_name,b.relationship,b.percentage+'%',b.id_document].filter(Boolean).join(' | ')).join(' ; ');
      const answerObj={};answers.filter(a=>a.runner_index===p.runner_index).forEach(a=>answerObj[a.field_key]=a.value);
      lines.push([r.registration_code,r.registration_type,r.group_name||'',r.runner_count||r.restart_participants.length,r.contact_runner_index||1,p.runner_index,p.first_name,p.last_name,p.id_document,p.phone,p.birth_date,p.gender,p.shirt_size,p.blood_group,p.address,p.emergency_phone,p.emergency_relation,t(r.restart_race_categories?.name),t(r.restart_packages?.name),followers,beneText,shirtAddons,JSON.stringify(answerObj),r.subtotal_amount_thb,r.discount_amount_thb,r.merchandise_amount_thb,r.total_amount_thb,r.payment_mode,r.status,r.created_at].map(csvCell).join(','))
    })
  });
  const blob=new Blob(['\ufeff'+lines.join('\n')],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(state.event.slug||'event')+'-registrations-full.csv';document.body.appendChild(a);a.click();URL.revokeObjectURL(a.href);a.remove();Swal.close()
};

Object.assign(window,{
  renderMarketing,promotionDialog,discountDialog,deleteMarketing,renderShirtSalesAdmin,shirtProductDialog,deleteShirtProduct,toggleShirtFulfilled,exportShirtSales,renderWaitlist,setWaitStatus,
  saveFullSystemSettings,translationDialog,deleteSponsor,showRegistrationDetail,exportRegistrations
});
})();