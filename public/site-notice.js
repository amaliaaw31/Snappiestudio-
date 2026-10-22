let currentNotice;
let currentKey = '';
let dismissedKey = '';
let loading = false;

async function showNotice() {
  if (loading || document.hidden) return;
  loading = true;
  try {
    const response = await fetch('/api/site-content', { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(5000) });
    if (!response.ok) return;
    const value = await response.json();
    if (!value.enabled || !value.message) {
      currentNotice?.remove(); currentNotice = null; currentKey = ''; dismissedKey = ''; return;
    }
    const key = JSON.stringify([value.title, value.message, value.updatedAt]);
    if (key === currentKey && (currentNotice?.isConnected || key === dismissedKey)) return;
    currentNotice?.remove(); currentKey = key;
    const notice = document.createElement('aside'); notice.className = 'site-notice'; notice.setAttribute('aria-label', 'Pengumuman Snappie Studio');
    const content = document.createElement('div');
    if (value.title) { const title = document.createElement('strong'); title.textContent = value.title; content.append(title); }
    const message = document.createElement('p'); message.textContent = value.message; content.append(message);
    const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Tutup'; close.setAttribute('aria-label', 'Tutup pengumuman');
    close.addEventListener('click', () => { notice.remove(); dismissedKey = key; });
    notice.append(content, close); document.body.append(notice); currentNotice = notice;
  } catch {}
  finally { loading = false; }
}
showNotice();
window.setInterval(showNotice, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) showNotice(); });
