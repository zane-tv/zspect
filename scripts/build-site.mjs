import fs from 'node:fs';
import path from 'node:path';

const rootDir = '/Users/zens/Work/Personal/ZSpect';
const siteDir = path.join(rootDir, 'site');

// Copy product screenshots into site/assets/screenshots so Docs & Landing serve crisp local visuals
const siteShotsDir = path.join(siteDir, 'assets/screenshots');
fs.mkdirSync(siteShotsDir, { recursive: true });
for (const file of fs.readdirSync(path.join(rootDir, 'assets/screenshots'))) {
  if (file.endsWith('.png')) {
    fs.copyFileSync(path.join(rootDir, 'assets/screenshots', file), path.join(siteShotsDir, file));
  }
}
fs.copyFileSync(path.join(rootDir, 'assets/brand/zspect-logo.svg'), path.join(siteDir, 'assets/zspect-logo.svg'));

const LOGO_SVG = `<svg viewBox="0 0 512 512" fill="none" aria-hidden="true">
  <rect x="16" y="16" width="480" height="480" rx="120" fill="#1d1d1f" stroke="#545458" stroke-width="14"/>
  <path fill="#ffffff" d="M124 128H286V166H162V248H124V128Z"/>
  <path fill="#ffffff" d="M124 290H162V346H214V384H124V290Z"/>
  <path fill="#ffffff" d="M232 346H350V276H388V384H232V346Z"/>
  <line x1="178" y1="330" x2="314" y2="194" stroke="#ffffff" stroke-width="40"/>
  <circle cx="358" cy="158" r="34" fill="#0071e3"/>
</svg>`;

const THEME_ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`;

const RELEASE_ZIP_URL = 'https://github.com/zane-tv/zspect/releases/download/v1.0.0/zspect-1.0.0-chrome.zip';
const REPO_URL = 'https://github.com/zane-tv/zspect';

function renderInteractivePlayground() {
  return `
    <div class="interactive-stage-wrap">
      <div class="stage-hint-bar">
        <span class="stage-badge">● Interactive Live Demo — Hover &amp; click any element inside the window below</span>
        <span>Switch tools on the bottom HUD or minimize to the circular logo</span>
      </div>

      <div class="app-window">
        <div class="app-window-bar">
          <div class="window-dots">
            <span style="background:#ff5f57"></span>
            <span style="background:#febc2e"></span>
            <span style="background:#28c840"></span>
          </div>
          <div class="window-url mono">🔒 staging.acmepay.io/checkout</div>
          <div class="window-ext-status">ZSpect Active · Alt+Z</div>
        </div>

        <div class="app-window-body">
          <div class="demo-canvas" id="zs-demo-canvas">
            <div class="demo-webapp-nav" data-inspect-comp="<CheckoutHeader>" data-inspect-file="src/checkout/CheckoutHeader.tsx:14" data-inspect-sel="header.checkout-nav" data-inspect-a11y="14.2:1 AAA">
              <div style="display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:700">
                <span style="width:9px;height:9px;border-radius:50%;background:#0071e3"></span>
                AcmePay <span class="env-pill" data-inspect-comp="<EnvStatusBadge>" data-inspect-file="src/checkout/EnvBadge.tsx:19" data-inspect-sel="span.env-pill" data-inspect-a11y="4.12:1 AA FAIL" style="font-size:10.5px;padding:2px 8px;border-radius:999px;background:#fef3c7;color:#b45309;margin-left:4px">Staging v2.4</span>
              </div>
              <div style="font-size:12px;color:#64748b;font-weight:500">Overview · <strong style="color:#0f172a">Checkout</strong> · Webhooks</div>
            </div>

            <div class="demo-webapp-grid">
              <div class="demo-card" data-inspect-comp="<PaymentDetailsForm>" data-inspect-file="src/checkout/PaymentDetailsForm.tsx:31" data-inspect-sel="section#payment-form" data-inspect-a11y="12.8:1 AAA">
                <div style="font-size:15px;font-weight:700;margin-bottom:3px">Payment &amp; Billing</div>
                <div style="font-size:12px;color:#64748b;margin-bottom:14px">Cluster us-east-1 · Automatic Stripe invoicing</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
                  <div data-inspect-comp="<CustomerInput>" data-inspect-file="src/ui/CustomerInput.tsx:12" data-inspect-sel="div.field-cardholder" data-inspect-a11y="9.6:1 AAA">
                    <div style="font-size:11px;font-weight:600;color:#475569">Cardholder</div>
                    <div class="demo-input">Alex Rivera</div>
                  </div>
                  <div data-inspect-comp="<PlanSelector>" data-inspect-file="src/checkout/PlanSelector.tsx:27" data-inspect-sel="div.field-plan" data-inspect-a11y="9.6:1 AAA">
                    <div style="font-size:11px;font-weight:600;color:#475569">Plan</div>
                    <div class="demo-input">Pro Team · $49/seat</div>
                  </div>
                </div>
                <div style="display:flex;justify-content:flex-end;gap:9px">
                  <button type="button" class="demo-ghost-btn" data-inspect-comp="<SaveDraftButton>" data-inspect-file="src/checkout/SaveDraftButton.tsx:18" data-inspect-sel="button.save-draft" data-inspect-a11y="8.9:1 AAA">Save Draft</button>
                  <button type="button" id="confirm-charge" class="demo-cta-btn" data-inspect-comp="<SubmitOrderButton>" data-inspect-file="src/checkout/SubmitButton.tsx:88" data-inspect-sel="button#confirm-charge" data-inspect-a11y="4.68:1 AA Pass">Confirm &amp; Charge $245</button>
                </div>
              </div>

              <div class="demo-card" data-inspect-comp="<OrderSummaryCard>" data-inspect-file="src/checkout/OrderSummaryCard.tsx:42" data-inspect-sel="aside#order-summary" data-inspect-a11y="13.1:1 AAA">
                <div style="font-size:14px;font-weight:700;margin-bottom:11px">Order Summary</div>
                <div style="display:flex;justify-content:space-between;font-size:12.5px;color:#475569;margin-bottom:8px"><span>5 × Pro Seats</span><strong>$245.00</strong></div>
                <div style="display:flex;justify-content:space-between;font-size:12.5px;color:#475569;margin-bottom:10px"><span>Tax (0%)</span><strong>$0.00</strong></div>
                <div style="height:1px;background:#e2e8f0;margin-bottom:10px"></div>
                <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:700"><span>Total Due</span><span>$245.00</span></div>
              </div>
            </div>

            <div id="zs-demo-pins"></div>

            <div class="demo-reticle" id="zs-demo-reticle">
              <div class="demo-reticle-tag mono" id="zs-demo-reticle-tag">&lt;Component&gt;</div>
            </div>

            <div class="demo-popover" id="zs-demo-popover">
              <div style="display:flex;align-items:center;justify-content:space-between">
                <div style="display:flex;align-items:center;gap:6px">
                  <span style="padding:2px 6px;border-radius:4px;background:rgba(0,113,227,0.2);color:#60a5fa;font-size:10px;font-weight:700">REACT</span>
                  <span class="mono" style="font-size:11px;font-weight:600" id="zs-pop-comp">&lt;OrderSummaryCard&gt;</span>
                </div>
                <button type="button" id="zs-pop-close" style="background:none;border:none;color:#9ca3af;cursor:pointer;font-size:14px">✕</button>
              </div>
              <textarea id="zs-pop-note" placeholder="Add feedback or AI instruction (e.g. Match @ref)..."></textarea>
              <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
                <button type="button" id="zs-pop-ref" style="padding:3px 8px;border-radius:5px;border:none;background:#0071e3;color:#fff;font-size:10.5px;font-weight:600;cursor:pointer">@stripe-card</button>
                <button type="button" id="zs-pop-save" style="padding:5px 11px;border-radius:7px;border:none;background:#0071e3;color:#fff;font-size:11.5px;font-weight:600;cursor:pointer">✓ Save Pin</button>
              </div>
            </div>

            <div class="demo-hud" id="zs-demo-hud">
              <span style="display:inline-flex;width:20px;height:20px;margin:0 4px">${LOGO_SVG}</span>
              <button type="button" class="demo-hud-tool active" data-demo-mode="inspect">Inspect</button>
              <button type="button" class="demo-hud-tool" data-demo-mode="guides">Redlines</button>
              <button type="button" class="demo-hud-tool" data-demo-mode="a11y">WCAG</button>
              <span style="width:1px;height:14px;background:rgba(255,255,255,0.16);margin:0 2px"></span>
              <span style="padding:3px 9px;border-radius:999px;background:#0071e3;color:#fff;font-size:11px;font-weight:700" data-zs-pin-count>2</span>
              <button type="button" id="zs-hud-clear" title="Clear all pins" style="height:26px;padding:0 7px;border-radius:999px;border:none;background:transparent;color:#9ca3af;cursor:pointer;font-size:11px">Clear</button>
              <button type="button" id="zs-hud-min" title="Minimize to circular logo (Off)" style="height:26px;width:26px;border-radius:999px;border:none;background:transparent;color:#9ca3af;cursor:pointer">✕</button>
            </div>

            <button type="button" class="demo-fab" id="zs-demo-fab" title="ZSpect Off — Click to resume">
              <span style="width:22px;height:22px;display:inline-flex">${LOGO_SVG}</span>
            </button>
          </div>

          <aside class="demo-sidepanel">
            <div class="demo-sp-header">
              <div style="display:flex;align-items:center;gap:7px;font-weight:700;font-size:13px">
                <span style="width:18px;height:18px;display:inline-flex">${LOGO_SVG}</span>
                <span>Live AI Prompt</span>
              </div>
              <button type="button" id="zs-demo-copy-btn" style="padding:4px 10px;border-radius:6px;border:none;background:#0071e3;color:#fff;font-size:11px;font-weight:600;cursor:pointer">Copy Prompt</button>
            </div>
            <pre class="demo-sp-pre mono" id="zs-demo-prompt"></pre>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:#9ca3af">
              <span>Pins in session: <strong style="color:#fff" data-zs-pin-count>2</strong></span>
              <span>Exports: .xlsx · .zip · .md</span>
            </div>
          </aside>
        </div>
      </div>
    </div>`;
}

// ==========================================================================
// 1. Cinematic Landing Page (site/index.html)
// ==========================================================================
const landingHtml = `<!doctype html>
<html lang="en" data-default-theme="dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ZSpect — Universal Zero-Install Visual Inspector &amp; AI/QA Exporter</title>
  <meta name="description" content="Inspect every webpage without npm packages: React/Vue/Svelte X-Ray, Cross-Tab @ref Vault, VisBug Redlines &amp; Diffs, 30s Bug Capsule &amp; .xlsx/.md AI Exports." />
  <link rel="icon" type="image/svg+xml" href="./assets/zspect-logo.svg" />
  <link rel="stylesheet" href="./styles.css" />
  <script src="./app.js" defer></script>
</head>
<body>
  <header class="site-nav">
    <div class="site-nav-inner">
      <a class="brand-lockup" href="./">
        ${LOGO_SVG}
        <span>ZSpect</span>
        <span class="brand-version">v1.0</span>
      </a>

      <nav class="nav-center">
        <a href="#playground">Live Demo</a>
        <a href="#capabilities">Capabilities</a>
        <a href="#outputs">Outputs</a>
        <a href="#compare">Compare</a>
        <a href="./docs/">Docs</a>
      </nav>

      <div class="nav-actions">
        <button type="button" class="theme-btn" data-toggle-theme aria-label="Toggle Light/Dark theme" title="Toggle theme">${THEME_ICON}</button>
        <a class="btn btn-sm btn-secondary" href="./docs/">Docs</a>
        <a class="btn btn-sm btn-primary" href="${RELEASE_ZIP_URL}">Download .zip</a>
      </div>
    </div>
  </header>

  <main>
    <section class="hero-stage" id="playground">
      <svg class="hero-reticle-bg" viewBox="0 0 800 800" fill="none" aria-hidden="true">
        <circle cx="400" cy="400" r="320" stroke="currentColor" stroke-opacity="0.14" stroke-dasharray="4 6"/>
        <circle cx="400" cy="400" r="210" stroke="#0071e3" stroke-opacity="0.22"/>
        <line x1="400" y1="20" x2="400" y2="780" stroke="currentColor" stroke-opacity="0.08"/>
        <line x1="20" y1="400" x2="780" y2="400" stroke="currentColor" stroke-opacity="0.08"/>
      </svg>

      <div class="wrap">
        <div class="hero-copy">
          <div class="eyebrow-pill">
            <span class="eyebrow-dot"></span>
            <span>Manifest V3 Browser Extension · 100% Client-Side · Zero Repo Install</span>
          </div>
          <h1 class="hero-title">
            Inspect every webpage.<br />
            <span class="muted-line">Ship exact context to AI &amp; QA.</span>
          </h1>
          <p class="hero-sub">
            Turn visual bugs, layout tweaks, and reference designs on <code>localhost</code>, staging, production, or any public site into structured AI coding prompts and annotated Excel QA sheets—without installing a dev package.
          </p>
          <div class="hero-cta-row">
            <a class="btn btn-primary" href="${RELEASE_ZIP_URL}">Download ZSpect v1.0 (.zip)</a>
            <a class="btn btn-secondary" href="./docs/">Read Documentation →</a>
            <a class="btn btn-secondary" href="${REPO_URL}">GitHub</a>
          </div>
          <div class="hero-meta-strip">
            <span>Activate anywhere with <kbd>Alt</kbd> + <kbd>Z</kbd></span>
            <span>·</span>
            <span>Freeze ephemeral UI with <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>F</kbd></span>
            <span>·</span>
            <span>0 KB overhead on idle tabs</span>
          </div>
        </div>

        ${renderInteractivePlayground()}
      </div>
    </section>

    <section class="landing-section" id="capabilities">
      <div class="wrap">
        <div class="sec-header">
          <span class="sec-kicker">Precision Engineering</span>
          <h2>Everything repo overlays and raw DevTools leave behind.</h2>
          <p>Four runtime layers work inside an isolated Closed Shadow DOM so host styles, modals, and minified production bundles never get in your way.</p>
        </div>

        <div class="bento-grid">
          <article class="bento-card col-7">
            <div>
              <h3>Zero-Install Framework &amp; Source X-Ray</h3>
              <p>Walks React 16–19 Fiber trees, Vue 3 instances, Svelte, Astro, and Angular nodes directly in the page's <code>MAIN</code> world—filtering minified symbols and linking straight to Cursor, VS Code, or Windsurf.</p>
            </div>
            <div class="bento-visual mono">
              <div class="xray-chain">
                <span class="xray-pill">&lt;button#confirm&gt;</span>
                <span>→</span>
                <span class="xray-pill">&lt;CheckoutPage&gt;</span>
                <span>→</span>
                <span class="xray-pill highlight">&lt;SubmitOrderButton&gt;</span>
                <span>→</span>
                <span class="xray-pill">cursor://file/.../SubmitButton.tsx:88</span>
              </div>
            </div>
          </article>

          <article class="bento-card col-5">
            <div>
              <h3>Cross-Tab <code>@ref</code> Design Vault</h3>
              <p>Inspect any reference website—Stripe, Linear, Apple—save its clean DOM skeleton, CSS custom properties, and motion curves as <code>@ref</code>, then attach it to pins on your own tab.</p>
            </div>
            <div class="bento-visual mono" style="display:flex;flex-direction:column;gap:6px">
              <div style="color:var(--accent-bright);font-weight:600">@ref:stripe-card</div>
              <div style="color:var(--text-secondary)">--radius-card: 16px · gap: 12px</div>
              <div style="color:var(--emerald)">Tailwind v4: rounded-[16px] p-6 gap-3</div>
            </div>
          </article>

          <article class="bento-card col-6">
            <div>
              <h3>VisBug Visual Toolkit + <code>Diff-to-Pin</code></h3>
              <p>Measure pixel redlines (<code>G</code>), audit live WCAG 2.1 AA/AAA contrast (<code>A</code>), nudge box spacing with arrow keys (<code>P</code>/<code>M</code>), reorder Flex siblings (<code>F</code>), and record structured <code>Before → After</code> diffs with Undo/Redo.</p>
            </div>
            <div class="bento-visual mono">
              <div>padding-inline: <span style="color:var(--text-muted)">12px</span> → <strong style="color:var(--accent-bright)">20px</strong></div>
              <div>border-radius: <span style="color:var(--text-muted)">6px</span> → <strong style="color:var(--accent-bright)">10px</strong></div>
            </div>
          </article>

          <article class="bento-card col-6">
            <div>
              <h3>30-Second Flight Capsule &amp; Secret Redactor</h3>
              <p>Automatically attaches recent user breadcrumbs, console errors, and failed or slow <code>fetch</code>/<code>XHR</code> calls while scrubbing tokens, cookies, API keys, and passwords before storage.</p>
            </div>
            <div class="bento-visual mono">
              <div style="color:var(--amber)">[502] POST /api/v2/orders (1840ms)</div>
              <div style="color:var(--text-secondary)">Authorization: Bearer <span style="color:var(--emerald)">[REDACTED]</span></div>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section class="landing-section" id="outputs">
      <div class="wrap">
        <div class="sec-header">
          <span class="sec-kicker">Structured Handoff</span>
          <h2>One session. Ready for Claude Code, Cursor, Linear, or Excel QA.</h2>
          <p>Switch output formats anytime inside Chrome's native Side Panel without recapturing a single pin.</p>
        </div>

        <div class="pill-tabs" data-tab-group="landing-out">
          <button type="button" class="pill-tab active" data-tab-target="lo-prompt">AI Coding Prompt</button>
          <button type="button" class="pill-tab" data-tab-target="lo-excel">Excel Workbook (.xlsx + Embedded Images)</button>
          <button type="button" class="pill-tab" data-tab-target="lo-zip">Portable .zip Bundle</button>
        </div>

        <div id="lo-prompt" class="tab-panel active" data-tab-panel="landing-out">
          <div class="code-card">
            <div class="code-card-bar">
              <span class="mono">Standard Density · ~320 tokens</span>
              <button type="button" class="copy-code-btn" data-copy-target="#landing-prompt-sample">Copy Sample</button>
            </div>
            <pre id="landing-prompt-sample"><code># ZSpect Visual Feedback — AcmePay Checkout QA (2 items)

## [#1] [BUG · CRITICAL] Submit order returns HTTP 502 &amp; padding mismatch
- **Page:** https://staging.acmepay.io/checkout (1440×900)
- **Component:** \`&lt;SubmitOrderButton&gt;\` (\`src/checkout/SubmitButton.tsx:88:5\`)
- **Selector:** \`button#confirm-charge\`
- **VisBug Diff:** \`padding-inline: 12px → 20px\`
- **Reference Attached:** \`@ref:stripe-card\` (\`rounded-[16px] p-6 border border-[#e2e8f0]\`)
- **30s Flight Capsule:** \`POST /api/v2/orders → 502 Bad Gateway (1840ms)\`</code></pre>
          </div>
        </div>

        <div id="lo-excel" class="tab-panel" data-tab-panel="landing-out">
          <div class="comp-table-wrap">
            <table class="comp-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Type</th>
                  <th>Severity</th>
                  <th>Annotated Screenshot</th>
                  <th>Component &amp; Selector</th>
                  <th>Description &amp; Diff</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="mono">#1</td>
                  <td>BUG</td>
                  <td><span style="color:var(--amber);font-weight:700">CRITICAL</span></td>
                  <td><code>[Embedded PNG 560×200]</code></td>
                  <td class="mono">&lt;SubmitOrderButton&gt;<br/>button#confirm-charge</td>
                  <td>POST /api/v2/orders 502 timeout · Diff: padding-inline 12px → 20px</td>
                </tr>
                <tr>
                  <td class="mono">#2</td>
                  <td>A11Y</td>
                  <td><span style="color:var(--accent-bright);font-weight:700">MEDIUM</span></td>
                  <td><code>[Embedded PNG 560×200]</code></td>
                  <td class="mono">&lt;EnvStatusBadge&gt;<br/>span.env-pill</td>
                  <td>WCAG contrast 4.12:1 below 4.5:1 AA threshold</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div id="lo-zip" class="tab-panel" data-tab-panel="landing-out">
          <div class="code-card">
            <div class="code-card-bar"><span class="mono">acmepay-checkout-qa-bundle.zip</span></div>
            <pre><code>acmepay-checkout-qa-bundle/
├── report.md                      # Full Markdown report with relative image links
├── screenshots/
│   ├── pin-01.png                 # Retina cropped region + #1 badge overlay
│   └── pin-02.png                 # Retina cropped region + #2 badge overlay
└── references/
    └── ref-stripe-card.png        # Cross-tab @ref visual snapshot</code></pre>
          </div>
        </div>
      </div>
    </section>

    <section class="landing-section" id="compare">
      <div class="wrap">
        <div class="sec-header">
          <span class="sec-kicker">Why ZSpect</span>
          <h2>Universal reach meets visual precision.</h2>
        </div>

        <div class="comp-table-wrap">
          <table class="comp-table">
            <thead>
              <tr>
                <th>Capability</th>
                <th>ZSpect</th>
                <th>Repo-Bound Overlays</th>
                <th>ProjectVisBug</th>
                <th>Browser DevTools</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Works on staging, production &amp; any third-party URL (Zero-Install)</td>
                <td class="check-yes">Yes</td>
                <td class="check-no">Dev repo only</td>
                <td class="check-yes">Yes</td>
                <td class="check-yes">Yes</td>
              </tr>
              <tr>
                <td>React, Vue, Svelte, Astro &amp; Angular component + IDE links</td>
                <td class="check-yes">Built-in</td>
                <td>React only</td>
                <td class="check-no">No</td>
                <td>Separate extensions</td>
              </tr>
              <tr>
                <td>Cross-tab <code>@ref</code> design token &amp; motion vault</td>
                <td class="check-yes">Yes</td>
                <td class="check-no">No</td>
                <td class="check-no">No</td>
                <td class="check-no">No</td>
              </tr>
              <tr>
                <td>VisBug live spacing/flex tweaks saved as <code>Before → After</code> diffs</td>
                <td class="check-yes">Yes (with Undo/Redo)</td>
                <td class="check-no">No</td>
                <td>Lost on reload</td>
                <td>Manual copy</td>
              </tr>
              <tr>
                <td>30s Console/Network flight capsule with automatic secret redaction</td>
                <td class="check-yes">Automatic</td>
                <td class="check-no">No</td>
                <td class="check-no">No</td>
                <td>Manual</td>
              </tr>
              <tr>
                <td>2-sheet Excel (<code>.xlsx</code> + embedded images), <code>.zip</code>, <code>.md</code> &amp; AI Prompt</td>
                <td class="check-yes">All built-in</td>
                <td>Markdown prompt</td>
                <td class="check-no">No</td>
                <td class="check-no">No</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <section class="landing-section" style="text-align:center">
      <div class="wrap" style="max-width:680px">
        <h2 style="font-size:clamp(28px,3.6vw,42px);letter-spacing:-0.03em;margin:0 0 14px">Ready to inspect without boundaries?</h2>
        <p style="color:var(--text-secondary);font-size:16.5px;margin:0 0 26px">Free, MIT-licensed, and 100% local in your browser. Install in 20 seconds or explore the full documentation.</p>
        <div class="hero-cta-row">
          <a class="btn btn-primary" href="${RELEASE_ZIP_URL}">Download v1.0.0 (.zip)</a>
          <a class="btn btn-secondary" href="./docs/install/">Installation Guide</a>
          <a class="btn btn-secondary" href="./docs/">Explore Docs</a>
        </div>
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <div class="wrap site-footer-inner">
      <div>© 2026 Zane (<a href="https://github.com/zane-tv">@zane-tv</a>) · Released under the MIT License.</div>
      <div class="footer-links">
        <a href="./docs/">Docs</a>
        <a href="./docs/install/">Install</a>
        <a href="./docs/output/">Output</a>
        <a href="./privacy/">Privacy</a>
        <a href="./terms/">Terms</a>
        <a href="${REPO_URL}">GitHub</a>
      </div>
    </div>
  </footer>
</body>
</html>`;

// ==========================================================================
// 2. Agentation-Style Documentation Pages Builder
// ==========================================================================
const DOCS_NAV = [
  {
    group: null,
    items: [
      { slug: 'overview', label: 'Overview', path: 'docs/' },
      { slug: 'install', label: 'Install', path: 'docs/install/' },
      {
        slug: 'features',
        label: 'Features',
        path: 'docs/features/',
        sub: [
          ['#modes', 'Inspection Modes'],
          ['#hud', 'HUD Controls'],
          ['#xray', 'Framework X-Ray'],
          ['#pause', 'Circular Pause Mode'],
        ],
      },
      { slug: 'output', label: 'Output', path: 'docs/output/', tag: '.xlsx + AI' },
    ],
  },
  {
    group: 'Tools',
    items: [
      { slug: 'visbug', label: 'VisBug Toolkit', path: 'docs/visbug/' },
      { slug: 'ref-vault', label: '@ref Vault', path: 'docs/ref-vault/' },
      { slug: 'freeze-capsule', label: 'Freeze & Capsule', path: 'docs/freeze-capsule/' },
      { slug: 'shortcuts', label: 'Shortcuts', path: 'docs/shortcuts/' },
      { slug: 'architecture', label: 'Architecture', path: 'docs/architecture/' },
    ],
  },
  {
    group: 'Resources',
    items: [
      { slug: 'changelog', label: 'Changelog', path: 'docs/changelog/' },
      { slug: 'faq', label: 'FAQ', path: 'docs/faq/' },
      { slug: 'privacy', label: 'Privacy', path: 'privacy/' },
      { slug: 'terms', label: 'Terms', path: 'terms/' },
    ],
  },
];

function renderDocsPage({ slug, title, subtitle, relRoot, bodyHtml, prev, next }) {
  const sidebarGroupsHtml = DOCS_NAV.map((grp) => {
    const linksHtml = grp.items
      .map((item) => {
        const isActive = item.slug === slug;
        const href = relRoot + item.path;
        const subHtml =
          isActive && item.sub
            ? `<div class="docs-sublinks">${item.sub
                .map(([hash, lbl]) => `<a href="${hash}">${lbl}</a>`)
                .join('')}</div>`
            : '';
        return `
          <div>
            <a class="docs-link${isActive ? ' active' : ''}" href="${href}">
              <span>${item.label}</span>
              ${item.tag ? `<span class="docs-tag">${item.tag}</span>` : ''}
            </a>
            ${subHtml}
          </div>`;
      })
      .join('');

    return `
      <div class="docs-nav-group">
        ${grp.group ? `<div class="docs-group-label">${grp.group}</div>` : ''}
        ${linksHtml}
      </div>`;
  }).join('');

  const pagerHtml =
    prev || next
      ? `<div class="docs-pager">
          <div>${prev ? `<a href="${relRoot + prev.path}">← ${prev.label}</a>` : ''}</div>
          <div>${next ? `<a href="${relRoot + next.path}">${next.label} →</a>` : ''}</div>
        </div>`
      : '';

  return `<!doctype html>
<html lang="en" data-default-theme="light">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — ZSpect Docs</title>
  <meta name="description" content="${subtitle}" />
  <link rel="icon" type="image/svg+xml" href="${relRoot}assets/zspect-logo.svg" />
  <link rel="stylesheet" href="${relRoot}styles.css" />
  <script src="${relRoot}app.js" defer></script>
</head>
<body>
  <div class="docs-shell">
    <aside class="docs-sidebar">
      <a class="docs-brand" href="${relRoot}">
        ${LOGO_SVG}
        <span>ZSpect</span>
      </a>

      ${sidebarGroupsHtml}

      <div class="docs-sidebar-foot">
        <a href="${REPO_URL}/releases/tag/v1.0.0" style="color:inherit">v1.0.0</a>
        <span>·</span>
        <a href="${REPO_URL}" style="color:inherit">GitHub</a>
        <span>·</span>
        <button type="button" class="theme-btn" style="width:26px;height:26px;border-radius:6px" data-toggle-theme title="Toggle Light/Dark">${THEME_ICON}</button>
      </div>
    </aside>

    <main class="docs-article">
      <h1>${title}</h1>
      <p class="docs-subtitle">${subtitle}</p>
      ${bodyHtml}
      ${pagerHtml}
    </main>
  </div>
</body>
</html>`;
}

const docsPages = [
  {
    outFile: 'docs/index.html',
    slug: 'overview',
    relRoot: '../',
    title: 'Visual feedback & inspection for AI agents and QA',
    subtitle: 'Zero-install browser extension that turns any webpage into structured context.',
    next: { label: 'Install', path: 'docs/install/' },
    bodyHtml: `
      <p><strong>ZSpect</strong> turns live DOM elements, visual layout diffs, cross-site design references, and console/network diagnostics into structured context that AI coding agents (Claude Code, Cursor, Antigravity, Windsurf, Codex) and QA teams can act on immediately.</p>
      <p>Unlike npm-based toolbars, ZSpect runs as a pure Manifest V3 browser extension—meaning it works out of the box on <code>localhost</code>, staging previews, production deployments, and any public website with <strong>0 KB idle overhead</strong>.</p>

      <img class="docs-shot" src="../assets/screenshots/hero-workspace.png" alt="ZSpect HUD, Pin Composer, and Docked Side Panel Workspace" />

      <h2 class="docs-rule-h2">How you use it</h2>
      <ol class="docs-steps">
        <li><span class="step-num">1.</span><span>Press <code>Alt + Z</code> (or click the ZSpect toolbar icon) on any webpage to mount the floating HUD</span></li>
        <li><span class="step-num">2.</span><span><strong>Hover</strong> any element to inspect its component name, dimensions, or WCAG contrast</span></li>
        <li><span class="step-num">3.</span><span><strong>Click</strong> an element (or drag an area marquee with <code>R</code>) to open the Pin Composer</span></li>
        <li><span class="step-num">4.</span><span>Write a note, optionally attach a saved <code>@ref</code> design blueprint, and click <strong>Save Pin</strong></span></li>
        <li><span class="step-num">5.</span><span>Open the <strong>Side Panel</strong> to copy the compiled AI Prompt, copy annotated PNGs, or export a 2-sheet <code>.xlsx</code> Excel report</span></li>
      </ol>

      <div class="docs-callout">
        Need to interact normally with the page? Click <code>✕</code> or press <code>Esc</code> to collapse ZSpect into a draggable <strong>44px circular logo button</strong> in the corner—all page listeners detach immediately until you click it again.
      </div>

      <h2 class="docs-rule-h2">How agents use it</h2>
      <p>Pointing to an element beats describing it in prose. When you paste a ZSpect prompt into your coding agent, it receives the exact React/Vue/Svelte component stack, <code>filepath:line:column</code> coordinates, resilient CSS selector, <code>Before → After</code> VisBug style diffs, and recent <code>console.error</code> or failed API calls—so it can jump straight to the file without grep guesswork.</p>

      <h2 class="docs-rule-h2">Animation scrubber demo</h2>
      <p>When debugging CSS transitions or Web Animations, ZSpect's <strong>Freeze &amp; Motion</strong> tool pauses <code>document.getAnimations()</code> and lets you scrub frame-by-frame from <code>0%</code> to <code>100%</code>. Try dragging the scrubber below:</p>

      <div class="anim-demo-box">
        <div class="anim-track">
          <div class="anim-orb" id="zs-scrub-orb"></div>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <button type="button" class="btn btn-sm btn-secondary" id="zs-scrub-toggle">Freeze</button>
          <input type="range" id="zs-scrub-range" min="0" max="100" value="35" style="flex:1;accent-color:#0071e3" />
          <span class="mono" style="font-size:12.5px;width:42px;text-align:right" id="zs-scrub-val">35%</span>
        </div>
      </div>
    `,
  },
  {
    outFile: 'docs/install/index.html',
    slug: 'install',
    relRoot: '../../',
    title: 'Installation',
    subtitle: 'Install ZSpect in Chrome, Arc, Brave, or Microsoft Edge in under 30 seconds.',
    prev: { label: 'Overview', path: 'docs/' },
    next: { label: 'Features', path: 'docs/features/' },
    bodyHtml: `
      <h2 class="docs-rule-h2">Option 1 — Download Prebuilt Release (.zip)</h2>
      <ol class="docs-steps">
        <li><span class="step-num">1.</span><span>Download <a href="${RELEASE_ZIP_URL}"><strong>zspect-1.0.0-chrome.zip</strong></a> from GitHub Releases and unzip it to a local folder.</span></li>
        <li><span class="step-num">2.</span><span>Open <code>chrome://extensions</code> (or <code>edge://extensions</code> / <code>brave://extensions</code>) and enable <strong>Developer mode</strong> in the top-right corner.</span></li>
        <li><span class="step-num">3.</span><span>Click <strong>Load unpacked</strong> and select the unzipped folder.</span></li>
        <li><span class="step-num">4.</span><span>Pin ZSpect to your browser toolbar and press <code>Alt + Z</code> on any <code>http://</code> or <code>https://</code> webpage.</span></li>
      </ol>

      <h2 class="docs-rule-h2">Option 2 — Build from Source</h2>
      <p>Requires <strong>Node.js 20+</strong> and <strong>npm</strong>:</p>
      <div class="code-card">
        <div class="code-card-bar">
          <span class="mono">Terminal</span>
          <button type="button" class="copy-code-btn" data-copy-target="#install-cli">Copy</button>
        </div>
        <pre id="install-cli"><code>git clone https://github.com/zane-tv/zspect.git
cd zspect
npm install
npm run build</code></pre>
      </div>
      <p>Then load the generated <code>.output/chrome-mv3</code> folder via <strong>Load unpacked</strong> in <code>chrome://extensions</code>.</p>

      <h2 class="docs-rule-h2">Customizing Keyboard Shortcuts</h2>
      <p>You can customize ZSpect's global hotkeys anytime at <code>chrome://extensions/shortcuts</code>:</p>
      <ul class="tool-list">
        <li><span class="tool-kbd">Alt+Z</span><span><strong>Toggle ZSpect Inspector HUD</strong> — mounts HUD or switches between active and circular paused mode</span></li>
        <li><span class="tool-kbd">Alt+Shift+F</span><span><strong>Freeze State Immediately</strong> — locks open tooltips/dropdowns without moving your mouse</span></li>
      </ul>
    `,
  },
  {
    outFile: 'docs/features/index.html',
    slug: 'features',
    relRoot: '../../',
    title: 'Features',
    subtitle: 'Everything built into the ZSpect HUD, Popover, and Side Panel Workspace.',
    prev: { label: 'Install', path: 'docs/install/' },
    next: { label: 'Output', path: 'docs/output/' },
    bodyHtml: `
      <h2 class="docs-rule-h2" id="modes">Inspection modes</h2>
      <p>Click the tabs below to preview how each primary ZSpect capture mode works:</p>

      <div class="pill-tabs" data-tab-group="feat-modes">
        <button type="button" class="pill-tab active" data-tab-target="fm-element">Element &amp; Text</button>
        <button type="button" class="pill-tab" data-tab-target="fm-area">Area Marquee</button>
        <button type="button" class="pill-tab" data-tab-target="fm-multi">Multi-Select</button>
        <button type="button" class="pill-tab" data-tab-target="fm-diff">Design Overlay Diff</button>
      </div>

      <div id="fm-element" class="tab-panel active" data-tab-panel="feat-modes">
        <div class="code-card">
          <div class="code-card-bar"><span class="mono">Mode: Inspect Element (I)</span></div>
          <pre><code>• Hover any DOM or Shadow DOM element to preview its tag, ID, and pixel dimensions.
• Click to open the compact 316px Pin Composer with auto-detected Component &amp; IDE link.
• Highlight text before clicking to automatically set Pin type to "Copy / Text" and quote the selection.</code></pre>
        </div>
      </div>

      <div id="fm-area" class="tab-panel" data-tab-panel="feat-modes">
        <div class="code-card">
          <div class="code-card-bar"><span class="mono">Mode: Capture Area (R)</span></div>
          <pre><code>• Drag a dashed selection rectangle across any region of the viewport.
• OffscreenCanvas crops a crisp Retina (2× DPR) PNG with a numbered badge overlay.
• Ideal for multi-card alignment bugs, chart rendering glitches, or visual regressions.</code></pre>
        </div>
      </div>

      <div id="fm-multi" class="tab-panel" data-tab-panel="feat-modes">
        <div class="code-card">
          <div class="code-card-bar"><span class="mono">Shortcut: Cmd/Ctrl + Click</span></div>
          <pre><code>• Hold Cmd (macOS) or Ctrl (Windows/Linux) while clicking to select multiple elements at once.
• Batch-adjust padding or margin across all selected nodes simultaneously in Spacing mode (P/M).
• All secondary selectors are bundled into extraSelectors in your exported report.</code></pre>
        </div>
      </div>

      <div id="fm-diff" class="tab-panel" data-tab-panel="feat-modes">
        <div class="code-card">
          <div class="code-card-bar"><span class="mono">Mode: Overlay Diff (D)</span></div>
          <pre><code>• Capture a "Before" viewport snapshot or press Cmd/Ctrl + V to paste a Figma PNG from your clipboard.
• Toggle between Onion-Skin opacity blending (0–100%) and an interactive Split-Wipe divider.
• Nudge overlay alignment by 1px (or 8px with Shift) using the arrow keys.</code></pre>
        </div>
      </div>

      <h2 class="docs-rule-h2" id="hud">HUD &amp; Pin management controls</h2>
      <ul class="tool-list">
        <li><span class="tool-kbd">Drag</span><span><strong>Draggable HUD &amp; Popover</strong> — grab the grip handle to reposition anywhere on screen</span></li>
        <li><span class="tool-kbd">Hover Pin</span><span><strong>Inline Pin Delete (✕)</strong> — hover any numbered pin on the webpage to preview its note or delete it immediately (remaining pins re-index automatically)</span></li>
        <li><span class="tool-kbd">Clear</span><span><strong>Two-Step Clear All</strong> — wipe all session pins from either the HUD trash button or Side Panel</span></li>
        <li><span class="tool-kbd">Copy Img</span><span><strong>Direct PNG Clipboard</strong> — copy a single annotated region screenshot or a stitched multi-pin contact sheet</span></li>
      </ul>

      <h2 class="docs-rule-h2" id="xray">Framework X-Ray</h2>
      <p>ZSpect's <code>MAIN</code> world probe inspects live component instances across <strong>React 16–19</strong>, <strong>Vue 3</strong>, <strong>Svelte</strong>, <strong>Astro</strong>, and <strong>Angular</strong>. On minified production bundles where function names are mangled to 1–2 letters (such as <code>&lt;Be&gt;</code> or <code>&lt;ps&gt;</code>), ZSpect automatically filters out mangled identifiers while still reporting the detected framework, resolved CSS Custom Properties, and Tailwind CSS v4 utility equivalents.</p>

      <h2 class="docs-rule-h2" id="pause">Circular Logo Pause Mode</h2>
      <img class="docs-shot" src="../../assets/screenshots/minimized-circular-fab.png" alt="ZSpect Minimized Circular Logo Launcher" />
      <p>Clicking <code>✕</code>, clicking the ZSpect logo on the left of the HUD, or pressing <code>Esc</code> collapses the toolbar into a <strong>44×44px circular logo launcher</strong> in the bottom-right corner. While minimized, inspection is completely off so clicks, hovers, and forms on the host webpage work without interception.</p>
    `,
  },
  {
    outFile: 'docs/output/index.html',
    slug: 'output',
    relRoot: '../../',
    title: 'Output & Exports',
    subtitle: 'How ZSpect structures visual feedback for AI coding agents and QA spreadsheets.',
    prev: { label: 'Features', path: 'docs/features/' },
    next: { label: 'VisBug Toolkit', path: 'docs/visbug/' },
    bodyHtml: `
      <p>Inside the Side Panel's <strong>AI &amp; Export</strong> tab, ZSpect compiles your active session into token-budgeted AI prompts or downloadable QA deliverables. Click the density tabs below to compare prompt formats:</p>

      <div class="pill-tabs" data-tab-group="out-density">
        <button type="button" class="pill-tab" data-tab-target="od-compact">Compact</button>
        <button type="button" class="pill-tab active" data-tab-target="od-standard">Standard</button>
        <button type="button" class="pill-tab" data-tab-target="od-forensic">Forensic</button>
      </div>

      <div id="od-compact" class="tab-panel" data-tab-panel="out-density">
        <div class="code-card">
          <div class="code-card-bar"><span class="mono">Compact · Minimal tokens for quick copy/style fixes</span><button type="button" class="copy-code-btn" data-copy-target="#pre-compact">Copy</button></div>
          <pre id="pre-compact"><code># ZSpect Feedback — AcmePay QA (1 item)

1. [BUG · CRITICAL] &lt;SubmitOrderButton&gt; (src/checkout/SubmitButton.tsx:88)
   Selector: \`button#confirm-charge\`
   Note: Fix 502 timeout on click and match horizontal padding to @ref:stripe-card.</code></pre>
        </div>
      </div>

      <div id="od-standard" class="tab-panel active" data-tab-panel="out-density">
        <div class="code-card">
          <div class="code-card-bar"><span class="mono">Standard · Default balanced context for coding agents</span><button type="button" class="copy-code-btn" data-copy-target="#pre-standard">Copy</button></div>
          <pre id="pre-standard"><code># ZSpect Visual Feedback — AcmePay QA (1 item)

## [#1] [BUG · CRITICAL] Fix 502 timeout &amp; match padding to @ref:stripe-card
- **URL:** https://staging.acmepay.io/checkout (1440×900)
- **Component:** \`&lt;CheckoutPage&gt; → &lt;PaymentForm&gt; → &lt;SubmitOrderButton&gt;\`
- **Source:** \`src/checkout/SubmitButton.tsx:88:5\`
- **Selector:** \`button#confirm-charge\` (410, 520 · 195×38px)
- **Tailwind Hint:** \`bg-[#0071e3] rounded-[9px] px-5 h-[38px]\`
- **VisBug Diff:** \`padding-inline: 12px → 20px\`
- **Attached @ref:** \`@ref:stripe-card\` (\`flex flex-col gap-3 p-6 rounded-[16px]\`)
- **Flight Capsule:** \`[502] POST https://staging.acmepay.io/api/v2/orders (1840ms)\`</code></pre>
        </div>
      </div>

      <div id="od-forensic" class="tab-panel" data-tab-panel="out-density">
        <div class="code-card">
          <div class="code-card-bar"><span class="mono">Forensic · Full DOM skeleton, computed CSS, tokens &amp; breadcrumbs</span><button type="button" class="copy-code-btn" data-copy-target="#pre-forensic">Copy</button></div>
          <pre id="pre-forensic"><code>## [#1] [BUG · CRITICAL] SubmitOrderButton
- **Selector:** \`button#confirm-charge\`
- **Clean HTML:** \`&lt;button id="confirm-charge" class="btn-primary"&gt;Confirm &amp; Charge $245.00&lt;/button&gt;\`
- **Computed Styles:** \`{"background-color":"#0071e3","border-radius":"9px","padding-inline":"20px","font-weight":"600"}\`
- **Resolved CSS Vars:** \`{"--btn-radius":"9px","--brand-primary":"#0071e3"}\`
- **Breadcrumbs (30s):** \`click input#cardholder → click button#confirm-charge\`
- **Console Error:** \`CheckoutApiError: POST /api/v2/orders failed with 502\`</code></pre>
        </div>
      </div>

      <h2 class="docs-rule-h2">File &amp; clipboard export formats</h2>
      <img class="docs-shot" src="../../assets/screenshots/sidepanel-themes-export.png" alt="ZSpect Dark and Light Side Panel Export Studio" />
      <ul class="tool-list">
        <li><span class="tool-kbd">.xlsx</span><span><strong>2-Sheet Excel Workbook</strong> — Sheet 1 (<em>Feedback &amp; Bug List</em>) embeds cropped annotated PNG screenshots directly inside each row; Sheet 2 (<em>Technical Context</em>) stores full selectors, CSS diffs, and console/network logs.</span></li>
        <li><span class="tool-kbd">.zip</span><span><strong>Markdown + Images Archive</strong> — Contains <code>report.md</code>, <code>screenshots/pin-01.png...</code>, and <code>references/ref-*.png</code>.</span></li>
        <li><span class="tool-kbd">.md</span><span><strong>Standalone Markdown Report</strong> — Lightweight single-file bug report for GitHub Issues, Linear, or Notion.</span></li>
        <li><span class="tool-kbd">PNG</span><span><strong>Composite Image Sheet</strong> — Renders all session pins onto a clean visual contact sheet copied straight to your clipboard.</span></li>
      </ul>
    `,
  },
  {
    outFile: 'docs/visbug/index.html',
    slug: 'visbug',
    relRoot: '../../',
    title: 'VisBug Toolkit & Diff-to-Pin',
    subtitle: 'Measure redlines, audit WCAG contrast, and tweak layouts live without losing changes.',
    prev: { label: 'Output', path: 'docs/output/' },
    next: { label: '@ref Vault', path: 'docs/ref-vault/' },
    bodyHtml: `
      <p>Inspired by Google Chrome Labs' ProjectVisBug, ZSpect brings visual design tools directly onto any live webpage—and solves VisBug's biggest limitation by recording every tweak into an undoable <strong><code>Before → After</code> Diff</strong> attached to your Pin.</p>

      <img class="docs-shot" src="../../assets/screenshots/visbug-redlines.png" alt="ZSpect Redline Distance Guides" />

      <h2 class="docs-rule-h2">Visual tools reference</h2>
      <ul class="tool-list">
        <li><span class="tool-kbd">G</span><span><strong>Redline Guides</strong> — Click an anchor element, then hover any second element to render pixel-exact distance pills and dashed alignment lines.</span></li>
        <li><span class="tool-kbd">A</span><span><strong>WCAG 2.1 Contrast X-Ray</strong> — Computes real effective background colors through transparent layers, reporting contrast ratio, AA/AAA status, ARIA role, and <code>&lt; 44×44px</code> touch target warnings.</span></li>
        <li><span class="tool-kbd">P / M</span><span><strong>Box-Model Spacing Tuner</strong> — Select one or more elements and press arrow keys (<code>+1px</code>, <code>Shift</code> <code>+4px</code>, <code>Alt</code> negative) to tune padding or margin with live box-model tinting.</span></li>
        <li><span class="tool-kbd">F</span><span><strong>Flexbox &amp; Sibling Reorder</strong> — Flip <code>row</code> / <code>column</code>, change alignment, and move elements among siblings with <code>←</code> / <code>→</code>.</span></li>
        <li><span class="tool-kbd">T</span><span><strong>Live Text Edit</strong> — Click any heading, button, or paragraph to test copy lengths inline and record exact text diffs.</span></li>
        <li><span class="tool-kbd">⌘Z</span><span><strong>Undo / Redo &amp; Reset</strong> — Step backward/forward through tweaks or reset all DOM mutations in one click.</span></li>
      </ul>
    `,
  },
  {
    outFile: 'docs/ref-vault/index.html',
    slug: 'ref-vault',
    relRoot: '../../',
    title: 'Cross-Tab @ref Design Vault',
    subtitle: 'Extract UI DNA from any reference website and reference it inside AI prompts.',
    prev: { label: 'VisBug Toolkit', path: 'docs/visbug/' },
    next: { label: 'Freeze & Capsule', path: 'docs/freeze-capsule/' },
    bodyHtml: `
      <p>When asking an AI agent to restyle a component, saying <em>"make it look nicer"</em> produces generic output. ZSpect's <strong><code>@ref</code> Vault</strong> lets you capture real production UI tokens from any website in one tab and attach them to pins on your project in another tab.</p>

      <h2 class="docs-rule-h2">What @ref extracts</h2>
      <ul class="tool-list">
        <li><span class="tool-kbd">DOM</span><span><strong>Sanitized Skeleton</strong> — Pruned structural HTML without noisy hashed classes or inline SVG bloat.</span></li>
        <li><span class="tool-kbd">CSS</span><span><strong>Resolved Custom Properties</strong> — Active <code>--token</code> values, layout rules (Flex/Grid/gap/padding), visual surfaces (radius/shadows/borders), and typography scale.</span></li>
        <li><span class="tool-kbd">Motion</span><span><strong>Transitions &amp; Keyframes</strong> — Exact <code>cubic-bezier()</code> curves, durations, and <code>::before</code> / <code>::after</code> pseudo-element styles.</span></li>
        <li><span class="tool-kbd">TW v4</span><span><strong>Tailwind CSS v4 Hints</strong> — Ready-to-paste utility class translation alongside a cropped preview image.</span></li>
      </ul>

      <h2 class="docs-rule-h2">Workflow</h2>
      <ol class="docs-steps">
        <li><span class="step-num">1.</span><span>Open any inspiration site, press <code>Alt + Z</code>, and click the component you admire.</span></li>
        <li><span class="step-num">2.</span><span>Switch the Popover tab to <strong>Save @ref</strong>, give it an alias like <code>stripe-card</code>, and save.</span></li>
        <li><span class="step-num">3.</span><span>On your own app tab, pin the target element and click the <code>@stripe-card</code> chip to inject its full blueprint into the compiled AI prompt.</span></li>
      </ol>
    `,
  },
  {
    outFile: 'docs/freeze-capsule/index.html',
    slug: 'freeze-capsule',
    relRoot: '../../',
    title: 'Ghost-State Freeze & 30s Flight Capsule',
    subtitle: 'Inspect disappearing tooltips and attach automatic redacted bug diagnostics.',
    prev: { label: '@ref Vault', path: 'docs/ref-vault/' },
    next: { label: 'Shortcuts', path: 'docs/shortcuts/' },
    bodyHtml: `
      <h2 class="docs-rule-h2">Freezing ephemeral UI states</h2>
      <p>Dropdown menus, hover tooltips, and autocomplete popovers normally vanish the moment you move your cursor to inspect them. Press <code>Alt + Shift + F</code> while hovering any ephemeral element:</p>
      <ul class="tool-list">
        <li><span class="tool-kbd">DOM</span><span><strong>Dismiss-Event Shield</strong> — Intercepts <code>mouseleave</code>, <code>mouseout</code>, <code>pointerleave</code>, <code>blur</code>, and <code>focusout</code> in capture phase so JS-driven popovers stay mounted.</span></li>
        <li><span class="tool-kbd">CDP</span><span><strong>Native Pseudo-Class Lock</strong> — Opt-in Chrome DevTools Protocol toggle forces browser-level <code>:hover</code>, <code>:focus</code>, and <code>:active</code> CSS states.</span></li>
        <li><span class="tool-kbd">0–100%</span><span><strong>Motion Scrubber</strong> — Pauses active Web Animations and CSS keyframes so you can scrub mid-transition states.</span></li>
      </ul>

      <h2 class="docs-rule-h2">30-second Flight Recorder &amp; Secret Redactor</h2>
      <p>While ZSpect is active on a tab, the probe keeps a lightweight rolling 30-second buffer of:</p>
      <ul class="tool-list">
        <li><span class="tool-kbd">UI</span><span>Recent user interaction breadcrumbs (<code>click</code>, <code>input</code>, <code>submit</code>)</span></li>
        <li><span class="tool-kbd">Console</span><span><code>console.error</code>, <code>console.warn</code>, uncaught exceptions, and unhandled rejections</span></li>
        <li><span class="tool-kbd">Net</span><span>Failed (<code>status &gt;= 400</code> or network error) and slow (<code>&gt;= 1500ms</code>) <code>fetch</code> / <code>XHR</code> requests</span></li>
      </ul>
      <div class="docs-callout">
        <strong>Automatic Redaction:</strong> All <code>Authorization</code> headers, <code>Bearer</code> tokens, JWTs, API keys, cookies, sensitive query parameters, and password inputs are replaced with <code>[REDACTED]</code> in memory before ever reaching local IndexedDB.
      </div>
    `,
  },
  {
    outFile: 'docs/shortcuts/index.html',
    slug: 'shortcuts',
    relRoot: '../../',
    title: 'Keyboard Shortcuts',
    subtitle: 'Complete hotkey reference for fast keyboard-driven inspection.',
    prev: { label: 'Freeze & Capsule', path: 'docs/freeze-capsule/' },
    next: { label: 'Architecture', path: 'docs/architecture/' },
    bodyHtml: `
      <div class="comp-table-wrap" style="margin-top:12px">
        <table class="comp-table">
          <thead>
            <tr><th>Shortcut</th><th>Scope</th><th>Action</th></tr>
          </thead>
          <tbody>
            <tr><td><code>Alt + Z</code></td><td>Global</td><td>Launch ZSpect or toggle between Active HUD and Minimized Logo mode</td></tr>
            <tr><td><code>Alt + Shift + F</code></td><td>Global</td><td>Freeze ephemeral tooltips/popovers and pause animations</td></tr>
            <tr><td><code>I</code></td><td>Active HUD</td><td>Inspect Element &amp; Text selection mode</td></tr>
            <tr><td><code>R</code></td><td>Active HUD</td><td>Capture Area marquee mode</td></tr>
            <tr><td><code>G</code></td><td>Active HUD</td><td>VisBug Redline distance &amp; alignment guides</td></tr>
            <tr><td><code>A</code></td><td>Active HUD</td><td>Live WCAG 2.1 AA/AAA contrast &amp; ARIA audit</td></tr>
            <tr><td><code>P</code> / <code>M</code></td><td>Active HUD</td><td>Tune Padding (<code>P</code>) or Margin (<code>M</code>) with arrow keys</td></tr>
            <tr><td><code>F</code></td><td>Active HUD</td><td>Flexbox direction/alignment &amp; sibling reorder</td></tr>
            <tr><td><code>T</code></td><td>Active HUD</td><td>Inline live text editing</td></tr>
            <tr><td><code>D</code></td><td>Active HUD</td><td>Design Overlay Diff (<code>Cmd/Ctrl + V</code> to paste mockup)</td></tr>
            <tr><td><code>↑ ↓ ← →</code></td><td>Spacing / Flex / Diff</td><td>Nudge by 1px (<code>Shift</code> = 4px, <code>Alt</code> = negative) or reorder siblings</td></tr>
            <tr><td><code>Cmd/Ctrl + Z</code></td><td>Active HUD</td><td>Undo visual tweak (<code>+ Shift</code> to Redo)</td></tr>
            <tr><td><code>Cmd/Ctrl + Enter</code></td><td>Pin Popover</td><td>Save Pin immediately from note textarea</td></tr>
            <tr><td><code>Esc</code></td><td>Active HUD</td><td>Close Popover → clear selection → minimize HUD to circular logo</td></tr>
          </tbody>
        </table>
      </div>
    `,
  },
  {
    outFile: 'docs/architecture/index.html',
    slug: 'architecture',
    relRoot: '../../',
    title: 'Architecture',
    subtitle: 'How ZSpect isolates styles, pierces Shadow DOM, and stores multi-page sessions.',
    prev: { label: 'Shortcuts', path: 'docs/shortcuts/' },
    next: { label: 'Changelog', path: 'docs/changelog/' },
    bodyHtml: `
      <h2 class="docs-rule-h2">4-Layer Manifest V3 Runtime</h2>
      <div class="code-card">
        <div class="code-card-bar"><span class="mono">Runtime Topology</span></div>
        <pre><code>[Inspected Tab — MAIN World]      probe.content.ts
  ├── Framework X-Ray (React Fiber, Vue 3, Svelte, Astro, Angular)
  ├── 30s Rolling Flight Capsule + Secret Redactor
  └── Web Animations API Scrubber
          ⇅ CustomEvent Bridge
[Inspected Tab — ISOLATED World]  hud.content (Closed ShadowRoot)
  ├── Preact + @preact/signals 38px HUD, 316px Popover &amp; 44px Circular FAB
  └── VisBug Redline, WCAG Contrast &amp; Undoable Tweak Engine
          ⇅ chrome.runtime Messaging
[Extension Service Worker]        background.ts + offscreen/main.ts
  ├── Throttled captureVisibleTab + OffscreenCanvas Retina Cropper
  └── Optional chrome.debugger CDP :hover/:focus/:active Lock
          ⇅ IndexedDB (ZSpectDB)
[Native Side Panel]               SidePanelApp.tsx
  └── Multi-Page Sessions, @ref Vault, AI Compiler &amp; .xlsx/.zip/.md Exporters</code></pre>
      </div>

      <h2 class="docs-rule-h2">Closed Shadow DOM &amp; Focus-Trap Shielding</h2>
      <p>Injecting UI into arbitrary third-party websites requires strict isolation in both directions:</p>
      <ul class="tool-list">
        <li><span class="tool-kbd">px</span><span><strong>Pure Pixel Token Scale</strong> — Uses <code>--spacing: 4px</code> inside a Closed <code>ShadowRoot</code> so host pages setting <code>html { font-size: 10px }</code> cannot shrink ZSpect's controls.</span></li>
        <li><span class="tool-kbd">CSS</span><span><strong>Inherited Property Reset</strong> — Resets <code>scrollbar-color</code>, <code>letter-spacing</code>, <code>text-transform</code>, and <code>user-select</code> at the <code>:host</code> boundary.</span></li>
        <li><span class="tool-kbd">Events</span><span><strong>Modal Focus-Trap Shield</strong> — Stops bubble-phase propagation of <code>keydown</code> and <code>focusin</code> at the shadow host so Radix/MUI focus traps and host hotkeys never steal focus while typing notes.</span></li>
      </ul>
    `,
  },
  {
    outFile: 'docs/changelog/index.html',
    slug: 'changelog',
    relRoot: '../../',
    title: 'Changelog',
    subtitle: 'Release history and updates for ZSpect.',
    prev: { label: 'Architecture', path: 'docs/architecture/' },
    next: { label: 'FAQ', path: 'docs/faq/' },
    bodyHtml: `
      <h2 class="docs-rule-h2">v1.0.0 — November 2026</h2>
      <p>Initial public release of ZSpect for Chrome, Arc, Brave, and Microsoft Edge.</p>
      <ul class="tool-list">
        <li><span class="tool-kbd">New</span><span>Universal on-demand Manifest V3 inspector (<code>Alt + Z</code>) with React, Vue, Svelte, Astro &amp; Angular X-Ray and Cursor / VS Code / Windsurf deep-links.</span></li>
        <li><span class="tool-kbd">New</span><span>Cross-Tab <code>@ref</code> Design Vault for extracting DOM skeletons, CSS custom properties, motion rules, and Tailwind v4 hints.</span></li>
        <li><span class="tool-kbd">New</span><span>VisBug visual toolkit (Redlines, WCAG 2.1 contrast, Spacing, Flexbox, Live Text, Design Overlay Diff) with Undo/Redo and <code>Before → After</code> diffs.</span></li>
        <li><span class="tool-kbd">New</span><span>Ghost-State Freeze (<code>Alt + Shift + F</code>), optional CDP pseudo-state lock, Web Animations scrubber, and 30s redacted Flight Capsule.</span></li>
        <li><span class="tool-kbd">New</span><span>High-density Side Panel Workspace with Light/Dark themes, EN/VI localization, image clipboard, AI Prompt Compiler, and <code>.xlsx</code> / <code>.zip</code> / <code>.md</code> exports.</span></li>
        <li><span class="tool-kbd">New</span><span>Draggable 38px HUD, inline hover-delete on screen pins, Clear All, and 44px circular logo pause mode.</span></li>
      </ul>
    `,
  },
  {
    outFile: 'docs/faq/index.html',
    slug: 'faq',
    relRoot: '../../',
    title: 'Frequently Asked Questions',
    subtitle: 'Common questions about ZSpect permissions, frameworks, and privacy.',
    prev: { label: 'Changelog', path: 'docs/changelog/' },
    next: { label: 'Privacy', path: 'privacy/' },
    bodyHtml: `
      <h2 class="docs-rule-h2">Does ZSpect slow down my browsing when I am not inspecting?</h2>
      <p><strong>No.</strong> ZSpect uses programmatic runtime injection (<code>registration: 'runtime'</code>). Zero content scripts are loaded on any webpage until you explicitly press <code>Alt + Z</code> or click Inspect.</p>

      <h2 class="docs-rule-h2">Why does ZSpect work on staging and third-party sites without installing an npm package?</h2>
      <p>Because ZSpect runs as a browser extension with a <code>MAIN</code> world probe and <code>OffscreenCanvas</code> screenshot pipeline, it inspects live DOM/Fiber trees directly in the browser—even on production builds or external reference websites.</p>

      <h2 class="docs-rule-h2">Does ZSpect send screenshots or code to any external server?</h2>
      <p><strong>Never.</strong> ZSpect has no backend server, no cloud database, and zero analytics. Every pin, screenshot blob, and <code>@ref</code> item stays inside your local browser's <code>IndexedDB</code> until you copy or download a file yourself.</p>

      <h2 class="docs-rule-h2">Why does ZSpect cannot open on chrome://extensions or the Chrome Web Store?</h2>
      <p>All Chromium browsers restrict extensions from injecting scripts into internal <code>chrome://</code>, <code>edge://</code>, and Chrome Web Store pages for browser security. Switch to any <code>http://</code> or <code>https://</code> tab to use the HUD.</p>
    `,
  },
  {
    outFile: 'privacy/index.html',
    slug: 'privacy',
    relRoot: '../',
    title: 'Privacy Policy',
    subtitle: 'Effective Date: November 26, 2026 · 100% Local-First & Zero Telemetry.',
    prev: { label: 'FAQ', path: 'docs/faq/' },
    next: { label: 'Terms', path: 'terms/' },
    bodyHtml: `
      <p><strong>ZSpect</strong> ("the Extension"), developed by <strong>Zane</strong> (<a href="https://github.com/zane-tv">@zane-tv</a>), operates exclusively inside your local browser. We do <strong>not</strong> collect, transmit, store on external servers, sell, or share any personal data, browsing history, or website content.</p>

      <h2 class="docs-rule-h2">Data Collection &amp; Local Storage</h2>
      <ul class="tool-list">
        <li><span class="tool-kbd">Zero</span><span><strong>No External Transmission:</strong> ZSpect makes zero network requests to any developer-owned, analytics, advertising, or third-party server.</span></li>
        <li><span class="tool-kbd">Prefs</span><span><strong>Local Preferences (<code>chrome.storage.local</code>):</strong> Stores only your theme (<code>light</code>/<code>dark</code>), UI language (<code>en</code>/<code>vi</code>), and active session ID locally.</span></li>
        <li><span class="tool-kbd">DB</span><span><strong>Local Workspace (<code>IndexedDB</code>):</strong> All captured pins, cropped screenshots, DOM/CSS snippets, and <code>@ref</code> blueprints stay inside your browser's local <code>ZSpectDB</code> database.</span></li>
      </ul>

      <h2 class="docs-rule-h2">Automatic Secret Redaction</h2>
      <p>When recording 30-second diagnostic capsules during an active inspection session, ZSpect automatically masks <code>Authorization</code> headers, <code>Bearer</code> tokens, JWTs, API keys, cookies, sensitive URL query parameters, and <code>input[type="password"]</code> fields with <code>[REDACTED]</code> before local storage and export.</p>

      <h2 class="docs-rule-h2">Permissions Explained</h2>
      <p><code>activeTab</code> and <code>scripting</code> mount the inspector HUD only when you activate ZSpect; <code>&lt;all_urls&gt;</code> allows capturing annotated element screenshots across localhost, staging, production, and reference domains; <code>sidePanel</code> renders the docked workspace; <code>offscreen</code> crops high-DPI PNGs in memory; <code>clipboardWrite</code> copies prompts/images on click; and optional <code>debugger</code> is requested only if you toggle native <code>:hover</code>/<code>:focus</code> locking.</p>

      <h2 class="docs-rule-h2">Contact</h2>
      <p>Questions about privacy may be filed at <a href="${REPO_URL}/issues">github.com/zane-tv/zspect/issues</a> or emailed to <a href="mailto:tientv.63.work@gmail.com">tientv.63.work@gmail.com</a>.</p>
    `,
  },
  {
    outFile: 'terms/index.html',
    slug: 'terms',
    relRoot: '../',
    title: 'Terms of Service',
    subtitle: 'Effective Date: November 26, 2026 · Open-Source MIT License.',
    prev: { label: 'Privacy', path: 'privacy/' },
    bodyHtml: `
      <h2 class="docs-rule-h2">1. Acceptance &amp; License</h2>
      <p>By installing or using <strong>ZSpect</strong>, developed by <strong>Zane</strong> (<a href="https://github.com/zane-tv">@zane-tv</a>), you agree to these Terms. ZSpect is free and open-source software released under the <strong>MIT License</strong> in the <a href="${REPO_URL}">official GitHub repository</a>.</p>

      <h2 class="docs-rule-h2">2. Permitted Use &amp; User Responsibility</h2>
      <p>ZSpect provides local client-side inspection, layout measurement, accessibility contrast auditing, UI token extraction, and QA report generation. You are responsible for ensuring that your inspection of websites and sharing of exported files (<code>.xlsx</code>, <code>.zip</code>, <code>.md</code>, or AI prompts) comply with applicable intellectual-property, confidentiality, and data-protection rules, and for reviewing exported prompts before sharing them externally.</p>

      <h2 class="docs-rule-h2">3. Local Storage &amp; Disclaimer</h2>
      <p>All session data is stored locally in your browser's <code>IndexedDB</code>; uninstalling the Extension or clearing browser storage removes unexported sessions. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY CLAIM OR DAMAGES ARISING FROM USE OF THE SOFTWARE.</p>

      <h2 class="docs-rule-h2">4. Contact</h2>
      <p>For questions regarding these Terms, open an issue at <a href="${REPO_URL}/issues">github.com/zane-tv/zspect/issues</a> or email <a href="mailto:tientv.63.work@gmail.com">tientv.63.work@gmail.com</a>.</p>
    `,
  },
];

// Write Landing Page
fs.writeFileSync(path.join(siteDir, 'index.html'), landingHtml);

// Write All Docs, Privacy & Terms Pages
for (const page of docsPages) {
  const fullOut = path.join(siteDir, page.outFile);
  fs.mkdirSync(path.dirname(fullOut), { recursive: true });
  fs.writeFileSync(fullOut, renderDocsPage(page));
}

console.log(`Generated ${docsPages.length + 1} static pages into ${siteDir}`);
