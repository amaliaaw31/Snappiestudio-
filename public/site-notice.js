async function showNotice() {
  try {
    const response = await fetch('/api/site-content', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!response.ok) return;
    const value = await response.json();
    if (!value.enabled || !value.message) return;
    const notice = document.createElement('aside'); notice.className = 'site-notice'; notice.setAttribute('aria-label', 'Pengumuman Snappie Studio');
    const content = document.createElement('div');
    if (value.title) { const title = document.createElement('strong'); title.textContent = value.title; content.append(title); }
    const message = document.createElement('p'); message.textContent = value.message; content.append(message);
    const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Tutup'; close.setAttribute('aria-label', 'Tutup pengumuman'); close.addEventListener('click', () => notice.remove());
    notice.append(content, close); document.body.append(notice);
  } catch {}
}
showNotice();
