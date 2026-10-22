export const OUTPUT_FORMATS = { story: [1080, 1920], post: [1080, 1350] };

export function containRect(width, height, targetWidth, targetHeight) {
  const scale = Math.min(targetWidth / width, targetHeight / height);
  return { x: (targetWidth - width * scale) / 2, y: (targetHeight - height * scale) / 2,
    width: width * scale, height: height * scale };
}

export function formatOutput(source, format) {
  const size = OUTPUT_FORMATS[format];
  if (!size) return source;
  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, ...size);
  const rect = containRect(source.width, source.height, ...size);
  ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height);
  return canvas;
}
