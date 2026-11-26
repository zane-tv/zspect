import type { MotionRules } from '@/types/zspect';

const LAYOUT_PROPS = [
  'display',
  'position',
  'flex-direction',
  'flex-wrap',
  'justify-content',
  'align-items',
  'gap',
  'grid-template-columns',
  'grid-template-rows',
  'width',
  'height',
  'padding',
  'margin',
] as const;

const VISUAL_PROPS = [
  'background-color',
  'background-image',
  'border',
  'border-radius',
  'box-shadow',
  'backdrop-filter',
  'opacity',
  'overflow',
] as const;

const TYPOGRAPHY_PROPS = [
  'color',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
  'text-align',
  'text-transform',
] as const;

const TRIVIAL_DEFAULTS = new Set([
  'none',
  'normal',
  'auto',
  '0px',
  'rgba(0, 0, 0, 0)',
  'transparent',
  'visible',
  'static',
  '1',
  'row',
  'nowrap',
  'start',
  'stretch',
]);

function pickStyles(cs: CSSStyleDeclaration, props: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const prop of props) {
    const val = cs.getPropertyValue(prop).trim();
    if (!val) continue;
    if (TRIVIAL_DEFAULTS.has(val) && prop !== 'display' && prop !== 'opacity') continue;
    if (prop === 'opacity' && val === '1') continue;
    if (prop === 'border' && val.startsWith('0px')) continue;
    out[prop] = val;
  }
  return out;
}

export function extractStyleGroups(el: Element): {
  layoutStyles: Record<string, string>;
  visualStyles: Record<string, string>;
  typographyStyles: Record<string, string>;
  combined: Record<string, string>;
} {
  const cs = window.getComputedStyle(el);
  const layoutStyles = pickStyles(cs, LAYOUT_PROPS);
  const visualStyles = pickStyles(cs, VISUAL_PROPS);
  const typographyStyles = pickStyles(cs, TYPOGRAPHY_PROPS);

  return {
    layoutStyles,
    visualStyles,
    typographyStyles,
    combined: { ...layoutStyles, ...visualStyles, ...typographyStyles },
  };
}

export function extractPseudoStyles(el: Element): {
  before?: Record<string, string>;
  after?: Record<string, string>;
} {
  const extractOne = (pseudo: '::before' | '::after'): Record<string, string> | undefined => {
    const cs = window.getComputedStyle(el, pseudo);
    const content = cs.getPropertyValue('content');
    if (!content || content === 'none' || content === 'normal') return undefined;
    return {
      content,
      ...pickStyles(cs, ['position', 'width', 'height', 'background-color', 'background-image', 'border', 'border-radius', 'opacity', 'backdrop-filter']),
    };
  };

  return {
    before: extractOne('::before'),
    after: extractOne('::after'),
  };
}

export function extractResolvedCssVariables(el: Element): Record<string, string> {
  const varsFound = new Set<string>();
  const inlineStyle = el.getAttribute('style') ?? '';
  for (const match of inlineStyle.matchAll(/--[a-zA-Z0-9-_]+/g)) {
    varsFound.add(match[0]);
  }

  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      // Cross-origin stylesheet without CORS
      continue;
    }
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        try {
          if (el.matches(rule.selectorText)) {
            const text = rule.cssText;
            for (const match of text.matchAll(/--[a-zA-Z0-9-_]+/g)) {
              varsFound.add(match[0]);
            }
          }
        } catch {
          // Non-standard selector
        }
      }
    }
  }

  const cs = window.getComputedStyle(el);
  const resolved: Record<string, string> = {};
  for (const varName of Array.from(varsFound).slice(0, 24)) {
    const val = cs.getPropertyValue(varName).trim();
    if (val) {
      resolved[varName] = val;
    }
  }
  return resolved;
}

export function extractMotionRules(el: Element): MotionRules {
  const cs = window.getComputedStyle(el);
  const transitions: string[] = [];
  const animations: string[] = [];
  const keyframesNames = new Set<string>();

  const transition = cs.getPropertyValue('transition').trim();
  if (transition && transition !== 'all 0s ease 0s' && transition !== 'none') {
    transitions.push(transition);
  }

  const animation = cs.getPropertyValue('animation').trim();
  if (animation && !animation.startsWith('none')) {
    animations.push(animation);
    const animName = cs.getPropertyValue('animation-name').trim();
    for (const n of animName.split(',')) {
      const clean = n.trim();
      if (clean && clean !== 'none') keyframesNames.add(clean);
    }
  }

  const keyframesCss: string[] = [];
  if (keyframesNames.size > 0) {
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSKeyframesRule && keyframesNames.has(rule.name)) {
          keyframesCss.push(rule.cssText);
        }
      }
    }
  }

  return { transitions, animations, keyframesCss };
}

export function rgbToHex(color: string): string | null {
  const trimmed = color.trim();
  if (trimmed.startsWith('#')) return trimmed.toLowerCase();
  const match = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i);
  if (!match) return null;
  const r = Number(match[1]);
  const g = Number(match[2]);
  const b = Number(match[3]);
  const a = match[4] !== undefined ? Number(match[4]) : 1;
  if (a === 0) return null;
  const hex = `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
  if (a < 1) {
    return `${hex}/${Math.round(a * 100)}`;
  }
  return hex;
}

const SPACING_SCALE_PX: Record<string, string> = {
  '0px': '0',
  '2px': '0.5',
  '4px': '1',
  '6px': '1.5',
  '8px': '2',
  '10px': '2.5',
  '12px': '3',
  '14px': '3.5',
  '16px': '4',
  '20px': '5',
  '24px': '6',
  '28px': '7',
  '32px': '8',
  '36px': '9',
  '40px': '10',
  '48px': '12',
  '64px': '16',
};

function mapSpacingToken(prefix: string, raw: string): string[] {
  const parts = raw.trim().split(/\s+/);
  const fmt = (v: string) => SPACING_SCALE_PX[v] ?? `[${v}]`;

  if (parts.length === 1) {
    const v = parts[0]!;
    if (v === '0px') return [];
    return [`${prefix}-${fmt(v)}`];
  }
  if (parts.length === 2) {
    const [vy, vx] = [parts[0]!, parts[1]!];
    const out: string[] = [];
    if (vy !== '0px') out.push(`${prefix}y-${fmt(vy)}`);
    if (vx !== '0px') out.push(`${prefix}x-${fmt(vx)}`);
    return out;
  }
  if (parts.length === 4) {
    const [t, r, b, l] = [parts[0]!, parts[1]!, parts[2]!, parts[3]!];
    if (t === b && r === l) return mapSpacingToken(prefix, `${t} ${r}`);
    const out: string[] = [];
    if (t !== '0px') out.push(`${prefix}t-${fmt(t)}`);
    if (r !== '0px') out.push(`${prefix}r-${fmt(r)}`);
    if (b !== '0px') out.push(`${prefix}b-${fmt(b)}`);
    if (l !== '0px') out.push(`${prefix}l-${fmt(l)}`);
    return out;
  }
  return [`${prefix}-[${raw.replace(/\s+/g, '_')}]`];
}

export function stylesToTailwindHint(styles: Record<string, string>): string {
  const classes: string[] = [];

  const display = styles['display'];
  if (display === 'flex') classes.push('flex');
  else if (display === 'inline-flex') classes.push('inline-flex');
  else if (display === 'grid') classes.push('grid');
  else if (display === 'inline-block') classes.push('inline-block');
  else if (display === 'none') classes.push('hidden');

  if (styles['flex-direction'] === 'column') classes.push('flex-col');
  if (styles['flex-wrap'] === 'wrap') classes.push('flex-wrap');

  const justifyMap: Record<string, string> = {
    center: 'justify-center',
    'space-between': 'justify-between',
    'space-around': 'justify-around',
    'flex-end': 'justify-end',
    end: 'justify-end',
  };
  if (styles['justify-content'] && justifyMap[styles['justify-content']]) {
    classes.push(justifyMap[styles['justify-content']]!);
  }

  const alignMap: Record<string, string> = {
    center: 'items-center',
    'flex-start': 'items-start',
    start: 'items-start',
    'flex-end': 'items-end',
    end: 'items-end',
    baseline: 'items-baseline',
  };
  if (styles['align-items'] && alignMap[styles['align-items']]) {
    classes.push(alignMap[styles['align-items']]!);
  }

  if (styles['gap'] && styles['gap'] !== '0px' && styles['gap'] !== 'normal') {
    const g = styles['gap'];
    classes.push(`gap-${SPACING_SCALE_PX[g] ?? `[${g.replace(/\s+/g, '_')}]`}`);
  }

  if (styles['padding']) {
    classes.push(...mapSpacingToken('p', styles['padding']));
  }
  if (styles['margin']) {
    classes.push(...mapSpacingToken('m', styles['margin']));
  }

  const radius = styles['border-radius'];
  if (radius && radius !== '0px') {
    if (radius === '9999px' || radius === '50%') classes.push('rounded-full');
    else if (radius === '8px') classes.push('rounded-lg');
    else if (radius === '12px') classes.push('rounded-xl');
    else if (radius === '16px') classes.push('rounded-2xl');
    else if (radius === '24px') classes.push('rounded-3xl');
    else classes.push(`rounded-[${radius.replace(/\s+/g, '_')}]`);
  }

  const bg = styles['background-color'] ? rgbToHex(styles['background-color']) : null;
  if (bg) classes.push(`bg-[${bg}]`);

  const fg = styles['color'] ? rgbToHex(styles['color']) : null;
  if (fg) classes.push(`text-[${fg}]`);

  const fs = styles['font-size'];
  if (fs) {
    const fsMap: Record<string, string> = {
      '12px': 'text-xs',
      '14px': 'text-sm',
      '16px': 'text-base',
      '18px': 'text-lg',
      '20px': 'text-xl',
      '24px': 'text-2xl',
    };
    classes.push(fsMap[fs] ?? `text-[${fs}]`);
  }

  const fw = styles['font-weight'];
  if (fw) {
    const fwMap: Record<string, string> = {
      '500': 'font-medium',
      '600': 'font-semibold',
      '700': 'font-bold',
    };
    if (fwMap[fw]) classes.push(fwMap[fw]!);
  }

  const ls = styles['letter-spacing'];
  if (ls && ls !== 'normal' && ls !== '0px') {
    classes.push(`tracking-[${ls}]`);
  }

  return classes.join(' ');
}
