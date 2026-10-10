import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Run the actual camera flash functions with a browser track double.
const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const flashCode = source.slice(source.indexOf('function videoTrack()'), source.indexOf('async function startCamera()'));
function camera(track, overrides = {}) {
  const context = vm.createContext({
    state: { stream: { getVideoTracks: () => [track] }, facing: 'environment', flash: 'on', ...overrides },
    window: { location: { search: '' } }, setTimeout, clearTimeout,
  });
  vm.runInContext(flashCode, context);
  return { shouldUseTorch: context.shouldUseTorch, setTorch: context.setTorch };
}

test('rear Flash On tries hardware control when capabilities omit torch', async () => {
  let lit = false;
  const track = {
    readyState: 'live', getCapabilities: () => ({}), getSettings: () => ({ torch: lit }),
    applyConstraints: async constraints => { lit = constraints.torch?.exact ?? constraints.advanced?.[0].torch; },
  };
  const flash = camera(track);
  assert.equal(flash.shouldUseTorch(), true);
  assert.equal(await flash.setTorch(true), true);
  assert.equal(lit, true);
  assert.equal(await flash.setTorch(false), true);
  assert.equal(lit, false);
});

test('a resolved constraint that leaves the lamp off is not success', async () => {
  const flash = camera({
    readyState: 'live', getCapabilities: () => ({ torch: true }),
    getSettings: () => ({ torch: false }), applyConstraints: async () => {},
  });
  assert.equal(await flash.setTorch(true), false);
});

test('legacy advanced torch control is retried and verified', async () => {
  let lit = false;
  const flash = camera({
    readyState: 'live', getCapabilities: () => ({ torch: [false, true] }),
    getSettings: () => ({ torch: lit }),
    applyConstraints: async constraints => {
      if (constraints.torch) throw new Error('requires advanced constraint');
      lit = constraints.advanced[0].torch;
    },
  });
  assert.equal(await flash.setTorch(true), true);
  assert.equal(lit, true);
});

test('unsupported and throwing tracks fail without breaking capture', async () => {
  for (const applyConstraints of [async () => { throw new Error('unsupported'); }, () => { throw new Error('unsupported'); }]) {
    assert.equal(await camera({ readyState: 'live', applyConstraints }).setTorch(true), false);
  }
  assert.equal(await camera({ readyState: 'ended' }).setTorch(true), false);
});

test('front camera and Flash Off never request rear illumination', () => {
  assert.equal(camera({}, { facing: 'user' }).shouldUseTorch(), false);
  assert.equal(camera({}, { flash: 'off' }).shouldUseTorch(), false);
});

test('an ignored unknown constraint without settings or capability is not success', async () => {
  const flash = camera({ readyState: 'live', applyConstraints: async () => {} });
  assert.equal(await flash.setTorch(true), false);
});

test('a timed out ON is switched off when it eventually completes', async () => {
  let complete;
  let lit = false;
  const flash = camera({
    readyState: 'live', getSettings: () => ({ torch: lit }),
    applyConstraints: constraints => {
      if (constraints.torch.exact) {
        return new Promise(resolve => { complete = () => { lit = true; resolve(); }; });
      }
      lit = false;
      return Promise.resolve();
    },
  });
  assert.equal(await flash.setTorch(true), false);
  complete();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(lit, false);
});
