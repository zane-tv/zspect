import type {
  IdeTarget,
  PinRecord,
  PromptDensity,
  ReferenceDNA,
  SourceLocation,
} from '@/types/zspect';

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.8);
}

export function buildIdeDeepLink(loc: SourceLocation, ide: IdeTarget = 'cursor'): string {
  const cleanPath = loc.filePath.startsWith('/') ? loc.filePath : `/${loc.filePath}`;
  const line = loc.line || 1;
  const col = loc.column || 1;
  return `${ide}://file${cleanPath}:${line}:${col}`;
}

function formatReferenceBlock(ref: ReferenceDNA): string {
  const lines: string[] = [];
  lines.push(`### @ref:${ref.alias}`);
  lines.push(`- **Source:** ${ref.sourceUrl}`);
  if (ref.tailwindHint) {
    lines.push(`- **Tailwind Equivalent:** \`${ref.tailwindHint}\``);
  }
  if (Object.keys(ref.resolvedCssVars).length > 0) {
    const vars = Object.entries(ref.resolvedCssVars)
      .map(([k, v]) => `${k}: ${v}`)
      .join('; ');
    lines.push(`- **Design Tokens:** \`${vars}\``);
  }
  const combinedStyles = {
    ...ref.layoutStyles,
    ...ref.visualStyles,
    ...ref.typographyStyles,
  };
  if (Object.keys(combinedStyles).length > 0) {
    const cssText = Object.entries(combinedStyles)
      .map(([k, v]) => `${k}: ${v};`)
      .join(' ');
    lines.push(`- **Computed CSS:** \`${cssText}\``);
  }
  if (ref.motionRules.transitions.length > 0 || ref.motionRules.animations.length > 0) {
    lines.push(
      `- **Motion / Easing:** \`${[...ref.motionRules.transitions, ...ref.motionRules.animations].join(' | ')}\``,
    );
  }
  if (ref.motionRules.keyframesCss.length > 0) {
    lines.push('```css\n' + ref.motionRules.keyframesCss.join('\n') + '\n```');
  }
  if (ref.domSkeleton) {
    lines.push('```html\n' + ref.domSkeleton + '\n```');
  }
  return lines.join('\n');
}

export function compileSinglePinSection(
  pin: PinRecord,
  density: PromptDensity = 'standard',
): string {
  const lines: string[] = [];
  const headerTag = `[#${pin.orderIndex}] [${pin.type.toUpperCase()} · ${pin.severity.toUpperCase()}]`;
  lines.push(`## ${headerTag} ${pin.note || '(Không có mô tả)'}`);

  lines.push(`- **Page:** ${pin.pageUrl} (${pin.viewport.width}×${pin.viewport.height})`);

  if (pin.frameworkMeta.componentName) {
    const stack =
      pin.frameworkMeta.componentStack.length > 0
        ? pin.frameworkMeta.componentStack.join(' > ')
        : pin.frameworkMeta.componentName;
    lines.push(`- **Component (${pin.frameworkMeta.framework}):** \`${stack}\``);
  }

  if (pin.frameworkMeta.sourceLocation) {
    const { filePath, line, column } = pin.frameworkMeta.sourceLocation;
    lines.push(`- **Source File:** \`${filePath}:${line}${column ? `:${column}` : ''}\``);
  }

  lines.push(`- **Selector:** \`${pin.selector}\``);

  if (pin.selectedText) {
    lines.push(`- **Selected Text:** "${pin.selectedText}"`);
  }

  // VisBug Visual Diff (Before -> After)
  if (pin.visualDiff) {
    lines.push('- **Requested Visual Diff (Before → After):**');
    for (const sc of pin.visualDiff.styleChanges) {
      lines.push(`  - \`${sc.property}\`: \`${sc.before}\` → \`${sc.after}\``);
    }
    if (pin.visualDiff.tailwindBefore || pin.visualDiff.tailwindAfter) {
      lines.push(
        `  - **Tailwind Hint:** \`${pin.visualDiff.tailwindBefore || '(none)'}\` → \`${pin.visualDiff.tailwindAfter || '(none)'}\``,
      );
    }
    if (pin.visualDiff.textChange) {
      lines.push(
        `  - **Copy Change:** "${pin.visualDiff.textChange.before}" → "${pin.visualDiff.textChange.after}"`,
      );
    }
    if (pin.visualDiff.domMoved) {
      lines.push(
        `  - **Sibling Order:** index \`${pin.visualDiff.domMoved.fromIndex}\` → \`${pin.visualDiff.domMoved.toIndex}\``,
      );
    }
  }

  // Accessibility Audit
  if (pin.a11yAudit && (pin.type === 'a11y' || pin.a11yAudit.issues.length > 0)) {
    lines.push(
      `- **Accessibility (WCAG):** Contrast \`${pin.a11yAudit.contrastRatio}:1\` (${pin.a11yAudit.wcagAA ? 'AA Pass' : 'AA FAIL'}, fg \`${pin.a11yAudit.foregroundColor}\` on bg \`${pin.a11yAudit.effectiveBackgroundColor}\`)`,
    );
    for (const issue of pin.a11yAudit.issues) {
      lines.push(`  - ⚠️ ${issue}`);
    }
  }

  if (density !== 'compact') {
    if (pin.tailwindHint) {
      lines.push(`- **Current Tailwind Equivalent:** \`${pin.tailwindHint}\``);
    }
    const styleEntries = Object.entries(pin.computedStyles).slice(0, 12);
    if (styleEntries.length > 0) {
      lines.push(
        `- **Computed Styles:** \`${styleEntries.map(([k, v]) => `${k}: ${v}`).join('; ')}\``,
      );
    }

    if (pin.flightCapsule) {
      const { consoleErrors, networkIssues, breadcrumbs } = pin.flightCapsule;
      if (consoleErrors.length > 0) {
        lines.push('- **Console Errors (Last 30s):**');
        for (const err of consoleErrors.slice(0, 5)) {
          lines.push(`  - \`[${err.level}]\` ${err.message}`);
        }
      }
      if (networkIssues.length > 0) {
        lines.push('- **Failed / Slow Network Calls:**');
        for (const net of networkIssues.slice(0, 5)) {
          lines.push(
            `  - \`${net.method} ${net.url}\` → **${net.status}** (${net.durationMs}ms)${net.responseSnippet ? ` — \`${net.responseSnippet.slice(0, 160)}\`` : ''}`,
          );
        }
      }
      if (density === 'forensic' && breadcrumbs.length > 0) {
        lines.push(
          `- **Steps / Breadcrumbs:** ${breadcrumbs.map((b) => `${b.action}(${b.targetLabel})`).join(' → ')}`,
        );
      }
    }
  }

  if (density === 'forensic' && pin.cleanHtml) {
    lines.push('```html\n' + pin.cleanHtml + '\n```');
  }

  return lines.join('\n');
}

export function compileAiPrompt(options: {
  sessionTitle?: string;
  pins: PinRecord[];
  references?: ReferenceDNA[];
  density?: PromptDensity;
}): { prompt: string; estimatedTokens: number } {
  const { sessionTitle, pins, references = [], density = 'standard' } = options;
  const sections: string[] = [];

  sections.push(
    `# ZSpect Visual Feedback${sessionTitle ? ` — ${sessionTitle}` : ''} (${pins.length} item${pins.length === 1 ? '' : 's'})`,
  );
  sections.push(
    'Please address each numbered item below accurately using the provided component coordinates, selectors, visual diffs, and reference blueprints.',
  );

  for (const pin of pins) {
    sections.push(compileSinglePinSection(pin, density));
  }

  // Collect all referenced @ref items
  const neededRefIds = new Set<string>();
  for (const pin of pins) {
    for (const refId of pin.attachedRefIds) neededRefIds.add(refId);
  }
  const activeRefs = references.filter(
    (r) => neededRefIds.has(r.id) || pins.some((p) => p.note.includes(`@ref:${r.alias}`)),
  );

  if (activeRefs.length > 0) {
    sections.push('---\n## Attached Cross-Site UI References (`@ref`)');
    for (const ref of activeRefs) {
      sections.push(formatReferenceBlock(ref));
    }
  }

  const prompt = sections.join('\n\n');
  return {
    prompt,
    estimatedTokens: estimateTokens(prompt),
  };
}
