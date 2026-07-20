(async()=>{
  const A=window.App;
  const m=document.getElementById('msg');
  const setMessage=(text,type='')=>{m.textContent=text;m.className=`message ${type}`;m.style.color=type==='ok'?'var(--primary)':''};

  try{
    if(await A.auth(false)) await A.routeAfterLogin();
  }catch(e){setMessage(e.message)}

  document.getElementById('login').addEventListener('submit',async e=>{
    e.preventDefault();setMessage('');const b=e.submitter;b.disabled=true;
    try{
      const{error}=await A.db.auth.signInWithPassword({
        email:document.getElementById('email').value.trim(),
        password:document.getElementById('password').value
      });
      if(error)throw error;
      await A.auth(true);
      await A.ensureProfile();
      await A.routeAfterLogin();
    }catch(x){setMessage(x.message)}finally{b.disabled=false}
  });

  document.getElementById('signup').addEventListener('submit',async e=>{
    e.preventDefault();setMessage('');const b=e.submitter;b.disabled=true;
    try{
      const email=document.getElementById('signupEmail').value.trim().toLowerCase();
      const password=document.getElementById('signupPassword').value;
      const displayName=document.getElementById('signupName').value.trim();
      const requestedOrgCode=document.getElementById('signupOrgCode').value.trim();
      const{data,error}=await A.db.auth.signUp({
        email,password,
        options:{data:{display_name:displayName,requested_org_code:requestedOrgCode}}
      });
      if(error)throw error;
      if(!data?.session){
        setMessage('Supabase Project นี้ยังเปิด Confirm email อยู่ ระบบ Trail Scan ไม่ใช้การยืนยันอีเมล กรุณาปิด Authentication > Providers > Email > Confirm email แล้วลบบัญชีทดสอบเดิมก่อนสมัครใหม่');
        return;
      }
      await A.auth(true);
      const profile=await A.ensureProfile();
      if(!profile) throw new Error('สร้างบัญชี Auth แล้ว แต่สร้าง profiles ไม่สำเร็จ กรุณารัน SQL 006');
      setMessage('สมัครสำเร็จ กำลังเปิดหน้ารอ Admin อนุมัติ','ok');
      location.replace('pending.html');
    }catch(x){setMessage(x.message)}finally{b.disabled=false}
  });
})();
