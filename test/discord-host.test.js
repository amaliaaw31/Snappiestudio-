import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { hostStatus, uptimeStatus, certificateStatus, sslStatus } from '../server/discord-host.js';

const day = 86400000;
const now = Date.parse('2026-10-23T00:00:00Z');
const certificate = days => ({ valid_from: new Date(now - day).toUTCString(), valid_to: new Date(now + days * day).toUTCString() });

test('host metrics sample CPU and expose only percentages; missing data stays UNKNOWN', async () => {
  let samples = 0;
  const options = {
    cpu: () => [{ times: { idle: ++samples === 1 ? 100 : 160, user: samples === 1 ? 100 : 140 } }],
    memory: () => [1000, 500], disk: async () => ({ blocks: 100n, bavail: 30n }), wait: async ms => assert.equal(ms, 150),
  };
  const result = await hostStatus('/private-path', options);
  assert.match(result, /VPS: UP/); assert.match(result, /CPU: 40.0%/); assert.match(result, /RAM: 50.0%/); assert.match(result, /Disk aplikasi: 70.0%/);
  assert.doesNotMatch(result, /private-path/);
  samples = 0;
  assert.match(await hostStatus('/private-path', { ...options, memory: () => [1000, 1] }), /VPS: DEGRADED/);
  assert.match(await hostStatus('/private-path', { ...options, cpu: () => [] }), /VPS: UNKNOWN/);
  assert.match(await hostStatus('/private-path', { ...options, disk: async () => { throw Error('secret-password'); } }), /VPS: UNKNOWN/);
});

test('uptime permits only two fixed read-only service queries with bounded execution and safe errors', async () => {
  const calls = [];
  const result = await uptimeStatus({ hostUptime: () => 90000, run: async (command, args, options) => {
    calls.push(args[1]); assert.equal(command, 'systemctl'); assert.equal(args[0], 'show'); assert.equal(options.timeout, 700);
    return { stdout: 'ActiveState=active\nActiveEnterTimestampMonotonic=1000000\n' };
  } });
  assert.deepEqual(calls, ['snappiestudio-counter.service', 'caddy.service']); assert.match(result, /Uptime host: 1 hari/); assert.match(result, /Backend Snappie: UP/);
  assert.match(await uptimeStatus({ run: async () => ({ stdout: 'ActiveState=failed\n' }) }), /Backend Snappie: DOWN/);
  const unavailable = await uptimeStatus({ run: async () => { throw Error('secret-host-ip'); } });
  assert.match(unavailable, /UNKNOWN/); assert.doesNotMatch(unavailable, /secret-host-ip/);
});

test('SSL reports expiry, impending expiry and invalid dates without certificate identities', () => {
  assert.match(certificateStatus(certificate(60), now), /SSL: UP/);
  assert.match(certificateStatus(certificate(3), now), /SSL: DEGRADED/);
  assert.match(certificateStatus(certificate(-1), now), /SSL: DOWN/);
  assert.match(certificateStatus({}, now), /SSL: UNKNOWN/);
  assert.doesNotMatch(certificateStatus({ ...certificate(60), subject: 'private certificate identity' }, now), /private certificate/);
});

test('TLS checks fixed public hostname, destroys sockets, and handles verification and timeout safely', async () => {
  for (const event of ['secureConnect', 'timeout', 'error']) {
    let destroyed = false;
    const result = await sslStatus({ now: () => now, dial: options => {
      assert.deepEqual(options, { host: 'snappiestudio.com', port: 443, servername: 'snappiestudio.com', rejectUnauthorized: true });
      const socket = new EventEmitter();
      socket.authorized = true; socket.getPeerCertificate = () => certificate(60);
      socket.destroy = () => { destroyed = true; }; socket.setTimeout = ms => assert.equal(ms, 1200);
      queueMicrotask(() => socket.emit(event, Error('private TLS failure')));
      return socket;
    } });
    assert.ok(destroyed); assert.match(result, event === 'secureConnect' ? /SSL: UP/ : /SSL: UNKNOWN/);
    assert.doesNotMatch(result, /private TLS failure/);
  }
  const started = performance.now();
  const result = await sslStatus({ dial: () => Object.assign(new EventEmitter(), { setTimeout() {}, destroy() {} }) });
  assert.match(result, /UNKNOWN/); assert.ok(performance.now() - started < 2000);
});
