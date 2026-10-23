import { cpus, totalmem, freemem, uptime } from 'node:os';
import { statfs } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { connect } from 'node:tls';
import { setTimeout, clearTimeout } from 'node:timers';

const execute = promisify(execFile);
const services = [['Backend Snappie', 'snappiestudio-counter.service'], ['Web server', 'caddy.service']];
const duration = seconds => `${Math.floor(seconds / 86400)} hari ${Math.floor(seconds / 3600) % 24} jam ${Math.floor(seconds / 60) % 60} menit`;
const cpuTimes = values => values.reduce((result, cpu) => ({ idle: result.idle + cpu.times.idle, total: result.total + Object.values(cpu.times).reduce((a, b) => a + b, 0) }), { idle: 0, total: 0 });

export async function hostStatus(directory, { cpu = cpus, memory = () => [totalmem(), freemem()], disk = statfs, wait = delay } = {}) {
  try {
    const first = cpuTimes(cpu());
    await wait(150);
    const last = cpuTimes(cpu());
    const [total, free] = memory();
    const storage = await disk(directory);
    const cpuPercent = last.total > first.total ? 100 * (1 - (last.idle - first.idle) / (last.total - first.total)) : null;
    const ramPercent = total > 0 ? 100 * (1 - free / total) : null;
    const blocks = Number(storage.blocks), available = Number(storage.bavail);
    const diskPercent = blocks > 0 ? 100 * (1 - available / blocks) : null;
    const percent = value => value !== null && Number.isFinite(value) && value >= 0 && value <= 100;
    const values = [cpuPercent, ramPercent, diskPercent];
    const state = !values.every(percent) ? 'UNKNOWN' : values.some(value => value >= 90) ? 'DEGRADED' : 'UP';
    const show = value => percent(value) ? value.toFixed(1) + '%' : 'UNKNOWN';
    return `VPS: ${state}\nCPU: ${show(cpuPercent)} (sampel 150 ms)\nRAM: ${show(ramPercent)} terpakai, termasuk cache OS\nDisk aplikasi: ${show(diskPercent)} terpakai\nTidak menyertakan identitas host, alamat jaringan, atau proses lain.`;
  } catch { return 'VPS: UNKNOWN. Metrik tidak dapat dibaca; tidak menyimpulkan host mati.'; }
}

export async function uptimeStatus({ run = execute, hostUptime = uptime } = {}) {
  const host = hostUptime();
  const results = await Promise.all(services.map(async ([label, service]) => {
    try {
      const { stdout } = await run('systemctl', ['show', service, '--property=ActiveState,ActiveEnterTimestampMonotonic', '--no-pager'], { timeout: 700, maxBuffer: 4096, env: { PATH: '/usr/bin:/bin', LC_ALL: 'C' } });
      const fields = Object.fromEntries(stdout.trim().split('\n').map(line => line.split('=')));
      if (fields.ActiveState !== 'active') return `${label}: ${fields.ActiveState === 'failed' || fields.ActiveState === 'inactive' ? 'DOWN' : 'UNKNOWN'}`;
      const started = Number(fields.ActiveEnterTimestampMonotonic) / 1000000;
      return `${label}: UP; ${Number.isFinite(started) && started > 0 && started <= host ? duration(host - started) : 'durasi UNKNOWN'}`;
    } catch { return `${label}: UNKNOWN (status layanan tidak dapat dibaca)`; }
  }));
  return `Uptime host: ${Number.isFinite(host) && host >= 0 ? duration(host) : 'UNKNOWN'}\n${results.join('\n')}\nDurasi sejak host/layanan aktif; bukan persentase ketersediaan historis.`;
}

export function certificateStatus(certificate, now = Date.now()) {
  const expires = Date.parse(certificate?.valid_to), starts = Date.parse(certificate?.valid_from);
  if (!Number.isFinite(expires) || !Number.isFinite(starts)) return 'SSL: UNKNOWN. Tanggal sertifikat tidak tersedia.';
  const days = Math.floor((expires - now) / 86400000);
  const state = expires <= now ? 'DOWN' : starts > now || days < 14 ? 'DEGRADED' : 'UP';
  return `SSL: ${state}\nDomain: snappiestudio.com\nKedaluwarsa: ${new Date(expires).toISOString().slice(0, 10)} UTC\nSisa masa berlaku: ${Math.max(0, days)} hari.`;
}

export function sslStatus({ dial = connect, now = Date.now } = {}) {
  return new Promise(resolve => {
    let socket, deadline, done = false;
    const finish = value => {
      if (done) return;
      done = true;
      clearTimeout(deadline); socket?.destroy(); resolve(value);
    };
    deadline = setTimeout(() => finish('SSL: UNKNOWN. Pemeriksaan melewati batas waktu.'), 1200);
    try {
      socket = dial({ host: 'snappiestudio.com', port: 443, servername: 'snappiestudio.com', rejectUnauthorized: true });
      socket.setTimeout(1200);
      socket.once('secureConnect', () => {
        try { finish(socket.authorized ? certificateStatus(socket.getPeerCertificate(), now()) : 'SSL: UNKNOWN. Sertifikat tidak dapat diverifikasi.'); }
        catch { finish('SSL: UNKNOWN. Sertifikat tidak dapat diperiksa.'); }
      });
      socket.once('timeout', () => finish('SSL: UNKNOWN. Pemeriksaan melewati batas waktu.'));
      socket.once('error', () => finish('SSL: UNKNOWN. Koneksi atau verifikasi sertifikat gagal.'));
    } catch { finish('SSL: UNKNOWN. Pemeriksaan tidak tersedia.'); }
  });
}
