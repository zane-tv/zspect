import type { ZSpectRuntimeMessage } from '@/types/zspect';

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = dataUrl;
  });
}

async function cropAndAnnotateImage(
  msg: Extract<ZSpectRuntimeMessage, { type: 'ZSPECT_OFFSCREEN_CROP' }>,
): Promise<string> {
  const img = await loadImage(msg.dataUrl);
  const scaleX = img.naturalWidth / Math.max(1, msg.viewport.width);
  const scaleY = img.naturalHeight / Math.max(1, msg.viewport.height);

  const padCss = 28; // Apple-balanced context margin around inspected element
  const cropXCss = Math.max(0, msg.rect.x - padCss);
  const cropYCss = Math.max(0, msg.rect.y - padCss);
  const cropRightCss = Math.min(msg.viewport.width, msg.rect.x + msg.rect.width + padCss);
  const cropBottomCss = Math.min(msg.viewport.height, msg.rect.y + msg.rect.height + padCss);

  const cropWCss = Math.max(40, cropRightCss - cropXCss);
  const cropHCss = Math.max(40, cropBottomCss - cropYCss);

  const sx = Math.round(cropXCss * scaleX);
  const sy = Math.round(cropYCss * scaleY);
  const sw = Math.min(img.naturalWidth - sx, Math.round(cropWCss * scaleX));
  const sh = Math.min(img.naturalHeight - sy, Math.round(cropHCss * scaleY));

  const maxOutDim = 1200;
  const outScale = Math.min(1, maxOutDim / Math.max(sw, sh));
  const outW = Math.max(1, Math.round(sw * outScale));
  const outH = Math.max(1, Math.round(sh * outScale));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d')!;

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);

  // Highlight target rectangle inside cropped canvas
  const boxX = (msg.rect.x - cropXCss) * scaleX * outScale;
  const boxY = (msg.rect.y - cropYCss) * scaleY * outScale;
  const boxW = msg.rect.width * scaleX * outScale;
  const boxH = msg.rect.height * scaleY * outScale;

  const strokeColor = msg.accentColor || '#0071e3';
  ctx.save();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = Math.max(2, Math.round(2 * outScale * scaleX));
  ctx.fillStyle = strokeColor === '#b64400' ? 'rgba(182, 68, 0, 0.08)' : 'rgba(0, 113, 227, 0.08)';
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeRect(boxX, boxY, boxW, boxH);

  // Numbered Pin Badge (#1, #2...)
  if (msg.badgeNumber !== undefined) {
    const radius = Math.max(12, Math.round(13 * scaleX * outScale));
    const cx = Math.max(radius + 4, Math.min(outW - radius - 4, boxX));
    const cy = Math.max(radius + 4, Math.min(outH - radius - 4, boxY));

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = strokeColor;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = `600 ${Math.round(radius * 1.05)}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${msg.badgeNumber}`, cx, cy + 0.5);
  }
  ctx.restore();

  return canvas.toDataURL('image/png');
}

chrome.runtime.onMessage.addListener((message: ZSpectRuntimeMessage, _sender, sendResponse) => {
  if (message?.type === 'ZSPECT_OFFSCREEN_CROP') {
    cropAndAnnotateImage(message)
      .then((croppedDataUrl) => sendResponse({ ok: true, dataUrl: croppedDataUrl }))
      .catch((err) =>
        sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      );
    return true;
  }
  return false;
});
