(()=>{
delete featureLabels.shirt_sales;
featureLabels.storefront='ร้านค้า / Merchandise';

const prevRender=render;
render=function(){
  if(state.tab==='store')return renderStoreAdmin();
  return prevRender()
};

function ensureStoreNav(){
  const nav=document.getElementById('nav');if(!nav)return;
  nav.querySelector('[data-tab="shirtsales"]')?.remove();
  if(nav.querySelector('[data-tab="store"]'))return;
  const b=document.createElement('button');b.dataset.tab='store';b.textContent='ร้านค้า';
  const marketing=nav.querySelector('[data-tab="marketing"]');
  if(marketing)marketing.after(b);else nav.append(b)
}
ensureStoreNav();

function storeTr(v){return typeof v==='string'?v:(v?.th||v?.en||Object.values(v||{})[0]||'')}
function storePrice(p,v){return Number(v?.price_override_thb??(Number(p?.price_thb||0)+Number(v?.price_adjustment_thb||0)))}
function storeAvail(v){return Math.max(0,Number(v.stock_qty||0)-Number(v.sold_qty||0))}
function storeOptionText(v){const o=v.option_values||{};return Object.keys(o).length?Object.entries(o).map(([k,x])=>k+'='+x).join(', '):(storeTr(v.variant_name)||v.size_label||'มาตรฐาน')}
function storeOrderStatus(s){return({PENDING_PAYMENT:'รอชำระ',PENDING_REVIEW:'รอตรวจสลิป',PAID:'ชำระแล้ว',PREPARING:'เตรียมสินค้า',READY:'พร้อมรับ',FULFILLED:'รับแล้ว',SHIPPED:'ส่งแล้ว',CANCELLED:'ยกเลิก'})[s]||s}
function storePaymentStatus(s){return({PENDING:'รอชำระ',PENDING_REVIEW:'รอตรวจ',APPROVED:'อนุมัติ',REJECTED:'ไม่ผ่าน',REFUNDED:'คืนเงิน'})[s]||s}

async function renderStoreAdmin(){
  if(!needEvent())return;
  ensureStoreNav();
  document.getElementById('content').innerHTML=
    card('ร้านค้า / Merchandise',
      '<div class="row space"><div><b>ขายสินค้าแยกจากการสมัครแข่งขัน</b><div class="muted">สินค้า ตัวเลือก สต๊อก ออเดอร์ และการชำระเงินเป็นระบบร้านค้าอิสระ</div></div><a class="btn soft" target="_blank" href="../public/shop.html?event='+encodeURIComponent(state.event.slug)+'">เปิดหน้าร้าน</a></div>'+
      '<div id="storeSettingsBox" style="margin-top:16px"></div>'+
      '<div id="storeStats" class="grid4" style="margin-top:16px"></div>'+
      '<div id="storeProductBox" style="margin-top:20px"></div>'+
      '<div id="storeOrderBox" style="margin-top:24px"></div>',
      '<button class="btn soft" onclick="exportStoreOrders()">Export Orders CSV</button><button class="btn primary" onclick="storeProductDialog()">+ เพิ่มสินค้า</button>'
    );
  const[{data:settings,error:se},{data:products,error:pe},{data:orders,error:oe}]=await Promise.all([
    db.from('restart_store_settings').select('*').eq('event_id',state.event.id).maybeSingle(),
    db.from('restart_merch_products').select('*,restart_merch_variants(*)').eq('event_id',state.event.id).order('sort_order'),
    db.from('restart_store_orders').select('*,restart_store_order_items(*),restart_store_payments(*)').eq('event_id',state.event.id).order('created_at',{ascending:false})
  ]);
  if(se||pe||oe)return Swal.fire('โหลดร้านค้าไม่สำเร็จ',(se||pe||oe).message,'error');
  window.__storeSettings=settings||null;window.__storeProducts=products||[];window.__storeOrders=orders||[];
  renderStoreSettings(settings);
  renderStoreProducts(products||[]);
  renderStoreOrders(orders||[]);
}
function renderStoreSettings(s){
  const name=storeTr(s?.store_name)||((state.event.name||'Event')+' Store');
  storeSettingsBox.innerHTML='<div class="paybox"><div class="row space"><div><b>ตั้งค่าหน้าร้าน</b><div class="muted">แยกจากเวลาเปิดรับสมัครแข่งขัน</div></div><button class="btn sm primary" id="saveStoreSettings">บันทึก</button></div><div class="grid2" style="margin-top:12px">'+
    '<label>ชื่อร้าน<input id="storeName" value="'+esc(name)+'"></label>'+
    '<label>สถานะร้าน<select id="storeOpen"><option value="true" '+(s?.is_open===false?'':'selected')+'>เปิดร้าน</option><option value="false" '+(s?.is_open===false?'selected':'')+'>ปิดร้าน</option></select></label>'+
    '<label>รับสินค้าเอง<select id="storePickup"><option value="true" '+(s?.pickup_enabled===false?'':'selected')+'>เปิด</option><option value="false" '+(s?.pickup_enabled===false?'selected':'')+'>ปิด</option></select></label>'+
    '<label>จัดส่ง<select id="storeDelivery"><option value="false" '+(s?.delivery_enabled?'':'selected')+'>ปิด</option><option value="true" '+(s?.delivery_enabled?'selected':'')+'>เปิด</option></select></label>'+
    '<label>ค่าส่ง (บาท)<input id="storeShipping" type="number" min="0" step="0.01" value="'+Number(s?.shipping_fee_thb||0)+'"></label>'+
    '<label>ข้อความจุดรับสินค้า<input id="storePickupNote" value="'+esc(storeTr(s?.pickup_note))+'"></label>'+
    '<label style="grid-column:1/-1">เงื่อนไข / หมายเหตุร้าน<textarea id="storeTerms" rows="3">'+esc(storeTr(s?.terms))+'</textarea></label>'+
    '</div></div>';
  document.getElementById('saveStoreSettings').onclick=saveStoreSettings
}
async function saveStoreSettings(){
  const row={event_id:state.event.id,store_name:{th:storeName.value.trim(),en:storeName.value.trim()},is_open:storeOpen.value==='true',pickup_enabled:storePickup.value==='true',delivery_enabled:storeDelivery.value==='true',shipping_fee_thb:Number(storeShipping.value||0),pickup_note:{th:storePickupNote.value.trim()},terms:{th:storeTerms.value.trim()},updated_at:new Date().toISOString()};
  if(!row.pickup_enabled&&!row.delivery_enabled)return Swal.fire('ต้องเปิดวิธีรับสินค้าอย่างน้อย 1 แบบ','','warning');
  const{error}=await db.from('restart_store_settings').upsert(row,{onConflict:'event_id'});
  if(error)return Swal.fire('บันทึกไม่ได้',error.message,'error');
  Swal.fire({icon:'success',title:'บันทึกหน้าร้านแล้ว',timer:900,showConfirmButton:false});renderStoreAdmin()
}
function renderStoreProducts(products){
  const totalStock=products.flatMap(p=>p.restart_merch_variants||[]).reduce((s,v)=>s+storeAvail(v),0);
  const orders=window.__storeOrders||[],active=orders.filter(o=>o.status!=='CANCELLED');
  const revenue=active.filter(o=>o.payment_status==='APPROVED').reduce((s,o)=>s+Number(o.total_amount_thb||0),0);
  const pending=orders.filter(o=>o.payment_status==='PENDING_REVIEW').length;
  storeStats.innerHTML='<div class="paybox"><small>สินค้า</small><div class="price">'+products.length+'</div></div><div class="paybox"><small>สต๊อกพร้อมขาย</small><div class="price">'+totalStock+'</div></div><div class="paybox"><small>รอตรวจสลิป</small><div class="price">'+pending+'</div></div><div class="paybox"><small>ยอดชำระแล้ว</small><div class="price">฿'+money(revenue)+'</div></div>';
  storeProductBox.innerHTML='<div class="row space"><div><h3 style="margin:0">สินค้า</h3><div class="muted">ตัวเลือกแต่ละแบบตั้งราคาและสต๊อกแยกกันได้</div></div></div>'+
    (products.length?'<div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>สินค้า</th><th>หมวด</th><th>ตัวเลือก / ราคา / สต๊อก</th><th>สถานะ</th><th></th></tr></thead><tbody>'+
      products.map(p=>'<tr><td><div class="row" style="gap:10px">'+(p.image_url?'<img src="'+esc(p.image_url)+'" style="width:64px;height:64px;object-fit:cover;border-radius:10px">':'')+'<div><b>'+esc(storeTr(p.name)||p.code)+'</b><div class="muted">'+esc(p.code)+'<br>'+esc(storeTr(p.description))+'</div></div></div></td><td>'+esc(p.category||'—')+'</td><td>'+((p.restart_merch_variants||[]).sort((a,b)=>a.sort_order-b.sort_order).map(v=>'<div><b>'+esc(storeOptionText(v))+'</b> · ฿'+money(storePrice(p,v))+' · เหลือ '+storeAvail(v)+'/'+v.stock_qty+(storeTr(v.badge)?' · <span class="badge">'+esc(storeTr(v.badge))+'</span>':'')+'</div>').join('')||'—')+'</td><td><span class="badge '+(p.is_active?'ok':'')+'">'+(p.is_active?'เปิดขาย':'ปิด')+'</span></td><td><button class="btn sm soft" onclick="storeProductDialog(\''+p.id+'\')">แก้ไข</button> <button class="btn sm danger" onclick="archiveStoreProduct(\''+p.id+'\')">'+(p.is_active?'ปิดขาย':'ลบ')+'</button></td></tr>').join('')+
      '</tbody></table></div>':'<div class="rr-empty">ยังไม่มีสินค้า · กด “+ เพิ่มสินค้า”</div>')
}
function parseStoreOptions(text){
  const out={};String(text||'').split(',').map(x=>x.trim()).filter(Boolean).forEach(piece=>{
    const i=piece.indexOf('=');if(i<1)out['ตัวเลือก']=piece;else out[piece.slice(0,i).trim()]=piece.slice(i+1).trim()
  });return out
}
function parseStoreVariants(txt){
  const rows=[],seen=new Set();
  String(txt||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).forEach((line,i)=>{
    const p=line.split('|').map(x=>x.trim()),options=parseStoreOptions(p[0]),label=Object.values(options).filter(Boolean).join(' / ')||p[0]||'มาตรฐาน',sku=p[1]||null,price=Number(p[2]||0),stock=Number(p[3]||0),badge=p[4]||'';
    if(!Number.isFinite(price)||price<0)throw new Error('ราคาบรรทัด '+(i+1)+' ไม่ถูกต้อง');
    if(!Number.isInteger(stock)||stock<0)throw new Error('สต๊อกบรรทัด '+(i+1)+' ไม่ถูกต้อง');
    const key=(sku||JSON.stringify(options)).toUpperCase();if(seen.has(key))throw new Error('ตัวเลือกหรือ SKU ซ้ำ บรรทัด '+(i+1));seen.add(key);
    rows.push({label,option_values:options,sku,price_override_thb:price,stock_qty:stock,badge:badge?{th:badge,en:badge}:{},sort_order:i})
  });
  if(!rows.length)throw new Error('กรุณาระบุอย่างน้อย 1 ตัวเลือกสินค้า');return rows
}
function variantLines(vars){
  return (vars||[]).sort((a,b)=>a.sort_order-b.sort_order).map(v=>[storeOptionText(v),v.sku||'',storePrice({price_thb:0},v),v.stock_qty||0,storeTr(v.badge)].join(' | ')).join('\n')
}
function buildOptionSchema(rows){
  const map={};rows.forEach(r=>Object.entries(r.option_values||{}).forEach(([k,v])=>{(map[k]||=new Set()).add(v)}));
  return Object.entries(map).map(([key,set])=>({key,label:{th:key,en:key},values:[...set].map(v=>({key:v,label:{th:v,en:v}}))}))
}
async function storeProductDialog(id=null){
  let p=null,vars=[];
  if(id){const{data,error}=await db.from('restart_merch_products').select('*,restart_merch_variants(*)').eq('id',id).eq('event_id',state.event.id).single();if(error)return Swal.fire('โหลดสินค้าไม่ได้',error.message,'error');p=data;vars=data.restart_merch_variants||[]}
  const example='สี=ขาว | BAG-WHITE | 100 | 30 |\nสี=ดำ,รุ่น=Limited | BAG-BLACK-LTD | 250 | 10 | LIMITED';
  const r=await Swal.fire({title:id?'แก้ไขสินค้า':'เพิ่มสินค้า',width:940,showCancelButton:true,confirmButtonText:'บันทึก',
    html:'<div class="grid2" style="text-align:left">'+
      '<label>รหัสสินค้า<input id="spCode" class="swal2-input" style="margin:0" value="'+esc(p?.code||'')+'" placeholder="BAG-001"></label>'+
      '<label>หมวดสินค้า<input id="spCategory" class="swal2-input" style="margin:0" value="'+esc(p?.category||'')+'" placeholder="กระเป๋า / เสื้อ / ของที่ระลึก"></label>'+
      '<label>ชื่อสินค้า TH<input id="spNameTh" class="swal2-input" style="margin:0" value="'+esc(p?.name?.th||storeTr(p?.name))+'"></label>'+
      '<label>ชื่อสินค้า EN<input id="spNameEn" class="swal2-input" style="margin:0" value="'+esc(p?.name?.en||'')+'"></label>'+
      '<label style="grid-column:1/-1">รายละเอียด<textarea id="spDesc" class="swal2-textarea" style="margin:0;width:100%">'+esc(p?.description?.th||storeTr(p?.description))+'</textarea></label>'+
      '<label>จำนวนสูงสุดต่อออเดอร์<input id="spMax" type="number" min="1" max="100" class="swal2-input" style="margin:0" value="'+Number(p?.max_per_order||10)+'"></label>'+
      '<label>สถานะ<select id="spActive" class="swal2-select" style="margin:0;width:100%"><option value="true" '+(p?.is_active===false?'':'selected')+'>เปิดขาย</option><option value="false" '+(p?.is_active===false?'selected':'')+'>ปิดขาย</option></select></label>'+
      '<label>เริ่มขาย<input id="spStart" type="datetime-local" class="swal2-input" style="margin:0" value="'+(p?.sale_starts_at?localDT(p.sale_starts_at):'')+'"></label>'+
      '<label>ปิดขาย<input id="spEnd" type="datetime-local" class="swal2-input" style="margin:0" value="'+(p?.sale_ends_at?localDT(p.sale_ends_at):'')+'"></label>'+
      '<label style="grid-column:1/-1">รูปสินค้า<input id="spImage" type="file" accept="image/*" class="swal2-file" style="margin:0;width:100%"><small class="muted">แนะนำ 1200×1200 px · JPG/PNG/WebP · ไม่เกิน 2 MB</small></label>'+
      '<label style="grid-column:1/-1"><b>ช้อยท์สินค้า</b><textarea id="spVariants" class="swal2-textarea" style="margin:0;width:100%;min-height:200px" placeholder="'+esc(example)+'">'+esc(variantLines(vars))+'</textarea><small class="muted">รูปแบบ: ตัวเลือก | SKU | ราคาขาย | สต๊อก | ป้าย เช่น “สี=ดำ,รุ่น=Limited | BAG-BLACK-LTD | 250 | 10 | LIMITED” รองรับหลายตัวเลือก เช่น สี + ไซส์ + รุ่น</small></label>'+
    '</div>',
    preConfirm:()=>{try{const code=spCode.value.trim().toUpperCase(),name=spNameTh.value.trim(),rows=parseStoreVariants(spVariants.value);if(!code||!name)return Swal.showValidationMessage('กรุณากรอกรหัสและชื่อสินค้า');if(spStart.value&&spEnd.value&&new Date(spEnd.value)<=new Date(spStart.value))return Swal.showValidationMessage('เวลาปิดขายต้องอยู่หลังเวลาเปิดขาย');return{code,category:spCategory.value.trim()||null,name:{th:name,en:spNameEn.value.trim()||name},description:{th:spDesc.value.trim(),en:spDesc.value.trim()},max:Number(spMax.value||10),active:spActive.value==='true',start:spStart.value||null,end:spEnd.value||null,rows,file:spImage.files?.[0]||null}}catch(e){return Swal.showValidationMessage(e.message)}}});
  if(!r.isConfirmed)return;
  let newPath=null,imageUrl=p?.image_url||null,imagePath=p?.image_storage_path||null;
  try{
    Swal.fire({title:'กำลังบันทึกสินค้า…',allowOutsideClick:false,didOpen:()=>Swal.showLoading()});
    if(r.value.file){if(r.value.file.size>2*1024*1024)throw new Error('รูปต้องไม่เกิน 2 MB');const ext=(r.value.file.name.split('.').pop()||'jpg').replace(/[^a-z0-9]/gi,'');newPath=state.event.id+'/store/'+Date.now()+'-'+Math.random().toString(36).slice(2,8)+'.'+ext;const up=await db.storage.from('restart-event-media').upload(newPath,r.value.file,{contentType:r.value.file.type,upsert:false});if(up.error)throw up.error;imageUrl=db.storage.from('restart-event-media').getPublicUrl(newPath).data.publicUrl;imagePath=newPath}
    const firstPrice=Math.min(...r.value.rows.map(x=>x.price_override_thb));
    const row={event_id:state.event.id,code:r.value.code,category:r.value.category,product_type:'GENERAL',name:r.value.name,description:r.value.description,price_thb:firstPrice,option_schema:buildOptionSchema(r.value.rows),max_per_order:r.value.max,image_url:imageUrl,image_storage_path:imagePath,is_active:r.value.active,sale_starts_at:r.value.start?new Date(r.value.start).toISOString():null,sale_ends_at:r.value.end?new Date(r.value.end).toISOString():null,updated_at:new Date().toISOString()};
    let pid=id;if(id){const{error}=await db.from('restart_merch_products').update(row).eq('id',id);if(error)throw error}else{const{data,error}=await db.from('restart_merch_products').insert(row).select('id').single();if(error)throw error;pid=data.id}
    const{data:existing,error:ee}=await db.from('restart_merch_variants').select('*').eq('product_id',pid);if(ee)throw ee;
    const bySku=new Map((existing||[]).filter(x=>x.sku).map(x=>[x.sku,x])),byOpt=new Map((existing||[]).map(x=>[JSON.stringify(x.option_values||{}),x])),keep=new Set();
    for(const v of r.value.rows){
      const old=(v.sku&&bySku.get(v.sku))||byOpt.get(JSON.stringify(v.option_values||{})),label=v.label;
      if(old&&v.stock_qty<Number(old.sold_qty||0))throw new Error('สต๊อก '+label+' ต่ำกว่าจำนวนที่จอง/ขายแล้ว '+old.sold_qty);
      const vr={product_id:pid,size_label:label,variant_name:{th:label,en:label},option_values:v.option_values,sku:v.sku,stock_qty:v.stock_qty,price_override_thb:v.price_override_thb,price_adjustment_thb:0,badge:v.badge,is_active:true,sort_order:v.sort_order,updated_at:new Date().toISOString()};
      if(old){keep.add(old.id);const{error}=await db.from('restart_merch_variants').update(vr).eq('id',old.id);if(error)throw error}else{const{data,error}=await db.from('restart_merch_variants').insert(vr).select('id').single();if(error)throw error;keep.add(data.id)}
    }
    for(const old of existing||[]){if(keep.has(old.id))continue;if(Number(old.sold_qty||0)>0){await db.from('restart_merch_variants').update({is_active:false,updated_at:new Date().toISOString()}).eq('id',old.id)}else await db.from('restart_merch_variants').delete().eq('id',old.id)}
    if(newPath&&p?.image_storage_path&&p.image_storage_path!==newPath)await db.storage.from('restart-event-media').remove([p.image_storage_path]).catch(()=>{});
    Swal.fire({icon:'success',title:'บันทึกสินค้าแล้ว',timer:900,showConfirmButton:false});renderStoreAdmin()
  }catch(e){if(newPath)await db.storage.from('restart-event-media').remove([newPath]).catch(()=>{});Swal.fire('บันทึกสินค้าไม่สำเร็จ',e.message||String(e),'error')}
}
async function archiveStoreProduct(id){
  const p=(window.__storeProducts||[]).find(x=>x.id===id);
  const{count,error}=await db.from('restart_store_order_items').select('id',{count:'exact',head:true}).eq('product_id',id);if(error)return Swal.fire('ตรวจสอบไม่ได้',error.message,'error');
  if(Number(count||0)>0||p?.is_active){const r=await Swal.fire({title:'ปิดขายสินค้านี้?',icon:'warning',showCancelButton:true,confirmButtonText:'ปิดขาย'});if(!r.isConfirmed)return;const{error:e}=await db.from('restart_merch_products').update({is_active:false,updated_at:new Date().toISOString()}).eq('id',id);if(e)return Swal.fire('ปิดขายไม่ได้',e.message,'error')}
  else{const r=await Swal.fire({title:'ลบสินค้านี้ถาวร?',icon:'warning',showCancelButton:true,confirmButtonText:'ลบ'});if(!r.isConfirmed)return;const{error:e}=await db.from('restart_merch_products').delete().eq('id',id);if(e)return Swal.fire('ลบไม่ได้',e.message,'error');if(p?.image_storage_path)await db.storage.from('restart-event-media').remove([p.image_storage_path]).catch(()=>{})}
  renderStoreAdmin()
}
function renderStoreOrders(orders){
  storeOrderBox.innerHTML='<div class="row space"><div><h3 style="margin:0">คำสั่งซื้อ</h3><div class="muted">ร้านค้าแยกจากใบสมัครแข่งขัน</div></div></div>'+
    (orders.length?'<div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Order</th><th>ลูกค้า</th><th>สินค้า</th><th>ยอด</th><th>ชำระ</th><th>สถานะ</th><th></th></tr></thead><tbody>'+
      orders.map(o=>'<tr><td><b>'+esc(o.order_code)+'</b><div class="muted">'+new Date(o.created_at).toLocaleString('th-TH')+'</div></td><td>'+esc(o.customer_name)+'<div class="muted">'+esc(o.phone)+' · '+(o.delivery_method==='DELIVERY'?'จัดส่ง':'รับเอง')+'</div></td><td>'+((o.restart_store_order_items||[]).map(i=>esc(storeTr(i.product_name_snapshot))+' · '+esc(storeTr(i.variant_name_snapshot))+' × '+i.qty).join('<br>')||'—')+'</td><td>฿'+money(o.total_amount_thb)+'</td><td><span class="badge '+(o.payment_status==='APPROVED'?'ok':o.payment_status==='REJECTED'?'danger':'')+'">'+storePaymentStatus(o.payment_status)+'</span></td><td><span class="badge '+(o.status==='FULFILLED'||o.status==='SHIPPED'?'ok':o.status==='CANCELLED'?'danger':'')+'">'+storeOrderStatus(o.status)+'</span></td><td><button class="btn sm soft" onclick="storeOrderDetail(\''+o.id+'\')">รายละเอียด</button></td></tr>').join('')+
      '</tbody></table></div>':'<div class="rr-empty">ยังไม่มีคำสั่งซื้อ</div>')
}
async function storeOrderDetail(id){
  const o=(window.__storeOrders||[]).find(x=>x.id===id);if(!o)return;
  const pays=(o.restart_store_payments||[]).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)),pending=pays.find(x=>x.status==='PENDING_REVIEW');
  let slipUrl='';if(pending?.slip_path){const{data}=await db.storage.from('restart-slips').createSignedUrl(pending.slip_path,600);slipUrl=data?.signedUrl||''}
  const items=(o.restart_store_order_items||[]).map(i=>'<div>'+esc(storeTr(i.product_name_snapshot))+' · '+esc(storeTr(i.variant_name_snapshot))+' × '+i.qty+' · ฿'+money(i.total_price_thb)+'</div>').join('');
  const actions=[];
  if(pending){actions.push('<button id="storeApprovePay" class="btn primary">อนุมัติสลิป</button><button id="storeRejectPay" class="btn danger">ไม่อนุมัติ</button>')}
  if(o.payment_status==='APPROVED'&&!['CANCELLED','FULFILLED','SHIPPED'].includes(o.status)){actions.push('<button class="btn soft" data-store-status="PREPARING">เตรียมสินค้า</button><button class="btn soft" data-store-status="READY">พร้อมรับ</button><button class="btn primary" data-store-status="'+(o.delivery_method==='DELIVERY'?'SHIPPED':'FULFILLED')+'">'+(o.delivery_method==='DELIVERY'?'จัดส่งแล้ว':'มอบสินค้าแล้ว')+'</button>')}
  if(!['CANCELLED','FULFILLED','SHIPPED'].includes(o.status))actions.push('<button id="storeCancelOrder" class="btn danger">ยกเลิกออเดอร์</button>');
  Swal.fire({title:o.order_code,width:850,showConfirmButton:false,showCloseButton:true,html:'<div style="text-align:left"><div class="paybox"><b>'+esc(o.customer_name)+'</b> · '+esc(o.phone)+'<br>'+esc(o.delivery_method==='DELIVERY'?(o.delivery_address||'จัดส่ง'):'รับสินค้าเอง')+'</div><div class="paybox">'+items+'</div><div class="paybox">สินค้า ฿'+money(o.subtotal_amount_thb)+(Number(o.shipping_fee_thb)?' · ค่าส่ง ฿'+money(o.shipping_fee_thb):'')+' · <b>รวม ฿'+money(o.total_amount_thb)+'</b></div>'+(slipUrl?'<a class="btn soft" target="_blank" href="'+esc(slipUrl)+'">เปิดสลิป</a>':'')+'<div class="row" style="margin-top:12px;flex-wrap:wrap">'+actions.join('')+'</div></div>',didOpen:()=>{
    document.getElementById('storeApprovePay')?.addEventListener('click',()=>reviewStorePayment(pending.id,'APPROVE'));
    document.getElementById('storeRejectPay')?.addEventListener('click',()=>reviewStorePayment(pending.id,'REJECT'));
    document.querySelectorAll('[data-store-status]').forEach(b=>b.onclick=()=>updateStoreStatus(o.id,b.dataset.storeStatus));
    document.getElementById('storeCancelOrder')?.addEventListener('click',()=>cancelStoreOrder(o.id))
  }})
}
async function reviewStorePayment(id,decision){
  const r=decision==='REJECT'?await Swal.fire({title:'ไม่อนุมัติสลิป',input:'text',inputLabel:'เหตุผล',showCancelButton:true,confirmButtonText:'ยืนยัน'}):{isConfirmed:true,value:null};if(!r.isConfirmed)return;
  const{error}=await db.rpc('restart_admin_review_store_payment',{p_payment_id:id,p_decision:decision,p_note:r.value||null});if(error)return Swal.fire('ทำรายการไม่ได้',error.message,'error');Swal.close();renderStoreAdmin()
}
async function updateStoreStatus(id,status){const{error}=await db.rpc('restart_admin_update_store_order_status',{p_order_id:id,p_status:status,p_note:null});if(error)return Swal.fire('เปลี่ยนสถานะไม่ได้',error.message,'error');Swal.close();renderStoreAdmin()}
async function cancelStoreOrder(id){const r=await Swal.fire({title:'ยกเลิกออเดอร์?',input:'text',inputLabel:'เหตุผล',showCancelButton:true,confirmButtonText:'ยืนยันยกเลิก'});if(!r.isConfirmed)return;const{error}=await db.rpc('restart_admin_update_store_order_status',{p_order_id:id,p_status:'CANCELLED',p_note:r.value||null});if(error)return Swal.fire('ยกเลิกไม่ได้',error.message,'error');Swal.close();renderStoreAdmin()}
function csvCellStore(v){return '"'+String(v??'').replaceAll('"','""')+'"'}
function exportStoreOrders(){
  const orders=window.__storeOrders||[],head=['order_code','customer_name','phone','email','delivery_method','address','products','subtotal','shipping','total','payment_status','status','created_at'];
  const lines=[head.map(csvCellStore).join(',')];orders.forEach(o=>{const products=(o.restart_store_order_items||[]).map(i=>[storeTr(i.product_name_snapshot),storeTr(i.variant_name_snapshot),'x'+i.qty,'฿'+money(i.total_price_thb)].join(' | ')).join(' ; ');lines.push([o.order_code,o.customer_name,o.phone,o.email,o.delivery_method,o.delivery_address,products,o.subtotal_amount_thb,o.shipping_fee_thb,o.total_amount_thb,o.payment_status,o.status,o.created_at].map(csvCellStore).join(','))});
  const blob=new Blob(['\ufeff'+lines.join('\n')],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(state.event.slug||'event')+'-store-orders.csv';document.body.appendChild(a);a.click();URL.revokeObjectURL(a.href);a.remove()
}
Object.assign(window,{renderStoreAdmin,saveStoreSettings,storeProductDialog,archiveStoreProduct,storeOrderDetail,reviewStorePayment,updateStoreStatus,cancelStoreOrder,exportStoreOrders});
})();