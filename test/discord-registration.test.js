import test from 'node:test';
import assert from 'node:assert/strict';
import { discordCommands, phaseOneCommands, phaseTwoCommands, registerDiscordCommands } from '../server/discord-commands.js';

const config = { applicationId: '100000000000000001', guildId: '100000000000000002', channelId: '100000000000000003', allowedUserIds: ['100000000000000004'], publicKey: 'a'.repeat(64) };
const token = 'fixture-bot-token-not-a-real-secret';
const remote = command => ({ ...structuredClone(command), id: '100000000000000010', application_id: config.applicationId, guild_id: config.guildId, version: '100000000000000020' });

function fixture(initial) {
  const state = initial.map(remote), calls = [];
  const request = async (url, options) => {
    assert.equal(url, `https://discord.com/api/v10/applications/${config.applicationId}/guilds/${config.guildId}/commands`);
    assert.equal(options.redirect, 'error'); assert.ok(options.signal); assert.equal(options.headers.Authorization, 'Bot ' + token);
    calls.push({ method: options.method, name: options.body ? JSON.parse(options.body).name : null });
    if (options.method === 'GET') return Response.json(state);
    assert.equal(options.method, 'POST'); assert.ok(!options.body.includes(token));
    const command = remote(JSON.parse(options.body));
    const index = state.findIndex(value => value.name === command.name && value.type === command.type);
    if (index < 0) state.push(command); else state[index] = command;
    return Response.json(command);
  };
  return { state, calls, request };
}

test('phase-one dry run only reads guild commands and leaves old or unrelated definitions untouched', async () => {
  const existing = discordCommands.filter(command => ['status', 'pengumuman', 'migrasi'].includes(command.name));
  const api = fixture([...existing, { name: 'other', description: 'Other application command', type: 1 }]);
  const original = structuredClone(api.state);
  const plan = await registerDiscordCommands(config, token, api.request, { names: phaseOneCommands, dryRun: true });
  assert.deepEqual(plan, { created: ['website', 'server', 'ssl', 'logs', 'uptime'], updated: [], unchanged: ['status'], dryRun: true });
  assert.deepEqual(api.calls, [{ method: 'GET', name: null }]); assert.deepEqual(api.state, original);
});

test('registration adds only missing selected commands and repeated registration is read-only', async () => {
  const api = fixture(discordCommands.filter(command => ['status', 'pengumuman', 'migrasi'].includes(command.name)));
  const old = structuredClone(api.state);
  await registerDiscordCommands(config, token, api.request, { names: phaseOneCommands });
  assert.deepEqual(api.calls.filter(call => call.method === 'POST').map(call => call.name), ['website', 'server', 'ssl', 'logs', 'uptime']);
  assert.deepEqual(api.state.slice(0, 3), old);
  api.calls.length = 0;
  const result = await registerDiscordCommands(config, token, api.request, { names: phaseOneCommands });
  assert.deepEqual(result.created, []); assert.deepEqual(result.updated, []);
  assert.equal(result.unchanged.length, 6); assert.equal(api.calls.length, 1);
});

test('only a changed selected definition is updated; default optional fields do not cause re-registration', async () => {
  const api = fixture(discordCommands);
  api.state.find(command => command.name === 'website').description = 'Old description';
  const optional = api.state.find(command => command.name === 'pengumuman').options[0].options[1];
  delete optional.required;
  const old = structuredClone(api.state.find(command => command.name === 'migrasi'));
  const result = await registerDiscordCommands(config, token, api.request);
  assert.deepEqual(result.updated, ['website']); assert.deepEqual(result.created, []);
  assert.deepEqual(api.state.find(command => command.name === 'migrasi'), old);
});

test('invalid selection, listing failures and malformed results fail closed without command mutations', async () => {
  let calls = 0;
  await assert.rejects(registerDiscordCommands(config, token, async () => { calls++; }, { names: ['unknown'] }), /Invalid command selection/);
  assert.equal(calls, 0);
  for (const response of [() => new Response('private-token', { status: 403 }), () => Response.json({ token: 'private-token' }), () => Response.json([{ name: 'status', id: '100000000000000010', application_id: '100000000000000099' }]), () => new Response('invalid-private-json')]) {
    const methods = [];
    await assert.rejects(registerDiscordCommands(config, token, async (_url, options) => { methods.push(options.method); return response(); }), error => !error.message.includes('private-token'));
    assert.deepEqual(methods, ['GET']);
  }
});

test('registration rejects unconfirmed responses and never deletes commands after a partial failure', async () => {
  const methods = [];
  await assert.rejects(registerDiscordCommands(config, token, async (_url, options) => {
    methods.push(options.method);
    if (options.method === 'GET') return Response.json([]);
    const body = JSON.parse(options.body);
    return Response.json({ ...remote(body), description: 'unexpected' });
  }, { names: ['website', 'server'] }), /not confirmed/);
  assert.deepEqual(methods, ['GET', 'POST']);
});


test('phase-two registration only adds backup and alert and leaves phase-one and migration commands untouched', async () => {
  const api = fixture(discordCommands.filter(command => !phaseTwoCommands.includes(command.name)));
  const old = structuredClone(api.state);
  const plan = await registerDiscordCommands(config, token, api.request, { names: phaseTwoCommands, dryRun: true });
  assert.deepEqual(plan.created, ['backup', 'alert']); assert.deepEqual(api.state, old);
  api.calls.length = 0;
  await registerDiscordCommands(config, token, api.request, { names: phaseTwoCommands });
  assert.deepEqual(api.calls.filter(call => call.method === 'POST').map(call => call.name), ['backup', 'alert']);
  assert.deepEqual(api.state.slice(0, old.length), old);
});
