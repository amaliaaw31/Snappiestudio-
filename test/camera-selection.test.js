import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as cameraModule from '../src/camera.js';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const startCode = source.slice(source.indexOf('async function startCamera()'), source.indexOf("$('btn-start').onclick"));
function stream(id, facing, torch) {
  const track = {
    readyState: 'live', stopped: false,
    getSettings: () => ({ deviceId: id, facingMode: facing }),
    getCapabilities: () => torch === undefined ? {} : { torch },
    stop() { this.stopped = true; this.readyState = 'ended'; },
    addEventListener() {},
  };
  return { getTracks: () => [track], getVideoTracks: () => [track] };
}
function setup(cameras, options = {}) {
  const opened = [];
  const requests = [];
  const mediaDevices = {
    enumerateDevices: async () => cameras.map(c => ({ kind: 'videoinput', deviceId: c.id })),
    getUserMedia: async constraints => {
      requests.push(constraints);
      const id = constraints.video.deviceId?.exact;
      const info = id ? cameras.find(c => c.id === id) : cameras[0];
      if (!info || (constraints.video.facingMode?.exact && info.facing !== constraints.video.facingMode.exact)) {
        throw Object.assign(new Error('wrong camera'), { name: 'OverconstrainedError' });
      }
      const result = stream(info.id, info.facing, info.torch);
      opened.push(result);
      return result;
    }, ...options,
  };
  return { opened, requests, mediaDevices };
}
const multiLens = [
  { id: 'rear-without-flash', facing: 'environment' },
  { id: 'front', facing: 'user' },
  { id: 'rear-with-flash', facing: 'environment', torch: true },
];

test('actual camera startup selects a rear track with torch instead of the default rear without it', async () => {
  const { mediaDevices, opened } = setup(multiLens);
  const nodes = { video: {}, camerr: { style: {}, dataset: {} }, startStatus: { style: {}, dataset: {} } };
  const state = { facing: 'environment', stream: null };
  const context = vm.createContext({
    ...cameraModule, state, cameraRequestId: 0, navigator: { mediaDevices },
    stopStream() {}, setCameraZoom() {}, torchSnapshot() {}, tr: key => key,
    $: id => nodes[id],
    document: { querySelectorAll: () => [nodes.camerr, nodes.startStatus] },
  });
  vm.runInContext(startCode, context);
  assert.equal(await context.startCamera(), true);
  assert.equal(state.stream.getVideoTracks()[0].getSettings().deviceId, 'rear-with-flash');
  assert.equal(nodes.video.srcObject, state.stream);
  assert.equal(opened[0].getVideoTracks()[0].stopped, true);
  assert.equal(nodes.camerr.style.display, 'none');
  assert.equal(nodes.startStatus.style.display, 'none');
});

test('camera permission failures show recovery messages on both entry and camera screens', async () => {
  for (const [name, message] of [
    ['NotAllowedError', 'err.denied'], ['NotFoundError', 'err.notfound'],
    ['NotReadableError', 'err.inuse'], ['UnknownError', 'err.generic'],
  ]) {
    const statuses = [{ style: {}, dataset: {} }, { style: {}, dataset: {} }];
    let rejectCamera;
    const context = vm.createContext({
      state: { facing: 'user', stream: null }, cameraRequestId: 0,
      navigator: { mediaDevices: {} }, stopStream() {}, tr: key => key,
      document: { querySelectorAll: () => statuses },
      openCameraStream: () => new Promise((resolve, reject) => { rejectCamera = reject; }),
    });
    vm.runInContext(startCode, context);
    const pending = context.startCamera();
    assert.ok(statuses.every(el => el.textContent === 'err.opening' && el.style.display === 'block'));
    rejectCamera(Object.assign(new Error('camera unavailable'), { name }));
    assert.equal(await pending, false);
    assert.ok(statuses.every(el => el.textContent === message && el.style.display === 'block'));
    assert.ok(statuses.every(el => el.dataset.i18n === message));
    assert.equal(context.state.stream, null);
  }
});

test('a rear camera already supporting torch is kept without enumeration', async () => {
  const { mediaDevices, opened } = setup([{ id: 'rear', facing: 'environment', torch: [false, true] }], {
    enumerateDevices: () => { assert.fail('should not enumerate'); },
  });
  const result = await cameraModule.openCameraStream(mediaDevices, 'environment');
  assert.equal(result, opened[0]);
  assert.equal(opened.length, 1);
  assert.equal(result.getVideoTracks()[0].stopped, false);
});

test('the original rear camera is restored when no alternative supports torch', async () => {
  const { mediaDevices, opened, requests } = setup([
    { id: 'original', facing: 'environment', torch: [false] },
    { id: 'other', facing: 'environment', torch: false },
  ]);
  const result = await cameraModule.openCameraStream(mediaDevices, 'environment');
  assert.equal(result.getVideoTracks()[0].getSettings().deviceId, 'original');
  assert.equal(requests.at(-1).video.deviceId.exact, 'original');
  assert.equal(opened.length, 3);
  assert.ok(opened.slice(0, -1).every(s => s.getVideoTracks()[0].stopped));
  assert.equal(result.getVideoTracks()[0].stopped, false);
});

test('camera enumeration failure preserves the live original stream', async () => {
  const { mediaDevices, opened } = setup(multiLens, {
    enumerateDevices: async () => { throw new Error('enumeration unavailable'); },
  });
  const result = await cameraModule.openCameraStream(mediaDevices, 'environment');
  assert.equal(result, opened[0]);
  assert.equal(result.getVideoTracks()[0].stopped, false);
});

test('front camera startup never searches for rear flash', async () => {
  const { mediaDevices, opened } = setup([{ id: 'front', facing: 'user' }], {
    enumerateDevices: () => { assert.fail('should not enumerate'); },
  });
  const result = await cameraModule.openCameraStream(mediaDevices, 'user');
  assert.equal(result, opened[0]);
  assert.equal(opened.length, 1);
});

test('a superseded selection closes the pending candidate and does not restore a stale stream', async () => {
  let active = true;
  const { mediaDevices, opened } = setup(multiLens);
  const open = mediaDevices.getUserMedia;
  mediaDevices.getUserMedia = async constraints => {
    const result = await open(constraints);
    if (constraints.video.deviceId?.exact === 'rear-with-flash') active = false;
    return result;
  };
  await assert.rejects(cameraModule.openCameraStream(mediaDevices, 'environment', {
    isCurrent: () => active,
  }), { name: 'AbortError' });
  assert.equal(opened.length, 2);
  assert.ok(opened.every(s => s.getVideoTracks()[0].stopped));
});

test('a front-facing track is rejected even if a browser ignores the exact facing constraint', async () => {
  const { mediaDevices } = setup(multiLens);
  const open = mediaDevices.getUserMedia;
  let front;
  mediaDevices.getUserMedia = async constraints => {
    if (constraints.video.deviceId?.exact === 'front') {
      front = stream('front', 'user', true);
      return front;
    }
    return open(constraints);
  };
  const result = await cameraModule.openCameraStream(mediaDevices, 'environment');
  assert.equal(result.getVideoTracks()[0].getSettings().deviceId, 'rear-with-flash');
  assert.equal(front.getVideoTracks()[0].stopped, true);
});
