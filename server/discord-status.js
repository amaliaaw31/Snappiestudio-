import { performance } from 'node:perf_hooks';

const origin = 'https://snappiestudio.com';
const checks = [
  { name: 'Website', path: '/', method: 'HEAD' },
  { name: 'API pengunjung', path: '/api/visitors', valid: value => Number.isSafeInteger(value?.total) && value.total >= 0 },
  { name: 'API pengumuman', path: '/api/site-content', valid: value => typeof value?.enabled === 'boolean' && typeof value?.message === 'string' },
];

export function createWebsiteStatus(fetchImpl = fetch) {
  const failures = new Map();
  async function probe(check) {
    const started = performance.now();
    let received = false;
    const failed = () => {
      const previous = failures.get(check.path);
      const count = previous && started - previous.at < 300000 ? previous.count + 1 : 1;
      failures.set(check.path, { at: started, count });
      return count >= 2;
    };
    try {
      const response = await fetchImpl(origin + check.path, {
        method: check.method || 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(1500),
      });
      received = true;
      try {
        if (response.status !== 200) {
          const repeated = failed();
          return `${check.name}: ${response.status >= 500 && repeated ? 'DOWN' : 'DEGRADED'} (HTTP ${response.status})`;
        }
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
        failures.delete(check.path);
        const duration = Math.round(performance.now() - started);
        return `${check.name}: ${duration >= 1000 ? 'DEGRADED' : 'UP'} (${duration} ms)`;
      } finally { if (!response.body?.locked) await response.body?.cancel(); }
    } catch {
      const repeated = failed();
      return `${check.name}: ${received ? 'DEGRADED' : repeated ? 'DOWN' : 'UNKNOWN'} (tidak dapat diverifikasi; koneksi, batas waktu, atau respons tidak valid).`;
    }
  }
  return async (websiteOnly = false) => {
    const results = await Promise.all((websiteOnly ? checks.slice(0, 1) : checks).map(probe));
    return `Status Snappie Studio\n${results.join('\n')}\nPemeriksaan dari server, bukan riwayat uptime. DOWN berarti dua pemeriksaan gagal berurutan dalam lima menit; bukan bukti seluruh VPS mati.`;
  };
}

export async function websiteStatus(fetchImpl = fetch) {
  return createWebsiteStatus(fetchImpl)();
}
