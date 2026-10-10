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

/* A resolved torch constraint does not mean the video already contains the lit
   scene. Allow exposure to settle, then wait for a newly presented video frame. */
export async function waitForFlashFrame(video, { isCurrent = () => true } = {}) {
  if (!video || !isCurrent()) return false;
  await new Promise(resolve => setTimeout(resolve, 1500));
  if (!isCurrent()) return false;
  return new Promise(resolve => {
    let callbackId = null, pollTimer = null, timeout = null, done = false;
    const finish = ready => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      clearTimeout(pollTimer);
      if (callbackId !== null && typeof video.cancelVideoFrameCallback === 'function') {
        video.cancelVideoFrameCallback(callbackId);
      }
      resolve(ready);
    };
    const valid = () => isCurrent() && !video.paused && !video.ended;
    const ready = () => valid() && video.readyState >= 2 && video.videoWidth > 0;
    timeout = setTimeout(() => finish(false), 2000);
    if (typeof video.requestVideoFrameCallback === 'function') {
      try {
        callbackId = video.requestVideoFrameCallback(() => finish(ready()));
      } catch (e) { finish(false); return; }
      const check = () => {
        if (!valid()) { finish(false); return; }
        pollTimer = setTimeout(check, 50);
      };
      check();
    } else {
      const framePosition = () => typeof video.getVideoPlaybackQuality === 'function'
        ? video.getVideoPlaybackQuality().totalVideoFrames : video.currentTime;
      const before = framePosition();
      const check = () => {
        if (!valid()) { finish(false); return; }
        if (ready() && framePosition() > before) { finish(true); return; }
        pollTimer = setTimeout(check, 50);
      };
      check();
    }
  });
}

/* Facing mode alone can select a rear lens without a flash. Inspect the actual
   tracks and prefer a rear camera that exposes torch, without guessing lens IDs. */
export async function openCameraStream(mediaDevices, facing, { isCurrent = () => true, onInspect = () => {} } = {}) {
  const requested = { facingMode: facing, width: { ideal: 1280 } };
  const stop = stream => stream.getTracks().forEach(track => track.stop());
  const current = stream => {
    if (isCurrent()) return;
    if (stream) stop(stream);
    throw Object.assign(new Error('Camera request superseded'), { name: 'AbortError' });
  };
  const open = async video => {
    current();
    const stream = await mediaDevices.getUserMedia({ video, audio: false });
    current(stream);
    return stream;
  };
  const inspect = stream => {
    const track = stream.getVideoTracks()[0];
    try { onInspect(track); } catch (e) { /* diagnostics must not interrupt camera selection */ }
    let settings = {}, capabilities = {};
    try { settings = track?.getSettings?.() || {}; } catch (e) { /* optional API */ }
    try { capabilities = track?.getCapabilities?.() || {}; } catch (e) { /* optional API */ }
    const torch = capabilities.torch;
    return {
      deviceId: settings.deviceId,
      hasRearTorch: settings.facingMode === 'environment'
        && (torch === true || (Array.isArray(torch) && torch.includes(true))),
    };
  };

  const initial = await open(requested);
  const initialInfo = inspect(initial);
  if (facing !== 'environment' || initialInfo.hasRearTorch || !initialInfo.deviceId
      || typeof mediaDevices.enumerateDevices !== 'function') return initial;

  let devices;
  try { devices = await mediaDevices.enumerateDevices(); }
  catch (e) { current(initial); return initial; }
  current(initial);
  const candidates = [...new Set(devices.filter(device => device.kind === 'videoinput'
    && device.deviceId && device.deviceId !== initialInfo.deviceId).map(device => device.deviceId))];
  if (!candidates.length) return initial;

  // Android commonly requires closing one camera before another can be opened.
  stop(initial);
  for (const deviceId of candidates) {
    let candidate;
    try {
      candidate = await open({ ...requested, deviceId: { exact: deviceId }, facingMode: { exact: 'environment' } });
    } catch (e) {
      current();
      continue;
    }
    if (inspect(candidate).hasRearTorch) return candidate;
    stop(candidate);
  }

  // No supported alternative: preserve the original camera rather than choose
  // a different unsupported lens or leave the last probed camera running.
  const restored = await open({ ...requested, deviceId: { exact: initialInfo.deviceId } });
  inspect(restored);
  return restored;
}
