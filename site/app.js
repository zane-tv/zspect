/* ==========================================================================
   ZSpect Interactive Landing Playground, Theme Switcher & Docs Controls
   ========================================================================== */
(function () {
  const THEME_KEY = 'zspect_site_theme';

  function applyTheme(next) {
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
  }

  // Initialize theme (default cinematic dark on landing, saved preference across pages)
  const savedTheme = (() => {
    try {
      return localStorage.getItem(THEME_KEY);
    } catch {
      return null;
    }
  })();
  const defaultTheme = document.documentElement.getAttribute('data-default-theme') || 'dark';
  applyTheme(savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : defaultTheme);

  document.addEventListener('DOMContentLoaded', () => {
    // 1. Theme Toggle Buttons
    document.querySelectorAll('[data-toggle-theme]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const curr = document.documentElement.getAttribute('data-theme') || 'dark';
        applyTheme(curr === 'dark' ? 'light' : 'dark');
      });
    });

    // 2. Pill Tab Switchers (Output Density, Feature Modes, Multi-Format Studio)
    document.querySelectorAll('[data-tab-group]').forEach((groupEl) => {
      const groupName = groupEl.getAttribute('data-tab-group');
      const buttons = groupEl.querySelectorAll('[data-tab-target]');
      buttons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const targetId = btn.getAttribute('data-tab-target');
          buttons.forEach((b) => b.classList.toggle('active', b === btn));
          document
            .querySelectorAll(`[data-tab-panel="${groupName}"]`)
            .forEach((panel) => {
              panel.classList.toggle('active', panel.id === targetId);
            });
        });
      });
    });

    // 3. Copy Code Buttons
    document.querySelectorAll('[data-copy-target]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const sel = btn.getAttribute('data-copy-target');
        const target = sel ? document.querySelector(sel) : null;
        if (!target) return;
        try {
          await navigator.clipboard.writeText(target.textContent || '');
          const orig = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(() => {
            btn.textContent = orig;
          }, 1600);
        } catch {}
      });
    });

    // 4. Live Interactive ZSpect Stage (Hero & Docs Playground)
    const canvas = document.getElementById('zs-demo-canvas');
    if (canvas) {
      const reticle = document.getElementById('zs-demo-reticle');
      const reticleTag = document.getElementById('zs-demo-reticle-tag');
      const popover = document.getElementById('zs-demo-popover');
      const popComp = document.getElementById('zs-pop-comp');
      const popNote = document.getElementById('zs-pop-note');
      const popSave = document.getElementById('zs-pop-save');
      const popClose = document.getElementById('zs-pop-close');
      const popRefChip = document.getElementById('zs-pop-ref');
      const pinsLayer = document.getElementById('zs-demo-pins');
      const promptOut = document.getElementById('zs-demo-prompt');
      const pinCountEls = document.querySelectorAll('[data-zs-pin-count]');
      const clearBtn = document.getElementById('zs-hud-clear');
      const minBtn = document.getElementById('zs-hud-min');
      const hudBar = document.getElementById('zs-demo-hud');
      const fabBtn = document.getElementById('zs-demo-fab');
      const copyPromptBtn = document.getElementById('zs-demo-copy-btn');

      let currentMode = 'inspect';
      let paused = false;
      let attachStripeRef = true;
      let pendingTarget = null;

      let pins = [
        {
          id: 1,
          comp: '<SubmitOrderButton>',
          file: 'src/checkout/SubmitButton.tsx:88',
          selector: 'button#confirm-charge',
          note: 'POST /api/v2/orders returns 502 timeout; match horizontal padding to @ref:stripe-card.',
          urgent: true,
          xPct: 41,
          yPct: 60,
          ref: true,
        },
        {
          id: 2,
          comp: '<EnvStatusBadge>',
          file: 'src/checkout/EnvBadge.tsx:19',
          selector: 'span.env-pill',
          note: 'Contrast 4.12:1 fails WCAG AA — darken foreground to #92400e.',
          urgent: false,
          xPct: 44,
          yPct: 24,
          ref: false,
        },
      ];

      function renderPinsAndPrompt() {
        if (!pinsLayer || !promptOut) return;
        pinsLayer.innerHTML = '';
        pins.forEach((p, idx) => {
          const num = idx + 1;
          const badge = document.createElement('div');
          badge.className = 'demo-pin-badge' + (p.urgent ? ' urgent' : '');
          badge.style.left = p.xPct + '%';
          badge.style.top = p.yPct + '%';
          badge.innerHTML = `<span>${num}</span><span class="pin-preview">${p.note}</span><span class="pin-del" title="Delete pin">✕</span>`;
          badge.querySelector('.pin-del').addEventListener('click', (ev) => {
            ev.stopPropagation();
            pins = pins.filter((item) => item.id !== p.id);
            renderPinsAndPrompt();
          });
          pinsLayer.appendChild(badge);
        });

        pinCountEls.forEach((el) => {
          el.textContent = String(pins.length);
        });
        if (clearBtn) {
          clearBtn.style.display = pins.length > 0 ? 'inline-flex' : 'none';
        }

        const lines = [
          `# ZSpect Visual Feedback — AcmePay Staging (${pins.length} items)`,
          `Viewport: 1440×900 · Mode: ${currentMode.toUpperCase()}`,
          '',
        ];
        if (pins.length === 0) {
          lines.push('// Click any card, input, or button on the left to drop a live Pin.');
        } else {
          pins.forEach((p, idx) => {
            lines.push(`## [#${idx + 1}] ${p.comp} (${p.urgent ? 'BUG · HIGH' : 'UI-POLISH'})`);
            lines.push(`- Source: \`${p.file}\` (cursor://file/${p.file})`);
            lines.push(`- Selector: \`${p.selector}\``);
            if (p.ref) {
              lines.push(`- Reference Blueprint: \`@ref:stripe-card\` (rounded-[14px] p-5 border-[#e2e8f0])`);
            }
            lines.push(`- Instruction: ${p.note}`);
            lines.push('');
          });
        }
        promptOut.textContent = lines.join('\n');
      }

      // Tool switching on Demo HUD
      document.querySelectorAll('[data-demo-mode]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          currentMode = btn.getAttribute('data-demo-mode') || 'inspect';
          document
            .querySelectorAll('[data-demo-mode]')
            .forEach((b) => b.classList.toggle('active', b === btn));
          popover.style.display = 'none';
          renderPinsAndPrompt();
        });
      });

      // Hover inspectables inside Demo Canvas
      canvas.querySelectorAll('[data-inspect-comp]').forEach((el) => {
        el.addEventListener('mouseenter', () => {
          if (paused || popover.style.display === 'flex') return;
          const cRect = canvas.getBoundingClientRect();
          const r = el.getBoundingClientRect();
          reticle.style.display = 'block';
          reticle.style.left = r.left - cRect.left + 'px';
          reticle.style.top = r.top - cRect.top + 'px';
          reticle.style.width = r.width + 'px';
          reticle.style.height = r.height + 'px';

          const comp = el.getAttribute('data-inspect-comp');
          const a11y = el.getAttribute('data-inspect-a11y') || '11.4:1 AAA';
          if (currentMode === 'a11y') {
            reticleTag.textContent = `${comp} · WCAG ${a11y}`;
          } else if (currentMode === 'guides') {
            reticleTag.textContent = `${comp} · gap 18px · ${Math.round(r.width)}×${Math.round(r.height)}`;
          } else {
            reticleTag.textContent = `${comp} · ${Math.round(r.width)}×${Math.round(r.height)}`;
          }
        });

        el.addEventListener('click', (ev) => {
          if (paused) return;
          ev.stopPropagation();
          const cRect = canvas.getBoundingClientRect();
          const r = el.getBoundingClientRect();
          pendingTarget = {
            comp: el.getAttribute('data-inspect-comp') || '<Element>',
            file: el.getAttribute('data-inspect-file') || 'src/App.tsx:24',
            selector: el.getAttribute('data-inspect-sel') || 'div.card',
            xPct: Math.min(82, Math.max(6, Math.round(((r.left - cRect.left + 14) / cRect.width) * 100))),
            yPct: Math.min(82, Math.max(8, Math.round(((r.top - cRect.top + 10) / cRect.height) * 100))),
          };
          popComp.textContent = pendingTarget.comp;
          popNote.value = '';
          popover.style.display = 'flex';
          popover.style.left = Math.min(cRect.width - 302, Math.max(12, r.left - cRect.left)) + 'px';
          popover.style.top = Math.min(cRect.height - 210, Math.max(12, r.bottom - cRect.top + 8)) + 'px';
          setTimeout(() => popNote.focus(), 20);
        });
      });

      canvas.addEventListener('mouseleave', () => {
        reticle.style.display = 'none';
      });

      if (popRefChip) {
        popRefChip.addEventListener('click', () => {
          attachStripeRef = !attachStripeRef;
          popRefChip.style.background = attachStripeRef ? '#0071e3' : '#26262a';
          popRefChip.style.color = '#ffffff';
        });
      }

      if (popSave) {
        popSave.addEventListener('click', () => {
          if (!pendingTarget) return;
          pins.push({
            id: Date.now(),
            comp: pendingTarget.comp,
            file: pendingTarget.file,
            selector: pendingTarget.selector,
            note: popNote.value.trim() || 'Align spacing & typography tokens to design spec.',
            urgent: false,
            xPct: pendingTarget.xPct,
            yPct: pendingTarget.yPct,
            ref: attachStripeRef,
          });
          popover.style.display = 'none';
          reticle.style.display = 'none';
          renderPinsAndPrompt();
        });
      }

      if (popClose) {
        popClose.addEventListener('click', () => {
          popover.style.display = 'none';
        });
      }

      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          pins = [];
          renderPinsAndPrompt();
        });
      }

      if (minBtn && hudBar && fabBtn) {
        minBtn.addEventListener('click', () => {
          paused = true;
          hudBar.style.display = 'none';
          pinsLayer.style.display = 'none';
          popover.style.display = 'none';
          reticle.style.display = 'none';
          fabBtn.style.display = 'inline-flex';
        });
        fabBtn.addEventListener('click', () => {
          paused = false;
          fabBtn.style.display = 'none';
          hudBar.style.display = 'inline-flex';
          pinsLayer.style.display = 'block';
        });
      }

      if (copyPromptBtn) {
        copyPromptBtn.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(promptOut.textContent || '');
            const orig = copyPromptBtn.textContent;
            copyPromptBtn.textContent = 'Copied Prompt!';
            setTimeout(() => {
              copyPromptBtn.textContent = orig;
            }, 1500);
          } catch {}
        });
      }

      renderPinsAndPrompt();
    }

    // 5. Docs Web Animations Scrubber Interactive Demo
    const scrubRange = document.getElementById('zs-scrub-range');
    const scrubOrb = document.getElementById('zs-scrub-orb');
    const scrubVal = document.getElementById('zs-scrub-val');
    const scrubToggle = document.getElementById('zs-scrub-toggle');
    if (scrubRange && scrubOrb && scrubVal) {
      let playing = true;
      let progress = 35;
      let rafId = null;

      const updateOrb = (pct) => {
        scrubOrb.style.transform = `translateX(${pct * 3.6}px) rotate(${pct * 1.8}deg)`;
        scrubVal.textContent = `${Math.round(pct)}%`;
        scrubRange.value = String(Math.round(pct));
      };

      const tick = () => {
        if (!playing) return;
        progress = (progress + 0.45) % 100;
        updateOrb(progress);
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);

      scrubRange.addEventListener('input', () => {
        playing = false;
        if (scrubToggle) scrubToggle.textContent = 'Play';
        progress = Number(scrubRange.value);
        updateOrb(progress);
      });

      if (scrubToggle) {
        scrubToggle.addEventListener('click', () => {
          playing = !playing;
          scrubToggle.textContent = playing ? 'Freeze' : 'Play';
          if (playing) rafId = requestAnimationFrame(tick);
          else if (rafId) cancelAnimationFrame(rafId);
        });
      }
    }
  });
})();
