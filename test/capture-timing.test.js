import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const handler = source.slice(source.indexOf("$('shutter').onclick = async () => {"), source.indexOf('\nfunction capture()'));

function camera(captureResult = true) {
  let resolveFrame;
  const frame = new Promise(resolve => { resolveFrame = resolve; });
  const events = [];
  const track = { readyState: 'live' };
  const stream = { getVideoTracks: () => [track] };
  const state = { stream, photos: [], layout: 3, busy: false, countdown: 0, flash: 'on', facing: 'environment', sound: false };
  const nodes = { shutter: {}, countdown: {}, video: {} };
  const context = vm.createContext({
    state, $: id => nodes[id], currentScreen: 'scr-cam', DEBUG_TORCH: false,
    shouldUseTorch: () => true, videoTrack: () => track, torchSnapshot() {},
    setTorch: async on => { events.push(on ? 'on' : 'off'); return true; },
    sleep: async () => {}, waitForFlashFrame: () => frame,
    capture: () => { events.push('capture'); return captureResult; },
    setTimeout: () => { events.push('schedule-off'); return 1; }, clearTimeout() {},
    showToast: () => events.push('toast'), tr: key => key,
  });
  vm.runInContext(handler, context);
  return { run: nodes.shutter.onclick, resolveFrame, events, state, nodes };
}

test('shutter waits for a fresh frame, captures with the lamp on, then immediately switches it off', async () => {
  const cam = camera();
  const shot = cam.run();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(cam.events, ['on']);
  assert.equal(cam.state.busy, true);
  cam.resolveFrame(true);
  await shot;
  assert.deepEqual(cam.events, ['on', 'capture', 'off']);
  assert.equal(cam.state.busy, false);
});

test('a missing fresh frame cancels capture and switches the lamp off', async () => {
  const cam = camera();
  const shot = cam.run();
  cam.resolveFrame(false);
  await shot;
  assert.deepEqual(cam.events, ['on', 'off', 'toast']);
  assert.equal(cam.state.busy, false);
  assert.equal(cam.nodes.shutter.disabled, false);
});

test('a failed capture still switches the lamp off and releases the shutter', async () => {
  const cam = camera(false);
  const shot = cam.run();
  cam.resolveFrame(true);
  await shot;
  assert.deepEqual(cam.events, ['on', 'capture', 'off']);
  assert.equal(cam.state.busy, false);
  assert.equal(cam.nodes.shutter.disabled, false);
});
