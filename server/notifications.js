export function discordWebhook(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid Discord webhook'); }
  if (url.protocol !== 'https:' || url.hostname !== 'discord.com' || url.port || url.username || url.password || url.hash
    || !/^\/api\/(?:v\d+\/)?webhooks\/\d{15,22}\/[A-Za-z0-9._-]{20,200}\/?$/.test(url.pathname)
    || [...url.searchParams.keys()].some(key => !['wait', 'thread_id'].includes(key))
    || (url.searchParams.has('thread_id') && !/^\d{15,22}$/.test(url.searchParams.get('thread_id')))) {
    throw new Error('Invalid Discord webhook');
  }
  url.searchParams.set('wait', 'true');
  return url;
}

export function notificationDestination(env) {
  const value = env.CMS_DISCORD_WEBHOOK || env.CMS_ALERT_WEBHOOK;
  if (!value) return null;
  const discord = !!env.CMS_DISCORD_WEBHOOK || /^https:\/\/discord\.com\//.test(value);
  if (discord) return { channel: 'discord', url: discordWebhook(value) };
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('HTTPS webhook required');
  return { channel: 'webhook', url };
}

export async function sendNotification(env, issues, at, fetchImpl = fetch) {
  const destination = notificationDestination(env);
  if (!destination) throw new Error('Notifications not configured');
  const labels = { website: 'situs tidak merespons', backend: 'backend bermasalah', database: 'integritas database bermasalah', storage: 'ruang penyimpanan hampir habis', backup: 'backup gagal atau terlambat', geoip: 'pembaruan GeoIP gagal atau terlambat', offsite: 'backup luar server gagal' };
  const message = issues.length ? 'Snappie Studio: perlu diperiksa\n' + issues.map(issue => '- ' + (labels[issue] || issue)).join('\n') : 'Snappie Studio: layanan pulih.';
  const payload = destination.channel === 'discord'
    ? { content: message + '\nWaktu: ' + at, allowed_mentions: { parse: [] } }
    : { text: message, issues, at };
  const response = await fetchImpl(destination.url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!response.ok) { await response.body?.cancel(); throw new Error('Notification rejected'); }
  if (destination.channel === 'discord') {
    const result = await response.json();
    if (!/^\d{15,22}$/.test(result?.id || '')) throw new Error('Discord delivery not confirmed');
  } else await response.body?.cancel();
}
