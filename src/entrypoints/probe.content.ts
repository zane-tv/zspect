import { defineContentScript } from 'wxt/sandbox';
import { redactTextOrJson, redactUrl } from '@/core/redactor';
import type {
  AnimationSummary,
  BreadcrumbItem,
  ConsoleErrorItem,
  FlightCapsule,
  FrameworkMeta,
  NetworkIssueItem,
  ProbeRequestMessage,
  ProbeResponseMessage,
  SourceLocation,
} from '@/types/zspect';

declare global {
  interface Window {
    __ZSPECT_PROBE_ACTIVE__?: boolean;
    ng?: {
      getOwningComponent?: (el: Element) => unknown;
    };
  }
}

const MAX_RING_AGE_MS = 30_000;
const MAX_RING_ITEMS = 50;
const SLOW_NETWORK_THRESHOLD_MS = 1500;

export default defineContentScript({
  matches: ['<all_urls>'],
  world: 'MAIN',
  registration: 'runtime',
  main() {
    if (window.__ZSPECT_PROBE_ACTIVE__) return;
    window.__ZSPECT_PROBE_ACTIVE__ = true;

    const breadcrumbs: BreadcrumbItem[] = [];
    const consoleErrors: ConsoleErrorItem[] = [];
    const networkIssues: NetworkIssueItem[] = [];

    function pruneRing<T extends { ts: number }>(arr: T[]): T[] {
      const cutoff = Date.now() - MAX_RING_AGE_MS;
      while (arr.length > 0 && arr[0]!.ts < cutoff) {
        arr.shift();
      }
      while (arr.length > MAX_RING_ITEMS) {
        arr.shift();
      }
      return arr;
    }

    function describeTarget(target: EventTarget | null): string {
      if (!(target instanceof Element)) return 'window';
      const tag = target.tagName.toLowerCase();
      if (target instanceof HTMLInputElement && target.type === 'password') {
        return 'input[type="password"]';
      }
      const id = target.id ? `#${target.id.slice(0, 24)}` : '';
      const label =
        target.getAttribute('aria-label') ||
        target.getAttribute('data-testid') ||
        (target.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 28);
      return `${tag}${id}${label ? `("${label}")` : ''}`;
    }

    // 1. User Breadcrumbs
    window.addEventListener(
      'click',
      (e) => {
        if ((e.target as Element | null)?.closest?.('[data-zspect-root]')) return;
        pruneRing(breadcrumbs);
        breadcrumbs.push({
          ts: Date.now(),
          action: 'click',
          targetLabel: describeTarget(e.target),
        });
      },
      { capture: true, passive: true },
    );

    window.addEventListener(
      'change',
      (e) => {
        if ((e.target as Element | null)?.closest?.('[data-zspect-root]')) return;
        pruneRing(breadcrumbs);
        breadcrumbs.push({
          ts: Date.now(),
          action: 'input',
          targetLabel: describeTarget(e.target),
        });
      },
      { capture: true, passive: true },
    );

    window.addEventListener(
      'submit',
      (e) => {
        pruneRing(breadcrumbs);
        breadcrumbs.push({
          ts: Date.now(),
          action: 'submit',
          targetLabel: describeTarget(e.target),
        });
      },
      { capture: true, passive: true },
    );

    // 2. Console Errors & Unhandled Exceptions
    const origError = console.error;
    const origWarn = console.warn;

    const formatArgs = (args: unknown[]): string =>
      args
        .map((a) => {
          if (a instanceof Error) return `${a.name}: ${a.message}`;
          if (typeof a === 'string') return a;
          try {
            return JSON.stringify(a);
          } catch {
            return String(a);
          }
        })
        .join(' ');

    console.error = function (...args: unknown[]) {
      try {
        pruneRing(consoleErrors);
        const firstErr = args.find((a): a is Error => a instanceof Error);
        consoleErrors.push({
          ts: Date.now(),
          level: 'error',
          message: redactTextOrJson(formatArgs(args), 500),
          stack: firstErr?.stack ? redactTextOrJson(firstErr.stack.split('\n').slice(0, 6).join('\n'), 600) : undefined,
        });
      } catch {
        // Never disrupt host console
      }
      origError.apply(console, args);
    };

    console.warn = function (...args: unknown[]) {
      try {
        pruneRing(consoleErrors);
        consoleErrors.push({
          ts: Date.now(),
          level: 'warn',
          message: redactTextOrJson(formatArgs(args), 400),
        });
      } catch {
        // Ignore
      }
      origWarn.apply(console, args);
    };

    window.addEventListener('error', (event) => {
      pruneRing(consoleErrors);
      consoleErrors.push({
        ts: Date.now(),
        level: 'error',
        message: redactTextOrJson(event.message || 'Uncaught Error', 500),
        stack: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : undefined,
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      pruneRing(consoleErrors);
      const reason =
        event.reason instanceof Error
          ? `${event.reason.name}: ${event.reason.message}`
          : String(event.reason);
      consoleErrors.push({
        ts: Date.now(),
        level: 'error',
        message: redactTextOrJson(`UnhandledRejection: ${reason}`, 500),
      });
    });

    // 3. Failed & Slow Fetch / XHR Recorder
    const origFetch = window.fetch;
    if (typeof origFetch === 'function') {
      window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        const started = performance.now();
        const rawUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();

        try {
          const response = await origFetch.call(this, input, init);
          const durationMs = Math.round(performance.now() - started);

          if (response.status >= 400 || durationMs >= SLOW_NETWORK_THRESHOLD_MS) {
            let snippet = '';
            if (response.status >= 400) {
              try {
                const clone = response.clone();
                const text = await clone.text();
                snippet = redactTextOrJson(text, 800);
              } catch {
                snippet = '';
              }
            }
            pruneRing(networkIssues);
            networkIssues.push({
              ts: Date.now(),
              method,
              url: redactUrl(rawUrl),
              status: response.status,
              durationMs,
              responseSnippet: snippet || undefined,
            });
          }
          return response;
        } catch (err) {
          const durationMs = Math.round(performance.now() - started);
          pruneRing(networkIssues);
          networkIssues.push({
            ts: Date.now(),
            method,
            url: redactUrl(rawUrl),
            status: 'NETWORK_ERROR',
            durationMs,
            responseSnippet: err instanceof Error ? redactTextOrJson(err.message, 300) : 'Failed to fetch',
          });
          throw err;
        }
      };
    }

    const origXhrOpen = XMLHttpRequest.prototype.open;
    const origXhrSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (
      method: string,
      url: string | URL,
      ...rest: [boolean?, (string | null)?, (string | null)?]
    ) {
      (this as XMLHttpRequest & { __zsMeta?: { method: string; url: string; start: number } }).__zsMeta = {
        method: String(method).toUpperCase(),
        url: String(url),
        start: 0,
      };
      return origXhrOpen.call(this, method, url, ...(rest as [boolean, string?, string?]));
    };

    XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
      const xhr = this as XMLHttpRequest & {
        __zsMeta?: { method: string; url: string; start: number };
      };
      if (xhr.__zsMeta) {
        xhr.__zsMeta.start = performance.now();
        xhr.addEventListener('loadend', () => {
          const meta = xhr.__zsMeta;
          if (!meta) return;
          const durationMs = Math.round(performance.now() - meta.start);
          const status = xhr.status || 'NETWORK_ERROR';
          if (status === 'NETWORK_ERROR' || status >= 400 || durationMs >= SLOW_NETWORK_THRESHOLD_MS) {
            let snippet = '';
            if (typeof status === 'number' && status >= 400) {
              try {
                snippet = redactTextOrJson(xhr.responseText, 800);
              } catch {
                snippet = '';
              }
            }
            pruneRing(networkIssues);
            networkIssues.push({
              ts: Date.now(),
              method: meta.method,
              url: redactUrl(meta.url),
              status,
              durationMs,
              responseSnippet: snippet || undefined,
            });
          }
        });
      }
      return origXhrSend.call(this, body);
    };

    // 4. Zero-Install Framework & Source-Map X-Ray
    function parseStackSource(stackStr: string | undefined): SourceLocation | undefined {
      if (!stackStr) return undefined;
      const match = stackStr.match(/((?:\/|[A-Za-z]:\\|src\/|app\/|components\/|pages\/)[^():?\s]+\.[jt]sx?):(\d+)(?::(\d+))?/);
      if (!match) return undefined;
      return {
        filePath: match[1]!,
        line: Number(match[2]),
        column: match[3] ? Number(match[3]) : undefined,
      };
    }

    function sanitizeProps(rawProps: Record<string, unknown> | null | undefined): Record<string, unknown> | undefined {
      if (!rawProps || typeof rawProps !== 'object') return undefined;
      const clean: Record<string, unknown> = {};
      let count = 0;
      for (const [k, v] of Object.entries(rawProps)) {
        if (k === 'children' || k.startsWith('__')) continue;
        if (count >= 8) break;
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          clean[k] = typeof v === 'string' ? redactTextOrJson(v, 80) : v;
          count++;
        }
      }
      return count > 0 ? clean : undefined;
    }

    function inspectFramework(el: Element): FrameworkMeta {
      const record = el as unknown as Record<string, unknown>;

      // A. React 16–19 Fiber inspection
      const fiberKey = Object.keys(record).find(
        (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'),
      );
      if (fiberKey) {
        let fiber = record[fiberKey] as
          | {
              type?: { displayName?: string; name?: string } | string;
              return?: unknown;
              memoizedProps?: Record<string, unknown>;
              _debugSource?: { fileName?: string; lineNumber?: number; columnNumber?: number };
              _debugStack?: { stack?: string };
              _debugOwner?: {
                _debugSource?: { fileName?: string; lineNumber?: number; columnNumber?: number };
              };
            }
          | undefined;

        const stack: string[] = [];
        let primaryProps: Record<string, unknown> | undefined;
        let sourceLocation: SourceLocation | undefined;

        let safety = 0;
        while (fiber && safety < 35) {
          safety++;
          if (fiber.type && typeof fiber.type === 'function') {
            const fnType = fiber.type as { displayName?: string; name?: string };
            const rawName = fnType.displayName || fnType.name;
            // Ignore minified 1-2 char mangled names like "ps", "Be", "Fe", "e" in prod bundles
            const isMeaningfulName =
              Boolean(rawName) &&
              !rawName!.startsWith('_') &&
              /^[A-Z][A-Za-z0-9_$.]*$/.test(rawName!) &&
              (rawName!.length > 2 || Boolean(fnType.displayName));
            if (isMeaningfulName && rawName) {
              if (stack[0] !== rawName) stack.unshift(rawName);
              if (!primaryProps) primaryProps = sanitizeProps(fiber.memoizedProps);
            }
          }
          if (!sourceLocation && fiber._debugSource?.fileName) {
            sourceLocation = {
              filePath: fiber._debugSource.fileName,
              line: fiber._debugSource.lineNumber || 1,
              column: fiber._debugSource.columnNumber,
            };
          }
          if (!sourceLocation && fiber._debugStack?.stack) {
            sourceLocation = parseStackSource(fiber._debugStack.stack);
          }
          fiber = fiber.return as typeof fiber;
        }

        const meaningfulStack = stack.slice(-5);
        return {
          framework: 'react',
          componentName: meaningfulStack[meaningfulStack.length - 1],
          componentStack: meaningfulStack,
          sourceLocation,
          sanitizedProps: primaryProps,
        };
      }

      // B. Vue 3 inspection
      let currVue: Element | null = el;
      while (currVue) {
        const vueInst = (currVue as unknown as Record<string, unknown>)['__vueParentComponent'] as
          | {
              type?: { __name?: string; name?: string; __file?: string };
              parent?: unknown;
              props?: Record<string, unknown>;
            }
          | undefined;
        if (vueInst) {
          const stack: string[] = [];
          let filePath: string | undefined;
          let ptr: typeof vueInst = vueInst;
          let depth = 0;
          while (ptr && depth < 15) {
            depth++;
            const name = ptr.type?.__name || ptr.type?.name;
            if (name) stack.unshift(name);
            if (!filePath && ptr.type?.__file) filePath = ptr.type.__file;
            ptr = ptr.parent as typeof vueInst;
          }
          return {
            framework: 'vue',
            componentName: stack[stack.length - 1],
            componentStack: stack.slice(-5),
            sourceLocation: filePath ? { filePath, line: 1 } : undefined,
            sanitizedProps: sanitizeProps(vueInst.props),
          };
        }
        currVue = currVue.parentElement;
      }

      // C. Svelte inspection
      const svelteMeta = record['__svelte_meta'] as
        | { loc?: { file?: string; line?: number; column?: number } }
        | undefined;
      if (svelteMeta?.loc?.file) {
        const fileName = svelteMeta.loc.file.split('/').pop()?.replace('.svelte', '') || 'SvelteComponent';
        return {
          framework: 'svelte',
          componentName: fileName,
          componentStack: [fileName],
          sourceLocation: {
            filePath: svelteMeta.loc.file,
            line: (svelteMeta.loc.line ?? 0) + 1,
            column: svelteMeta.loc.column,
          },
        };
      }

      // D. Astro Island inspection
      const astroIsland = el.closest('astro-island');
      if (astroIsland) {
        const compUrl = astroIsland.getAttribute('component-url') || '';
        const compName =
          astroIsland.getAttribute('component-export') ||
          compUrl.split('/').pop()?.replace(/\.[jt]sx?$|\.astro$/, '') ||
          'AstroIsland';
        return {
          framework: 'astro',
          componentName: compName,
          componentStack: [compName],
          sourceLocation: compUrl && !compUrl.startsWith('/_astro') ? { filePath: compUrl, line: 1 } : undefined,
        };
      }

      // E. Angular inspection
      const ngComp = window.ng?.getOwningComponent?.(el);
      if (ngComp && typeof ngComp === 'object') {
        const ctorName = (ngComp as { constructor?: { name?: string } }).constructor?.name;
        if (ctorName) {
          return {
            framework: 'angular',
            componentName: ctorName,
            componentStack: [ctorName],
          };
        }
      }

      return { framework: 'unknown', componentStack: [] };
    }

    function queryTargetAnimations(selector?: string): Animation[] {
      let scope: Element | Document = document;
      if (selector) {
        try {
          const target = document.querySelector(selector);
          if (target) scope = target;
        } catch {
          scope = document;
        }
      }
      const anims =
        scope instanceof Document
          ? document.getAnimations()
          : scope.getAnimations({ subtree: true });
      return anims;
    }

    function summarizeAnimations(anims: Animation[]): AnimationSummary[] {
      return anims.slice(0, 20).map((anim, idx) => {
        const timing = anim.effect?.getTiming();
        const durationMs = typeof timing?.duration === 'number' ? timing.duration : 1000;
        const currentTimeMs = typeof anim.currentTime === 'number' ? Math.round(anim.currentTime) : 0;
        return {
          id: anim.id || `anim-${idx + 1}`,
          name: (anim as CSSAnimation).animationName || anim.id || `Animation #${idx + 1}`,
          durationMs,
          currentTimeMs,
          playState: anim.playState,
          easing: timing?.easing || 'linear',
        };
      });
    }

    function getFlightSnapshot(): FlightCapsule {
      return {
        breadcrumbs: [...pruneRing(breadcrumbs)].slice(-8),
        consoleErrors: [...pruneRing(consoleErrors)].slice(-10),
        networkIssues: [...pruneRing(networkIssues)].slice(-10),
      };
    }

    // 5. Secure Point-to-Point Handshake with ISOLATED HUD Script
    let activePort: MessagePort | null = null;

    const handleRequest = (req: ProbeRequestMessage): ProbeResponseMessage => {
      try {
        if (req.action === 'INSPECT_ELEMENT') {
          const el = document.querySelector(req.selector);
          return {
            id: req.id,
            ok: true,
            frameworkMeta: el ? inspectFramework(el) : { framework: 'unknown', componentStack: [] },
            flightCapsule: getFlightSnapshot(),
          };
        }

        if (req.action === 'GET_FLIGHT_CAPSULE') {
          return {
            id: req.id,
            ok: true,
            flightCapsule: getFlightSnapshot(),
          };
        }

        if (req.action === 'LIST_ANIMATIONS') {
          const anims = queryTargetAnimations(req.selector);
          return {
            id: req.id,
            ok: true,
            animations: summarizeAnimations(anims),
          };
        }

        if (req.action === 'SCRUB_ANIMATIONS') {
          const anims = queryTargetAnimations(req.selector);
          const clamped = Math.max(0, Math.min(1, req.progress));
          for (const anim of anims) {
            const timing = anim.effect?.getTiming();
            const dur = typeof timing?.duration === 'number' && timing.duration > 0 ? timing.duration : 1000;
            if (req.pause) anim.pause();
            anim.currentTime = dur * clamped;
          }
          return {
            id: req.id,
            ok: true,
            animations: summarizeAnimations(anims),
          };
        }

        if (req.action === 'RESUME_ANIMATIONS') {
          for (const anim of document.getAnimations()) {
            if (anim.playState === 'paused') anim.play();
          }
          return { id: req.id, ok: true };
        }

        return { id: (req as { id: string }).id, ok: false, error: 'Unknown probe action' };
      } catch (err) {
        return {
          id: req.id,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    };

    window.addEventListener('message', (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data as { source?: string; nonce?: string } | undefined;
      if (data?.source === 'zspect-probe-init' && event.ports[0]) {
        activePort = event.ports[0];
        activePort.onmessage = (msgEvt: MessageEvent<ProbeRequestMessage>) => {
          const resp = handleRequest(msgEvt.data);
          activePort?.postMessage(resp);
        };
        activePort.postMessage({ id: data.nonce || 'init', ok: true });
      }
    });
  },
});
