import test from 'node:test';
import assert from 'node:assert/strict';
import { discordWebhook, notificationDestination, sendNotification } from '../server/notifications.js';
const webhook = 'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz0123456789';

test('Discord destination uses confirmed delivery and accepts a forum thread without leaking its token', () => {
  assert.equal(discordWebhook(webhook).searchParams.get('wait'), 'true');
  assert.equal(discordWebhook(webhook + '?thread_id=123456789012345679&wait=false').searchParams.get('wait'), 'true');
  assert.equal(notificationDestination({ CMS_ALERT_WEBHOOK: webhook }).channel, 'discord');
  for (const value of ['http://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz', webhook.replace('discord.com', 'discord.com.evil.invalid'), webhook + '/messages/123', webhook + '?unexpected=value']) {
    assert.throws(() => discordWebhook(value), /Invalid Discord webhook/);
  }
});

test('Discord payload has content, disables mentions, confirms delivery and keeps generic webhooks compatible', async () => {
  const fetchMock = async (url, options) => {
    assert.equal(url.hostname, 'discord.com'); assert.equal(url.searchParams.get('wait'), 'true');
    assert.equal(options.redirect, 'error');
    const payload = JSON.parse(options.body); assert.match(payload.content, /backup gagal/); assert.deepEqual(payload.allowed_mentions, { parse: [] });
    assert.ok(!options.body.includes('abcdefghijklmnopqrstuvwxyz'));
    return Response.json({ id: '123456789012345680' });
  };
  await sendNotification({ CMS_DISCORD_WEBHOOK: webhook }, ['backup'], '2026-10-22T18:00:00Z', fetchMock);
  await sendNotification({ CMS_ALERT_WEBHOOK: 'https://example.invalid/notify' }, [], 'now', async (_url, options) => {
    assert.match(JSON.parse(options.body).text, /layanan pulih/); return new Response(null, { status: 204 });
  });
});

test('Discord rejects missing acknowledgement, rate limits, malformed replies and invalid configured destinations', async () => {
  for (const response of [new Response(null, { status: 204 }), Response.json({ retry_after: 1 }, { status: 429 }), Response.json({}), new Response('bad json')]) {
    await assert.rejects(sendNotification({ CMS_DISCORD_WEBHOOK: webhook }, [], 'now', async () => response));
  }
  await assert.rejects(sendNotification({ CMS_DISCORD_WEBHOOK: 'https://example.invalid/notify' }, [], 'now', () => { throw new Error('Must not fetch'); }));
});
