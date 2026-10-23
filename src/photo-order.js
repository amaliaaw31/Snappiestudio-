export function movePhoto(photos, from, to) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from === to ||
      from < 0 || to < 0 || from >= photos.length || to >= photos.length) return photos;
  const result = [...photos];
  const [photo] = result.splice(from, 1);
  result.splice(to, 0, photo);
  return result;
}
