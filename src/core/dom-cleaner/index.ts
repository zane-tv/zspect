import { REDACTED } from '@/core/redactor';

export const ZSPECT_HOST_ATTR = 'data-zspect-root';

const STABLE_TEST_ATTRS = [
  'data-testid',
  'data-test-id',
  'data-test',
  'data-cy',
  'data-qa',
  'aria-label',
  'name',
];

const NOISY_CLASS_PATTERN =
  /^(css-[a-z0-9]+|sc-[a-zA-Z0-9-]+|_[a-zA-Z0-9]+_[a-z0-9]+|jsx-\d+|svelte-[a-z0-9]+|astro-[a-z0-9]+)$/i;

export function isZSpectInternalNode(node: Node | null): boolean {
  let curr: Node | null = node;
  while (curr) {
    if (curr instanceof Element && curr.hasAttribute(ZSPECT_HOST_ATTR)) {
      return true;
    }
    if (curr instanceof ShadowRoot) {
      curr = curr.host;
    } else {
      curr = curr.parentNode;
    }
  }
  return false;
}

export function deepElementFromPoint(x: number, y: number): Element | null {
  let root: Document | ShadowRoot = document;
  let lastHit: Element | null = null;

  for (let depth = 0; depth < 12; depth++) {
    const candidates: Element[] = root.elementsFromPoint(x, y);
    const hit: Element | undefined = candidates.find((el: Element) => !isZSpectInternalNode(el));
    if (!hit) break;

    lastHit = hit;
    if (hit.shadowRoot && hit.shadowRoot.mode === 'open') {
      const innerHit = hit.shadowRoot.elementFromPoint(x, y);
      if (innerHit && innerHit !== hit) {
        root = hit.shadowRoot;
        continue;
      }
    }
    break;
  }

  return lastHit;
}

function escapeCssIdent(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/([^a-zA-Z0-9_-])/g, '\\$1');
}

function isCleanId(id: string): boolean {
  if (!id || id.length > 48) return false;
  // Skip React/Radix auto-generated IDs like ":r1:", "radix-:r4:"
  if (id.includes(':')) return false;
  if (/^[0-9a-f-]{24,}$/i.test(id)) return false;
  return true;
}

export function buildResilientSelector(el: Element): string {
  if (el === document.body) return 'body';
  if (el === document.documentElement) return 'html';

  if (el.id && isCleanId(el.id)) {
    const idSel = `#${escapeCssIdent(el.id)}`;
    try {
      if (document.querySelectorAll(idSel).length === 1) return idSel;
    } catch {
      // Continue building hierarchical selector
    }
  }

  const segments: string[] = [];
  let current: Element | null = el;

  while (current && current !== document.body && current !== document.documentElement && segments.length < 5) {
    const tag = current.tagName.toLowerCase();

    if (current.id && isCleanId(current.id)) {
      segments.unshift(`#${escapeCssIdent(current.id)}`);
      break;
    }

    let attrPart = '';
    for (const attr of STABLE_TEST_ATTRS) {
      const val = current.getAttribute(attr);
      if (val && val.length <= 48 && !val.includes('"')) {
        attrPart = `[${attr}="${val}"]`;
        break;
      }
    }

    if (attrPart) {
      segments.unshift(`${tag}${attrPart}`);
      const candidate = segments.join(' > ');
      try {
        if (document.querySelectorAll(candidate).length === 1) return candidate;
      } catch {
        // Keep climbing
      }
      current = current.parentElement;
      continue;
    }

    const cleanClasses = Array.from(current.classList)
      .filter((c) => c.length <= 32 && !NOISY_CLASS_PATTERN.test(c) && !c.includes(':'))
      .slice(0, 2)
      .map((c) => `.${escapeCssIdent(c)}`)
      .join('');

    let nthPart = '';
    const parentEl: Element | null = current.parentElement;
    if (parentEl) {
      const currTag = current.tagName;
      const sameTagSiblings = Array.from(parentEl.children).filter(
        (child: Element) => child.tagName === currTag,
      );
      if (sameTagSiblings.length > 1) {
        const idx = sameTagSiblings.indexOf(current) + 1;
        nthPart = `:nth-of-type(${idx})`;
      }
    }

    segments.unshift(`${tag}${cleanClasses}${nthPart}`);
    const candidate = segments.join(' > ');
    try {
      if (document.querySelectorAll(candidate).length === 1) return candidate;
    } catch {
      // Keep climbing
    }

    current = parentEl;
  }

  return segments.join(' > ') || el.tagName.toLowerCase();
}

export function queryDeepSelector(selector: string): Element | null {
  try {
    const direct = document.querySelector(selector);
    if (direct) return direct;
  } catch {
    return null;
  }

  const walkShadow = (root: ParentNode): Element | null => {
    for (const el of Array.from(root.querySelectorAll('*'))) {
      if (el.shadowRoot && el.shadowRoot.mode === 'open') {
        const hit = el.shadowRoot.querySelector(selector) || walkShadow(el.shadowRoot);
        if (hit) return hit;
      }
    }
    return null;
  };

  return walkShadow(document);
}

const KEEP_ATTRS = new Set([
  'id',
  'class',
  'role',
  'type',
  'href',
  'alt',
  'placeholder',
  'aria-label',
  'aria-expanded',
  'aria-disabled',
  'data-testid',
  'data-state',
  'viewBox',
]);

export function extractCleanHtml(
  el: Element,
  options: { maxDepth?: number; maxLength?: number; skeletonOnly?: boolean } = {},
): string {
  const { maxDepth = 4, maxLength = 2400, skeletonOnly = false } = options;

  const serializeNode = (node: Node, depth: number): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (!text) return '';
      if (skeletonOnly && text.length > 36) {
        return `${text.slice(0, 36)}…`;
      }
      return text.length > 140 ? `${text.slice(0, 140)}…` : text;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const elem = node as Element;
    if (isZSpectInternalNode(elem)) return '';

    const tag = elem.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'noscript') return '';

    const isSensitive =
      elem.hasAttribute('data-sensitive') ||
      (elem instanceof HTMLInputElement && elem.type === 'password');

    if (tag === 'svg') {
      const rect = elem.getBoundingClientRect();
      const viewBox = elem.getAttribute('viewBox') ?? '';
      const dims = rect.width > 0 ? `${Math.round(rect.width)}x${Math.round(rect.height)}` : 'icon';
      return `<svg${viewBox ? ` viewBox="${viewBox}"` : ''} data-icon="${dims}" />`;
    }

    const attrs: string[] = [];
    for (const attr of Array.from(elem.attributes)) {
      if (!KEEP_ATTRS.has(attr.name) && !attr.name.startsWith('aria-')) continue;
      let val = attr.value.trim();
      if (!val) continue;

      if (attr.name === 'class') {
        const filtered = val
          .split(/\s+/)
          .filter((c) => !NOISY_CLASS_PATTERN.test(c))
          .slice(0, 8)
          .join(' ');
        if (!filtered) continue;
        val = filtered;
      } else if (attr.name === 'href' && val.startsWith('data:')) {
        val = 'data:[truncated]';
      } else if (val.length > 80) {
        val = `${val.slice(0, 80)}…`;
      }
      attrs.push(`${attr.name}="${val.replace(/"/g, '&quot;')}"`);
    }

    if (elem instanceof HTMLImageElement) {
      const src = elem.getAttribute('src') ?? '';
      const cleanSrc = src.startsWith('data:') ? 'data:image/[truncated]' : src.slice(0, 80);
      if (cleanSrc) attrs.push(`src="${cleanSrc.replace(/"/g, '&quot;')}"`);
    }

    const attrStr = attrs.length ? ` ${attrs.join(' ')}` : '';
    if (isSensitive) {
      return `<${tag}${attrStr}>${REDACTED}</${tag}>`;
    }

    if (['img', 'input', 'br', 'hr'].includes(tag)) {
      return `<${tag}${attrStr} />`;
    }

    if (depth >= maxDepth) {
      const childCount = elem.children.length;
      const innerPreview = childCount > 0 ? `<!-- ${childCount} children -->` : (elem.textContent ?? '').trim().slice(0, 40);
      return `<${tag}${attrStr}>${innerPreview}</${tag}>`;
    }

    const childrenHtml = Array.from(elem.childNodes)
      .map((child) => serializeNode(child, depth + 1))
      .filter(Boolean)
      .join(skeletonOnly ? '\n' + '  '.repeat(depth + 1) : '');

    return `<${tag}${attrStr}>${childrenHtml}</${tag}>`;
  };

  const result = serializeNode(el, 0);
  if (result.length > maxLength) {
    return `${result.slice(0, maxLength)}\n<!-- truncated -->`;
  }
  return result;
}
