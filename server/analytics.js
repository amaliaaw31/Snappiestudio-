const DAY = 86400000;
const WIB = 7 * 3600000;
export const utcTimestamp = time => new Date(time).toISOString().slice(0, 19).replace('T', ' ');
const localDay = time => new Date(time + WIB).toISOString().slice(0, 10);
const midnight = day => Date.parse(`${day}T00:00:00+07:00`);
const badRequest = message => Object.assign(new Error(message), { status: 400 });

function dateParameter(params, name) {
  const value = params.get(name) || '';
  if (value && (!/^20\d{2}-\d{2}-\d{2}$/.test(value)
    || !Number.isFinite(midnight(value)) || localDay(midnight(value)) !== value)) {
    throw badRequest('Tanggal tidak valid. Gunakan YYYY-MM-DD.');
  }
  return value;
}

export function reportFilters(params) {
  const from = dateParameter(params, 'from');
  const to = dateParameter(params, 'to');
  if (from && to && from > to) throw badRequest('Tanggal mulai harus sebelum atau sama dengan tanggal akhir.');
  const q = (params.get('q') || '').trim();
  const province = (params.get('province') || '').trim();
  if (province.length > 100) throw badRequest('Provinsi maksimal 100 karakter.');
  if (q.length > 100) throw badRequest('Pencarian maksimal 100 karakter.');
  const integer = (name, fallback, max) => {
    const value = params.get(name);
    if (value === null) return fallback;
    if (!/^[1-9]\d{0,6}$/.test(value) || Number(value) > max) throw badRequest('Halaman atau ukuran halaman tidak valid.');
    return Number(value);
  };
  return { from, to, q, province, page: integer('page', 1, 1000000), pageSize: integer('pageSize', 100, 100) };
}

function where(filters, visitorAlias = 'v') {
  const clauses = [];
  const values = [];
  if (filters.province) { clauses.push(`${visitorAlias}.province = ?`); values.push(filters.province); }
  if (filters.from || filters.to) {
    const range = [];
    if (filters.from) { range.push('a.hour >= ?'); values.push(utcTimestamp(midnight(filters.from))); }
    if (filters.to) { range.push('a.hour < ?'); values.push(utcTimestamp(midnight(filters.to) + DAY)); }
    clauses.push(`EXISTS (SELECT 1 FROM visitor_activity a WHERE a.visitor_hash = ${visitorAlias}.visitor_hash AND ${range.join(' AND ')})`);
  }
  if (filters.q) {
    clauses.push(`(COALESCE(${visitorAlias}.country, 'Tidak diketahui') LIKE ? ESCAPE '\\' OR COALESCE(${visitorAlias}.province, '') LIKE ? ESCAPE '\\' OR COALESCE(${visitorAlias}.city, '') LIKE ? ESCAPE '\\')`);
    const search = `%${filters.q.replace(/[\\%_]/g, '\\$&')}%`;
    values.push(search, search, search);
  }
  return { sql: clauses.length ? 'WHERE ' + clauses.join(' AND ') : '', values };
}

export function createAnalytics(db, now) {
  const columns = db.prepare('PRAGMA table_info(visitors)').all();
  if (!columns.some(column => column.name === 'last_seen')) db.exec('ALTER TABLE visitors ADD COLUMN last_seen TEXT');
  db.exec(`
    UPDATE visitors SET last_seen = first_seen WHERE last_seen IS NULL;
    CREATE TABLE IF NOT EXISTS visitor_activity (
      visitor_hash TEXT NOT NULL REFERENCES visitors(visitor_hash) ON DELETE CASCADE,
      hour TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      PRIMARY KEY (visitor_hash, hour)
    );
    CREATE INDEX IF NOT EXISTS activity_hour ON visitor_activity(hour, visitor_hash);
    CREATE INDEX IF NOT EXISTS visitors_last_seen ON visitors(last_seen DESC);
    CREATE TABLE IF NOT EXISTS analytics_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT OR IGNORE INTO visitor_activity (visitor_hash, hour, last_seen)
      SELECT visitor_hash, substr(first_seen, 1, 13) || ':00:00', first_seen FROM visitors;
  `);
  db.prepare("INSERT OR IGNORE INTO analytics_meta VALUES ('tracking_since', ?)").run(utcTimestamp(now()));
  const trackingSince = db.prepare("SELECT value FROM analytics_meta WHERE key = 'tracking_since'").get().value;
  const record = db.prepare(`INSERT INTO visitor_activity (visitor_hash, hour, last_seen) VALUES (?, ?, ?)
    ON CONFLICT(visitor_hash, hour) DO UPDATE SET last_seen = MAX(last_seen, excluded.last_seen)`);
  const updateLastSeen = db.prepare('UPDATE visitors SET last_seen = MAX(last_seen, ?) WHERE visitor_hash = ?');
  const fields = 'v.first_seen, v.last_seen, v.country, v.province, v.city';
  const ordering = 'ORDER BY v.last_seen DESC, v.rowid DESC';
  const countRange = db.prepare('SELECT COUNT(DISTINCT visitor_hash) AS count FROM visitor_activity WHERE hour >= ? AND hour < ?');

  return {
    provinces() {
      return db.prepare("SELECT DISTINCT province FROM visitors WHERE province IS NOT NULL AND province != '' ORDER BY province").all().map(row => row.province);
    },
    insights(filters) {
      const range = this.comparison(filters);
      const { sql, values } = where({ ...filters, from: range.from, to: range.to });
      const start = utcTimestamp(midnight(range.from));
      const end = utcTimestamp(midnight(range.to) + DAY);
      const counts = db.prepare(`SELECT SUM(CASE WHEN v.first_seen >= ? AND v.first_seen < ? THEN 1 ELSE 0 END) AS newBrowsers,
        SUM(CASE WHEN v.first_seen < ? THEN 1 ELSE 0 END) AS returningBrowsers FROM visitors v ${sql}`).get(start, end, start, ...values);
      const month = (filters.to || localDay(now())).slice(0, 7);
      const monthEnd = new Date(Date.parse(month + '-01T00:00:00Z'));
      monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1); monthEnd.setUTCDate(0);
      const calendar = this.charts({ ...filters, from: month + '-01', to: monthEnd.toISOString().slice(0, 10) });
      const trend = this.charts(filters);
      const pattern = trend.unit === 'year' ? '%Y' : trend.unit === 'month' ? '%Y-%m' : '%Y-%m-%d';
      const location = where({ ...filters, from: '', to: '' });
      const newRows = db.prepare(`SELECT strftime('${pattern}', v.first_seen, '+7 hours') AS date, COUNT(*) AS count
        FROM visitors v ${location.sql || 'WHERE 1=1'} AND v.first_seen >= ? AND v.first_seen < ? GROUP BY date`)
        .all(...location.values, utcTimestamp(midnight(trend.from)), utcTimestamp(midnight(trend.to) + DAY));
      const newCounts = new Map(newRows.map(row => [row.date, row.count]));
      return { from: range.from, to: range.to, newBrowsers: counts.newBrowsers || 0, returningBrowsers: counts.returningBrowsers || 0,
        calendar: { month, days: calendar.daily }, trendUnit: trend.unit,
        trend: trend.daily.map(row => ({ date: row.date, newBrowsers: newCounts.get(row.date) || 0,
          returningBrowsers: row.count - (newCounts.get(row.date) || 0) })), trackingSince };
    },
    record(hash, timestamp) {
      record.run(hash, timestamp.slice(0, 13) + ':00:00', timestamp);
      updateLastSeen.run(timestamp, hash);
    },
    summary() {
      const today = localDay(now());
      const start = midnight(today);
      const dayOfWeek = new Date(start + WIB).getUTCDay();
      const count = (from, to) => countRange.get(utcTimestamp(from), utcTimestamp(to)).count;
      return {
        today: count(start, start + DAY), yesterday: count(start - DAY, start),
        week: count(start - ((dayOfWeek + 6) % 7) * DAY, start + DAY),
        month: count(midnight(today.slice(0, 8) + '01'), start + DAY),
        trackingSince,
      };
    },
    comparison(filters) {
      const today = localDay(now());
      const to = filters.to || (filters.from > today ? filters.from : today);
      const from = filters.from || localDay(midnight(to) - 6 * DAY);
      const days = Math.round((midnight(to) - midnight(from)) / DAY) + 1;
      const previousTo = localDay(midnight(from) - DAY);
      const previousFrom = localDay(midnight(from) - days * DAY);
      const count = (start, end) => {
        const { sql, values } = where({ ...filters, from: start, to: end });
        return db.prepare(`SELECT COUNT(*) AS count FROM visitors v ${sql}`).get(...values).count;
      };
      const current = count(from, to);
      const previous = count(previousFrom, previousTo);
      return { from, to, previousFrom, previousTo, days, current, previous, difference: current - previous,
        percent: previous ? (current - previous) / previous * 100 : null, includesToday: from <= today && to >= today };
    },
    visits(filters) {
      const { sql, values } = where(filters);
      const total = db.prepare(`SELECT COUNT(*) AS total FROM visitors v ${sql}`).get(...values).total;
      const pages = Math.max(1, Math.ceil(total / filters.pageSize));
      const page = Math.min(filters.page, pages);
      const rows = db.prepare(`SELECT ${fields} FROM visitors v ${sql} ${ordering} LIMIT ? OFFSET ?`)
        .all(...values, filters.pageSize, (page - 1) * filters.pageSize);
      return { total, visits: rows, page, pageSize: filters.pageSize, pages };
    },
    locations(filters) {
      const { sql, values } = where(filters);
      const locations = db.prepare(`SELECT v.country_code, v.country, v.province, v.city, COUNT(*) AS count
        FROM visitors v ${sql} GROUP BY v.country_code, v.country, v.province, v.city ORDER BY count DESC, v.country, v.province, v.city`).all(...values);
      return { total: locations.reduce((sum, row) => sum + row.count, 0), locations };
    },
    charts(filters) {
      const { sql, values } = where({ ...filters, from: '', to: '' });
      const today = localDay(now());
      const to = filters.to || (filters.from > today ? filters.from : today);
      const from = filters.from || localDay(midnight(to) - 29 * DAY);
      const days = Math.round((midnight(to) - midnight(from)) / DAY) + 1;
      const unit = days > 730 ? 'year' : days > 62 ? 'month' : 'day';
      const pattern = unit === 'year' ? '%Y' : unit === 'month' ? '%Y-%m' : '%Y-%m-%d';
      const join = `FROM visitor_activity a JOIN visitors v ON v.visitor_hash = a.visitor_hash
        ${sql || 'WHERE 1=1'} AND a.hour >= ? AND a.hour < ?`;
      const args = [...values, utcTimestamp(midnight(from)), utcTimestamp(midnight(to) + DAY)];
      const rows = db.prepare(`SELECT strftime('${pattern}', a.hour, '+7 hours') AS date,
        COUNT(DISTINCT a.visitor_hash) AS count ${join} GROUP BY date ORDER BY date`).all(...args);
      const counts = new Map(rows.map(row => [row.date, row.count]));
      const daily = [];
      const cursor = new Date(midnight(from) + WIB);
      const end = midnight(to) + WIB;
      while (cursor.getTime() <= end) {
        const date = cursor.toISOString().slice(0, unit === 'year' ? 4 : unit === 'month' ? 7 : 10);
        daily.push({ date, count: counts.get(date) || 0 });
        if (unit === 'year') cursor.setUTCFullYear(cursor.getUTCFullYear() + 1, 0, 1);
        else if (unit === 'month') cursor.setUTCMonth(cursor.getUTCMonth() + 1, 1);
        else cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      const hourlyRows = db.prepare(`SELECT CAST(strftime('%H', a.hour, '+7 hours') AS INTEGER) AS local_hour,
        COUNT(*) AS count ${join} GROUP BY local_hour ORDER BY local_hour`).all(...args);
      const hourlyCounts = new Map(hourlyRows.map(row => [row.local_hour, row.count]));
      return { from, to, unit, daily, hourly: Array.from({ length: 24 }, (_, hour) => ({ hour, count: hourlyCounts.get(hour) || 0 })) };
    },
    csvRows(filters) {
      const { sql, values } = where(filters);
      return db.prepare(`SELECT ${fields} FROM visitors v ${sql} ${ordering}`).iterate(...values);
    },
  };
}

export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+@-]|^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function csvVisit(row) {
  const time = value => utcTimestamp(Date.parse(value.replace(' ', 'T') + 'Z') + WIB).slice(0, 16) + ' WIB';
  return [time(row.first_seen), time(row.last_seen), row.country || 'Tidak diketahui', row.province || '', row.city || '']
    .map(csvCell).join(',') + '\r\n';
}
