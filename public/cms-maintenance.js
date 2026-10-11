export async function excludeMaintenanceBrowser(csrfToken) {
  try {
    const visitorId = localStorage.getItem('snappie-visitor-id') || window.crypto.randomUUID();
    localStorage.setItem('snappie-visitor-id', visitorId);
    const response = await fetch('/api/admin/exclude-browser', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ visitorId }),
    });
    if (!response.ok) return false;
    localStorage.setItem('snappie-maintenance', '1');
    return true;
  } catch { return false; }
}
