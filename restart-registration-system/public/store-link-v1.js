(()=>{
const prevPreview=renderEventPreview;
const prevRender=render;
function injectStoreLink(){
  if(!E?.feature_flags?.storefront)return;
  if(document.getElementById('restartStoreEntry'))return;
  const a=document.createElement('a');
  a.id='restartStoreEntry';a.className='btn primary';
  a.href='shop.html?event='+encodeURIComponent(E.slug);
  a.textContent=RestartI18n.t("ร้านค้า / ซื้อสินค้า");
  const target=document.querySelector('.preview-hero-actions')||document.getElementById('registrationUtilityBar')||document.querySelector('#regForm .rr-card')||document.querySelector('.preview-final-cta');
  if(target){
    let actions=target;
    if(target.id==='registrationUtilityBar')actions=target.querySelector('.row')||target;
    else if(target.matches('#regForm .rr-card')){
      actions=document.createElement('div');
      actions.className='row store-entry-actions';
      actions.style.marginTop='12px';
      target.appendChild(actions);
    }
    actions.appendChild(a);
  }
}
renderEventPreview=function(){const out=prevPreview();queueMicrotask(injectStoreLink);return out};
render=function(){const out=prevRender();queueMicrotask(injectStoreLink);return out};
setTimeout(injectStoreLink,0);
})();
