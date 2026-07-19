(async()=>{
  const m=document.getElementById('msg');
  try{if(await App.auth(false))await App.routeAfterLogin()}catch(e){m.textContent=e.message}
  document.getElementById('login').addEventListener('submit',async e=>{
    e.preventDefault();m.textContent='';const b=e.submitter;b.disabled=true;
    try{const{error}=await App.db.auth.signInWithPassword({email:document.getElementById('email').value.trim(),password:document.getElementById('password').value});if(error)throw error;await App.routeAfterLogin()}
    catch(x){m.textContent=x.message}finally{b.disabled=false}
  });
  document.getElementById('signup').addEventListener('submit',async e=>{
    e.preventDefault();m.textContent='';const b=e.submitter;b.disabled=true;
    try{
      const{data,error}=await App.db.auth.signUp({
        email:document.getElementById('signupEmail').value.trim(),
        password:document.getElementById('signupPassword').value,
        options:{data:{
          display_name:document.getElementById('signupName').value.trim(),
          requested_org_code:document.getElementById('signupOrgCode').value.trim()
        }}
      });
      if(error)throw error;
      m.style.color='var(--primary)';
      if(data.session){location.replace('pending.html')}
      else m.textContent='สมัครสำเร็จ กรุณายืนยันอีเมล แล้วรอ Admin อนุมัติบัญชี';
    }catch(x){m.style.color='';m.textContent=x.message}finally{b.disabled=false}
  });
})();
