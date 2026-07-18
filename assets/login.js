const { supabase, toast } = window.TrailApp;

(async () => {
  const { data } = await supabase.auth.getSession();
  if (data.session) window.location.href = '/index.html';
})();

document.querySelector('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  const email = document.querySelector('#email').value.trim();
  const password = document.querySelector('#password').value;

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  button.disabled = false;
  if (error) return toast(error.message, 'error');
  window.location.href = '/index.html';
});

document.querySelector('#signup-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  const displayName = document.querySelector('#signup-name').value.trim();
  const email = document.querySelector('#signup-email').value.trim();
  const password = document.querySelector('#signup-password').value;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } }
  });
  button.disabled = false;
  if (error) return toast(error.message, 'error');

  if (data.session) {
    toast('สร้างบัญชีสำเร็จ', 'success');
    window.location.href = '/index.html';
  } else {
    toast('สร้างบัญชีแล้ว กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ', 'success');
  }
});
