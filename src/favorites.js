import { THEMES, FILTERS, FONT_TRACKING } from './data.js';

export const FAVORITES_KEY = 'snappie-favorites-v1';
export function favoriteSettings(source) {
  if (!source || !THEMES.some(t => t.id === source.theme) || !FILTERS.some(f => f.id === source.filter)) return null;
  const result = { theme: source.theme, filter: source.filter, frame: source.frame !== false,
    showDate: !!source.showDate };
  for (const key of ['captionFont', 'dateFont']) {
    result[key] = Object.hasOwn(FONT_TRACKING, source[key]) ? source[key] : 'Matcha Iced';
  }
  for (const key of ['captionColor', 'dateColor']) {
    result[key] = /^#[\da-f]{6}$/i.test(source[key]) ? source[key] : '';
  }
  if (source.customFrame && typeof source.customFrame === 'object') {
    result.customFrame = {};
    for (const key of ['bg', 'bg2', 'outline', 'slot']) {
      if (/^#[\da-f]{6}$/i.test(source.customFrame[key])) result.customFrame[key] = source.customFrame[key];
    }
    for (const key of ['gradient', 'outlineOn', 'slotBorder']) result.customFrame[key] = source.customFrame[key] !== false;
    result.customFrame.pattern = ['none', 'dots', 'stripes'].includes(source.customFrame.pattern) ? source.customFrame.pattern : 'none';
  }
  return result;
}

export function readFavorites(storage) {
  try {
    const entries = JSON.parse(storage.getItem(FAVORITES_KEY) || '[]');
    if (!Array.isArray(entries)) return [];
    return entries.slice(0, 12).flatMap(entry => {
      const settings = favoriteSettings(entry?.settings);
      return settings && typeof entry.name === 'string' && entry.name.trim()
        ? [{ name: entry.name.trim().slice(0, 32), settings }] : [];
    });
  } catch { return []; }
}
