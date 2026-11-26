import type { A11yAuditSnapshot } from '@/types/zspect';

export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function parseCssColor(raw: string): RgbaColor | null {
  const str = raw.trim().toLowerCase();
  if (!str || str === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };

  if (str.startsWith('#')) {
    const hex = str.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0]! + hex[0]!, 16),
        g: parseInt(hex[1]! + hex[1]!, 16),
        b: parseInt(hex[2]! + hex[2]!, 16),
        a: 1,
      };
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      };
    }
  }

  const rgbMatch = str.match(
    /^rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)(?:\s*[,/]\s*([\d.%]+))?\s*\)$/,
  );
  if (rgbMatch) {
    let a = 1;
    if (rgbMatch[4] !== undefined) {
      a = rgbMatch[4].endsWith('%')
        ? parseFloat(rgbMatch[4]) / 100
        : parseFloat(rgbMatch[4]);
    }
    return {
      r: Math.min(255, Math.max(0, Math.round(parseFloat(rgbMatch[1]!)))),
      g: Math.min(255, Math.max(0, Math.round(parseFloat(rgbMatch[2]!)))),
      b: Math.min(255, Math.max(0, Math.round(parseFloat(rgbMatch[3]!)))),
      a: Math.min(1, Math.max(0, a)),
    };
  }

  return null;
}

export function blendOver(fg: RgbaColor, bg: RgbaColor): RgbaColor {
  const alpha = fg.a + bg.a * (1 - fg.a);
  if (alpha === 0) return { r: 255, g: 255, b: 255, a: 0 };
  return {
    r: Math.round((fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / alpha),
    g: Math.round((fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / alpha),
    b: Math.round((fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / alpha),
    a: alpha,
  };
}

export function relativeLuminance(color: RgbaColor): number {
  const channel = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

export function computeContrastRatio(fg: RgbaColor, bg: RgbaColor): number {
  const effectiveFg = fg.a < 1 ? blendOver(fg, bg) : fg;
  const l1 = relativeLuminance(effectiveFg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
}

function formatRgbaHex(c: RgbaColor): string {
  return `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function resolveEffectiveBackground(el: Element): RgbaColor {
  const layers: RgbaColor[] = [];
  let curr: Element | null = el;

  while (curr) {
    const cs = window.getComputedStyle(curr);
    const parsed = parseCssColor(cs.backgroundColor);
    if (parsed && parsed.a > 0) {
      layers.push(parsed);
      if (parsed.a >= 1) break;
    }
    curr = curr.parentElement;
  }

  // Base browser canvas fallback is white (#ffffff)
  let composite: RgbaColor = { r: 255, g: 255, b: 255, a: 1 };
  for (let i = layers.length - 1; i >= 0; i--) {
    composite = blendOver(layers[i]!, composite);
  }
  return composite;
}

const INTERACTIVE_TAGS = new Set(['a', 'button', 'input', 'select', 'textarea', 'summary']);

export function auditElementAccessibility(el: Element): A11yAuditSnapshot {
  const cs = window.getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  const fgParsed = parseCssColor(cs.color) ?? { r: 29, g: 29, b: 31, a: 1 };
  const bgComposite = resolveEffectiveBackground(el);
  const ratio = computeContrastRatio(fgParsed, bgComposite);

  const fontSizePx = parseFloat(cs.fontSize) || 16;
  const fontWeight = parseInt(cs.fontWeight, 10) || 400;
  const isLargeText = fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);

  const aaThreshold = isLargeText ? 3.0 : 4.5;
  const aaaThreshold = isLargeText ? 4.5 : 7.0;
  const wcagAA = ratio >= aaThreshold;
  const wcagAAA = ratio >= aaaThreshold;

  const tag = el.tagName.toLowerCase();
  const explicitRole = el.getAttribute('role') ?? undefined;
  const ariaLabel =
    el.getAttribute('aria-label') ||
    el.getAttribute('title') ||
    (el instanceof HTMLImageElement ? el.getAttribute('alt') : null) ||
    (el.textContent ?? '').trim().slice(0, 60) ||
    undefined;

  const isInteractive =
    INTERACTIVE_TAGS.has(tag) ||
    explicitRole === 'button' ||
    explicitRole === 'link' ||
    el.hasAttribute('onclick') ||
    (el.hasAttribute('tabindex') && el.getAttribute('tabindex') !== '-1');

  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  const touchTargetPass = !isInteractive || (width >= 44 && height >= 44) || (width >= 24 && height >= 24);
  const strictTouchPass = !isInteractive || (width >= 44 && height >= 44);

  const issues: string[] = [];
  if (!wcagAA && (el.textContent ?? '').trim().length > 0) {
    issues.push(`Low text contrast (${ratio}:1 < ${aaThreshold}:1 WCAG AA minimum)`);
  }
  if (tag === 'img' && !el.hasAttribute('alt')) {
    issues.push('<img> element is missing an alt attribute for screen readers');
  }
  if (isInteractive && !ariaLabel) {
    issues.push(`Interactive <${tag}> lacks an accessible name (aria-label or text)`);
  }
  if (isInteractive && !strictTouchPass) {
    issues.push(`Small touch target (${width}×${height}px, recommended minimum 44×44px)`);
  }

  return {
    contrastRatio: ratio,
    wcagAA,
    wcagAAA,
    isLargeText,
    foregroundColor: formatRgbaHex(blendOver(fgParsed, bgComposite)),
    effectiveBackgroundColor: formatRgbaHex(bgComposite),
    role: explicitRole ?? tag,
    accessibleName: ariaLabel,
    touchTargetPass: strictTouchPass && touchTargetPass,
    dimensions: { width, height },
    issues,
  };
}
