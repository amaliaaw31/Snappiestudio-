import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraCrop } from '../src/camera.js';

test('unzoomed widescreen camera crops centrally to the photo aspect ratio', () => {
  assert.deepEqual(cameraCrop(1280, 720, 4 / 3), {
    width: 960, height: 720, sx: 160, sy: 0, sw: 960, sh: 720,
  });
});

test('zoom crops the center while keeping the photo output resolution', () => {
  assert.deepEqual(cameraCrop(1280, 720, 4 / 3, 2), {
    width: 960, height: 720, sx: 400, sy: 180, sw: 480, sh: 360,
  });
});

test('portrait cameras keep the zoomed crop inside the video', () => {
  const crop = cameraCrop(720, 1280, 4 / 3, 3);
  assert.equal(crop.width, 720);
  assert.equal(crop.height, 540);
  assert.equal(crop.sw, 240);
  assert.equal(crop.sh, 180);
  assert.equal(crop.sx + crop.sw / 2, 360);
  assert.equal(crop.sy + crop.sh / 2, 640);
});

test('camera zoom stays within the supported range', () => {
  assert.deepEqual(cameraCrop(640, 480, 4 / 3, 0.5), cameraCrop(640, 480, 4 / 3, 1));
  assert.deepEqual(cameraCrop(640, 480, 4 / 3, 8), cameraCrop(640, 480, 4 / 3, 3));
});
