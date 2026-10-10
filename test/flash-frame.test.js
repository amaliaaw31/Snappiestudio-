import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForFlashFrame } from '../src/camera.js';

function video() {
  let callback;
  const cancelled = [];
  return {
    readyState: 2, videoWidth: 1280, paused: false, ended: false, currentTime: 1,
    requestVideoFrameCallback(fn) { callback = fn; return 7; },
    cancelVideoFrameCallback(id) { cancelled.push(id); },
    present() { callback(); },
    hasCallback: () => !!callback, cancelled,
  };
}

test('flash preparation waits 1.5 seconds and then a new video frame', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const v = video();
  let finished = false;
  const result = waitForFlashFrame(v).then(ready => { finished = true; return ready; });
  t.mock.timers.tick(1499);
  await Promise.resolve();
  assert.equal(v.hasCallback(), false);
  t.mock.timers.tick(1);
  await Promise.resolve();
  assert.equal(v.hasCallback(), true);
  assert.equal(finished, false);
  v.present();
  assert.equal(await result, true);
});

test('a stalled video times out instead of returning an old frame', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const v = video();
  const result = waitForFlashFrame(v);
  t.mock.timers.tick(1500);
  await Promise.resolve();
  t.mock.timers.tick(2000);
  assert.equal(await result, false);
  assert.deepEqual(v.cancelled, [7]);
});

test('switching cameras cancels the pending video callback', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const v = video();
  let active = true;
  const result = waitForFlashFrame(v, { isCurrent: () => active });
  t.mock.timers.tick(1500);
  await Promise.resolve();
  active = false;
  t.mock.timers.tick(50);
  assert.equal(await result, false);
  assert.deepEqual(v.cancelled, [7]);
});

test('older browsers wait for video progress after the exposure delay', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const v = { readyState: 2, videoWidth: 1280, currentTime: 1, paused: false, ended: false };
  let finished = false;
  const result = waitForFlashFrame(v).then(ready => { finished = true; return ready; });
  t.mock.timers.tick(1500);
  await Promise.resolve();
  t.mock.timers.tick(50);
  await Promise.resolve();
  assert.equal(finished, false);
  v.currentTime = 2;
  t.mock.timers.tick(50);
  assert.equal(await result, true);
});
