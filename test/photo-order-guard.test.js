import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { movePhoto } from '../src/photo-order.js';

test('reordering keeps all photo objects, filters and crop transforms', () => {
  const photos = Array.from({ length: 8 }, (_, id) => ({ id, canvas: { id }, filter: 'bw', zoom: 1.5, ox: .1, oy: -.2 }));
  const moved = movePhoto(photos, 7, 0);
  assert.deepEqual(moved.map(photo => photo.id), [7, 0, 1, 2, 3, 4, 5, 6]);
  assert.equal(moved[0], photos[7]);
  assert.deepEqual(photos.map(photo => photo.id), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(movePhoto(moved, 0, 7), photos);
  for (const count of [4, 6, 8]) {
    const list = photos.slice(0, count);
    assert.equal(new Set(movePhoto(list, 0, count - 1)).size, count);
  }
});

test('invalid reorder targets leave the photo list untouched', () => {
  const photos = [{ id: 1 }];
  for (const [from, to] of [[0, 0], [-1, 0], [0, 1], [NaN, 0], [0, .5]]) assert.equal(movePhoto(photos, from, to), photos);
  const empty = [];
  assert.equal(movePhoto(empty, 0, 1), empty);
});

function guard() {
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const code = source.slice(source.indexOf('let savedPhotoKey = null;'), source.indexOf('\nfunction renderVisitorCount()'));
  let key = 'original', confirms = 0, accepts = false, registrations = 0;
  const listeners = new Map(), state = { photos: [] };
  const context = vm.createContext({ state, stateKey: () => key, tr: value => value,
    window: {
      addEventListener(type, fn) { listeners.set(type, fn); registrations++; },
      removeEventListener(type) { listeners.delete(type); },
      confirm() { confirms++; return accepts; },
    },
  });
  vm.runInContext(code, context);
  return { context, state, listeners, setKey: value => { key = value; }, setAccept: value => { accepts = value; },
    confirms: () => confirms, registrations: () => registrations };
}

test('exit listener exists only while photos or edits are unsaved', () => {
  const g = guard();
  g.context.syncLeaveWarning();
  assert.equal(g.listeners.size, 0);
  g.state.photos.push({ id: 1 });
  g.context.syncLeaveWarning(); g.context.syncLeaveWarning();
  assert.equal(g.registrations(), 1);
  const event = { prevented: false, preventDefault() { this.prevented = true; } };
  g.listeners.get('beforeunload')(event);
  assert.equal(event.prevented, true);
  g.context.markPhotosSaved('original');
  assert.equal(g.listeners.size, 0);
  g.setKey('edited'); g.context.syncLeaveWarning();
  assert.equal(g.listeners.size, 1);
  g.setKey('original'); g.context.syncLeaveWarning();
  assert.equal(g.listeners.size, 0);
});

test('finishing an older export does not mark newer edits as saved', () => {
  const g = guard();
  g.state.photos.push({ id: 1 });
  g.setKey('newer-edit');
  g.context.markPhotosSaved('original');
  assert.equal(g.context.hasUnsavedPhotos(), true);
  assert.equal(g.listeners.size, 1);
});

test('canceling discard preserves photos; empty and downloaded sessions skip confirmation', () => {
  const g = guard();
  assert.equal(g.context.confirmPhotoDiscard(), true);
  assert.equal(g.confirms(), 0);
  const photo = { id: 1 }; g.state.photos.push(photo);
  assert.equal(g.context.confirmPhotoDiscard(), false);
  assert.equal(g.state.photos[0], photo);
  g.setAccept(true);
  assert.equal(g.context.confirmPhotoDiscard(), true);
  g.context.markPhotosSaved('original');
  assert.equal(g.context.confirmPhotoDiscard(), true);
  assert.equal(g.confirms(), 2);
});


test('reordering keeps an unfinished retake attached to the same photo', () => {
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const code = source.slice(source.indexOf('function movePreviewPhoto('), source.indexOf('\nfunction renderPhotoOrder()'));
  const photos = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const state = { photos, selectedPhotoIndex: 2, replaceIndex: 1 };
  const context = vm.createContext({ state, movePhoto, orderSelected: 0,
    renderDots() {}, renderThumbs() {}, renderPreview() {},
    $: () => ({}), tr: key => key, localNumber: String,
    document: { querySelector: () => ({ focus() {} }) },
  });
  vm.runInContext(code, context);
  context.movePreviewPhoto(1, 0);
  assert.equal(state.photos[state.replaceIndex], photos[1]);
  assert.equal(state.photos[state.selectedPhotoIndex], photos[2]);
});
