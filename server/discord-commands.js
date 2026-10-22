import { validateBotConfig } from './discord-bot.js';
const string = (name, description, required = true, max_length = 500) => ({ type: 3, name, description, required, max_length });
const sub = (name, description, options = []) => ({ type: 1, name, description, options });
export const discordCommands = [
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

export async function registerDiscordCommands(configuration, token, fetchImpl = fetch) {
  const config = validateBotConfig(configuration);
  if (typeof token !== 'string' || !/^[A-Za-z0-9._-]{20,500}$/.test(token)) throw new Error('Invalid bot token');
  for (const command of discordCommands) {
    const response = await fetchImpl(`https://discord.com/api/v10/applications/${config.applicationId}/guilds/${config.guildId}/commands`, {
      method: 'POST', headers: { Authorization: 'Bot ' + token, 'Content-Type': 'application/json' },
      redirect: 'error', signal: AbortSignal.timeout(10000), body: JSON.stringify(command),
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error('Command registration failed: HTTP ' + response.status); }
    const value = await response.json();
    if (value?.name !== command.name || value.application_id !== config.applicationId || !/^\d{15,22}$/.test(value.id || '')) throw new Error('Command registration not confirmed');
  }
}
