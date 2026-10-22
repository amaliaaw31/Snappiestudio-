import { GIFEncoder, quantize, applyPalette } from 'gifenc';

export async function encodeGif(frames) {
  const gif = GIFEncoder();
  let count = 0;
  for await (const source of frames) {
    const scale = Math.min(1, 720 / Math.max(source.width, source.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(source.width * scale));
    canvas.height = Math.max(1, Math.round(source.height * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const palette = quantize(rgba, 256);
    gif.writeFrame(applyPalette(rgba, palette), canvas.width, canvas.height, { palette, delay: 800, repeat: 0, dispose: 2 });
    count++;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  if (!count) throw new Error('No GIF frames');
  gif.finish();
  return new Blob([gif.bytes()], { type: 'image/gif' });
}
