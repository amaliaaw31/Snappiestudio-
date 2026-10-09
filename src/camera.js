/* Center crop matches object-fit: cover followed by preview scaling. */
export function cameraCrop(videoWidth, videoHeight, aspectRatio, zoom = 1) {
  let width = videoWidth, height = Math.round(videoWidth / aspectRatio);
  if (height > videoHeight) {
    height = videoHeight;
    width = Math.round(videoHeight * aspectRatio);
  }
  const scale = Math.max(1, Math.min(3, Number(zoom) || 1));
  const sw = width / scale, sh = height / scale;
  return { width, height, sx: (videoWidth - sw) / 2, sy: (videoHeight - sh) / 2, sw, sh };
}
