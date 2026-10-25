import { validateBotConfig } from './discord-bot.js';
const string = (name, description, required = true, max_length = 500) => ({ type: 3, name, description, required, max_length });
const sub = (name, description, options = []) => ({ type: 1, name, description, options });
export const discordCommands = [
  { name: 'status', description: 'Periksa website dan API Snappie Studio', type: 1, default_member_permissions: '0' },
  ...[
    ['website', 'Periksa HTTP dan waktu respons website'],
    ['server', 'Ringkasan CPU, RAM, dan disk VPS'],
    ['ssl', 'Periksa masa berlaku sertifikat website'],
    ['logs', 'Ringkasan aman catatan error yang diizinkan'],
    ['uptime', 'Lama host dan layanan aktif'],
  ].map(([name, description]) => ({ name, description, type: 1, default_member_permissions: '0' })),
  { name: 'pengunjung', description: 'Lihat statistik kunjungan seperti di CMS', type: 1, default_member_permissions: '0', options: [
    sub('ringkasan', 'Total, hari ini, minggu ini, dan perbandingan 7 hari'), sub('tren', 'Browser aktif 7 hari terakhir dan jam tersibuk'),
    sub('wilayah', 'Sepuluh wilayah dengan browser terbanyak'),
  ] },
  { name: 'penggunaan', description: 'Lihat penggunaan fitur seperti di CMS', type: 1, default_member_permissions: '0', options: [
    { type: 4, name: 'hari', description: 'Jumlah hari terakhir; bawaan 7', min_value: 1, max_value: 90 },
  ] },
  { name: 'backup', description: 'Periksa snapshot backup lokal tanpa restore', type: 1, default_member_permissions: '0', options: [
    sub('status', 'Lihat hasil dan waktu backup terakhir'), sub('history', 'Lihat sepuluh snapshot terbaru'),
    sub('verify', 'Periksa integritas snapshot tanpa mengubah sumber', [string('snapshot', 'ID dari backup history; bawaan snapshot terbaru', false, 32)]),
  ] },
  { name: 'alert', description: 'Uji tujuan notifikasi yang dikonfigurasi', type: 1, default_member_permissions: '0', options: [
    sub('test', 'Kirim satu pesan uji setelah konfirmasi', [{ type: 5, name: 'konfirmasi', description: 'Setujui pengiriman satu pesan uji', required: true }]),
  ] },
  { name: 'pengumuman', description: 'Kelola pengumuman di website Snappie Studio', type: 1, default_member_permissions: '0', options: [
    sub('pasang', 'Tampilkan pengumuman pada website', [string('pesan', 'Isi pengumuman untuk pengunjung'), string('judul', 'Judul pengumuman', false, 80)]),
    sub('hapus', 'Sembunyikan pengumuman website'), sub('status', 'Lihat pengumuman yang sedang aktif'),
  ] },
  { name: 'migrasi', description: 'Atur pengingat migrasi dan pengumuman otomatis', type: 1, default_member_permissions: '0', options: [
    sub('jadwalkan', 'Jadwalkan pengingat dan pengumuman; tidak memindahkan data server', [
      string('waktu', 'YYYY-MM-DD HH:mm, menggunakan WIB', true, 16), string('pesan', 'Pengumuman yang ditampilkan saat jadwal dimulai'),
      string('judul', 'Judul pengumuman; bawaan Migrasi server', false, 80),
      { type: 4, name: 'pengingat_menit', description: 'Menit sebelum jadwal; bawaan 60', min_value: 1, max_value: 10080 },
      { type: 5, name: 'otomatis', description: 'Tampilkan pengumuman saat jadwal tiba; bawaan ya' },
    ]),
    sub('selesai', 'Tandai migrasi selesai dan hentikan pengumuman otomatisnya', [string('id', 'ID jadwal dari /migrasi status', true, 12)]),
    sub('batal', 'Batalkan jadwal dan pengumuman otomatisnya', [string('id', 'ID jadwal dari /migrasi status', true, 12)]),
    sub('status', 'Lihat jadwal dan status pengiriman pengingat'),
  ] },
];

const optionDefinition = option => {
  const result = { type: option.type, name: option.name, description: option.description };
  if (option.type >= 3) result.required = option.required === true;
  for (const key of ['min_length', 'max_length', 'min_value', 'max_value']) {
    if (option[key] !== undefined) result[key] = option[key];
  }
  result.options = (option.options || []).map(optionDefinition);
  result.choices = (option.choices || []).map(({ name, value }) => ({ name, value }));
  return result;
};
const definition = command => JSON.stringify({ type: command.type || 1, name: command.name,
  description: command.description, default_member_permissions: command.default_member_permissions ?? null,
  options: (command.options || []).map(optionDefinition) });
export const phaseOneCommands = ['status', 'website', 'server', 'ssl', 'logs', 'uptime'];
export const phaseTwoCommands = ['backup', 'alert'];
export const phaseThreeCommands = ['pengunjung', 'penggunaan'];

export async function registerDiscordCommands(configuration, token, fetchImpl = fetch, { names = discordCommands.map(command => command.name), dryRun = false } = {}) {
  const config = validateBotConfig(configuration);
  if (typeof token !== 'string' || !/^[A-Za-z0-9._-]{20,500}$/.test(token)) throw new Error('Invalid bot token');
  if (!Array.isArray(names) || !names.length || new Set(names).size !== names.length
    || !names.every(name => discordCommands.some(command => command.name === name))) throw new Error('Invalid command selection');
  const endpoint = `https://discord.com/api/v10/applications/${config.applicationId}/guilds/${config.guildId}/commands`;
  const request = async (method, command) => {
    const response = await fetchImpl(endpoint, {
      method, headers: { Authorization: 'Bot ' + token, 'Content-Type': 'application/json' },
      redirect: 'error', signal: AbortSignal.timeout(10000), ...(command ? { body: JSON.stringify(command) } : {}),
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error('Command registration failed: HTTP ' + response.status); }
    try { return await response.json(); } catch { throw new Error('Command registration response invalid'); }
  };
  const existing = await request('GET');
  if (!Array.isArray(existing) || existing.some(command => !command || typeof command.name !== 'string'
    || command.application_id !== config.applicationId || !/^\d{15,22}$/.test(command.id || ''))) throw new Error('Command registration list invalid');
  const result = { created: [], updated: [], unchanged: [], dryRun };
  for (const command of discordCommands.filter(command => names.includes(command.name))) {
    const previous = existing.find(value => value.name === command.name && (value.type || 1) === command.type);
    if (previous && definition(previous) === definition(command)) { result.unchanged.push(command.name); continue; }
    if (!dryRun) {
      const value = await request('POST', command);
      if (value?.name !== command.name || value.application_id !== config.applicationId || !/^\d{15,22}$/.test(value.id || '')
        || definition(value) !== definition(command)) throw new Error('Command registration not confirmed');
    }
    result[previous ? 'updated' : 'created'].push(command.name);
  }
  return result;
}
