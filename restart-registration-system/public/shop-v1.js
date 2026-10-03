const db=supabase.createClient(RESTART_REG_CONFIG.SUPABASE_URL,RESTART_REG_CONFIG.SUPABASE_PUBLISHABLE_KEY);
const app=document.getElementById('shopApp');
const qs=new URLSearchParams(location.search),slug=qs.get('event');
let E=null,SETTINGS=null,PRODUCTS=[],VARIANTS=[],METHODS=[],CART=new Map(),LANG=localStorage.getItem('restart_lang')||'th';
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money=v=>Number(v||0).toLocaleString('th-TH',{maximumFractionDigits:2});
const tr=v=>typeof v==='string'?v:(v?.[LANG]||v?.th||v?.en||Object.values(v||{})[0]||'');
const byId=id=>document.getElementById(id);
function api(action,body={}){
  return fetch(RESTART_REG_CONFIG.SUPABASE_URL+'/functions/v1/restart-registration-api?action='+encodeURIComponent(action),{
    method:'POST',headers:{'content-type':'application/json','apikey':RESTART_REG_CONFIG.SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify(body)
  }).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||('HTTP '+r.status));return d})
}
function variantPrice(p,v){return Number(v.price_override_thb??(Number(p.price_thb||0)+Number(v.price_adjustment_thb||0)))}
function optionText(v){
  const opts=v.option_values&&Object.keys(v.option_values).length?v.option_values:null;
  if(opts)return Object.entries(opts).map(([k,val])=>k+'='+val).join(' · ');
  return tr(v.variant_name)||v.size_label||'ตัวเลือกมาตรฐาน'
}
function optionTags(v){
  const opts=v.option_values||{};
  const badge=tr(v.badge);
  return Object.entries(opts).map(([k,val])=>'<span class="store-option-tag">'+esc(k)+': '+esc(val)+'</span>').join('')+
    (badge?'<span class="store-option-tag"><b>'+esc(badge)+'</b></span>':'')
}
function stock(v){return Math.max(0,Number(v.stock_qty||0)-Number(v.sold_qty||0))}
function productMinPrice(p){
  const vs=VARIANTS.filter(v=>v.product_id===p.id&&v.is_active);
  return vs.length?Math.min(...vs.map(v=>variantPrice(p,v))):Number(p.price_thb||0)
}
function render(){
  document.title=(tr(SETTINGS?.store_name)||tr(E?.name)||'RESTART')+' Store';
  byId('backEvent').href='./?event='+encodeURIComponent(E.slug);
  const productId=new URLSearchParams(location.search).get('product');
  if(productId){
    const p=PRODUCTS.find(x=>x.id===productId);
    if(p)return renderProductDetail(p);
    history.replaceState(null,'','shop.html?event='+encodeURIComponent(E.slug));
  }
  const storeName=tr(SETTINGS?.store_name)||((tr(E.name)||'Event')+' Store');
  const cats=[...new Set(PRODUCTS.map(p=>p.category).filter(Boolean))];
  app.innerHTML=
    '<section class="rr-card store-hero"><div><div class="muted">RESTART EVENT STORE</div><h2>'+esc(storeName)+'</h2><div class="muted">'+esc(tr(SETTINGS?.terms)||'เลือกสินค้าและชำระเงินแยกจากการสมัครแข่งขัน')+'</div></div><div><span class="badge ok">ร้านค้าเปิด</span></div></section>'+
    (cats.length?'<section class="rr-card"><div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn sm soft" data-cat="">ทั้งหมด</button>'+cats.map(c=>'<button class="btn sm soft" data-cat="'+esc(c)+'">'+esc(c)+'</button>').join('')+'</div></section>':'')+
    '<section id="productGrid" class="store-showcase-grid">'+PRODUCTS.map(productCard).join('')+'</section>'+
    '<div class="store-cart-float"><div class="rr-card store-cart-bar"><div><b>ตะกร้า</b><div id="cartMini" class="muted">ยังไม่มีสินค้า</div></div><div class="row"><div id="cartTotal" class="store-total">฿0</div><button id="cartBtn" class="btn primary" type="button">ดูตะกร้า / ชำระเงิน</button></div></div></div>';
  document.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>filterCategory(b.dataset.cat));
  byId('cartBtn').onclick=openCart;
  renderCartMini()
}
function productCard(p){
  const min=productMinPrice(p);
  const soldOut=!VARIANTS.some(v=>v.product_id===p.id&&v.is_active&&stock(v)>0);
  const href='shop.html?event='+encodeURIComponent(E.slug)+'&product='+encodeURIComponent(p.id);
  return '<a class="store-showcase-card" data-product-cat="'+esc(p.category||'')+'" href="'+href+'">'+
    '<div class="store-card-media '+(!p.image_url?'store-card-media-fallback':'')+'" '+(p.image_url?'style="background-image:url(\''+esc(p.image_url).replaceAll("'","%27")+'\')"':'')+'><div class="store-card-scrim"></div></div>'+
    '<div class="store-card-content">'+
      '<div class="store-card-topline"><span class="store-card-status '+(!soldOut?'is-open':'')+'">'+(soldOut?'หมด':'พร้อมจำหน่าย')+'</span>'+(tr(p.badge)?'<span class="store-card-featured">'+esc(tr(p.badge))+'</span>':'')+'</div>'+
      '<div class="store-card-copy"><div class="muted" style="color:rgba(255,255,255,.7)">'+esc(p.category||p.product_type||'สินค้า')+'</div><h2>'+esc(tr(p.name)||p.code)+'</h2>'+
        (tr(p.description)?'<p>'+esc(tr(p.description).slice(0,150))+(tr(p.description).length>150?'…':'')+'</p>':'')+
        '<div class="store-card-meta"><span>เริ่ม ฿'+money(min)+'</span><span>ดูสินค้า ↗</span></div>'+
      '</div>'+
    '</div>'+
  '</a>'
}
function renderProductDetail(p){
  const vs=VARIANTS.filter(v=>v.product_id===p.id&&v.is_active).sort((a,b)=>a.sort_order-b.sort_order);
  const back='shop.html?event='+encodeURIComponent(E.slug);
  app.innerHTML=
    '<section class="store-detail-shell">'+
      '<div class="store-detail-head"><a class="btn soft" href="'+back+'">← กลับหน้าร้าน</a><div class="muted">'+esc(p.category||p.product_type||'สินค้า')+'</div></div>'+
      '<div class="rr-card store-detail-hero">'+
        '<div class="store-detail-media">'+(p.image_url?'<img src="'+esc(p.image_url)+'" alt="">':'<div class="store-detail-placeholder">🛍️</div>')+'</div>'+
        '<div class="store-detail-info">'+
          (tr(p.badge)?'<span class="badge">'+esc(tr(p.badge))+'</span>':'')+
          '<h1>'+esc(tr(p.name)||p.code)+'</h1>'+
          '<div class="store-detail-price">เริ่ม ฿'+money(productMinPrice(p))+'</div>'+
          '<p>'+esc(tr(p.description)||'')+'</p>'+
          '<div class="store-detail-options"><h3>เลือกตัวเลือก</h3>'+
            (vs.length?vs.map(v=>variantRow(p,v)).join(''):'<div class="rr-empty">ไม่มีตัวเลือกพร้อมขาย</div>')+
          '</div>'+
        '</div>'+
      '</div>'+
    '</section>'+
    '<div class="store-cart-float"><div class="rr-card store-cart-bar"><div><b>ตะกร้า</b><div id="cartMini" class="muted">ยังไม่มีสินค้า</div></div><div class="row"><div id="cartTotal" class="store-total">฿0</div><button id="cartBtn" class="btn primary" type="button">ดูตะกร้า / ชำระเงิน</button></div></div></div>';
  document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>addVariant(b.dataset.add,b));
  byId('cartBtn').onclick=openCart;
  renderCartMini()
}
function variantRow(p,v){
  const avail=stock(v),price=variantPrice(p,v);
  return '<div class="store-variant '+(!avail?'out':'')+'"><div><b>'+esc(tr(v.variant_name)||optionText(v))+'</b><div class="store-option-tags">'+optionTags(v)+'</div><div class="muted">฿'+money(price)+' · '+(avail?'เหลือ '+avail:'หมด')+'</div></div>'+
    (avail?'<button class="btn sm primary" data-add="'+esc(v.id)+'">เพิ่มตะกร้า</button>':'<span class="badge danger">หมด</span>')+'</div>'
}
function filterCategory(cat){document.querySelectorAll('[data-product-cat]').forEach(el=>el.style.display=!cat||el.dataset.productCat===cat?'':'none')}
function addVariant(id,btn){
  const v=VARIANTS.find(x=>x.id===id),p=PRODUCTS.find(x=>x.id===v?.product_id);if(!v||!p)return;
  const cur=CART.get(id)||0,max=Math.min(stock(v),Number(p.max_per_order||10));
  if(cur>=max)return Swal.fire('เพิ่มไม่ได้','ถึงจำนวนสูงสุดของตัวเลือกนี้แล้ว','info');
  CART.set(id,cur+1);renderCartMini();btn.textContent='เพิ่มแล้ว ✓';setTimeout(()=>btn.textContent='เพิ่ม',700)
}
function cartItems(){return [...CART].filter(([,q])=>q>0).map(([variant_id,qty])=>({variant_id,qty}))}
function localTotal(){return cartItems().reduce((s,x)=>{const v=VARIANTS.find(a=>a.id===x.variant_id),p=PRODUCTS.find(a=>a.id===v?.product_id);return s+(v&&p?variantPrice(p,v)*x.qty:0)},0)}
function renderCartMini(){
  const items=cartItems(),qty=items.reduce((s,x)=>s+x.qty,0);
  byId('cartMini').textContent=qty?qty+' ชิ้น':'ยังไม่มีสินค้า';byId('cartTotal').textContent='฿'+money(localTotal())
}
function cartRows(){
  return cartItems().map(x=>{const v=VARIANTS.find(a=>a.id===x.variant_id),p=PRODUCTS.find(a=>a.id===v?.product_id);return '<div class="store-cart-row"><div><b>'+esc(tr(p?.name)||p?.code)+'</b><div class="muted">'+esc(tr(v?.variant_name)||optionText(v))+' · ฿'+money(variantPrice(p,v))+'</div></div><div><input data-cart-qty="'+esc(x.variant_id)+'" type="number" min="0" max="'+Math.min(stock(v),Number(p.max_per_order||10))+'" value="'+x.qty+'" style="width:90px"></div></div>'}).join('')
}
async function openCart(){
  if(!cartItems().length)return Swal.fire('ตะกร้าว่าง','กรุณาเลือกสินค้าก่อน','info');
  const deliveryOptions=[];
  if(SETTINGS?.pickup_enabled!==false)deliveryOptions.push('<option value="PICKUP">รับสินค้าเอง</option>');
  if(SETTINGS?.delivery_enabled)deliveryOptions.push('<option value="DELIVERY">จัดส่ง (+฿'+money(SETTINGS.shipping_fee_thb)+')</option>');
  const r=await Swal.fire({title:'ตะกร้า / Checkout',width:880,showCancelButton:true,confirmButtonText:'ไปชำระเงิน',
    html:'<div style="text-align:left">'+cartRows()+'<div class="store-checkout-grid" style="margin-top:14px"><label>ชื่อ-นามสกุล<input id="coName" class="swal2-input" style="margin:0"></label><label>โทรศัพท์<input id="coPhone" class="swal2-input" style="margin:0"></label><label>Email (ถ้ามี)<input id="coEmail" class="swal2-input" style="margin:0"></label><label>วิธีรับสินค้า<select id="coDelivery" class="swal2-select" style="margin:0;width:100%">'+deliveryOptions.join('')+'</select></label><label id="coAddressWrap" style="grid-column:1/-1;display:none">ที่อยู่จัดส่ง<textarea id="coAddress" class="swal2-textarea" style="margin:0;width:100%"></textarea></label><label style="grid-column:1/-1">หมายเหตุ<textarea id="coNote" class="swal2-textarea" style="margin:0;width:100%"></textarea></label></div><div id="coQuote" class="paybox" style="margin-top:12px"></div></div>',
    didOpen:()=>{
      document.querySelectorAll('[data-cart-qty]').forEach(i=>i.onchange=()=>{const q=Math.max(0,Math.floor(Number(i.value||0)));if(q)CART.set(i.dataset.cartQty,q);else CART.delete(i.dataset.cartQty);updateCheckoutQuote()});
      coDelivery.onchange=()=>{coAddressWrap.style.display=coDelivery.value==='DELIVERY'?'block':'none';updateCheckoutQuote()};updateCheckoutQuote()
    },
    preConfirm:async()=>{
      const name=coName.value.trim(),phone=coPhone.value.trim();if(!name||!phone)return Swal.showValidationMessage('กรุณากรอกชื่อและเบอร์โทร');
      if(coDelivery.value==='DELIVERY'&&!coAddress.value.trim())return Swal.showValidationMessage('กรุณากรอกที่อยู่จัดส่ง');
      try{const q=await storeQuote(coDelivery.value);return{name,phone,email:coEmail.value.trim(),delivery:coDelivery.value,address:coAddress.value.trim(),note:coNote.value.trim(),quote:q}}catch(e){return Swal.showValidationMessage(e.message)}
    }});
  if(r.isConfirmed)openPayment(r.value)
}
async function updateCheckoutQuote(){try{const q=await storeQuote(coDelivery.value);coQuote.innerHTML='สินค้า ฿'+money(q.subtotal_amount_thb)+(Number(q.shipping_fee_thb)?' · ค่าส่ง ฿'+money(q.shipping_fee_thb):'')+' · <b>รวม ฿'+money(q.total_amount_thb)+'</b>'}catch(e){coQuote.textContent=e.message}}
function storeQuote(delivery){return api('store-quote',{event_id:E.id,items:cartItems(),delivery_method:delivery})}
function methodCard(m,i,total){
  const pp=m.kind==='PROMPTPAY';
  return '<label class="store-pay-method"><div><input type="radio" name="storePay" value="'+esc(m.id)+'" '+(i===0?'checked':'')+'> <b>'+esc(m.label||m.kind)+'</b></div>'+
    (pp?'<div class="muted">PromptPay '+esc(m.promptpay_id||'')+'</div><div id="storeQr_'+i+'" class="store-qr"></div>':'<div class="muted">'+esc(m.bank_name||'')+' · '+esc(m.account_name||'')+' · '+esc(m.account_number||'')+'</div>')+'</label>'
}
async function openPayment(co){
  const q=co.quote,total=Number(q.total_amount_thb||0);
  const methods=METHODS.filter(m=>m.is_enabled);
  if(total>0&&!methods.length)return Swal.fire('ยังไม่มีช่องทางชำระเงิน','กรุณาติดต่อผู้จัด','error');
  const r=await Swal.fire({title:'ชำระเงิน',width:780,showCancelButton:true,confirmButtonText:'ส่งคำสั่งซื้อ',
    html:'<div style="text-align:left"><div class="paybox">ยอดชำระ <b style="font-size:24px">฿'+money(total)+'</b></div>'+methods.map((m,i)=>methodCard(m,i,total)).join('')+(total>0?'<label style="margin-top:12px;display:block">สลิปการชำระเงิน<input id="storeSlip" type="file" accept="image/*,application/pdf" class="swal2-file" style="margin:0;width:100%"></label>':'')+'</div>',
    didOpen:()=>methods.forEach((m,i)=>{if(m.kind==='PROMPTPAY'&&m.qr_enabled&&m.promptpay_id&&byId('storeQr_'+i)){try{new QRCode(byId('storeQr_'+i),{text:promptpayPayload(m.promptpay_id,total,m.promptpay_type),width:220,height:220})}catch(e){}}}),
    preConfirm:()=>{const method=document.querySelector('[name=storePay]:checked')?.value||null,file=byId('storeSlip')?.files?.[0]||null;if(total>0&&!method)return Swal.showValidationMessage('กรุณาเลือกช่องทางชำระเงิน');if(total>0&&!file)return Swal.showValidationMessage('กรุณาอัปโหลดสลิป');return{method,file}}
  });
  if(!r.isConfirmed)return;
  let slipPath=null;
  try{
    Swal.fire({title:'กำลังสร้างคำสั่งซื้อ…',allowOutsideClick:false,didOpen:()=>Swal.showLoading()});
    if(r.value.file)slipPath=await uploadSlip(r.value.file);
    const out=await api('store-create-order',{payload:{event_id:E.id,language:LANG,customer_name:co.name,phone:co.phone,email:co.email,delivery_method:co.delivery,delivery_address:co.address,customer_note:co.note,payment_method_id:r.value.method,slip_path:slipPath,total_amount_thb:total,items:cartItems()}});
    CART.clear();
    await Swal.fire({icon:'success',title:'สั่งซื้อสำเร็จ',html:'เลขออเดอร์ <b>'+esc(out.order_code)+'</b><br>ยอดรวม <b>฿'+money(out.total_amount_thb)+'</b><br>สถานะ <b>'+esc(out.status)+'</b><br><small>เก็บเลขออเดอร์ไว้สำหรับเช็กสถานะ</small>',confirmButtonText:'ตกลง'});
    render()
  }catch(e){Swal.fire('สั่งซื้อไม่สำเร็จ',e.message,'error')}
}
async function uploadSlip(file){
  const form=new FormData();form.append('event_slug',E.slug);form.append('purpose','store');form.append('slip',file);
  const res=await fetch(RESTART_REG_CONFIG.SUPABASE_URL+'/functions/v1/restart-registration-api?action=upload-slip',{method:'POST',headers:{apikey:RESTART_REG_CONFIG.SUPABASE_PUBLISHABLE_KEY},body:form});
  const d=await res.json().catch(()=>({}));if(!res.ok)throw new Error(d.error||('HTTP '+res.status));return d.path
}
async function lookupOrder(){
  const r=await Swal.fire({title:'เช็กสถานะออเดอร์',showCancelButton:true,confirmButtonText:'ค้นหา',html:'<div style="text-align:left"><label>เลขออเดอร์<input id="loCode" class="swal2-input" style="margin:0" placeholder="SHOP-..."></label><label>เบอร์โทรที่ใช้สั่งซื้อ<input id="loPhone" class="swal2-input" style="margin:0"></label></div>',preConfirm:()=>{if(!loCode.value.trim()||!loPhone.value.trim())return Swal.showValidationMessage('กรุณากรอกข้อมูลให้ครบ');return{code:loCode.value.trim(),phone:loPhone.value.trim()}}});
  if(!r.isConfirmed)return;
  try{
    const o=await api('store-lookup',{event_slug:E.slug,order_code:r.value.code,phone:r.value.phone});
    const rows=(o.items||[]).map(i=>'<div>'+esc(tr(i.product_name))+' · '+esc(tr(i.variant_name)||Object.values(i.option_values||{}).join(' / '))+' × '+i.qty+' · ฿'+money(i.total_price_thb)+'</div>').join('');
    const canRetry=['PENDING','REJECTED'].includes(o.payment_status)&&!['CANCELLED','FULFILLED','SHIPPED'].includes(o.status);
    Swal.fire({title:esc(o.order_code),width:700,html:'<div style="text-align:left"><div class="paybox"><b>สถานะ: '+esc(statusText(o.status))+'</b><br>การชำระ: '+esc(paymentText(o.payment_status))+'</div><div class="paybox">'+rows+'</div><div class="paybox">รวม <b>฿'+money(o.total_amount_thb)+'</b></div>'+(canRetry?'<button id="retryStorePay" class="btn primary" type="button">ส่งสลิปใหม่</button>':'')+'</div>',showConfirmButton:false,showCloseButton:true,didOpen:()=>byId('retryStorePay')?.addEventListener('click',()=>retryPayment(r.value.code,r.value.phone,o.total_amount_thb))})
  }catch(e){Swal.fire('ไม่พบออเดอร์',e.message,'error')}
}
async function retryPayment(code,phone,total){
  const r=await Swal.fire({title:'ส่งสลิปใหม่',html:'ยอด <b>฿'+money(total)+'</b><br><input id="retrySlip" type="file" accept="image/*,application/pdf" class="swal2-file" style="margin:12px 0;width:100%">',showCancelButton:true,confirmButtonText:'ส่งสลิป',preConfirm:()=>retrySlip.files?.[0]||Swal.showValidationMessage('กรุณาเลือกสลิป')});
  if(!r.isConfirmed)return;try{Swal.fire({title:'กำลังส่ง…',allowOutsideClick:false,didOpen:()=>Swal.showLoading()});const path=await uploadSlip(r.value);await api('store-submit-payment',{event_slug:E.slug,order_code:code,phone,slip_path:path});Swal.fire({icon:'success',title:'ส่งสลิปแล้ว',text:'รอ Admin ตรวจสอบ'})}catch(e){Swal.fire('ส่งไม่สำเร็จ',e.message,'error')}
}
function statusText(s){return({PENDING_PAYMENT:'รอชำระเงิน',PENDING_REVIEW:'รอตรวจสลิป',PAID:'ชำระแล้ว',PREPARING:'กำลังเตรียมสินค้า',READY:'พร้อมรับสินค้า',FULFILLED:'รับสินค้าแล้ว',SHIPPED:'จัดส่งแล้ว',CANCELLED:'ยกเลิก'})[s]||s}
function paymentText(s){return({PENDING:'รอชำระ',PENDING_REVIEW:'รอตรวจ',APPROVED:'อนุมัติแล้ว',REJECTED:'สลิปไม่ผ่าน',REFUNDED:'คืนเงินแล้ว'})[s]||s}
function promptpayPayload(id,amount,type){const digits=String(id).replace(/\D/g,'');const target=type||((digits.length===13)?'NATIONAL_ID':'PHONE');let aid=digits,tag='01';if(target==='PHONE'){aid=digits.length===10?'0066'+digits.substring(1):digits;tag='01'}else if(target==='NATIONAL_ID'){tag='02'}else if(target==='EWALLET'){tag='03'}const tlv=(i,v)=>i+String(v.length).padStart(2,'0')+v;const merchant=tlv('00','A000000677010111')+tlv(tag,aid);let p=tlv('00','01')+tlv('01','12')+tlv('29',merchant)+tlv('53','764')+(amount?tlv('54',Number(amount).toFixed(2)):'')+tlv('58','TH')+tlv('62',tlv('07','RESTART'))+'6304';const crc=s=>{let c=0xffff;for(let i=0;i<s.length;i++){c^=s.charCodeAt(i)<<8;for(let j=0;j<8;j++)c=(c&0x8000)?((c<<1)^0x1021)&0xffff:(c<<1)&0xffff}return c.toString(16).toUpperCase().padStart(4,'0')};return p+crc(p)}
async function init(){
  if(!slug)throw new Error('ไม่พบ Event');
  const{data:e,error:ee}=await db.from('restart_events').select('*').eq('slug',slug).maybeSingle();if(ee||!e)throw new Error('ไม่พบ Event');
  E=e;
  const[{data:s,error:se},{data:p,error:pe},{data:m,error:me}]=await Promise.all([
    db.from('restart_store_settings').select('*').eq('event_id',E.id).maybeSingle(),
    db.from('restart_merch_products').select('*,restart_merch_variants(*)').eq('event_id',E.id).eq('is_active',true).order('sort_order'),
    db.from('restart_payment_methods').select('*').eq('event_id',E.id).eq('is_enabled',true).order('sort_order')
  ]);
  if(se||pe||me)throw (se||pe||me);
  const storeEnabled=!!E.feature_flags?.storefront||!!s?.is_open;
  if(!storeEnabled)throw new Error('Event นี้ยังไม่เปิดร้านค้า');
  SETTINGS=s||{is_open:true,pickup_enabled:true,delivery_enabled:false,shipping_fee_thb:0,store_name:{th:(tr(E.name)||'Event')+' Store'}};
  if(SETTINGS.is_open===false)throw new Error('ร้านค้าปิดชั่วคราว');
  PRODUCTS=p||[];VARIANTS=PRODUCTS.flatMap(x=>x.restart_merch_variants||[]);METHODS=m||[];
  render()
}
document.getElementById('orderLookupBtn').onclick=lookupOrder;
init().catch(e=>app.innerHTML='<section class="rr-card rr-empty"><h3>เปิดร้านค้าไม่ได้</h3><div>'+esc(e.message)+'</div></section>');