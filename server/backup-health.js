export function backupIsLate(lastSuccess, now) {
  const success = typeof lastSuccess === 'string' ? Date.parse(lastSuccess) : NaN;
  const scheduled = new Date(now);
  scheduled.setUTCHours(19, 30, 0, 0);
  const expected = scheduled.getTime() - (now < scheduled.getTime() + 2 * 3600000 ? 86400000 : 0);
  return !Number.isFinite(success) || success > now + 60000 || success < expected || now - success > 48 * 3600000;
}
