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

  const{data:stores,error:ste}=await db.from('restart_stores').select('*').eq('event_id',state.event.id).order('sort_order').order('created_at');
  if(ste)return Swal.fire('โหลดร้านค้าไม่สำเร็จ',ste.message,'error');
  const allStores=stores||[];
  window.__stores=allStores;

  let active=allStores.find(x=>x.id===window.__storeActiveId)||allStores[0]||null;
  window.__storeActiveId=active?.id||null;
  window.__activeStore=active;

  document.getElementById('content').innerHTML=
    card('ร้านค้า / Marketplace',
      '<div class="row space" style="gap:12px;flex-wrap:wrap"><div><b>หลายร้านใน Event เดียว</b><div class="muted">สินค้า สต๊อก ออเดอร์ และช่องทางรับเงินแยกตามร้านอย่างอิสระ</div></div>'+
      '<div class="row" style="gap:8px;flex-wrap:wrap"><a class="btn soft" target="_blank" href="../public/shop.html?event='+encodeURIComponent(state.event.slug)+'">เปิดหน้ารวมร้าน</a><button class="btn primary" onclick="storeShopDialog()">+ สร้างร้านใหม่</button></div></div>'+
      '<div id="storeSelectorBox" style="margin-top:16px"></div>'+
      '<div id="storeSettingsBox" style="margin-top:16px"></div>'+
      '<div id="storePaymentBox" style="margin-top:16px"></div>'+
      '<div id="storeStats" class="grid4" style="margin-top:16px"></div>'+
      '<div id="storeProductBox" style="margin-top:20px"></div>'+
      '<div id="storeOrderBox" style="margin-top:24px"></div>',
      '<button class="btn soft" onclick="exportStoreOrders()">Export Orders CSV</button><button class="btn primary" onclick="storeProductDialog()">+ เพิ่มสินค้า</button>'
    );

  renderStoreSelector(allStores,active);

  if(!active){
    storeSettingsBox.innerHTML='<div class="rr-empty">ยังไม่มีร้านค้า · กด “+ สร้างร้านใหม่” เพื่อเริ่มต้น</div>';
    storePaymentBox.innerHTML='';storeStats.innerHTML='';storeProductBox.innerHTML='';storeOrderBox.innerHTML='';
    return
  }

  const[{data:products,error:pe},{data:orders,error:oe},{data:methods,error:me}]=await Promise.all([
    db.from('restart_merch_products').select('*,restart_merch_variants(*)').eq('store_id',active.id).order('sort_order'),
    db.from('restart_store_orders').select('*,restart_store_order_items(*),restart_store_payments(*)').eq('store_id',active.id).order('created_at',{ascending:false}),
    db.from('restart_store_payment_methods').select('*').eq('store_id',active.id).order('sort_order')
  ]);
  if(pe||oe||me)return Swal.fire('โหลดข้อมูลร้านไม่สำเร็จ',(pe||oe||me).message,'error');

  window.__storeSettings=active;
  window.__storeProducts=products||[];
  window.__storeOrders=orders||[];
  window.__storePaymentMethods=methods||[];

  renderStoreSettings(active);
  renderStorePaymentMethods(methods||[]);
  renderStoreProducts(products||[]);
  renderStoreOrders(orders||[]);
}
function renderStoreSelector(stores,active){
  if(!stores.length){
    storeSelectorBox.innerHTML='<div class="paybox"><b>ยังไม่มีร้านค้า</b><div class="muted">สร้างร้านแรกก่อนเพิ่มสินค้า</div></div>';
    return
  }
  const link=active?'../public/shop.html?event='+encodeURIComponent(state.event.slug)+'&store='+encodeURIComponent(active.slug):'';
  storeSelectorBox.innerHTML=
    '<div class="paybox"><div class="grid2">'+
      '<label><b>ร้านที่กำลังจัดการ</b><select id="storeAdminSelect">'+stores.map(s=>'<option value="'+s.id+'" '+(active?.id===s.id?'selected':'')+'>'+esc(storeTr(s.name)||s.slug)+(s.is_open?'':' (ปิด)')+'</option>').join('')+'</select></label>'+
      '<label><b>ลิงก์เฉพาะร้าน</b><div class="row" style="gap:8px"><input id="storeDirectLink" readonly value="'+esc(active?location.origin+location.pathname.replace(/\/admin\/$/,'/public/')+'shop.html?event='+encodeURIComponent(state.event.slug)+'&store='+encodeURIComponent(active.slug):'')+'"><a class="btn sm soft" target="_blank" href="'+esc(link)+'">เปิดร้าน</a></div></label>'+
    '</div><div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap"><button class="btn sm soft" id="copyStoreLink">คัดลอกลิงก์ร้าน</button><button class="btn sm soft" onclick="storeShopDialog(\''+(active?.id||'')+'\')">แก้ไขข้อมูลร้าน</button><button class="btn sm danger" onclick="archiveStoreShop(\''+(active?.id||'')+'\')">ปิด/ลบร้าน</button></div></div>';
  document.getElementById('storeAdminSelect').onchange=e=>{window.__storeActiveId=e.target.value;renderStoreAdmin()};
  document.getElementById('copyStoreLink').onclick=async()=>{const v=document.getElementById('storeDirectLink').value;try{await navigator.clipboard.writeText(v);Swal.fire({icon:'success',title:'คัดลอกลิงก์แล้ว',timer:800,showConfirmButton:false})}catch(e){fallbackStoreCopy(v)}}
}
function fallbackStoreCopy(v){const t=document.createElement('textarea');t.value=v;document.body.appendChild(t);t.select();document.execCommand('copy');t.remove();Swal.fire({icon:'success',title:'คัดลอกลิงก์แล้ว',timer:800,showConfirmButton:false})}
function slugifyStore(v){return String(v||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')}
async function storeShopDialog(id=null){
  let s=id?(window.__stores||[]).find(x=>x.id===id):null;
  if(id&&!s){const{data,error}=await db.from('restart_stores').select('*').eq('id',id).single();if(error)return Swal.fire('โหลดร้านไม่ได้',error.message,'error');s=data}
  const r=await Swal.fire({title:id?'แก้ไขร้านค้า':'สร้างร้านใหม่',width:760,showCancelButton:true,confirmButtonText:'บันทึก',
    html:'<div class="grid2" style="text-align:left">'+
      '<label>ชื่อร้าน<input id="ssName" class="swal2-input" style="margin:0" value="'+esc(storeTr(s?.name)||'')+'" placeholder="เช่น RESTART Official"></label>'+
      '<label>Slug / ลิงก์ร้าน<input id="ssSlug" class="swal2-input" style="margin:0" value="'+esc(s?.slug||'')+'" placeholder="restart-official"><small class="muted">ใช้ a-z, 0-9 และ - เท่านั้น</small></label>'+
      '<label style="grid-column:1/-1">คำอธิบายร้าน<textarea id="ssDesc" class="swal2-textarea" style="margin:0;width:100%">'+esc(storeTr(s?.description)||'')+'</textarea></label>'+
      '<label>สถานะ<select id="ssOpen" class="swal2-select" style="margin:0;width:100%"><option value="true" '+(s?.is_open===false?'':'selected')+'>เปิดร้าน</option><option value="false" '+(s?.is_open===false?'selected':'')+'>ปิดร้าน</option></select></label>'+
      '<label>รับสินค้าเอง<select id="ssPickup" class="swal2-select" style="margin:0;width:100%"><option value="true" '+(s?.pickup_enabled===false?'':'selected')+'>เปิด</option><option value="false" '+(s?.pickup_enabled===false?'selected':'')+'>ปิด</option></select></label>'+
      '<label>จัดส่ง<select id="ssDelivery" class="swal2-select" style="margin:0;width:100%"><option value="false" '+(s?.delivery_enabled?'':'selected')+'>ปิด</option><option value="true" '+(s?.delivery_enabled?'selected':'')+'>เปิด</option></select></label>'+
      '<label>ค่าส่ง (บาท)<input id="ssShipping" type="number" min="0" step="0.01" class="swal2-input" style="margin:0" value="'+Number(s?.shipping_fee_thb||0)+'"></label>'+
      '<label>ใช้ RESTART Points<select id="ssPointsEnabled" class="swal2-select" style="margin:0;width:100%"><option value="false" '+(s?.points_redemption_enabled?'':'selected')+'>ปิด</option><option value="true" '+(s?.points_redemption_enabled?'selected':'')+'>เปิด</option></select></label>'+
      '<label>จำนวนแต้ม = ส่วนลด 1 บาท<input id="ssPointsRate" type="number" min="1" step="1" class="swal2-input" style="margin:0" value="'+Number(s?.points_per_thb||1)+'"></label>'+
      '<label>แต้มขั้นต่ำที่ใช้<input id="ssPointsMin" type="number" min="0" step="1" class="swal2-input" style="margin:0" value="'+Number(s?.min_redeem_points||0)+'"></label>'+
      '<label>แต้มสูงสุดต่อออเดอร์ <small class="muted">(ว่าง = ไม่จำกัด)</small><input id="ssPointsMax" type="number" min="1" step="1" class="swal2-input" style="margin:0" value="'+(s?.max_redeem_points_per_order??'')+'"></label>'+
      '<label style="grid-column:1/-1">ข้อความจุดรับสินค้า<input id="ssPickupNote" class="swal2-input" style="margin:0" value="'+esc(storeTr(s?.pickup_note)||'')+'"></label>'+
      '<label style="grid-column:1/-1">เงื่อนไข / หมายเหตุ<textarea id="ssTerms" class="swal2-textarea" style="margin:0;width:100%">'+esc(storeTr(s?.terms)||'')+'</textarea></label>'+
    '</div>',
    didOpen:()=>{if(!id){ssName.addEventListener('input',()=>{if(!ssSlug.dataset.touched)ssSlug.value=slugifyStore(ssName.value)});ssSlug.addEventListener('input',()=>ssSlug.dataset.touched='1')}},
    preConfirm:()=>{const name=ssName.value.trim(),slug=ssSlug.value.trim().toLowerCase();if(!name)return Swal.showValidationMessage('กรุณากรอกชื่อร้าน');if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))return Swal.showValidationMessage('Slug ต้องใช้ a-z, 0-9 และ - เท่านั้น');const pickup=ssPickup.value==='true',delivery=ssDelivery.value==='true';if(!pickup&&!delivery)return Swal.showValidationMessage('ต้องเปิดวิธีรับสินค้าอย่างน้อย 1 แบบ');const rate=Math.max(1,Math.floor(Number(ssPointsRate.value||1))),min=Math.max(0,Math.floor(Number(ssPointsMin.value||0))),max=ssPointsMax.value.trim()?Math.max(1,Math.floor(Number(ssPointsMax.value))):null;return{name,slug,description:ssDesc.value.trim(),open:ssOpen.value==='true',pickup,delivery,shipping:Number(ssShipping.value||0),pointsEnabled:ssPointsEnabled.value==='true',pointsRate:rate,pointsMin:min,pointsMax:max,pickupNote:ssPickupNote.value.trim(),terms:ssTerms.value.trim()}}});
  if(!r.isConfirmed)return;
  const row={event_id:state.event.id,slug:r.value.slug,name:{th:r.value.name,en:r.value.name},description:{th:r.value.description,en:r.value.description},is_open:r.value.open,pickup_enabled:r.value.pickup,delivery_enabled:r.value.delivery,shipping_fee_thb:r.value.shipping,points_redemption_enabled:r.value.pointsEnabled,points_per_thb:r.value.pointsRate,min_redeem_points:r.value.pointsMin,max_redeem_points_per_order:r.value.pointsMax,pickup_note:{th:r.value.pickupNote},terms:{th:r.value.terms},updated_at:new Date().toISOString()};
  let sid=id;
  if(id){
    const{error}=await db.from('restart_stores').update(row).eq('id',id);if(error)return Swal.fire('บันทึกร้านไม่ได้',error.message,'error')
  }else{
    const{data,error}=await db.from('restart_stores').insert(row).select('id').single();if(error)return Swal.fire('สร้างร้านไม่ได้',error.message,'error');sid=data.id;
    const{data:baseMethods}=await db.from('restart_payment_methods').select('*').eq('event_id',state.event.id).eq('is_enabled',true).order('sort_order');
    if(baseMethods?.length){
      const copied=baseMethods.map((m,i)=>({store_id:sid,source_payment_method_id:m.id,kind:m.kind,label:m.label,bank_name:m.bank_name,account_name:m.account_name,account_number:m.account_number,promptpay_type:m.promptpay_type,promptpay_id:m.promptpay_id,qr_enabled:m.qr_enabled,is_enabled:true,sort_order:i}));
      await db.from('restart_store_payment_methods').insert(copied)
    }
  }
  const flags={...(state.event.feature_flags||{}),storefront:true};
  await db.from('restart_events').update({feature_flags:flags}).eq('id',state.event.id);
  state.event.feature_flags=flags;window.__storeActiveId=sid;
  Swal.fire({icon:'success',title:id?'บันทึกร้านแล้ว':'สร้างร้านแล้ว',timer:900,showConfirmButton:false});renderStoreAdmin()
}
async function archiveStoreShop(id){
  if(!id)return;
  const[{count:pc},{count:oc}]=await Promise.all([
    db.from('restart_merch_products').select('id',{count:'exact',head:true}).eq('store_id',id),
    db.from('restart_store_orders').select('id',{count:'exact',head:true}).eq('store_id',id)
  ]);
  if(Number(pc||0)>0||Number(oc||0)>0){
    const r=await Swal.fire({title:'ปิดร้านนี้?',text:'ร้านมีสินค้า/ประวัติออเดอร์ จึงปิดร้านแทนการลบเพื่อรักษาข้อมูล',icon:'warning',showCancelButton:true,confirmButtonText:'ปิดร้าน'});if(!r.isConfirmed)return;
    const{error}=await db.from('restart_stores').update({is_open:false,updated_at:new Date().toISOString()}).eq('id',id);if(error)return Swal.fire('ปิดร้านไม่ได้',error.message,'error')
  }else{
    const r=await Swal.fire({title:'ลบร้านนี้ถาวร?',icon:'warning',showCancelButton:true,confirmButtonText:'ลบ'});if(!r.isConfirmed)return;
    const{error}=await db.from('restart_stores').delete().eq('id',id);if(error)return Swal.fire('ลบร้านไม่ได้',error.message,'error')
  }
  window.__storeActiveId=null;renderStoreAdmin()
}
function renderStoreSettings(s){
  const name=storeTr(s?.name)||s?.slug||'ร้านค้า';
  const direct='../public/shop.html?event='+encodeURIComponent(state.event.slug)+'&store='+encodeURIComponent(s.slug);
  storeSettingsBox.innerHTML='<div class="paybox"><div class="row space"><div><b>'+esc(name)+'</b><div class="muted">Slug: '+esc(s.slug)+' · '+(s.is_open?'เปิดร้าน':'ปิดร้าน')+'</div></div><a class="btn sm soft" target="_blank" href="'+direct+'">เปิดลิงก์ร้าน</a></div><div class="grid2" style="margin-top:12px">'+
    '<label>ชื่อร้าน<input id="storeName" value="'+esc(name)+'"></label>'+
    '<label>สถานะร้าน<select id="storeOpen"><option value="true" '+(s.is_open?'selected':'')+'>เปิดร้าน</option><option value="false" '+(!s.is_open?'selected':'')+'>ปิดร้าน</option></select></label>'+
    '<label>รับสินค้าเอง<select id="storePickup"><option value="true" '+(s.pickup_enabled?'selected':'')+'>เปิด</option><option value="false" '+(!s.pickup_enabled?'selected':'')+'>ปิด</option></select></label>'+
    '<label>จัดส่ง<select id="storeDelivery"><option value="false" '+(!s.delivery_enabled?'selected':'')+'>ปิด</option><option value="true" '+(s.delivery_enabled?'selected':'')+'>เปิด</option></select></label>'+
    '<label>ค่าส่ง (บาท)<input id="storeShipping" type="number" min="0" step="0.01" value="'+Number(s.shipping_fee_thb||0)+'"></label>'+
    '<label>ใช้ RESTART Points<select id="storePointsEnabled"><option value="false" '+(s.points_redemption_enabled?'':'selected')+'>ปิด</option><option value="true" '+(s.points_redemption_enabled?'selected':'')+'>เปิด</option></select></label>'+
    '<label>จำนวนแต้ม = ส่วนลด 1 บาท<input id="storePointsRate" type="number" min="1" step="1" value="'+Number(s.points_per_thb||1)+'"></label>'+
    '<label>แต้มขั้นต่ำที่ใช้<input id="storePointsMin" type="number" min="0" step="1" value="'+Number(s.min_redeem_points||0)+'"></label>'+
    '<label>แต้มสูงสุดต่อออเดอร์<input id="storePointsMax" type="number" min="1" step="1" placeholder="ไม่จำกัด" value="'+(s.max_redeem_points_per_order??'')+'"></label>'+
    '<label>ข้อความจุดรับสินค้า<input id="storePickupNote" value="'+esc(storeTr(s.pickup_note))+'"></label>'+
    '<label style="grid-column:1/-1">เงื่อนไข / หมายเหตุร้าน<textarea id="storeTerms" rows="3">'+esc(storeTr(s.terms))+'</textarea></label>'+
    '</div><button class="btn sm primary" id="saveStoreSettings" style="margin-top:10px">บันทึกการตั้งค่าร้าน</button></div>';
  document.getElementById('saveStoreSettings').onclick=saveStoreSettings
}
async function saveStoreSettings(){
  const s=window.__activeStore;if(!s)return Swal.fire('กรุณาเลือกร้าน','','warning');
  const row={name:{th:storeName.value.trim(),en:storeName.value.trim()},is_open:storeOpen.value==='true',pickup_enabled:storePickup.value==='true',delivery_enabled:storeDelivery.value==='true',shipping_fee_thb:Number(storeShipping.value||0),points_redemption_enabled:storePointsEnabled.value==='true',points_per_thb:Math.max(1,Math.floor(Number(storePointsRate.value||1))),min_redeem_points:Math.max(0,Math.floor(Number(storePointsMin.value||0))),max_redeem_points_per_order:storePointsMax.value.trim()?Math.max(1,Math.floor(Number(storePointsMax.value))):null,pickup_note:{th:storePickupNote.value.trim()},terms:{th:storeTerms.value.trim()},updated_at:new Date().toISOString()};
  if(!row.pickup_enabled&&!row.delivery_enabled)return Swal.fire('ต้องเปิดวิธีรับสินค้าอย่างน้อย 1 แบบ','','warning');
  const{error}=await db.from('restart_stores').update(row).eq('id',s.id);
  if(error)return Swal.fire('บันทึกไม่ได้',error.message,'error');
  Swal.fire({icon:'success',title:'บันทึกร้านแล้ว',timer:900,showConfirmButton:false});renderStoreAdmin()
}
function renderStorePaymentMethods(methods){
  storePaymentBox.innerHTML='<div class="paybox"><div class="row space"><div><b>ช่องทางรับเงินของร้านนี้</b><div class="muted">แยกจากร้านอื่นอย่างอิสระ</div></div><button class="btn sm primary" onclick="storePaymentDialog()">+ เพิ่มช่องทาง</button></div>'+
    (methods.length?'<div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>ประเภท</th><th>รายละเอียด</th><th>สถานะ</th><th></th></tr></thead><tbody>'+methods.map(m=>'<tr><td>'+esc(m.kind)+'</td><td><b>'+esc(m.label||'')+'</b><div class="muted">'+esc(m.kind==='PROMPTPAY'?(m.promptpay_id||''):[m.bank_name,m.account_name,m.account_number].filter(Boolean).join(' · '))+'</div></td><td>'+(m.is_enabled?'เปิด':'ปิด')+'</td><td><button class="btn sm soft" onclick="storePaymentDialog(\''+m.id+'\')">แก้ไข</button> <button class="btn sm danger" onclick="deleteStorePayment(\''+m.id+'\')">ลบ</button></td></tr>').join('')+'</tbody></table></div>':'<div class="rr-empty">ยังไม่มีช่องทางรับเงิน</div>')+
  '</div>'
}
async function storePaymentDialog(id=null){
  const s=window.__activeStore;if(!s)return Swal.fire('กรุณาเลือกร้าน','','warning');
  let m=id?(window.__storePaymentMethods||[]).find(x=>x.id===id):null;
  const r=await Swal.fire({title:id?'แก้ไขช่องทางรับเงิน':'เพิ่มช่องทางรับเงิน',width:700,showCancelButton:true,confirmButtonText:'บันทึก',
    html:'<div class="grid2" style="text-align:left">'+
      '<label>ประเภท<select id="pmKind" class="swal2-select" style="margin:0;width:100%"><option value="PROMPTPAY" '+(m?.kind!=='BANK'?'selected':'')+'>PromptPay</option><option value="BANK" '+(m?.kind==='BANK'?'selected':'')+'>ธนาคาร</option></select></label>'+
      '<label>ชื่อแสดง<input id="pmLabel" class="swal2-input" style="margin:0" value="'+esc(m?.label||'')+'"></label>'+
      '<label>PromptPay ID<input id="pmPrompt" class="swal2-input" style="margin:0" value="'+esc(m?.promptpay_id||'')+'" placeholder="เบอร์โทร / เลขบัตร"></label>'+
      '<label>ประเภท PromptPay<select id="pmPromptType" class="swal2-select" style="margin:0;width:100%"><option value="PHONE" '+(m?.promptpay_type!=='NATIONAL_ID'?'selected':'')+'>เบอร์โทร</option><option value="NATIONAL_ID" '+(m?.promptpay_type==='NATIONAL_ID'?'selected':'')+'>เลขบัตร/เลขผู้เสียภาษี</option></select></label>'+
      '<label>ธนาคาร<input id="pmBank" class="swal2-input" style="margin:0" value="'+esc(m?.bank_name||'')+'"></label>'+
      '<label>ชื่อบัญชี<input id="pmAccountName" class="swal2-input" style="margin:0" value="'+esc(m?.account_name||'')+'"></label>'+
      '<label>เลขบัญชี<input id="pmAccountNo" class="swal2-input" style="margin:0" value="'+esc(m?.account_number||'')+'"></label>'+
      '<label>สถานะ<select id="pmEnabled" class="swal2-select" style="margin:0;width:100%"><option value="true" '+(m?.is_enabled===false?'':'selected')+'>เปิด</option><option value="false" '+(m?.is_enabled===false?'selected':'')+'>ปิด</option></select></label>'+
    '</div>',
    preConfirm:()=>{const kind=pmKind.value,label=pmLabel.value.trim();if(kind==='PROMPTPAY'&&!pmPrompt.value.trim())return Swal.showValidationMessage('กรุณากรอก PromptPay ID');if(kind==='BANK'&&!pmAccountNo.value.trim())return Swal.showValidationMessage('กรุณากรอกเลขบัญชี');return{kind,label,prompt:pmPrompt.value.trim(),promptType:pmPromptType.value,bank:pmBank.value.trim(),accountName:pmAccountName.value.trim(),accountNo:pmAccountNo.value.trim(),enabled:pmEnabled.value==='true'}}});
  if(!r.isConfirmed)return;
  const row={store_id:s.id,kind:r.value.kind,label:r.value.label||null,promptpay_id:r.value.kind==='PROMPTPAY'?r.value.prompt:null,promptpay_type:r.value.kind==='PROMPTPAY'?r.value.promptType:null,bank_name:r.value.kind==='BANK'?r.value.bank:null,account_name:r.value.kind==='BANK'?r.value.accountName:null,account_number:r.value.kind==='BANK'?r.value.accountNo:null,qr_enabled:r.value.kind==='PROMPTPAY',is_enabled:r.value.enabled,updated_at:new Date().toISOString()};
  const q=id?db.from('restart_store_payment_methods').update(row).eq('id',id):db.from('restart_store_payment_methods').insert(row);
  const{error}=await q;if(error)return Swal.fire('บันทึกไม่ได้',error.message,'error');renderStoreAdmin()
}
async function deleteStorePayment(id){
  const r=await Swal.fire({title:'ลบช่องทางรับเงินนี้?',icon:'warning',showCancelButton:true,confirmButtonText:'ลบ'});if(!r.isConfirmed)return;
  const{error}=await db.from('restart_store_payment_methods').delete().eq('id',id);if(error)return Swal.fire('ลบไม่ได้',error.message,'error');renderStoreAdmin()
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
function storeChoiceSeed(v){
  const label=storeTr(v?.variant_name)||storeOptionText(v)||'มาตรฐาน';
  return {label,sku:v?.sku||'',price:Number(v?storePrice({price_thb:0},v):0),stock:Number(v?.stock_qty||0),badge:storeTr(v?.badge)||''}
}
function storeChoiceRowHtml(row={}){
  const label=esc(row.label||''),sku=esc(row.sku||''),price=Number(row.price||0),stock=Number(row.stock||0),badge=esc(row.badge||'');
  return '<div class="store-choice-row" style="border:1px solid rgba(127,127,127,.25);border-radius:14px;padding:12px;margin-top:10px;background:rgba(127,127,127,.04)">'+
    '<div class="grid2" style="gap:10px">'+
      '<label style="grid-column:1/-1"><b>ชื่อช้อยท์</b><input data-choice="label" class="swal2-input" style="margin:0" value="'+label+'" placeholder="เช่น สีขาว / สีดำ Limited / ดำ ไซส์ M"></label>'+
      '<label>ราคาขาย (บาท)<input data-choice="price" type="number" min="0" step="0.01" class="swal2-input" style="margin:0" value="'+price+'"></label>'+
      '<label>สต๊อก<input data-choice="stock" type="number" min="0" step="1" class="swal2-input" style="margin:0" value="'+stock+'"></label>'+
      '<label>SKU <small class="muted">(ไม่บังคับ)</small><input data-choice="sku" class="swal2-input" style="margin:0" value="'+sku+'" placeholder="เช่น BAG-WHITE"></label>'+
      '<label>ป้าย <small class="muted">(ไม่บังคับ)</small><input data-choice="badge" class="swal2-input" style="margin:0" value="'+badge+'" placeholder="เช่น LIMITED / NEW"></label>'+
    '</div>'+
    '<div class="row" style="justify-content:flex-end;margin-top:8px"><button type="button" class="btn sm danger" data-choice-remove>ลบช้อยท์นี้</button></div>'+
  '</div>'
}
function addStoreChoiceRow(seed={}){
  const list=document.getElementById('spVariantList');if(!list)return;
  const wrap=document.createElement('div');wrap.innerHTML=storeChoiceRowHtml(seed);
  const row=wrap.firstElementChild;list.appendChild(row);
  row.querySelector('[data-choice-remove]').onclick=()=>{
    if(list.querySelectorAll('.store-choice-row').length<=1){
      Swal.fire({icon:'info',title:'ต้องมีอย่างน้อย 1 ช้อยท์',timer:1200,showConfirmButton:false});return
    }
    row.remove()
  }
}
function initStoreChoiceBuilder(vars=[]){
  const list=document.getElementById('spVariantList');if(!list)return;
  list.innerHTML='';
  const seeds=(vars||[]).sort((a,b)=>a.sort_order-b.sort_order).map(storeChoiceSeed);
  (seeds.length?seeds:[{label:'มาตรฐาน',price:0,stock:0,sku:'',badge:''}]).forEach(addStoreChoiceRow);
  document.getElementById('spAddChoice').onclick=()=>addStoreChoiceRow({label:'',price:0,stock:0,sku:'',badge:''})
}
function collectStoreChoiceRows(){
  const nodes=[...document.querySelectorAll('#spVariantList .store-choice-row')],rows=[],seenLabels=new Set(),seenSkus=new Set();
  if(!nodes.length)throw new Error('กรุณาเพิ่มอย่างน้อย 1 ช้อยท์');
  nodes.forEach((node,i)=>{
    const val=k=>node.querySelector('[data-choice="'+k+'"]')?.value?.trim()||'';
    const label=val('label'),sku=val('sku').toUpperCase()||null,badge=val('badge'),price=Number(val('price')||0),stock=Number(val('stock')||0);
    if(!label)throw new Error('กรุณากรอกชื่อช้อยท์ลำดับที่ '+(i+1));
    if(!Number.isFinite(price)||price<0)throw new Error('ราคาของ “'+label+'” ไม่ถูกต้อง');
    if(!Number.isInteger(stock)||stock<0)throw new Error('สต๊อกของ “'+label+'” ไม่ถูกต้อง');
    const lk=label.toLocaleUpperCase('th-TH');if(seenLabels.has(lk))throw new Error('ชื่อช้อยท์ “'+label+'” ซ้ำกัน');seenLabels.add(lk);
    if(sku){if(seenSkus.has(sku))throw new Error('SKU “'+sku+'” ซ้ำกัน');seenSkus.add(sku)}
    rows.push({label,option_values:{'ตัวเลือก':label},sku,price_override_thb:price,stock_qty:stock,badge:badge?{th:badge,en:badge}:{},sort_order:i})
  });
  return rows
}
function buildOptionSchema(rows){
  const map={};rows.forEach(r=>Object.entries(r.option_values||{}).forEach(([k,v])=>{(map[k]||=new Set()).add(v)}));
  return Object.entries(map).map(([key,set])=>({key,label:{th:key,en:key},values:[...set].map(v=>({key:v,label:{th:v,en:v}}))}))
}
function inspectStoreProductImage(file){
  const status=document.getElementById('spImageStatus');
  if(!status||!file)return;
  if(file.size>2*1024*1024){
    status.innerHTML='<span style="color:#c0392b">ไฟล์ใหญ่เกิน 2 MB</span>';
    return
  }
  const url=URL.createObjectURL(file),img=new Image();
  img.onload=()=>{
    const ratio=img.width/img.height,target=4/5,diff=Math.abs(ratio-target)/target;
    const minOk=img.width>=1200&&img.height>=1500;
    const ratioOk=diff<=0.06;
    status.innerHTML=
      '<b>'+img.width+'×'+img.height+' px</b> · '+
      (ratioOk?'<span style="color:#1f8f4d">สัดส่วนเหมาะสม 4:5</span>':'<span style="color:#c47a00">แนะนำสัดส่วน 4:5 (1600×2000 px)</span>')+
      (minOk?'':' · <span style="color:#c47a00">ความละเอียดต่ำกว่าที่แนะนำ</span>');
    URL.revokeObjectURL(url)
  };
  img.onerror=()=>{status.innerHTML='<span style="color:#c0392b">อ่านขนาดภาพไม่ได้</span>';URL.revokeObjectURL(url)};
  img.src=url
}

async function storeProductDialog(id=null){
  let p=null,vars=[];
  const activeStore=window.__activeStore;if(!activeStore)return Swal.fire('กรุณาเลือกร้านก่อนเพิ่มสินค้า','','warning');
  if(id){const{data,error}=await db.from('restart_merch_products').select('*,restart_merch_variants(*)').eq('id',id).eq('store_id',activeStore.id).single();if(error)return Swal.fire('โหลดสินค้าไม่ได้',error.message,'error');p=data;vars=data.restart_merch_variants||[]}
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
      '<label style="grid-column:1/-1"><b>รูปสินค้า</b><input id="spImage" type="file" accept="image/jpeg,image/png,image/webp" class="swal2-file" style="margin:0;width:100%"><div class="paybox" style="margin-top:8px"><b>ขนาดภาพที่แนะนำ</b><div>1600×2000 px · สัดส่วน 4:5</div><small class="muted">ขั้นต่ำ 1200×1500 px · JPG/PNG/WebP · ไม่เกิน 2 MB · วางสินค้าหลักไว้กึ่งกลางภาพ เพราะการ์ดจะครอปภาพแบบ Cover</small><div id="spImageStatus" style="margin-top:6px"></div></div></label>'+
      '<div style="grid-column:1/-1;border-top:1px solid rgba(127,127,127,.2);padding-top:14px"><div class="row space"><div><b>ช้อยท์สินค้า</b><div class="muted">กรอกทีละช้อยท์ ไม่ต้องใช้เครื่องหมายหรือจำรูปแบบ</div></div><button id="spAddChoice" type="button" class="btn sm soft">+ เพิ่มช้อยท์</button></div><div id="spVariantList"></div><div class="muted" style="margin-top:8px">ตัวอย่าง: ชื่อ “สีขาว” ราคา 100 สต๊อก 30 หรือ “สีดำ Limited” ราคา 250 สต๊อก 10 · SKU และป้ายเว้นว่างได้</div></div>'+
    '</div>',
    didOpen:()=>{
      initStoreChoiceBuilder(vars);
      document.getElementById('spImage')?.addEventListener('change',e=>{
        const file=e.target.files?.[0];
        if(file)inspectStoreProductImage(file)
      })
    },
    preConfirm:()=>{try{const code=spCode.value.trim().toUpperCase(),name=spNameTh.value.trim(),rows=collectStoreChoiceRows();if(!code||!name)return Swal.showValidationMessage('กรุณากรอกรหัสและชื่อสินค้า');if(spStart.value&&spEnd.value&&new Date(spEnd.value)<=new Date(spStart.value))return Swal.showValidationMessage('เวลาปิดขายต้องอยู่หลังเวลาเปิดขาย');return{code,category:spCategory.value.trim()||null,name:{th:name,en:spNameEn.value.trim()||name},description:{th:spDesc.value.trim(),en:spDesc.value.trim()},max:Number(spMax.value||10),active:spActive.value==='true',start:spStart.value||null,end:spEnd.value||null,rows,file:spImage.files?.[0]||null}}catch(e){return Swal.showValidationMessage(e.message)}}});
  if(!r.isConfirmed)return;
  let newPath=null,imageUrl=p?.image_url||null,imagePath=p?.image_storage_path||null;
  try{
    Swal.fire({title:'กำลังบันทึกสินค้า…',allowOutsideClick:false,didOpen:()=>Swal.showLoading()});
    if(r.value.file){if(r.value.file.size>2*1024*1024)throw new Error('รูปต้องไม่เกิน 2 MB');const ext=(r.value.file.name.split('.').pop()||'jpg').replace(/[^a-z0-9]/gi,'');newPath=state.event.id+'/store/'+activeStore.id+'/'+Date.now()+'-'+Math.random().toString(36).slice(2,8)+'.'+ext;const up=await db.storage.from('restart-event-media').upload(newPath,r.value.file,{contentType:r.value.file.type,upsert:false});if(up.error)throw up.error;imageUrl=db.storage.from('restart-event-media').getPublicUrl(newPath).data.publicUrl;imagePath=newPath}
    const firstPrice=Math.min(...r.value.rows.map(x=>x.price_override_thb));
    const row={event_id:state.event.id,store_id:activeStore.id,code:r.value.code,category:r.value.category,product_type:'GENERAL',name:r.value.name,description:r.value.description,price_thb:firstPrice,option_schema:buildOptionSchema(r.value.rows),max_per_order:r.value.max,image_url:imageUrl,image_storage_path:imagePath,is_active:r.value.active,sale_starts_at:r.value.start?new Date(r.value.start).toISOString():null,sale_ends_at:r.value.end?new Date(r.value.end).toISOString():null,updated_at:new Date().toISOString()};
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
  const blob=new Blob(['\ufeff'+lines.join('\n')],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(state.event.slug||'event')+'-'+(window.__activeStore?.slug||'store')+'-orders.csv';document.body.appendChild(a);a.click();URL.revokeObjectURL(a.href);a.remove()
}
Object.assign(window,{renderStoreAdmin,saveStoreSettings,storeShopDialog,archiveStoreShop,storePaymentDialog,deleteStorePayment,storeProductDialog,archiveStoreProduct,storeOrderDetail,reviewStorePayment,updateStoreStatus,cancelStoreOrder,exportStoreOrders});
})();