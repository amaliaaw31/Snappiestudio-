import { excludeMaintenanceBrowser } from './cms-maintenance.js';

// Remove credentials left by older versions of the CMS.
try { sessionStorage.removeItem('snappieCmsAuth'); } catch {}
const status = document.getElementById('status');
const notice = new window.URLSearchParams(location.search).get('updated');
if (notice === 'password') status.textContent = 'Password berhasil diubah. Masuk kembali dengan password baru.';
if (notice === 'sessions') status.textContent = 'Semua sesi sudah diakhiri. Masuk kembali untuk melanjutkan.';
document.getElementById('login').addEventListener('submit', async event => {
  event.preventDefault();
  const submit = document.getElementById('login-submit');
  const password = document.getElementById('password');
  const otp = document.getElementById('login-otp');
  let awaitingOtp = false;
  submit.disabled = true;
  status.textContent = 'Memeriksa…';
  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: document.getElementById('username').value, password: password.value, otp: otp.value.trim() }),
    });
    if (response.status === 429) {
      status.textContent = 'Terlalu banyak percobaan. Tunggu beberapa menit sebelum mencoba lagi.';
      return;
    }
    if (!response.ok) throw new Error('Login ditolak');
    const data = await response.json();
    if (data.mfaRequired) {
      awaitingOtp = true;
      document.getElementById('login-otp-fields').hidden = false;
      otp.required = true;
      otp.focus();
      status.textContent = 'Masukkan kode autentikator atau satu kode pemulihan untuk menyelesaikan login.';
      return;
    }
    password.value = '';
    otp.value = '';
    const { csrfToken } = data;
    await excludeMaintenanceBrowser(csrfToken);
    location.replace('/cms/dashboard');
  } catch {
    status.textContent = 'Login gagal. Periksa username, password, dan kode 2FA jika aktif. Kode yang sudah dipakai tidak dapat dipakai lagi.';
  } finally {
    if (!awaitingOtp) { password.value = ''; otp.value = ''; }
    submit.disabled = false;
  }
});

window.addEventListener('pagehide', () => {
  document.getElementById('password').value = '';
  document.getElementById('login-otp').value = '';
});
