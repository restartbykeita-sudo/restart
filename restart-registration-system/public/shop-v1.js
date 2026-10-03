const db=supabase.createClient(RESTART_REG_CONFIG.SUPABASE_URL,RESTART_REG_CONFIG.SUPABASE_PUBLISHABLE_KEY);
const app=document.getElementById('shopApp');
const qs=new URLSearchParams(location.search),slug=qs.get('event'),storeSlug=qs.get('store');
let E=null,STORES=[],STORE=null,SETTINGS=null,PRODUCTS=[],VARIANTS=[],METHODS=[],CART=new Map(),MEMBER_SESSION=null,MEMBER_PROFILE=null,LANG=localStorage.getItem('restart_lang')||'th';
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money=v=>Number(v||0).toLocaleString(RestartI18n.locale(),{maximumFractionDigits:2});
const tr=v=>typeof v==='string'?v:(v?.[LANG]||v?.th||v?.en||Object.values(v||{})[0]||'');
const byId=id=>document.getElementById(id);
async function api(action,body={}){
  const{data:{session}}=await db.auth.getSession();
  const headers={'content-type':'application/json','apikey':RESTART_REG_CONFIG.SUPABASE_PUBLISHABLE_KEY};
  if(session?.access_token)headers.authorization='Bearer '+session.access_token;
  const r=await fetch(RESTART_REG_CONFIG.SUPABASE_URL+'/functions/v1/restart-registration-api?action='+encodeURIComponent(action),{
    method:'POST',headers,body:JSON.stringify(body)
  });
  const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||('HTTP '+r.status));return d
}
function variantPrice(p,v){return Number(v.price_override_thb??(Number(p.price_thb||0)+Number(v.price_adjustment_thb||0)))}
function optionText(v){
  const opts=v.option_values&&Object.keys(v.option_values).length?v.option_values:null;
  if(opts)return Object.entries(opts).map(([k,val])=>k+'='+val).join(' · ');
  return tr(v.variant_name)||v.size_label||RestartI18n.t('ตัวเลือกมาตรฐาน')
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
function renderStoreDirectory(){
  document.title=(tr(E?.name)||'RESTART')+' '+RestartI18n.t('ร้านค้าทั้งหมด');
  const back=byId('backEvent');back.href='./?event='+encodeURIComponent(E.slug);back.textContent=RestartI18n.t('กลับ Event');
  const lookup=byId('orderLookupBtn');if(lookup)lookup.style.display='none';
  app.innerHTML=
    RestartI18n.t('<section class="rr-card store-hero"><div><div class="muted"></div><h2>เลือกร้านค้า</h2><div class="muted">')+esc(tr(E.name)||'Event')+'</div></div><div><span class="badge ok">'+STORES.length+RestartI18n.t(' ร้าน</span></div></section>')+
    (STORES.length?'<section class="store-showcase-grid">'+STORES.map(storeDirectoryCard).join('')+'</section>':RestartI18n.t('<section class="rr-card rr-empty">ยังไม่มีร้านค้าที่เปิดให้บริการ</section>'));
}
function storeDirectoryCard(s){
  const href='shop.html?event='+encodeURIComponent(E.slug)+'&store='+encodeURIComponent(s.slug);
  const image=s.banner_url||s.logo_url||'';
  const methods=[s.pickup_enabled?RestartI18n.t('รับเอง'):'',s.delivery_enabled?RestartI18n.t('จัดส่ง'):''].filter(Boolean).join(' · ');
  return '<a class="store-showcase-card" href="'+href+'">'+
    '<div class="store-card-media '+(!image?'store-card-media-fallback':'')+'" '+(image?'style="background-image:url(\''+esc(image).replaceAll("'","%27")+'\')"':'')+'><div class="store-card-scrim"></div></div>'+
    RestartI18n.t('<div class="store-card-content"><div class="store-card-topline"><span class="store-card-status is-open">เปิดร้าน</span></div>')+
      RestartI18n.t('<div class="store-card-copy"><div class="muted" style="color:rgba(255,255,255,.7)">ร้านค้า</div><h2>')+esc(tr(s.name)||s.slug)+'</h2>'+
      (tr(s.description)?'<p>'+esc(tr(s.description))+'</p>':'')+
      '<div class="store-card-meta"><span>'+esc(methods||RestartI18n.t('ดูสินค้า'))+RestartI18n.t('</span><span>เข้าร้าน ↗</span></div></div></div>')+
  '</a>'
}
function render(){
  if(!STORE)return renderStoreDirectory();
  document.title=(tr(SETTINGS?.store_name)||tr(E?.name)||'RESTART')+' '+RestartI18n.t('ร้านค้า');
  byId('backEvent').href='shop.html?event='+encodeURIComponent(E.slug);
  byId('backEvent').textContent=RestartI18n.t('ร้านค้าทั้งหมด');
  if(byId('orderLookupBtn'))byId('orderLookupBtn').style.display='';
  const productId=new URLSearchParams(location.search).get('product');
  if(productId){
    const p=PRODUCTS.find(x=>x.id===productId);
    if(p)return renderProductDetail(p);
    history.replaceState(null,'','shop.html?event='+encodeURIComponent(E.slug)+'&store='+encodeURIComponent(STORE.slug));
  }
  const storeName=tr(SETTINGS?.store_name)||((tr(E.name)||'Event')+' '+RestartI18n.t('ร้านค้า'));
  const cats=[...new Set(PRODUCTS.map(p=>p.category).filter(Boolean))];
  app.innerHTML=
    '<section class="rr-card store-hero"><div><div class="muted"></div><h2>'+esc(storeName)+'</h2><div class="muted">'+esc(tr(SETTINGS?.terms)||'')+RestartI18n.t('</div></div><div><span class="badge ok">ร้านค้าเปิด</span></div></section>')+
    (cats.length?RestartI18n.t('<section class="rr-card"><div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn sm soft" data-cat="">ทั้งหมด</button>')+cats.map(c=>'<button class="btn sm soft" data-cat="'+esc(c)+'">'+esc(c)+'</button>').join('')+'</div></section>':'')+
    '<section id="productGrid" class="store-showcase-grid">'+PRODUCTS.map(productCard).join('')+'</section>'+
    RestartI18n.t('<div class="store-cart-float"><div class="rr-card store-cart-bar"><div><b>ตะกร้า</b><div id="cartMini" class="muted">ยังไม่มีสินค้า</div></div><div class="row"><div id="cartTotal" class="store-total">฿0</div><button id="cartBtn" class="btn primary" type="button">ดูตะกร้า / ชำระเงิน</button></div></div></div>');
  document.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>filterCategory(b.dataset.cat));
  byId('cartBtn').onclick=openCart;
  renderCartMini()
}
function productCard(p){
  const min=productMinPrice(p);
  const soldOut=!VARIANTS.some(v=>v.product_id===p.id&&v.is_active&&stock(v)>0);
  const href='shop.html?event='+encodeURIComponent(E.slug)+'&store='+encodeURIComponent(STORE.slug)+'&product='+encodeURIComponent(p.id);
  return '<a class="store-showcase-card" data-product-cat="'+esc(p.category||'')+'" href="'+href+'">'+
    '<div class="store-card-media '+(!p.image_url?'store-card-media-fallback':'')+'" '+(p.image_url?'style="background-image:url(\''+esc(p.image_url).replaceAll("'","%27")+'\')"':'')+'><div class="store-card-scrim"></div></div>'+
    '<div class="store-card-content">'+
      '<div class="store-card-topline"><span class="store-card-status '+(!soldOut?'is-open':'')+'">'+(soldOut?RestartI18n.t('หมด'):RestartI18n.t('พร้อมจำหน่าย'))+'</span>'+(tr(p.badge)?'<span class="store-card-featured">'+esc(tr(p.badge))+'</span>':'')+'</div>'+
      '<div class="store-card-copy"><div class="muted" style="color:rgba(255,255,255,.7)">'+esc(p.category||p.product_type||RestartI18n.t('สินค้า'))+'</div><h2>'+esc(tr(p.name)||p.code)+'</h2>'+
        (tr(p.description)?'<p>'+esc(tr(p.description).slice(0,150))+(tr(p.description).length>150?'…':'')+'</p>':'')+
        RestartI18n.t('<div class="store-card-meta"><span>เริ่ม ฿')+money(min)+RestartI18n.t('</span><span>ดูสินค้า ↗</span></div>')+
      '</div>'+
    '</div>'+
  '</a>'
}
function renderProductDetail(p){
  const vs=VARIANTS.filter(v=>v.product_id===p.id&&v.is_active).sort((a,b)=>a.sort_order-b.sort_order);
  const back='shop.html?event='+encodeURIComponent(E.slug)+'&store='+encodeURIComponent(STORE.slug);
  app.innerHTML=
    '<section class="store-detail-shell">'+
      '<div class="store-detail-head"><a class="btn soft" href="'+back+RestartI18n.t('">← กลับหน้าร้าน</a><div class="muted">')+esc(p.category||p.product_type||RestartI18n.t('สินค้า'))+'</div></div>'+
      '<div class="rr-card store-detail-hero">'+
        '<div class="store-detail-media">'+(p.image_url?'<img src="'+esc(p.image_url)+'" alt="">':'<div class="store-detail-placeholder">🛍️</div>')+'</div>'+
        '<div class="store-detail-info">'+
          (tr(p.badge)?'<span class="badge">'+esc(tr(p.badge))+'</span>':'')+
          '<h1>'+esc(tr(p.name)||p.code)+'</h1>'+
          RestartI18n.t('<div class="store-detail-price">เริ่ม ฿')+money(productMinPrice(p))+'</div>'+
          '<p>'+esc(tr(p.description)||'')+'</p>'+
          RestartI18n.t('<div class="store-detail-options"><h3>เลือกตัวเลือก</h3>')+
            (vs.length?vs.map(v=>variantRow(p,v)).join(''):RestartI18n.t('<div class="rr-empty">ไม่มีตัวเลือกพร้อมขาย</div>'))+
          '</div>'+
        '</div>'+
      '</div>'+
    '</section>'+
    RestartI18n.t('<div class="store-cart-float"><div class="rr-card store-cart-bar"><div><b>ตะกร้า</b><div id="cartMini" class="muted">ยังไม่มีสินค้า</div></div><div class="row"><div id="cartTotal" class="store-total">฿0</div><button id="cartBtn" class="btn primary" type="button">ดูตะกร้า / ชำระเงิน</button></div></div></div>');
  document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>addVariant(b.dataset.add,b));
  byId('cartBtn').onclick=openCart;
  renderCartMini()
}
function variantRow(p,v){
  const avail=stock(v),price=variantPrice(p,v);
  return '<div class="store-variant '+(!avail?'out':'')+'"><div><b>'+esc(tr(v.variant_name)||optionText(v))+'</b><div class="store-option-tags">'+optionTags(v)+RestartI18n.t('</div><div class="muted">฿')+money(price)+' · '+(avail?RestartI18n.t('เหลือ ')+avail:RestartI18n.t('หมด'))+'</div></div>'+
    (avail?'<button class="btn sm primary" data-add="'+esc(v.id)+RestartI18n.t('">เพิ่มตะกร้า</button>'):RestartI18n.t('<span class="badge danger">หมด</span>'))+'</div>'
}
function filterCategory(cat){document.querySelectorAll('[data-product-cat]').forEach(el=>el.style.display=!cat||el.dataset.productCat===cat?'':'none')}
function addVariant(id,btn){
  const v=VARIANTS.find(x=>x.id===id),p=PRODUCTS.find(x=>x.id===v?.product_id);if(!v||!p)return;
  const cur=CART.get(id)||0,max=Math.min(stock(v),Number(p.max_per_order||10));
  if(cur>=max)return Swal.fire(RestartI18n.t('เพิ่มไม่ได้'),RestartI18n.t('ถึงจำนวนสูงสุดของตัวเลือกนี้แล้ว'),'info');
  CART.set(id,cur+1);renderCartMini();btn.textContent=RestartI18n.t('เพิ่มแล้ว ✓');setTimeout(()=>btn.textContent=RestartI18n.t('เพิ่ม'),700)
}
function cartItems(){return [...CART].filter(([,q])=>q>0).map(([variant_id,qty])=>({variant_id,qty}))}
function localTotal(){return cartItems().reduce((s,x)=>{const v=VARIANTS.find(a=>a.id===x.variant_id),p=PRODUCTS.find(a=>a.id===v?.product_id);return s+(v&&p?variantPrice(p,v)*x.qty:0)},0)}
function renderCartMini(){
  const items=cartItems(),qty=items.reduce((s,x)=>s+x.qty,0);
  byId('cartMini').textContent=qty?qty+RestartI18n.t(' ชิ้น'):RestartI18n.t('ยังไม่มีสินค้า');byId('cartTotal').textContent=RestartI18n.t('฿')+money(localTotal())
}
function cartRows(){
  return cartItems().map(x=>{const v=VARIANTS.find(a=>a.id===x.variant_id),p=PRODUCTS.find(a=>a.id===v?.product_id);return '<div class="store-cart-row"><div><b>'+esc(tr(p?.name)||p?.code)+'</b><div class="muted">'+esc(tr(v?.variant_name)||optionText(v))+RestartI18n.t(' · ฿')+money(variantPrice(p,v))+'</div></div><div><input data-cart-qty="'+esc(x.variant_id)+'" type="number" min="0" max="'+Math.min(stock(v),Number(p.max_per_order||10))+'" value="'+x.qty+'" style="width:90px"></div></div>'}).join('')
}
async function openCart(){
  if(!cartItems().length)return Swal.fire(RestartI18n.t('ตะกร้าว่าง'),RestartI18n.t('กรุณาเลือกสินค้าก่อน'),'info');
  const deliveryOptions=[];
  if(SETTINGS?.pickup_enabled!==false)deliveryOptions.push(RestartI18n.t('<option value="PICKUP">รับสินค้าเอง</option>'));
  if(SETTINGS?.delivery_enabled)deliveryOptions.push(RestartI18n.t('<option value="DELIVERY">จัดส่ง (+฿')+money(SETTINGS.shipping_fee_thb)+')</option>');
  const pointsRate=Math.max(1,Number(SETTINGS?.points_per_thb||1));
  const pointBalance=Number(MEMBER_PROFILE?.points_balance||0);
  const pointsUi=SETTINGS?.points_redemption_enabled
    ?(MEMBER_SESSION
      ?RestartI18n.t('<div class="paybox" style="grid-column:1/-1"><b>RESTART Points</b><div class="muted">มี ')+pointBalance.toLocaleString(RestartI18n.locale())+RestartI18n.t(' แต้ม · ')+pointsRate+RestartI18n.t(' แต้ม = ส่วนลด 1 บาท')+(Number(SETTINGS?.min_redeem_points||0)>0?RestartI18n.t(' · ขั้นต่ำ ')+Number(SETTINGS.min_redeem_points).toLocaleString(RestartI18n.locale())+RestartI18n.t(' แต้ม'):'')+RestartI18n.t('</div><div class="row" style="gap:8px;align-items:end;margin-top:8px"><label style="flex:1;margin:0">แต้มที่ต้องการใช้<input id="coPoints" type="number" min="0" step="')+pointsRate+'" max="'+pointBalance+RestartI18n.t('" value="0"></label><button id="useMaxPoints" class="btn sm soft" type="button">ใช้แต้มสูงสุด</button></div><div id="pointUseHint" class="muted" style="margin-top:6px"></div></div>')
      :RestartI18n.t('<div class="paybox" style="grid-column:1/-1"><b>ร้านนี้ใช้ RESTART Points ได้</b><div class="muted">เข้าสู่ระบบสมาชิกเพื่อใช้คะแนนเป็นส่วนลด</div><a class="btn sm soft" href="member.html?return=')+encodeURIComponent(location.href)+RestartI18n.t('">Login สมาชิก</a></div>'))
    :'';
  const r=await Swal.fire({title:RestartI18n.t('ตะกร้า / Checkout'),width:880,showCancelButton:true,confirmButtonText:RestartI18n.t('ไปชำระเงิน'),
    html:'<div style="text-align:left">'+cartRows()+RestartI18n.t('<div class="store-checkout-grid" style="margin-top:14px"><label>ชื่อ-นามสกุล<input id="coName" class="swal2-input" style="margin:0" value="')+esc([MEMBER_PROFILE?.first_name,MEMBER_PROFILE?.last_name].filter(Boolean).join(' '))+RestartI18n.t('"></label><label>โทรศัพท์<input id="coPhone" class="swal2-input" style="margin:0" value="')+esc(MEMBER_PROFILE?.phone||'')+RestartI18n.t('"></label><label>Email (ถ้ามี)<input id="coEmail" class="swal2-input" style="margin:0" value="')+esc(MEMBER_SESSION?.user?.email||'')+RestartI18n.t('"></label><label>วิธีรับสินค้า<select id="coDelivery" class="swal2-select" style="margin:0;width:100%">')+deliveryOptions.join('')+RestartI18n.t('</select></label><label id="coAddressWrap" style="grid-column:1/-1;display:none">ที่อยู่จัดส่ง<textarea id="coAddress" class="swal2-textarea" style="margin:0;width:100%">')+esc(MEMBER_PROFILE?.address||'')+'</textarea></label>'+pointsUi+RestartI18n.t('<label style="grid-column:1/-1">หมายเหตุ<textarea id="coNote" class="swal2-textarea" style="margin:0;width:100%"></textarea></label></div><div id="coQuote" class="paybox" style="margin-top:12px"></div></div>'),
    didOpen:()=>{
      document.querySelectorAll('[data-cart-qty]').forEach(i=>i.onchange=()=>{const q=Math.max(0,Math.floor(Number(i.value||0)));if(q)CART.set(i.dataset.cartQty,q);else CART.delete(i.dataset.cartQty);updateCheckoutQuote()});
      coDelivery.onchange=()=>{coAddressWrap.style.display=coDelivery.value==='DELIVERY'?'block':'none';updateCheckoutQuote()};
      byId('coPoints')?.addEventListener('input',updateCheckoutQuote);
      byId('useMaxPoints')?.addEventListener('click',()=>{const p=byId('coPoints');if(p){p.value=String(pointBalance);updateCheckoutQuote()}});
      updateCheckoutQuote()
    },
    preConfirm:async()=>{
      const name=coName.value.trim(),phone=coPhone.value.trim();if(!name||!phone)return Swal.showValidationMessage(RestartI18n.t('กรุณากรอกชื่อและเบอร์โทร'));
      if(coDelivery.value==='DELIVERY'&&!coAddress.value.trim())return Swal.showValidationMessage(RestartI18n.t('กรุณากรอกที่อยู่จัดส่ง'));
      const points=Math.max(0,Math.floor(Number(byId('coPoints')?.value||0)));
      try{const q=await storeQuote(coDelivery.value,points);return{name,phone,email:coEmail.value.trim(),delivery:coDelivery.value,address:coAddress.value.trim(),note:coNote.value.trim(),quote:q}}catch(e){return Swal.showValidationMessage(e.message)}
    }});
  if(r.isConfirmed)openPayment(r.value)
}
async function updateCheckoutQuote(){try{const input=byId('coPoints'),points=Math.max(0,Math.floor(Number(input?.value||0))),q=await storeQuote(coDelivery.value,points),actual=Number(q.points_redeemed||0);if(input&&points>0&&actual!==points)input.value=String(actual);const hint=byId('pointUseHint');if(hint)hint.textContent=actual>0?RestartI18n.t('ใช้จริง ')+actual.toLocaleString(RestartI18n.locale())+RestartI18n.t(' แต้ม · ลด ฿')+money(q.points_discount_thb):'';coQuote.innerHTML=RestartI18n.t('สินค้า ฿')+money(q.subtotal_amount_thb)+(Number(q.shipping_fee_thb)?RestartI18n.t(' · ค่าส่ง ฿')+money(q.shipping_fee_thb):'')+(Number(q.points_discount_thb)>0?RestartI18n.t(' · แต้ม <b>-฿')+money(q.points_discount_thb)+'</b> ('+actual.toLocaleString(RestartI18n.locale())+RestartI18n.t(' แต้ม)'):'')+RestartI18n.t(' · <b>รวม ฿')+money(q.total_amount_thb)+'</b>'}catch(e){coQuote.textContent=e.message}}
function storeQuote(delivery,points=0){return api('store-quote',{event_id:E.id,store_slug:STORE.slug,items:cartItems(),delivery_method:delivery,points_to_redeem:Math.max(0,Math.floor(Number(points||0)))})}
function methodCard(m,i,total){
  const pp=m.kind==='PROMPTPAY';
  return '<label class="store-pay-method"><div><input type="radio" name="storePay" value="'+esc(m.id)+'" '+(i===0?'checked':'')+'> <b>'+esc(m.label||m.kind)+'</b></div>'+
    (pp?'<div class="muted">PromptPay '+esc(m.promptpay_id||'')+'</div><div id="storeQr_'+i+'" class="store-qr"></div>':'<div class="muted">'+esc(m.bank_name||'')+' · '+esc(m.account_name||'')+' · '+esc(m.account_number||'')+'</div>')+'</label>'
}
async function openPayment(co){
  const q=co.quote,total=Number(q.total_amount_thb||0);
  const methods=METHODS.filter(m=>m.is_enabled);
  if(total>0&&!methods.length)return Swal.fire(RestartI18n.t('ยังไม่มีช่องทางชำระเงิน'),RestartI18n.t('กรุณาติดต่อผู้จัด'),'error');
  const r=await Swal.fire({title:RestartI18n.t('ชำระเงิน'),width:780,showCancelButton:true,confirmButtonText:RestartI18n.t('ส่งคำสั่งซื้อ'),
    html:'<div style="text-align:left"><div class="paybox">'+(Number(q.points_discount_thb)>0?RestartI18n.t('ใช้ ')+Number(q.points_redeemed).toLocaleString(RestartI18n.locale())+RestartI18n.t(' Points · ลด ฿')+money(q.points_discount_thb)+'<br>':'')+RestartI18n.t('ยอดชำระ <b style="font-size:24px">฿')+money(total)+'</b></div>'+methods.map((m,i)=>methodCard(m,i,total)).join('')+(total>0?RestartI18n.t('<label style="margin-top:12px;display:block">สลิปการชำระเงิน<input id="storeSlip" type="file" accept="image/*,application/pdf" class="swal2-file" style="margin:0;width:100%"></label>'):'')+'</div>',
    didOpen:()=>methods.forEach((m,i)=>{if(m.kind==='PROMPTPAY'&&m.qr_enabled&&m.promptpay_id&&byId('storeQr_'+i)){try{new QRCode(byId('storeQr_'+i),{text:promptpayPayload(m.promptpay_id,total,m.promptpay_type),width:220,height:220})}catch(e){}}}),
    preConfirm:()=>{const method=document.querySelector('[name=storePay]:checked')?.value||null,file=byId('storeSlip')?.files?.[0]||null;if(total>0&&!method)return Swal.showValidationMessage(RestartI18n.t('กรุณาเลือกช่องทางชำระเงิน'));if(total>0&&!file)return Swal.showValidationMessage(RestartI18n.t('กรุณาอัปโหลดสลิป'));return{method,file}}
  });
  if(!r.isConfirmed)return;
  let slipPath=null;
  try{
    Swal.fire({title:RestartI18n.t('กำลังสร้างคำสั่งซื้อ…'),allowOutsideClick:false,didOpen:()=>Swal.showLoading()});
    if(r.value.file)slipPath=await uploadSlip(r.value.file);
    const out=await api('store-create-order',{payload:{event_id:E.id,store_slug:STORE.slug,language:LANG,customer_name:co.name,phone:co.phone,email:co.email,delivery_method:co.delivery,delivery_address:co.address,customer_note:co.note,payment_method_id:r.value.method,slip_path:slipPath,points_to_redeem:Number(q.points_redeemed||0),total_amount_thb:total,items:cartItems()}});
    CART.clear();
    await Swal.fire({icon:'success',title:RestartI18n.t('สั่งซื้อสำเร็จ'),html:RestartI18n.t('เลขออเดอร์ <b>')+esc(out.order_code)+'</b>'+(Number(out.points_redeemed)>0?RestartI18n.t('<br>ใช้แต้ม <b>')+Number(out.points_redeemed).toLocaleString(RestartI18n.locale())+RestartI18n.t('</b> · ลด ฿')+money(out.points_discount_thb):'')+RestartI18n.t('<br>ยอดรวม <b>฿')+money(out.total_amount_thb)+RestartI18n.t('</b><br>สถานะ <b>')+esc(RestartI18n.status(out.status))+RestartI18n.t('</b><br><small>เก็บเลขออเดอร์ไว้สำหรับเช็กสถานะ</small>'),confirmButtonText:RestartI18n.t('ตกลง')});
    render()
  }catch(e){Swal.fire(RestartI18n.t('สั่งซื้อไม่สำเร็จ'),e.message,'error')}
}
async function uploadSlip(file){
  const form=new FormData();form.append('event_slug',E.slug);form.append('purpose','store');form.append('slip',file);
  const{data:{session}}=await db.auth.getSession();const headers={apikey:RESTART_REG_CONFIG.SUPABASE_PUBLISHABLE_KEY};if(session?.access_token)headers.authorization='Bearer '+session.access_token;
  const res=await fetch(RESTART_REG_CONFIG.SUPABASE_URL+'/functions/v1/restart-registration-api?action=upload-slip',{method:'POST',headers,body:form});
  const d=await res.json().catch(()=>({}));if(!res.ok)throw new Error(d.error||('HTTP '+res.status));return d.path
}
async function lookupOrder(){
  const r=await Swal.fire({title:RestartI18n.t('เช็กสถานะออเดอร์'),showCancelButton:true,confirmButtonText:RestartI18n.t('ค้นหา'),html:RestartI18n.t('<div style="text-align:left"><label>เลขออเดอร์<input id="loCode" class="swal2-input" style="margin:0" placeholder="SHOP-..."></label><label>เบอร์โทรที่ใช้สั่งซื้อ<input id="loPhone" class="swal2-input" style="margin:0"></label></div>'),preConfirm:()=>{if(!loCode.value.trim()||!loPhone.value.trim())return Swal.showValidationMessage(RestartI18n.t('กรุณากรอกข้อมูลให้ครบ'));return{code:loCode.value.trim(),phone:loPhone.value.trim()}}});
  if(!r.isConfirmed)return;
  try{
    if(!STORE)throw new Error(RestartI18n.t('กรุณาเข้าร้านที่สั่งซื้อก่อน'));
    const o=await api('store-lookup',{event_slug:E.slug,store_slug:STORE.slug,order_code:r.value.code,phone:r.value.phone});
    const rows=(o.items||[]).map(i=>'<div>'+esc(tr(i.product_name))+' · '+esc(tr(i.variant_name)||Object.values(i.option_values||{}).join(' / '))+' × '+i.qty+RestartI18n.t(' · ฿')+money(i.total_price_thb)+'</div>').join('');
    const canRetry=['PENDING','REJECTED'].includes(o.payment_status)&&!['CANCELLED','FULFILLED','SHIPPED'].includes(o.status);
    Swal.fire({title:esc(o.order_code),width:700,html:RestartI18n.t('<div style="text-align:left"><div class="paybox"><b>สถานะ: ')+esc(statusText(o.status))+RestartI18n.t('</b><br>การชำระ: ')+esc(paymentText(o.payment_status))+'</div><div class="paybox">'+rows+RestartI18n.t('</div><div class="paybox">รวม <b>฿')+money(o.total_amount_thb)+'</b></div>'+(canRetry?RestartI18n.t('<button id="retryStorePay" class="btn primary" type="button">ส่งสลิปใหม่</button>'):'')+'</div>',showConfirmButton:false,showCloseButton:true,didOpen:()=>byId('retryStorePay')?.addEventListener('click',()=>retryPayment(r.value.code,r.value.phone,o.total_amount_thb))})
  }catch(e){Swal.fire(RestartI18n.t('ไม่พบออเดอร์'),e.message,'error')}
}
async function retryPayment(code,phone,total){
  const r=await Swal.fire({title:RestartI18n.t('ส่งสลิปใหม่'),html:RestartI18n.t('ยอด <b>฿')+money(total)+'</b><br><input id="retrySlip" type="file" accept="image/*,application/pdf" class="swal2-file" style="margin:12px 0;width:100%">',showCancelButton:true,confirmButtonText:RestartI18n.t('ส่งสลิป'),preConfirm:()=>retrySlip.files?.[0]||Swal.showValidationMessage(RestartI18n.t('กรุณาเลือกสลิป'))});
  if(!r.isConfirmed)return;try{Swal.fire({title:RestartI18n.t('กำลังส่ง…'),allowOutsideClick:false,didOpen:()=>Swal.showLoading()});const path=await uploadSlip(r.value);await api('store-submit-payment',{event_slug:E.slug,store_slug:STORE.slug,order_code:code,phone,slip_path:path});Swal.fire({icon:'success',title:RestartI18n.t('ส่งสลิปแล้ว'),text:RestartI18n.t('รอตรวจสอบ')})}catch(e){Swal.fire(RestartI18n.t('ส่งไม่สำเร็จ'),e.message,'error')}
}
function statusText(s){return({PENDING_PAYMENT:RestartI18n.t('รอชำระเงิน'),PENDING_REVIEW:RestartI18n.t('รอตรวจสลิป'),PAID:RestartI18n.t('ชำระแล้ว'),PREPARING:RestartI18n.t('กำลังเตรียมสินค้า'),READY:RestartI18n.t('พร้อมรับสินค้า'),FULFILLED:RestartI18n.t('รับสินค้าแล้ว'),SHIPPED:RestartI18n.t('จัดส่งแล้ว'),CANCELLED:RestartI18n.t('ยกเลิก')})[s]||s}
function paymentText(s){return({PENDING:RestartI18n.t('รอชำระ'),PENDING_REVIEW:RestartI18n.t('รอตรวจ'),APPROVED:RestartI18n.t('อนุมัติแล้ว'),REJECTED:RestartI18n.t('สลิปไม่ผ่าน'),REFUNDED:RestartI18n.t('คืนเงินแล้ว')})[s]||s}
function promptpayPayload(id,amount,type){const digits=String(id).replace(/\D/g,'');const target=type||((digits.length===13)?'NATIONAL_ID':'PHONE');let aid=digits,tag='01';if(target==='PHONE'){aid=digits.length===10?'0066'+digits.substring(1):digits;tag='01'}else if(target==='NATIONAL_ID'){tag='02'}else if(target==='EWALLET'){tag='03'}const tlv=(i,v)=>i+String(v.length).padStart(2,'0')+v;const merchant=tlv('00','A000000677010111')+tlv(tag,aid);let p=tlv('00','01')+tlv('01','12')+tlv('29',merchant)+tlv('53','764')+(amount?tlv('54',Number(amount).toFixed(2)):'')+tlv('58','TH')+tlv('62',tlv('07','RESTART'))+'6304';const crc=s=>{let c=0xffff;for(let i=0;i<s.length;i++){c^=s.charCodeAt(i)<<8;for(let j=0;j<8;j++)c=(c&0x8000)?((c<<1)^0x1021)&0xffff:(c<<1)&0xffff}return c.toString(16).toUpperCase().padStart(4,'0')};return p+crc(p)}
async function init(){
  if(!slug)throw new Error(RestartI18n.t('ไม่พบ Event'));
  const{data:e,error:ee}=await db.from('restart_events').select('*').eq('slug',slug).maybeSingle();
  if(ee||!e)throw new Error(RestartI18n.t('ไม่พบ Event'));
  E=e;
  const{data:{session}}=await db.auth.getSession();MEMBER_SESSION=session||null;MEMBER_PROFILE=null;
  if(session?.user){const{data:mp}=await db.from('restart_member_profiles').select('*').eq('user_id',session.user.id).maybeSingle();MEMBER_PROFILE=mp||null}
  if(!E.feature_flags?.storefront)throw new Error(RestartI18n.t('Event นี้ยังไม่เปิดร้านค้า'));

  const{data:stores,error:ste}=await db.from('restart_stores').select('*').eq('event_id',E.id).eq('is_open',true).order('sort_order').order('created_at');
  if(ste)throw ste;
  STORES=stores||[];

  if(!storeSlug){
    STORE=null;SETTINGS=null;PRODUCTS=[];VARIANTS=[];METHODS=[];
    return renderStoreDirectory()
  }

  STORE=STORES.find(s=>s.slug===storeSlug)||null;
  if(!STORE)throw new Error(RestartI18n.t('ไม่พบร้านค้านี้ หรือร้านค้าปิดอยู่'));
  SETTINGS={...STORE,store_name:STORE.name};

  const[{data:p,error:pe},{data:m,error:me}]=await Promise.all([
    db.from('restart_merch_products').select('*,restart_merch_variants(*)').eq('store_id',STORE.id).eq('is_active',true).order('sort_order'),
    db.from('restart_store_payment_methods').select('*').eq('store_id',STORE.id).eq('is_enabled',true).order('sort_order')
  ]);
  if(pe||me)throw (pe||me);
  PRODUCTS=p||[];
  VARIANTS=PRODUCTS.flatMap(x=>x.restart_merch_variants||[]);
  METHODS=m||[];
  render()
}
document.getElementById('orderLookupBtn').onclick=lookupOrder;
RestartI18n.mount();
RestartI18n.onChange(()=>{LANG=RestartI18n.language();if(E)render()});
init().catch(e=>app.innerHTML=RestartI18n.t('<section class="rr-card rr-empty"><h3>เปิดร้านค้าไม่ได้</h3><div>')+esc(e.message)+'</div></section>');
