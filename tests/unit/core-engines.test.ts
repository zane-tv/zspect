import { describe, expect, it } from 'vitest';
import { buildResilientSelector, extractCleanHtml } from '@/core/dom-cleaner';
import { buildIdeDeepLink, compileAiPrompt, estimateTokens } from '@/core/prompt-compiler';
import { REDACTED, redactHeaders, redactTextOrJson, redactUrl } from '@/core/redactor';
import { stylesToTailwindHint } from '@/core/style-dna';
import {
  auditElementAccessibility,
  computeContrastRatio,
  parseCssColor,
} from '@/core/visbug-tools/a11y-inspector';
import { computeRedlineGuides } from '@/core/visbug-tools/guides';
import { VisBugTweakEngine } from '@/core/visbug-tools/tweak-engine';
import type { PinRecord, ReferenceDNA } from '@/types/zspect';

describe('ZSpect Security Redactor', () => {
  it('redacts sensitive query parameters and inline Bearer/JWT tokens', () => {
    const cleanUrl = redactUrl(
      'https://api.example.com/v1/orders?page=2&access_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123456789&api_key=sk-proj-1234567890abcdefghij',
    );
    expect(cleanUrl).toContain('page=2');
    expect(cleanUrl).toContain(`access_token=${encodeURIComponent(REDACTED)}`);
    expect(cleanUrl).toContain(`api_key=${encodeURIComponent(REDACTED)}`);
    expect(cleanUrl).not.toContain('sk-proj');
  });

  it('redacts sensitive headers and JSON payload keys deeply', () => {
    const headers = redactHeaders({
      Authorization: 'Bearer super-secret-token-value',
      'Content-Type': 'application/json',
      Cookie: 'sid=xyz987',
    });
    expect(headers.Authorization).toBe(REDACTED);
    expect(headers.Cookie).toBe(REDACTED);
    expect(headers['Content-Type']).toBe('application/json');

    const json = redactTextOrJson(
      JSON.stringify({
        user: 'zens',
        password: 'my-secret-password',
        nested: { clientSecret: 'shh-123', message: 'Bearer abcdef123456' },
      }),
    );
    expect(json).toContain('"user":"zens"');
    expect(json).toContain(`"password":"${REDACTED}"`);
    expect(json).toContain(`"clientSecret":"${REDACTED}"`);
    expect(json).not.toContain('my-secret-password');
    expect(json).not.toContain('abcdef123456');
  });
});

describe('ZSpect DOM Cleaner & Style DNA', () => {
  it('generates clean selectors, collapses giant SVGs and redacts password inputs', () => {
    document.body.innerHTML = `
      <div id="checkout-card" class="sc-bdvvtL card-shell">
        <svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>
        <input type="password" value="topsecret" />
        <button data-testid="pay-now-btn" class="css-19283a btn-primary">Pay $49</button>
      </div>
    `;
    const btn = document.querySelector('[data-testid="pay-now-btn"]')!;
    const card = document.getElementById('checkout-card')!;

    expect(buildResilientSelector(btn)).toContain('data-testid="pay-now-btn"');

    const cleaned = extractCleanHtml(card);
    expect(cleaned).toContain('<svg viewBox="0 0 24 24" data-icon="icon" />');
    expect(cleaned).not.toContain('<path');
    expect(cleaned).not.toContain('topsecret');
    expect(cleaned).toContain(REDACTED);
  });

  it('maps computed CSS properties into clean Tailwind v4 utility hints', () => {
    const hint = stylesToTailwindHint({
      display: 'flex',
      'justify-content': 'space-between',
      'align-items': 'center',
      gap: '16px',
      padding: '12px 24px',
      'border-radius': '9999px',
      'background-color': 'rgb(0, 113, 227)',
      color: 'rgb(255, 255, 255)',
      'font-size': '12px',
      'font-weight': '600',
      'letter-spacing': '-0.12px',
    });

    expect(hint).toContain('flex');
    expect(hint).toContain('justify-between');
    expect(hint).toContain('items-center');
    expect(hint).toContain('gap-4');
    expect(hint).toContain('py-3');
    expect(hint).toContain('px-6');
    expect(hint).toContain('rounded-full');
    expect(hint).toContain('bg-[#0071e3]');
    expect(hint).toContain('text-[#ffffff]');
    expect(hint).toContain('font-semibold');
    expect(hint).toContain('tracking-[-0.12px]');
  });
});

describe('ZSpect VisBug Interactive Engines (Guides, A11y & Diff Undo)', () => {
  it('computes accurate pixel redline distances and alignment snap guides', () => {
    const anchor = { x: 100, y: 100, width: 200, height: 60 };
    const target = { x: 340, y: 100, width: 120, height: 60 };
    const result = computeRedlineGuides(anchor, target);

    expect(result.lines.some((l) => l.orientation === 'horizontal' && l.distancePx === 40)).toBe(true);
    expect(result.alignments.some((a) => a.orientation === 'horizontal' && a.pos === 100)).toBe(true);
  });

  it('evaluates WCAG 2.1 contrast accurately including semi-transparent foregrounds', () => {
    const ink = parseCssColor('#1d1d1f')!;
    const white = parseCssColor('#ffffff')!;
    const ratio = computeContrastRatio(ink, white);
    expect(ratio).toBeGreaterThan(16);

    document.body.innerHTML = `<button id="low-contrast-btn" style="color: #b0b0b5; background-color: #ffffff; font-size: 13px;"></button>`;
    const btn = document.getElementById('low-contrast-btn')!;
    btn.textContent = 'Ghost Action';
    const audit = auditElementAccessibility(btn);
    expect(audit.wcagAA).toBe(false);
    expect(audit.issues.length).toBeGreaterThan(0);
  });

  it('tracks VisBug spacing & live text edits with Undo/Redo and Before->After Diff', () => {
    document.body.innerHTML = `<div class="row"><button id="tweak-target" style="padding-left: 12px; padding-right: 12px;">Submit</button><span>Cancel</span></div>`;
    const btn = document.getElementById('tweak-target') as HTMLElement;

    const engine = new VisBugTweakEngine();
    engine.nudgeBoxSpacing([btn], 'padding', 'left', 8);
    btn.textContent = 'Pay Now';
    engine.recordTextEdit(btn, 'Submit', 'Pay Now');

    const diff = engine.extractDiff(btn);
    expect(diff).toBeDefined();
    expect(diff?.styleChanges).toContainEqual({
      property: 'padding-left',
      before: '12px',
      after: '20px',
    });
    expect(diff?.textChange).toEqual({ before: 'Submit', after: 'Pay Now' });

    engine.undo();
    expect(btn.textContent).toBe('Submit');
    engine.redo();
    expect(btn.textContent).toBe('Pay Now');
    engine.resetAll();
    expect(btn.textContent).toBe('Submit');
    expect(engine.extractDiff(btn)).toBeUndefined();
  });
});

describe('ZSpect AI Prompt Compiler & Cross-Site @ref Injection', () => {
  it('compiles pins, IDE links, VisBug diffs, and @ref DNA with token estimation', () => {
    const ref: ReferenceDNA = {
      id: 'ref-1',
      alias: 'linear-card',
      sourceUrl: 'https://linear.app',
      domSkeleton: '<article class="card"><h3>Feature</h3></article>',
      resolvedCssVars: { '--card-radius': '28px' },
      layoutStyles: { display: 'flex', padding: '28px' },
      visualStyles: { 'border-radius': '28px', 'background-color': '#ffffff' },
      typographyStyles: {},
      pseudoElements: {},
      motionRules: {
        transitions: ['transform 200ms cubic-bezier(0.22, 1, 0.36, 1)'],
        animations: [],
        keyframesCss: [],
      },
      tailwindHint: 'flex p-7 rounded-[28px] bg-[#ffffff]',
      createdAt: Date.now(),
    };

    const pin: PinRecord = {
      id: 'pin-1',
      sessionId: 'sess-1',
      orderIndex: 1,
      type: 'visual-tweak',
      severity: 'high',
      status: 'open',
      note: 'Match card aesthetic to @ref:linear-card',
      pageUrl: 'http://localhost:3000/pricing',
      pageTitle: 'Pricing',
      viewport: { width: 1440, height: 900, dpr: 2 },
      boundingBox: { x: 100, y: 120, width: 320, height: 200 },
      selector: '[data-testid="pricing-tier"]',
      cleanHtml: '<div data-testid="pricing-tier">Pro</div>',
      computedStyles: { padding: '16px' },
      frameworkMeta: {
        framework: 'react',
        componentName: 'PricingCard',
        componentStack: ['PricingPage', 'PricingCard'],
        sourceLocation: { filePath: '/Users/dev/app/src/PricingCard.tsx', line: 42, column: 8 },
      },
      visualDiff: {
        styleChanges: [{ property: 'padding', before: '16px', after: '28px' }],
      },
      attachedRefIds: ['ref-1'],
      createdAt: Date.now(),
    };

    expect(buildIdeDeepLink(pin.frameworkMeta.sourceLocation!, 'cursor')).toBe(
      'cursor://file/Users/dev/app/src/PricingCard.tsx:42:8',
    );

    const { prompt, estimatedTokens } = compileAiPrompt({
      sessionTitle: 'Pricing Redesign',
      pins: [pin],
      references: [ref],
      density: 'standard',
    });

    expect(prompt).toContain('PricingPage > PricingCard');
    expect(prompt).toContain('/Users/dev/app/src/PricingCard.tsx:42:8');
    expect(prompt).toContain('`padding`: `16px` → `28px`');
    expect(prompt).toContain('### @ref:linear-card');
    expect(prompt).toContain('cubic-bezier(0.22, 1, 0.36, 1)');
    expect(estimatedTokens).toBe(estimateTokens(prompt));
    expect(estimatedTokens).toBeGreaterThan(50);
  });
});
