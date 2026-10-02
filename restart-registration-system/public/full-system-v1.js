(()=>{
const baseRender=render;
const baseRenderEventPreview=renderEventPreview;
const baseRenderRunnerForms=renderRunnerForms;
const baseRefreshPrice=refreshPrice;
const baseTotalPrice=totalPrice;
const baseCurrentCatPrice=currentCatPrice;
const baseLangs=langs;
const basePreviewMedia=previewMedia;
const baseEventCard=eventCard;
const baseListEvents=listEvents;

let FULL_QUOTE=null;
let FULL_TRANSLATIONS={};
let FULL_LIST_TRANSLATIONS={};
let SHIRT_PRODUCTS=[];
let SHIRT_VARIANTS=[];
let quoteSeq=0;

function fullFlags(){return E?.feature_flags||{}}
function normalizeId(v){return String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'')}
function fullMoney(v){return Number(v||0).toLocaleString('th-TH',{maximumFractionDigits:2})}
function fullErr(err){return String(err?.message||err||'')}
async function fullApi(action,body={}){
  const res=await fetch(RESTART_REG_CONFIG.SUPABASE_URL+'/functions/v1/restart-registration-api?action='+encodeURIComponent(action),{
    method:'POST',
    headers:{'content-type':'application/json','apikey':RESTART_REG_CONFIG.SUPABASE_PUBLISHABLE_KEY},
    body:JSON.stringify(body)
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(data.error||('HTTP '+res.status));
  return data
}

currentCatPrice=function(c){
  if((E?.feature_flags||{}).category_pricing===false)return Number(E?.base_registration_price_thb||0);
  return baseCurrentCatPrice(c);
};

previewMedia=function(type){
  const f=fullFlags();
  if(f.media===false&&['GALLERY','AWARD'].includes(type))return[];
  if(f.showcase_media===false&&['SHIRT','MEDAL','TROPHY','COURSE_MAP','BACKGROUND'].includes(type))return[];
  if(f.sponsor_logos===false&&type==='SPONSOR')return[];
  return basePreviewMedia(type);
};

function translatedEvent(){
  const tr=FULL_TRANSLATIONS[lang];
  if(!tr)return null;
  return{
    name:tr.name||E.name,
    description:tr.description||E.description,
    location_name:tr.location_name||E.location_name
  };
}
function withEventTranslation(fn){
  if(!E)return fn();
  const tr=translatedEvent();if(!tr)return fn();
  const old={name:E.name,description:E.description,location_name:E.location_name};
  E.name=tr.name;E.description=tr.description;E.location_name=tr.location_name;
  try{return fn()}finally{Object.assign(E,old)}
}
async function loadFullTranslations(){
  if(!E?.id)return;
  const{data}=await db.from('restart_event_translations').select('*').eq('event_id',E.id);
  FULL_TRANSLATIONS={};(data||[]).forEach(x=>FULL_TRANSLATIONS[x.language]=x);
}
async function loadListTranslations(){
  const{data}=await db.from('restart_event_translations').select('*');
  FULL_LIST_TRANSLATIONS={};(data||[]).forEach(x=>{(FULL_LIST_TRANSLATIONS[x.event_id]||={})[x.language]=x});
}

async function loadShirtCatalog(){
  SHIRT_PRODUCTS=[];SHIRT_VARIANTS=[];
  if(!E?.id||!fullFlags().shirt_sales)return;
  const{data:products,error:pe}=await db.from('restart_merch_products').select('*').eq('event_id',E.id).eq('is_active',true).order('sort_order');
  if(pe)throw pe;
  SHIRT_PRODUCTS=products||[];
  const ids=SHIRT_PRODUCTS.map(x=>x.id);
  if(!ids.length)return;
  const{data:variants,error:ve}=await db.from('restart_merch_variants').select('*').in('product_id',ids).eq('is_active',true).order('sort_order');
  if(ve)throw ve;
  SHIRT_VARIANTS=variants||[];
}

langs=function(){
  const f=fullFlags(),allowed=f.multilingual===false?[E.default_language||'th']:(Array.isArray(E.languages)&&E.languages.length?E.languages:[E.default_language||'th']);
  if(!allowed.includes(lang))lang=allowed[0];
  langbar.innerHTML=allowed.map(x=>'<button class="'+(x===lang?'active':'')+'" data-l="'+x+'">'+x.toUpperCase()+'</button>').join('');
  langbar.onclick=e=>{
    const b=e.target.closest('[data-l]');if(!b)return;
    lang=b.dataset.l;localStorage.setItem('restart_lang',lang);
    if(registerMode&&E?.status==='OPEN')render();else renderEventPreview();
  };
};

eventCard=function(e,index,copy){
  const tr=FULL_LIST_TRANSLATIONS[e.id]?.[lang],clone0=tr?{...e,name:tr.name||e.name,description:tr.description||e.description,location_name:tr.location_name||e.location_name}:{...e};
  const ef=clone0.feature_flags||{};
  const clone={...clone0,logo_url:ef.logo===false?null:clone0.logo_url,banner_url:ef.banner===false?null:clone0.banner_url};
  let html=baseEventCard(clone,index,copy);
  if(clone.status==='OPEN'&&clone.feature_flags?.event_preview===false){
    html=html.replace('href="?event='+encodeURIComponent(clone.slug)+'"','href="?event='+encodeURIComponent(clone.slug)+'&register=1"');
  }
  return html;
};
listEvents=async function(){await loadListTranslations().catch(()=>{});return baseListEvents()};

function postPreviewFlags(){
  const f=fullFlags(),p=previewCopy();
  if(f.logo===false)document.querySelectorAll('.preview-event-logo').forEach(x=>x.remove());
  if(f.banner===false&&!firstPreviewMedia('BACKGROUND')){
    const hero=document.querySelector('.preview-hero');
    if(hero)hero.style.backgroundImage='linear-gradient(135deg,rgba(7,8,11,.97),rgba(28,20,45,.92))';
  }
  if(f.distances===false){
    document.querySelectorAll('.preview-race-distance').forEach(x=>x.style.display='none');
    document.querySelectorAll('.preview-hero-meta > div').forEach(x=>{if(x.querySelector('span')?.textContent===p.distance)x.style.display='none'});
  }
  if(f.capacity===false){
    document.querySelectorAll('.preview-hero-meta > div,.preview-race-grid > div').forEach(x=>{if(x.querySelector('span')?.textContent===p.capacity)x.style.display='none'});
  }
  const sponsors=previewMedia('SPONSOR');
  if(f.sponsor_logos!==false&&sponsors.length&&!document.getElementById('fullSponsorSection')){
    const sec=document.createElement('section');sec.id='fullSponsorSection';sec.className='preview-section';
    sec.innerHTML='<div class="preview-section-kicker">PARTNERS</div><h2>'+(lang==='th'?'ผู้สนับสนุน':'Sponsors')+'</h2><div class="row" style="flex-wrap:wrap;gap:18px">'+sponsors.map(x=>'<img src="'+esc(x.url)+'" alt="" style="width:150px;height:90px;object-fit:contain;background:#fff;border-radius:14px;padding:10px">').join('')+'</div>';
    document.querySelector('.preview-final-cta')?.before(sec);
  }
  injectPublicTools();
}

renderEventPreview=function(){
  if(E?.status==='OPEN'&&fullFlags().event_preview===false){
    history.replaceState({},'',location.pathname+'?event='+encodeURIComponent(E.slug)+'&register=1');
    return render();
  }
  const out=withEventTranslation(()=>baseRenderEventPreview());
  postPreviewFlags();
  return out;
};

function injectPublicTools(){
  const f=fullFlags();
  if(document.getElementById('fullPublicTools'))return;
  if(!(f.installments||f.edit_after_submit||f.cancellation||f.transfer_registration))return;
  const box=document.createElement('div');box.id='fullPublicTools';box.className='row';box.style.cssText='gap:8px;flex-wrap:wrap;margin-top:12px';
  if(f.installments)box.innerHTML+='<button type="button" class="btn soft" id="fullNextPaymentBtn">ชำระงวดถัดไป</button>';
  if(f.edit_after_submit||f.cancellation||f.transfer_registration)box.innerHTML+='<button type="button" class="btn soft" id="fullManageBtn">จัดการใบสมัคร</button>';
  (document.querySelector('.preview-hero-actions')||document.querySelector('.hero')||app)?.append(box);
  byId('fullNextPaymentBtn')?.addEventListener('click',openNextPayment);
  byId('fullManageBtn')?.addEventListener('click',openManageRegistration);
}

renderRunnerForms=function(){
  baseRenderRunnerForms();
  const f=fullFlags();
  if(f.insurance&&f.beneficiaries_multiple===false){
    document.querySelectorAll('[data-add-bene]').forEach(btn=>{
      const i=Number(btn.dataset.addBene),list=byId('beneList_'+i);
      if(list&&!list.children.length)addBene(i);
      btn.style.display='none';
    });
  }
  bindFormQuoteListeners();
};

function followerHTML(i){
  return '<div class="paybox" data-follower="'+i+'" style="margin-top:10px"><b>ผู้ติดตาม '+i+'</b><div class="grid2" style="margin-top:8px">'+
    '<label>ชื่อ-นามสกุล<input data-ff="full_name" required></label>'+
    '<label>เลขบัตร / Passport<input data-ff="id_document" required></label>'+
    '<label>เบอร์โทร<input data-ff="phone" type="tel"></label>'+
    '<label>ความสัมพันธ์<input data-ff="relationship"></label>'+
  '</div></div>';
}
function renderFollowers(){
  const host=byId('followersBox');if(!host)return;
  const pkg=P.find(x=>x.id===(byId('packageSel')?.value||'')),count=fullFlags().followers===false?0:Number(pkg?.follower_count||0);
  host.innerHTML=count?'<section class="rr-card"><h3>ข้อมูลผู้ติดตาม</h3><p class="muted">Package นี้รวมผู้ติดตาม '+count+' คน</p>'+Array.from({length:count},(_,i)=>followerHTML(i+1)).join('')+'</section>':'';
}
function collectFollowers(){
  return [...document.querySelectorAll('[data-follower]')].map((box,i)=>({
    follower_index:i+1,
    full_name:box.querySelector('[data-ff=full_name]').value.trim(),
    id_document:box.querySelector('[data-ff=id_document]').value.trim(),
    phone:box.querySelector('[data-ff=phone]').value.trim(),
    relationship:box.querySelector('[data-ff=relationship]').value.trim()
  }));
}

function merchProductName(p){return tr(p?.name)||p?.code||'เสื้อ'}
function merchProductDesc(p){return tr(p?.description)||''}
function merchUnitPrice(p,v){return Math.max(0,Number(p?.price_thb||0)+Number(v?.price_adjustment_thb||0))}
function collectMerchItems(){
  return [...document.querySelectorAll('[data-merch-variant]')].map(input=>({
    variant_id:input.dataset.merchVariant,
    qty:Math.max(0,Math.floor(Number(input.value||0)))
  })).filter(x=>x.qty>0)
}
function localMerchTotal(){
  return collectMerchItems().reduce((sum,item)=>{
    const v=SHIRT_VARIANTS.find(x=>x.id===item.variant_id),p=SHIRT_PRODUCTS.find(x=>x.id===v?.product_id);
    return sum+(p&&v?merchUnitPrice(p,v)*item.qty:0)
  },0)
}
function enforceMerchLimit(input){
  const pid=input.dataset.productId,p=SHIRT_PRODUCTS.find(x=>x.id===pid);if(!p)return;
  const peers=[...document.querySelectorAll('[data-product-id="'+CSS.escape(pid)+'"]')];
  const others=peers.filter(x=>x!==input).reduce((s,x)=>s+Math.max(0,Math.floor(Number(x.value||0))),0);
  const allowed=Math.max(0,Number(p.max_per_registration||10)-others);
  const requested=Math.max(0,Math.floor(Number(input.value||0)));
  if(requested>allowed){
    input.value=String(allowed);
    Swal.fire({icon:'info',title:'จำนวนเสื้อเกินที่กำหนด',text:merchProductName(p)+' ซื้อได้สูงสุด '+Number(p.max_per_registration||10)+' ตัวต่อใบสมัคร',timer:1800,showConfirmButton:false});
  }
}
function renderShirtSales(){
  const old=byId('shirtSalesBox');if(old)old.remove();
  if(!fullFlags().shirt_sales||!SHIRT_PRODUCTS.length)return;
  const payment=byId('priceBox')?.closest('.rr-card');if(!payment)return;
  const sec=document.createElement('section');sec.id='shirtSalesBox';sec.className='rr-card';
  const cards=SHIRT_PRODUCTS.map(p=>{
    const vars=SHIRT_VARIANTS.filter(v=>v.product_id===p.id);
    const rows=vars.map(v=>{
      const available=Math.max(0,Number(v.stock_qty||0)-Number(v.sold_qty||0));
      const max=Math.min(available,Number(p.max_per_registration||10));
      const price=merchUnitPrice(p,v);
      return '<div class="row space" style="gap:12px;padding:9px 0;border-top:1px solid rgba(127,127,127,.18)"><div><b>'+esc(v.size_label)+'</b>'+(v.sku?'<div class="muted" style="font-size:12px">'+esc(v.sku)+'</div>':'')+'<div class="muted">฿'+fullMoney(price)+'</div></div>'+(available>0?'<label style="min-width:120px">จำนวน<input data-merch-variant="'+esc(v.id)+'" data-product-id="'+esc(p.id)+'" type="number" min="0" max="'+max+'" step="1" value="0"></label>':'<span class="badge danger">หมด</span>')+'</div>'
    }).join('');
    return '<div class="paybox" style="margin-top:12px"><div class="row" style="align-items:flex-start;gap:14px">'+
      (p.image_url?'<img src="'+esc(p.image_url)+'" alt="" style="width:110px;height:110px;object-fit:cover;border-radius:14px;background:#eee">':'')+
      '<div style="flex:1;min-width:0"><div class="row space"><div><b style="font-size:18px">'+esc(merchProductName(p))+'</b><div class="muted">'+esc(merchProductDesc(p))+'</div></div><b>เริ่ม ฿'+fullMoney(p.price_thb)+'</b></div>'+
      '<div class="muted" style="margin-top:6px">ซื้อเพิ่มได้สูงสุด '+Number(p.max_per_registration||10)+' ตัวต่อใบสมัคร</div>'+rows+'</div></div></div>'
  }).join('');
  sec.innerHTML='<h3>ซื้อเสื้อเพิ่ม</h3><p class="muted">ส่วนนี้เป็นเสื้อซื้อเพิ่ม แยกจากไซส์เสื้อที่รวมอยู่ในการสมัคร</p>'+cards;
  payment.before(sec);
  sec.querySelectorAll('[data-merch-variant]').forEach(input=>{
    input.addEventListener('input',()=>{enforceMerchLimit(input);debouncedQuote()});
    input.addEventListener('change',()=>{enforceMerchLimit(input);refreshPrice()});
  });
}

function injectRegistrationFullUI(){
  const form=byId('regForm');if(!form)return;
  const f=fullFlags();
  if(!byId('followersBox')){
    const div=document.createElement('div');div.id='followersBox';byId('runnersBox')?.after(div);
  }
  renderFollowers();
  renderShirtSales();
  if(byId('packageSel')&&!P.length){const sec=byId('packageSel').closest('.rr-card');if(sec)sec.style.display='none'}

  if((f.promotions||f.discount_codes)&&!byId('fullDiscountBox')){
    const sec=document.createElement('section');sec.id='fullDiscountBox';sec.className='rr-card';
    sec.innerHTML='<h3>Promotion / Discount</h3>'+
      (f.discount_codes?'<label>Discount Code<div class="row"><input id="discountCode" placeholder="กรอกโค้ดส่วนลด"><button type="button" id="applyDiscountBtn" class="btn soft">ใช้โค้ด</button></div></label>':'')+
      '<div id="fullQuoteBreakdown" class="muted" style="margin-top:10px"></div>';
    const payment=byId('priceBox')?.closest('.rr-card');payment?.before(sec);
    byId('applyDiscountBtn')?.addEventListener('click',()=>refreshPrice());
  }

  if(f.pdpa&&!byId('pdpaConsent')){
    const submitCard=form.querySelector('section.rr-card:last-child');
    const sec=document.createElement('section');sec.className='rr-card';sec.id='pdpaBox';
    sec.innerHTML='<h3>PDPA / Consent</h3><div class="paybox" style="max-height:220px;overflow:auto;white-space:pre-wrap">'+esc(E.pdpa_text||'ข้าพเจ้ายินยอมให้ผู้จัดเก็บและใช้ข้อมูลที่จำเป็นสำหรับการสมัคร การชำระเงิน การประกัน และการจัดการแข่งขัน')+'</div><label style="display:flex;align-items:flex-start;gap:10px;margin-top:12px"><input id="pdpaConsent" type="checkbox" style="width:auto;margin-top:4px" required> <span>ยอมรับและให้ความยินยอมตามข้อความข้างต้น'+(E.pdpa_version?' · Version '+esc(E.pdpa_version):'')+'</span></label>';
    submitCard?.before(sec);
  }

  if(!byId('registrationUtilityBar')){
    const bar=document.createElement('section');bar.id='registrationUtilityBar';bar.className='rr-card';
    let html='<div class="row" style="gap:8px;flex-wrap:wrap">';
    if(fullFlags().route_animation!==false&&ROUTES.length)html+='<a class="btn soft" href="?event='+encodeURIComponent(E.slug)+'#routeSection">ดูเส้นทาง Animation</a>';
    if(f.installments)html+='<button type="button" class="btn soft" id="formNextPaymentBtn">ชำระงวดถัดไป</button>';
    if(f.edit_after_submit||f.cancellation||f.transfer_registration)html+='<button type="button" class="btn soft" id="formManageBtn">จัดการใบสมัคร</button>';
    html+='</div>';bar.innerHTML=html;form.prepend(bar);
    byId('formNextPaymentBtn')?.addEventListener('click',openNextPayment);
    byId('formManageBtn')?.addEventListener('click',openManageRegistration);
  }

  const cat=byId('categorySel');
  if(cat&&f.competition_categories!==false){
    const section=cat.closest('.rr-card');
    if(f.auto_category){
      cat.required=false;section.style.display='none';
    }else if(f.self_select_category===false){
      cat.required=false;
      if(C.length===1)cat.value=C[0].id;
      section.style.display='none';
    }
  }
  bindFormQuoteListeners();
}

render=function(){
  const out=withEventTranslation(()=>baseRender());
  injectRegistrationFullUI();
  refreshPrice();
  return out;
};

function bindFormQuoteListeners(){
  const form=byId('regForm');if(!form||form.dataset.fullQuoteBound)return;
  form.dataset.fullQuoteBound='1';
  form.addEventListener('change',e=>{
    if(e.target?.id==='slipFile'||e.target?.id==='pdpaConsent')return;
    if(e.target?.id==='packageSel')renderFollowers();
    refreshPrice();
  });
  form.addEventListener('input',e=>{
    if(e.target?.closest('[data-runner-card]')||e.target?.id==='discountCode'||e.target?.matches?.('[data-merch-variant]'))debouncedQuote();
  });
}
let quoteTimer=null;
function debouncedQuote(){clearTimeout(quoteTimer);quoteTimer=setTimeout(()=>refreshPrice(),350)}

function quoteReady(){
  const f=fullFlags(),count=registrationRunnerCount();
  let runners=[];try{runners=Array.from({length:count},(_,i)=>collectRunner(i+1))}catch(e){return false}
  if(f.competition_categories!==false){
    const cid=byId('categorySel')?.value||'';
    if(cid){
      const cat=C.find(x=>x.id===cid);if(!cat)return false;
      if((cat.min_age!=null||cat.max_age!=null)&&runners.some(r=>!r.birth_date))return false;
      if(['MALE','FEMALE'].includes(String(cat.gender_rule||''))&&runners.some(r=>!r.gender))return false;
    }else if(f.auto_category){
      const needsBirth=C.some(cat=>cat.min_age!=null||cat.max_age!=null);
      const needsGender=C.some(cat=>['MALE','FEMALE'].includes(String(cat.gender_rule||'')));
      if(needsBirth&&runners.some(r=>!r.birth_date))return false;
      if(needsGender&&runners.some(r=>!r.gender))return false;
    }else if(f.self_select_category===false&&C.length===1){
      const cat=C[0];
      if((cat.min_age!=null||cat.max_age!=null)&&runners.some(r=>!r.birth_date))return false;
      if(['MALE','FEMALE'].includes(String(cat.gender_rule||''))&&runners.some(r=>!r.gender))return false;
    }else return false;
  }
  return true
}

function quotePayload(){
  const count=registrationRunnerCount();
  let runners=[];
  try{runners=Array.from({length:count},(_,i)=>collectRunner(i+1))}catch(e){runners=[]}
  return{
    p_event_id:E.id,
    p_category_id:byId('categorySel')?.value||null,
    p_package_id:byId('packageSel')?.value||null,
    p_registration_type:registrationType(),
    p_runner_count:count,
    p_discount_code:byId('discountCode')?.value.trim()||null,
    p_runners:runners,
    p_merch_items:collectMerchItems()
  };
}
async function getFullQuote(silent=true){
  if(!quoteReady())return null;
  const seq=++quoteSeq,q=quotePayload();
  let data;
  try{
    data=await fullApi('price-quote',{
      event_id:q.p_event_id,category_id:q.p_category_id,package_id:q.p_package_id,
      registration_type:q.p_registration_type,runner_count:q.p_runner_count,
      discount_code:q.p_discount_code,runners:q.p_runners,merch_items:q.p_merch_items
    })
  }catch(error){if(!silent)throw error;return null}
  if(seq!==quoteSeq)return null;
  FULL_QUOTE=data;
  if(data?.category_id&&byId('categorySel')&&!byId('categorySel').value){
    byId('categorySel').value=data.category_id;
    refreshPackages();
  }
  return data;
}

totalPrice=function(){return FULL_QUOTE?Number(FULL_QUOTE.total_amount_thb||0):(baseTotalPrice()+localMerchTotal())};

refreshPrice=function(){
  FULL_QUOTE=null;
  baseRefreshPrice();
  getFullQuote(true).then(q=>{
    if(!q||!byId('priceBox'))return;
    baseRefreshPrice();
    const b=byId('fullQuoteBreakdown');
    const slip=byId('slipFile');if(slip)slip.required=Number(q.total_amount_thb||0)>0;
    if(b)b.innerHTML=
      'ก่อนส่วนลด <b>฿'+fullMoney(q.subtotal_amount_thb)+'</b>'+
      (Number(q.promotion_discount_thb||0)>0?' · Promotion <b>-฿'+fullMoney(q.promotion_discount_thb)+'</b>':'')+
      (Number(q.discount_code_discount_thb||0)>0?' · Code <b>-฿'+fullMoney(q.discount_code_discount_thb)+'</b>':'')+
      (Number(q.merchandise_amount_thb||0)>0?' · เสื้อเพิ่ม <b>฿'+fullMoney(q.merchandise_amount_thb)+'</b>':'')+
      ' · สุทธิ <b>฿'+fullMoney(q.total_amount_thb)+'</b>'+
      (q.promotion_name?'<br>Promotion: '+esc(q.promotion_name):'');
  }).catch(()=>{});
};

function fullSchedule(total){
  FULL_QUOTE={...(FULL_QUOTE||{}),total_amount_thb:total};
  return makeSchedule();
}

function validateFullClient(runners,followers){
  const f=fullFlags(),ids=runners.map(r=>r.id_normalized).filter(Boolean),beneIds=runners.flatMap(r=>(r.beneficiaries||[]).map(b=>normalizeId(b.id_document)).filter(Boolean)),fids=followers.map(x=>normalizeId(x.id_document)).filter(Boolean);
  if(new Set(ids).size!==ids.length)throw new Error('เลขบัตร/Passport ผู้แข่งขันซ้ำกัน');
  if(new Set(beneIds).size!==beneIds.length)throw new Error('เลขบัตร/Passport ผู้รับผลประโยชน์ซ้ำกัน');
  if(beneIds.some(x=>ids.includes(x)))throw new Error('เลขผู้รับผลประโยชน์ห้ามซ้ำกับผู้แข่งขัน');
  if(new Set(fids).size!==fids.length||fids.some(x=>ids.includes(x)))throw new Error('เลขบัตร/Passport ผู้ติดตามซ้ำกับผู้แข่งขันหรือผู้ติดตามคนอื่น');
  if(f.insurance){
    runners.forEach((r,i)=>{
      if(f.beneficiaries_multiple===false&&(r.beneficiaries||[]).length>1)throw new Error('ผู้จัดอนุญาตผู้รับผลประโยชน์ 1 คนต่อผู้แข่งขัน');
      if(f.beneficiary_total_100!==false&&Math.abs((r.beneficiaries||[]).reduce((s,b)=>s+Number(b.percentage||0),0)-100)>.001)throw new Error('ผู้รับผลประโยชน์ของผู้แข่งขันคนที่ '+(i+1)+' ต้องรวม 100%');
    });
  }
}

async function offerWaitlist(payload){
  const r=await Swal.fire({icon:'info',title:'จำนวนรับเต็มแล้ว',text:'ต้องการเข้าคิวรอหรือไม่?',showCancelButton:true,confirmButtonText:'เข้าคิวรอ',cancelButtonText:'ยกเลิก'});
  if(!r.isConfirmed)return;
  const data=await fullApi('join-waitlist',{payload:{...payload,slip_path:null,schedule:[]}});
  await Swal.fire({icon:'success',title:'เข้าคิวรอแล้ว',html:'ลำดับคิวปัจจุบัน <b>'+Number(data.queue_position||0)+'</b>',confirmButtonText:'ตกลง'});
}

submit=async function(e){
  e.preventDefault();
  let uploadedSlip=null;
  try{
    const f=fullFlags(),type=registrationType(),count=registrationRunnerCount(),runners=Array.from({length:count},(_,i)=>collectRunner(i+1)),followers=collectFollowers();
    if(type==='TEAM'&&f.team_name_required!==false&&!val('groupName'))throw new Error('กรุณาระบุชื่อทีม');
    if(f.competition_categories!==false&&f.auto_category!==true&&f.self_select_category!==false&&!byId('categorySel')?.value)throw new Error('กรุณาเลือกรุ่นการแข่งขัน');
    const pkg=P.find(x=>x.id===(byId('packageSel')?.value||'')),expectedFollowers=f.followers===false?0:Number(pkg?.follower_count||0);
    if(followers.length!==expectedFollowers)throw new Error('ข้อมูลผู้ติดตามไม่ครบตาม Package');
    validateFullClient(runners,followers);
    if(f.pdpa&&!byId('pdpaConsent')?.checked)throw new Error('กรุณายอมรับ PDPA / Consent');

    Swal.fire({title:'กำลังตรวจราคาและส่งใบสมัคร…',allowOutsideClick:false,didOpen:()=>Swal.showLoading()});
    const quote=await getFullQuote(false);if(!quote)throw new Error('คำนวณราคาไม่ได้');
    FULL_QUOTE=quote;
    const categoryId=quote.category_id||byId('categorySel')?.value||null;
    if(categoryId&&byId('categorySel'))byId('categorySel').value=categoryId;
    const schedule=makeSchedule();
    const total=Number(quote.total_amount_thb||0);
    const slipInput=byId('slipFile');

    if(f.slip_upload&&total>0){
      const file=slipInput?.files?.[0];if(!file)throw new Error('กรุณาอัปโหลดสลิป');
      uploadedSlip=await uploadPublicSlip(file,'registration');
    }

    const payload={
      event_id:E.id,category_id:categoryId,package_id:byId('packageSel')?.value||null,
      registration_type:type,group_name:val('groupName')||null,contact_runner_index:Number(byId('contactRunner')?.value||1),
      language:lang,payment_mode:document.querySelector('[name=paymode]:checked')?.value||'FULL',
      total_amount_thb:total,discount_code:byId('discountCode')?.value.trim()||null,
      pdpa_accepted:!f.pdpa||!!byId('pdpaConsent')?.checked,
      slip_path:uploadedSlip,schedule,runners,followers,merch_items:collectMerchItems()
    };
    let data;
    try{data=await fullApi('create-registration',{payload})}
    catch(error){
      if(fullErr(error).includes('WAITLIST_AVAILABLE')){
        uploadedSlip=null;
        Swal.close();return offerWaitlist(payload)
      }
      throw error;
    }
    Swal.fire({icon:'success',title:'สมัครสำเร็จ',html:'เลขที่สมัคร <b>'+esc(data.registration_code)+'</b><br>ผู้แข่งขัน <b>'+data.runner_count+'</b> คน'+(data.follower_count?'<br>ผู้ติดตาม <b>'+data.follower_count+'</b> คน':'')+(data.merchandise_qty?'<br>เสื้อซื้อเพิ่ม <b>'+data.merchandise_qty+'</b> ตัว · ฿'+fullMoney(data.merchandise_amount_thb):'')+'<br>ยอดสุทธิ <b>฿'+fullMoney(data.total_amount_thb)+'</b><br>สถานะ <b>'+esc(data.status)+'</b>',confirmButtonText:'ตกลง'}).then(()=>location.reload())
  }catch(err){
    Swal.fire('สมัครไม่สำเร็จ',fullRegistrationError(err),'error')
  }
};

function fullRegistrationError(err){
  const s=fullErr(err),map={
    AUTO_CATEGORY_NOT_FOUND:'ไม่พบรุ่นการแข่งขันที่ตรงกับอายุ/เพศ',
    CATEGORY_NOT_ELIGIBLE:'อายุหรือเพศไม่ตรงกับรุ่นการแข่งขัน',
    DISCOUNT_CODE_INVALID:'Discount Code ไม่ถูกต้อง หมดอายุ หรือใช้ครบแล้ว',
    DISCOUNT_CODES_DISABLED:'Event นี้ไม่ได้เปิดใช้ Discount Code',
    FOLLOWER_COUNT_MISMATCH:'จำนวนผู้ติดตามไม่ตรงกับ Package',
    FOLLOWERS_DISABLED:'Event นี้ไม่ได้เปิดรับผู้ติดตาม',
    DUPLICATE_FOLLOWER_ID:'เลขบัตร/Passport ผู้ติดตามซ้ำ',
    MULTIPLE_BENEFICIARIES_DISABLED:'อนุญาตผู้รับผลประโยชน์เพียง 1 คน',
    PDPA_REQUIRED:'กรุณายอมรับ PDPA / Consent',
    SLIP_REQUIRED:'กรุณาอัปโหลดสลิป',
    EVENT_CAPACITY_EXCEEDED:'จำนวนรับเต็มแล้ว',
    CATEGORY_CAPACITY_EXCEEDED:'รุ่นนี้เต็มแล้ว',
    WAITLIST_DISABLED:'Event นี้ไม่ได้เปิดคิวรอ',
    SHIRT_SALES_DISABLED:'Event นี้ไม่ได้เปิดขายเสื้อเพิ่ม',
    SHIRT_VARIANT_NOT_AVAILABLE:'ไซส์เสื้อที่เลือกไม่พร้อมจำหน่าย',
    SHIRT_PRODUCT_NOT_AVAILABLE:'เสื้อที่เลือกไม่พร้อมจำหน่าย',
    SHIRT_SALE_NOT_OPEN:'ยังไม่ถึงเวลาเปิดขายเสื้อ',
    SHIRT_SALE_CLOSED:'ปิดขายเสื้อแล้ว',
    SHIRT_MAX_PER_REGISTRATION:'จำนวนเสื้อเกินที่ผู้จัดกำหนดต่อใบสมัคร',
    SHIRT_OUT_OF_STOCK:'เสื้อไซส์ที่เลือกหมดหรือจำนวนคงเหลือไม่พอ'
  };
  const k=Object.keys(map).find(k=>s.includes(k));return k?map[k]:registrationErrorMessage(err)
}

async function uploadPublicSlip(file,prefix='next'){
  const form=new FormData();form.append('event_slug',E.slug);form.append('purpose',prefix);form.append('slip',file);
  const res=await fetch(RESTART_REG_CONFIG.SUPABASE_URL+'/functions/v1/restart-registration-api?action=upload-slip',{
    method:'POST',headers:{'apikey':RESTART_REG_CONFIG.SUPABASE_PUBLISHABLE_KEY},body:form
  });
  const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||('HTTP '+res.status));
  return data.path
}
async function openNextPayment(){
  const ask=await Swal.fire({title:'ชำระงวดถัดไป',input:'text',inputLabel:'เลขบัตรประชาชน / Passport ของผู้แข่งขัน',inputPlaceholder:'กรอกเลขบัตรหรือ Passport',showCancelButton:true,confirmButtonText:'ค้นหา',preConfirm:v=>v.trim()||Swal.showValidationMessage('กรุณากรอกข้อมูล')});
  if(!ask.isConfirmed)return;
  const id=ask.value.trim();
  let data;try{data=await fullApi('next-payment-lookup',{event_slug:E.slug,id_document:id})}catch(error){return Swal.fire('ค้นหาไม่สำเร็จ',fullErr(error),'error')}
  if(data.fully_paid)return Swal.fire({icon:'success',title:'ชำระครบแล้ว',html:'เลขสมัคร <b>'+esc(data.registration_code)+'</b>'});
  if(data.payment_status==='PENDING_REVIEW')return Swal.fire('รอตรวจสลิป','งวดนี้ส่งสลิปแล้ว กำลังรอ Admin ตรวจสอบ','info');

  const r=await Swal.fire({title:'งวด '+data.installment_no,html:'<div style="text-align:left"><p>เลขสมัคร <b>'+esc(data.registration_code)+'</b></p><p>ผู้สมัคร '+esc(data.runner_name||'')+'</p><p>ยอดชำระ <b>฿'+fullMoney(data.amount_due_thb)+'</b></p><label>อัปโหลดสลิป<input id="nextSlip" type="file" accept="image/*,application/pdf" class="swal2-file" style="margin:0;width:100%"></label></div>',showCancelButton:true,confirmButtonText:'ส่งสลิป',preConfirm:()=>{const file=nextSlip.files?.[0];if(!file)return Swal.showValidationMessage('กรุณาเลือกสลิป');return file}});
  if(!r.isConfirmed)return;
  let path=null;try{
    Swal.fire({title:'กำลังส่งสลิป…',allowOutsideClick:false,didOpen:()=>Swal.showLoading()});
    path=await uploadPublicSlip(r.value,'installment');
    const done=await fullApi('next-payment-submit',{event_slug:E.slug,id_document:id,slip_path:path});
    Swal.fire({icon:'success',title:'ส่งสลิปแล้ว',html:'งวด '+done.installment_no+' · ฿'+fullMoney(done.amount_due_thb)+'<br>สถานะ '+esc(done.status)})
  }catch(e){Swal.fire('ส่งไม่สำเร็จ',fullErr(e),'error')}
}

async function openManageRegistration(){
  const ask=await Swal.fire({title:'จัดการใบสมัคร',width:700,html:'<div style="text-align:left"><label>เลขที่สมัคร<input id="mgCode" class="swal2-input" style="margin:0" placeholder="RST-..."></label><label>เลขบัตร/Passport ของผู้ติดต่อหลัก<input id="mgId" class="swal2-input" style="margin:0"></label></div>',showCancelButton:true,confirmButtonText:'ค้นหา',preConfirm:()=>{const code=mgCode.value.trim(),id=mgId.value.trim();if(!code||!id)return Swal.showValidationMessage('กรุณากรอกข้อมูลให้ครบ');return{code,id}}});
  if(!ask.isConfirmed)return;
  return loadManageRegistration(ask.value.code,ask.value.id);
}
async function loadManageRegistration(code,id){
  let data;try{data=await fullApi('manage-lookup',{event_slug:E.slug,registration_code:code,id_document:id})}catch(error){return Swal.fire('ไม่พบใบสมัคร',fullErr(error),'error')}
  const ps=data.participants||[];
  const html='<div style="text-align:left"><p><b>'+esc(data.registration_code)+'</b> · '+esc(data.registration_type)+' · สถานะ '+esc(data.status)+'</p>'+
    ps.map(p=>'<div class="paybox" style="margin:8px 0"><b>'+p.runner_index+'. '+esc((p.first_name||'')+' '+(p.last_name||''))+'</b><div class="muted">'+esc(p.id_document||'')+' · '+esc(p.phone||'')+' · เสื้อ '+esc(p.shirt_size||'—')+'</div><div class="row" style="margin-top:8px">'+(data.can_edit?'<button class="btn sm soft" data-mg-edit="'+p.runner_index+'">แก้ไข</button>':'')+(data.can_transfer?'<button class="btn sm soft" data-mg-transfer="'+p.runner_index+'">โอนสิทธิ์</button>':'')+'</div></div>').join('')+
    (data.can_cancel?'<button class="btn danger" id="mgCancel" style="width:100%;margin-top:10px">ยกเลิกใบสมัคร</button>':'')+'</div>';
  Swal.fire({title:'ใบสมัคร',html,width:850,showConfirmButton:false,showCloseButton:true,didOpen:()=>{
    document.querySelectorAll('[data-mg-edit]').forEach(b=>b.onclick=()=>editRunner(code,id,data,Number(b.dataset.mgEdit)));
    document.querySelectorAll('[data-mg-transfer]').forEach(b=>b.onclick=()=>transferRunner(code,id,data,Number(b.dataset.mgTransfer)));
    byId('mgCancel')?.addEventListener('click',()=>cancelRegistration(code,id));
  }});
}
async function editRunner(code,id,data,idx){
  const p=(data.participants||[]).find(x=>Number(x.runner_index)===idx);if(!p)return;
  const sizes=E.field_settings?.shirt_size?.options||[];
  const r=await Swal.fire({title:'แก้ไขผู้แข่งขัน '+idx,width:800,showCancelButton:true,html:'<div class="grid2" style="text-align:left">'+
    '<label>ชื่อ<input id="erFirst" class="swal2-input" style="margin:0" value="'+esc(p.first_name||'')+'"></label>'+
    '<label>นามสกุล<input id="erLast" class="swal2-input" style="margin:0" value="'+esc(p.last_name||'')+'"></label>'+
    '<label>โทรศัพท์<input id="erPhone" class="swal2-input" style="margin:0" value="'+esc(p.phone||'')+'"></label>'+
    '<label>วันเกิด<input id="erBirth" type="date" class="swal2-input" style="margin:0" value="'+esc(p.birth_date||'')+'"></label>'+
    '<label>เพศ<select id="erGender" class="swal2-select" style="margin:0;width:100%"><option value="MALE" '+(p.gender==='MALE'?'selected':'')+'>ชาย</option><option value="FEMALE" '+(p.gender==='FEMALE'?'selected':'')+'>หญิง</option><option value="OTHER" '+(p.gender==='OTHER'?'selected':'')+'>อื่นๆ</option></select></label>'+
    '<label>ไซส์เสื้อ<select id="erShirt" class="swal2-select" style="margin:0;width:100%"><option value="">—</option>'+sizes.map(s=>'<option '+(p.shirt_size===s?'selected':'')+'>'+esc(s)+'</option>').join('')+'</select></label>'+
    '<label style="grid-column:1/-1">ที่อยู่<textarea id="erAddress" class="swal2-textarea" style="margin:0;width:100%">'+esc(p.address||'')+'</textarea></label>'+
    '<label>เบอร์ฉุกเฉิน<input id="erEmergency" class="swal2-input" style="margin:0" value="'+esc(p.emergency_phone||'')+'"></label>'+
    '<label>ความสัมพันธ์ฉุกเฉิน<input id="erRelation" class="swal2-input" style="margin:0" value="'+esc(p.emergency_relation||'')+'"></label>'+
    '</div>',preConfirm:()=>({runner_index:idx,first_name:erFirst.value.trim(),last_name:erLast.value.trim(),phone:erPhone.value.trim(),birth_date:erBirth.value,gender:erGender.value,shirt_size:erShirt.value,address:erAddress.value.trim(),emergency_phone:erEmergency.value.trim(),emergency_relation:erRelation.value.trim()})});
  if(!r.isConfirmed)return;try{await fullApi('manage-action',{event_slug:E.slug,registration_code:code,id_document:id,manage_action:'EDIT',payload:r.value})}catch(error){return Swal.fire('แก้ไขไม่ได้',fullErr(error),'error')}Swal.fire({icon:'success',title:'แก้ไขแล้ว'}).then(()=>loadManageRegistration(code,id))
}
async function transferRunner(code,id,data,idx){
  const sizes=E.field_settings?.shirt_size?.options||[];
  const r=await Swal.fire({title:'โอนสิทธิ์ผู้แข่งขัน '+idx,width:820,showCancelButton:true,html:'<div class="grid2" style="text-align:left">'+
    '<label>ชื่อ<input id="tfFirst" class="swal2-input" style="margin:0"></label><label>นามสกุล<input id="tfLast" class="swal2-input" style="margin:0"></label>'+
    '<label>เลขบัตร / Passport<input id="tfId" class="swal2-input" style="margin:0"></label><label>โทรศัพท์<input id="tfPhone" class="swal2-input" style="margin:0"></label>'+
    '<label>วันเกิด<input id="tfBirth" type="date" class="swal2-input" style="margin:0"></label><label>เพศ<select id="tfGender" class="swal2-select" style="margin:0;width:100%"><option value="MALE">ชาย</option><option value="FEMALE">หญิง</option><option value="OTHER">อื่นๆ</option></select></label>'+
    '<label>ไซส์เสื้อ<select id="tfShirt" class="swal2-select" style="margin:0;width:100%"><option value="">—</option>'+sizes.map(s=>'<option>'+esc(s)+'</option>').join('')+'</select></label>'+
    '<label style="grid-column:1/-1">ที่อยู่<textarea id="tfAddress" class="swal2-textarea" style="margin:0;width:100%"></textarea></label>'+
    (fullFlags().insurance?'<div style="grid-column:1/-1" class="paybox"><b>ผู้รับผลประโยชน์ของผู้รับโอน</b><div class="grid2"><label>ชื่อ<input id="tfBName"></label><label>เลขบัตร/Passport<input id="tfBId"></label><label>ความสัมพันธ์<input id="tfBRel"></label><label>เปอร์เซ็นต์<input id="tfBPct" type="number" value="100"></label></div></div>':'')+
    '</div>',preConfirm:()=>{
      if(!tfFirst.value.trim()||!tfLast.value.trim()||!tfId.value.trim())return Swal.showValidationMessage('กรุณากรอกชื่อ นามสกุล และ ID/Passport');
      const payload={runner_index:idx,first_name:tfFirst.value.trim(),last_name:tfLast.value.trim(),id_document:tfId.value.trim(),phone:tfPhone.value.trim(),birth_date:tfBirth.value,gender:tfGender.value,shirt_size:tfShirt.value,address:tfAddress.value.trim()};
      if(fullFlags().insurance){if(!tfBName.value.trim()||!tfBId.value.trim()||!tfBRel.value.trim())return Swal.showValidationMessage('กรุณากรอกผู้รับผลประโยชน์');payload.beneficiaries=[{full_name:tfBName.value.trim(),id_document:tfBId.value.trim(),relationship:tfBRel.value.trim(),percentage:Number(tfBPct.value||100)}]}
      return payload;
    }});
  if(!r.isConfirmed)return;try{await fullApi('manage-action',{event_slug:E.slug,registration_code:code,id_document:id,manage_action:'TRANSFER',payload:r.value})}catch(error){return Swal.fire('โอนสิทธิ์ไม่ได้',fullErr(error),'error')}Swal.fire({icon:'success',title:'โอนสิทธิ์แล้ว'})
}
async function cancelRegistration(code,id){
  const r=await Swal.fire({title:'ยืนยันยกเลิกใบสมัคร?',input:'text',inputLabel:'เหตุผล (ถ้ามี)',showCancelButton:true,confirmButtonText:'ยืนยันยกเลิก',confirmButtonColor:'#b42318'});if(!r.isConfirmed)return;
  try{await fullApi('manage-action',{event_slug:E.slug,registration_code:code,id_document:id,manage_action:'CANCEL',payload:{reason:r.value||null}})}
  catch(error){return Swal.fire('ยกเลิกไม่ได้',fullErr(error),'error')}Swal.fire({icon:'success',title:'ยกเลิกใบสมัครแล้ว'})
}

async function initFullSystem(){
  let tries=0;while(!E&&tries++<80)await new Promise(r=>setTimeout(r,100));
  if(!E)return;
  await Promise.all([
    loadFullTranslations().catch(()=>{}),
    loadShirtCatalog().catch(e=>console.warn('shirt catalog',e))
  ]);
  langs();
  if(registerMode&&E.status==='OPEN')render();else renderEventPreview();
}
initFullSystem();

Object.assign(window,{openNextPayment,openManageRegistration});
})();