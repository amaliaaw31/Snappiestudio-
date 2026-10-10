/* One local atlas source for the picker, photo preview and exported PNG. */
import { EMOJI_CATALOG } from './emoji-catalog.js';

const entries = new Map(EMOJI_CATALOG.map(entry => [entry.value.replace(/\uFE0F/g, ''), entry]));
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/* Atlas gutters vary slightly; share these crop boundaries between SVG and Canvas. */
const ATLAS_ROWS = {
  faces: [0, 290, 560, 830, 1122],
  hearts: [0, 305, 560, 825, 1122],
  hands: [0, 290, 560, 830, 1122],
  nature: [0, 330, 600, 865, 1122],
  food: [0, 285, 560, 825, 1122],
  party: [0, 285, 580, 840, 1122],
};

/* These source cells include a few pixels from the illustration beside them. */
const ATLAS_INSETS = {
  "😎": [12, 0],
  "💓": [12, 0],
  "💞": [0, 13],
  "💘": [0, 13],
  "🫶": [18, 0],
  "🐥": [0, 24],
  "🐶": [24, 0],
  "🐼": [0, 14],
  "🦊": [0, 13],
  "🦋": [14, 0],
  "🌸": [0, 13],
  "🌺": [0, 12],
  "🌈": [0, 24],
  "☀️": [24, 0],
  "🍕": [0, 18],
  "🍔": [0, 20],
  "🌮": [17, 13],
  "🍣": [0, 21],
  "🍉": [0, 24],
  "🎀": [0, 14],
  "🕶️": [0, 24],
  "⚡": [24, 0],
  "🎉": [0, 20],
  "💌": [0, 16],
  "🎊": [0, 24],
  "🎁": [24, 0],
  "🎂": [0, 20],
  "🪩": [0, 12],
  "📷": [0, 24],
  "🕯️": [24, 0],
  "🫧": [0, 18],
  "🏆": [0, 15],
};
export function emojiSourceRect(entry, width = 1402, height = 1122) {
  const row = Math.floor(entry.index / 5), rows = ATLAS_ROWS[entry.category];
  const [leftInset, rightInset] = ATLAS_INSETS[entry.value] || [0, 0];
  return { x: (entry.index % 5 * width / 5) + leftInset * width / 1402,
    y: rows[row] * height / 1122,
    width: width / 5 - (leftInset + rightInset) * width / 1402,
    height: (rows[row + 1] - rows[row]) * height / 1122 };
}

export function emojiArtwork(value) {
  return entries.get(value.replace(/\uFE0F/g, '')) || null;
}

export function emojiStickerUrl(value) {
  const entry = emojiArtwork(value);
  return entry ? './emoji/iphone-inspired/' + entry.category + '.png' : null;
}

export function emojiArtMarkup(value, extraClass = '') {
  const entry = emojiArtwork(value);
  if (!entry) return '';
  const rect = emojiSourceRect(entry);
  const viewBox = [rect.x, rect.y, rect.width, rect.height].join(' ');
  // The outer SVG can letterbox. Clip the atlas inside a nested viewport so
  // neighboring cells cannot paint into that otherwise empty space.
  return '<svg class="emoji-art ' + extraClass + '" aria-hidden="true" focusable="false" viewBox="' +
    viewBox + '"><svg x="' + rect.x + '" y="' + rect.y + '" width="' + rect.width +
    '" height="' + rect.height + '" viewBox="' + viewBox + '" overflow="hidden"><image href="' +
    emojiStickerUrl(value) + '" width="1402" height="1122"/></svg></svg>';
}

/* Graphemes keep unsupported skin tones/ZWJ sequences intact for native fallback. */
export function splitEmojiRuns(text) {
  const runs = [];
  for (const { segment } of segmenter.segment(text)) {
    const entry = emojiArtwork(segment);
    if (entry) runs.push({ value: segment, emoji: entry.value });
    else if (runs.length && !runs[runs.length - 1].emoji) runs[runs.length - 1].value += segment;
    else runs.push({ value: segment, emoji: null });
  }
  return runs;
}

const images = new Map();
export async function loadEmojiImgs(values) {
  const loaded = await Promise.all([...new Set(values)].map(async value => {
    const entry = emojiArtwork(value);
    const url = emojiStickerUrl(value);
    if (!entry) return [value, null];
    if (!images.has(url)) {
      const image = new Image();
      image.src = url;
      images.set(url, image.decode().then(() => image).catch(err => {
        images.delete(url);
        throw err;
      }));
    }
    return [value, { image: await images.get(url), entry }];
  }));
  return Object.fromEntries(loaded);
}

export function drawEmojiArt(context, artwork, x, y, size) {
  const { image, entry } = artwork;
  const rect = emojiSourceRect(entry, image.naturalWidth, image.naturalHeight);
  const fit = Math.min(size / rect.width, size / rect.height);
  const width = rect.width * fit, height = rect.height * fit;
  context.drawImage(image, rect.x, rect.y, rect.width, rect.height,
    x + (size - width) / 2, y + (size - height) / 2, width, height);
}

/* Inline emoji occupy one em, matching .text-emoji in the HTML preview. */
export function drawStickerText(context, text, artwork, fontSize, outline = true) {
  const runs = splitEmojiRuns(text);
  const widths = runs.map(run => run.emoji ? fontSize : context.measureText(run.value).width);
  let left = -widths.reduce((sum, width) => sum + width, 0) / 2;
  context.textAlign = 'left';
  runs.forEach((run, index) => {
    if (run.emoji) {
      drawEmojiArt(context, artwork[run.emoji], left, -fontSize / 2, fontSize);
    } else {
      if (outline) context.strokeText(run.value, left, 0);
      context.fillText(run.value, left, 0);
    }
    left += widths[index];
  });
}
