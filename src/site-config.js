/* Pengaturan situs dari CMS (musim stiker, tautan dukungan) dan hitungan penggunaan anonim.
   Hanya mengirim nama kejadian, id tema, dan id filter; tanpa foto, ID browser, atau teks pengguna. */
export const DEFAULT_SUPPORT = { enabled: true, trakteerUrl: 'https://trakteer.id/snappiestudio/gift', kofiUrl: 'https://ko-fi.com/snappiestudio' };
export const siteConfig = { seasons: {}, support: { ...DEFAULT_SUPPORT } };

const DAY = /^20\d{2}-\d{2}-\d{2}$/;
const link = (value, prefix) => typeof value === 'string' && value.length <= 200 && value.startsWith(prefix) ? value : '';

// Respons dianggap tidak tepercaya: hanya bentuk yang dikenal yang dipakai.
export function sanitizeConfig(value) {
  const seasons = {};
  for (const [id, item] of Object.entries(value?.seasons && typeof value.seasons === 'object' ? value.seasons : {})) {
    if (!/^[a-z]{3,12}$/.test(id) || !['auto', 'on', 'off'].includes(item?.mode)) continue;
    seasons[id] = DAY.test(item.from) && DAY.test(item.to) && item.mode === 'auto' ? { mode: 'auto', from: item.from, to: item.to } : { mode: item.mode };
  }
  const source = value?.support;
  const support = source && typeof source === 'object' && typeof source.enabled === 'boolean'
    ? { enabled: source.enabled, trakteerUrl: link(source.trakteerUrl, 'https://trakteer.id/'), kofiUrl: link(source.kofiUrl, 'https://ko-fi.com/') }
    : { ...DEFAULT_SUPPORT };
  return { seasons, support };
}

let loading;
export function loadSiteConfig() { return loading ||= fetchSiteConfig(); }

async function fetchSiteConfig() {
  try {
    const response = await window.fetch('/api/site-config', { cache: 'no-store', credentials: 'omit', signal: window.AbortSignal.timeout(5000) });
    if (!response.ok) return false;
    Object.assign(siteConfig, sanitizeConfig(await response.json()));
    return true;
  } catch { return false; }
}

export function track(event, extra = {}) {
  try {
    if (localStorage.getItem('snappie-maintenance') === '1') return;
    window.fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event, ...extra }),
      keepalive: true, credentials: 'omit', cache: 'no-store' }).catch(() => {});
  } catch { /* pencatatan tidak boleh mengganggu pemakaian */ }
}
