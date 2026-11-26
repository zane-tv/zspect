import type { PinRecord } from '@/types/zspect';

function loadBlobAsImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

export async function buildCompositePinsImageBlob(
  sessionTitle: string,
  pins: PinRecord[],
): Promise<Blob | null> {
  const pinsWithImg = pins.filter((p) => Boolean(p.croppedImageBlob));
  if (pinsWithImg.length === 0) return null;

  // Single pin fast-path: return its exact crisp annotated PNG directly
  if (pinsWithImg.length === 1) {
    return pinsWithImg[0]!.croppedImageBlob!;
  }

  const loaded = await Promise.all(
    pinsWithImg.map(async (pin) => ({
      pin,
      img: await loadBlobAsImage(pin.croppedImageBlob!),
    })),
  );

  const canvasWidth = 960;
  const padding = 32;
  const cardGap = 24;
  const headerHeight = 68;
  const innerWidth = canvasWidth - padding * 2;

  const cardLayouts = loaded.map(({ pin, img }) => {
    const scale = Math.min(1, (innerWidth - 32) / Math.max(1, img.naturalWidth));
    const drawW = Math.round(img.naturalWidth * scale);
    const drawH = Math.min(380, Math.round(img.naturalHeight * scale));
    const captionH = 52;
    return {
      pin,
      img,
      drawW,
      drawH,
      cardH: captionH + drawH + 24,
    };
  });

  const totalHeight =
    padding +
    headerHeight +
    cardLayouts.reduce((sum, item) => sum + item.cardH, 0) +
    cardGap * Math.max(0, cardLayouts.length - 1) +
    padding;

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d')!;

  // Background (#f5f5f7 Studio Mist)
  ctx.fillStyle = '#f5f5f7';
  ctx.fillRect(0, 0, canvasWidth, totalHeight);

  // Header Title
  ctx.fillStyle = '#1d1d1f';
  ctx.font = '600 22px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(`ZSpect — ${sessionTitle} (${pinsWithImg.length} items)`, padding, padding + 30);

  let cursorY = padding + headerHeight;

  for (const item of cardLayouts) {
    // Card white surface
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#e6e6e8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(padding, cursorY, innerWidth, item.cardH, 20);
    ctx.fill();
    ctx.stroke();

    // Badge (#1, #2)
    const badgeColor =
      item.pin.severity === 'critical' || item.pin.severity === 'high' ? '#b64400' : '#0071e3';
    ctx.fillStyle = badgeColor;
    ctx.beginPath();
    ctx.arc(padding + 28, cursorY + 26, 13, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '600 12px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`#${item.pin.orderIndex}`, padding + 28, cursorY + 26.5);

    // Caption text
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#1d1d1f';
    ctx.font = '600 14px -apple-system, BlinkMacSystemFont, sans-serif';
    const notePreview = (item.pin.note || item.pin.selector).replace(/\s+/g, ' ').slice(0, 82);
    ctx.fillText(
      `[${item.pin.type.toUpperCase()}] ${notePreview}`,
      padding + 50,
      cursorY + 31,
    );

    // Draw screenshot centered horizontally inside card
    const imgX = padding + Math.round((innerWidth - item.drawW) / 2);
    const imgY = cursorY + 50;
    ctx.drawImage(item.img, 0, 0, item.img.naturalWidth, item.img.naturalHeight, imgX, imgY, item.drawW, item.drawH);

    cursorY += item.cardH + cardGap;
  }

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

export async function copyImageAndOrTextToClipboard(options: {
  imageBlob?: Blob | null;
  text?: string;
}): Promise<'both' | 'image' | 'text' | 'failed'> {
  const { imageBlob, text } = options;

  if (imageBlob && text) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': imageBlob,
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ]);
      return 'both';
    } catch {
      // Fallback to text if multi-MIME item rejected
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': imageBlob })]);
        return 'image';
      } catch {
        await navigator.clipboard.writeText(text);
        return 'text';
      }
    }
  }

  if (imageBlob) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': imageBlob })]);
      return 'image';
    } catch {
      return 'failed';
    }
  }

  if (text) {
    await navigator.clipboard.writeText(text);
    return 'text';
  }

  return 'failed';
}
