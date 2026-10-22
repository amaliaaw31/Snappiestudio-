import { performance } from 'node:perf_hooks';

const origin = 'https://snappiestudio.com';
const checks = [
  { name: 'Website', path: '/', method: 'HEAD' },
  { name: 'API pengunjung', path: '/api/visitors', valid: value => Number.isSafeInteger(value?.total) && value.total >= 0 },
  { name: 'API pengumuman', path: '/api/site-content', valid: value => typeof value?.enabled === 'boolean' && typeof value?.message === 'string' },
];

export async function websiteStatus(fetchImpl = fetch) {
  const results = await Promise.all(checks.map(async check => {
    const started = performance.now();
    try {
      const response = await fetchImpl(origin + check.path, {
        method: check.method || 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(1500),
      });
      try {
        if (response.status !== 200) return `${check.name}: GANGGUAN (HTTP ${response.status})`;
        if (check.valid) {
          if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) throw new Error('Invalid response');
          let length = 0;
          const chunks = [];
          for await (const chunk of response.body) {
            length += chunk.length;
            if (length > 8192) throw new Error('Response too large');
            chunks.push(chunk);
          }
          if (!check.valid(JSON.parse(Buffer.concat(chunks).toString('utf8')))) throw new Error('Invalid response');
        } else if (!/^text\/html(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) throw new Error('Invalid response');
        return `${check.name}: OK (${Math.round(performance.now() - started)} ms)`;
      } finally { if (!response.body?.locked) await response.body?.cancel(); }
    } catch {
      return `${check.name}: tidak dapat diverifikasi (koneksi, batas waktu, atau respons tidak valid).`;
    }
  }));
  return `Status Snappie Studio\n${results.join('\n')}\nPemeriksaan dari server saat perintah dijalankan; bukan riwayat uptime.`;
}
