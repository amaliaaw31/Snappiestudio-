import { excludeMaintenanceBrowser } from './cms-maintenance.js';

// Remove credentials left by older versions of the CMS.
try { sessionStorage.removeItem('snappieCmsAuth'); } catch {}
const status = document.getElementById('status');
document.getElementById('login').addEventListener('submit', async event => {
  event.preventDefault();
  const submit = document.getElementById('login-submit');
  const password = document.getElementById('password');
  submit.disabled = true;
  status.textContent = 'Memeriksa…';
  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: document.getElementById('username').value, password: password.value }),
    });
    password.value = '';
    if (response.status === 429) {
      status.textContent = 'Terlalu banyak percobaan. Tunggu beberapa menit sebelum mencoba lagi.';
      return;
    }
    if (!response.ok) throw new Error('Login ditolak');
    const { csrfToken } = await response.json();
    await excludeMaintenanceBrowser(csrfToken);
    location.replace('/cms/dashboard');
  } catch {
    status.textContent = 'Login gagal. Periksa username, password, atau layanan CMS.';
  } finally {
    password.value = '';
    submit.disabled = false;
  }
});
