import { utcTimestamp } from './analytics.js';

const DAY = 86400000;
const WIB = 7 * 3600000;

// Membandingkan browser aktif kemarin (hari WIB penuh) dengan rata-rata 7 hari sebelumnya.
// Tanpa riwayat 8 hari penuh, atau dengan rata-rata kecil, tidak ada peringatan agar tidak salah alarm.
export function trafficAlert(db, now = Date.now()) {
  const today = Math.floor((now + WIB) / DAY) * DAY - WIB;
  const yesterday = today - DAY, start = yesterday - 7 * DAY;
  const since = db.prepare('SELECT MIN(hour) AS hour FROM visitor_activity').get().hour;
  const day = time => new Date(time + WIB).toISOString().slice(0, 10);
  if (!since || day(Date.parse(since.replace(' ', 'T') + 'Z')) > day(start)) return null;
  const counts = new Map(db.prepare(`SELECT strftime('%Y-%m-%d', hour, '+7 hours') AS date, COUNT(DISTINCT visitor_hash) AS count
    FROM visitor_activity WHERE hour >= ? AND hour < ? GROUP BY date`).all(utcTimestamp(start), utcTimestamp(today)).map(row => [row.date, row.count]));
  let sum = 0;
  for (let time = start; time < yesterday; time += DAY) sum += counts.get(day(time)) || 0;
  const average = sum / 7, last = counts.get(day(yesterday)) || 0;
  if (average >= 20 && last < average * 0.3) return 'traffic_drop';
  if (last >= 50 && last >= 3 * Math.max(average, 10)) return 'traffic_spike';
  return null;
}
