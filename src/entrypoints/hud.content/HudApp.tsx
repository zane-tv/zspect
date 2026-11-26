import { signal } from '@preact/signals';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  Accessibility,
  BookmarkPlus,
  Check,
  Copy,
  Crosshair,
  ExternalLink,
  GripVertical,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  Move,
  PanelRightOpen,
  Pause,
  Play,
  RotateCcw,
  Ruler,
  Scan,
  Snowflake,
  Type as TypeIcon,
  Undo2,
  X,
} from 'lucide-preact';
import {
  buildResilientSelector,
  deepElementFromPoint,
  extractCleanHtml,
  isZSpectInternalNode,
  queryDeepSelector,
} from '@/core/dom-cleaner';
import { useZSpectI18n } from '@/core/i18n';
import { buildIdeDeepLink, compileSinglePinSection } from '@/core/prompt-compiler';
import {
  extractMotionRules,
  extractPseudoStyles,
  extractResolvedCssVariables,
  extractStyleGroups,
  stylesToTailwindHint,
} from '@/core/style-dna';
import { useZSpectTheme } from '@/core/theme/useTheme';
import { auditElementAccessibility } from '@/core/visbug-tools/a11y-inspector';
import { computeRedlineGuides, type RedlineMeasurement } from '@/core/visbug-tools/guides';
import { VisBugTweakEngine } from '@/core/visbug-tools/tweak-engine';
import { copyImageAndOrTextToClipboard } from '@/exporters/image-sheet';
import type {
  A11yAuditSnapshot,
  AnimationSummary,
  BoundingBox,
  CdpPseudoState,
  FlightCapsule,
  FrameworkMeta,
  InspectorToolMode,
  PinRecord,
  PinSeverity,
  PinType,
  ZSpectRuntimeMessage,
} from '@/types/zspect';
import { MainWorldProbeClient } from './probe-client';

interface HudPinMarker {
  id: string;
  orderIndex: number;
  selector: string;
  note: string;
  type: PinType;
  severity: PinSeverity;
  boundingBox: BoundingBox;
}

interface HudRefSummary {
  id: string;
  alias: string;
  sourceUrl: string;
  tailwindHint: string;
}

interface TooltipState {
  label: string;
  shortcut?: string;
  x: number;
  y: number;
  placement: 'top' | 'bottom';
}

const hudVisible = signal(true);
const externalEventTick = signal<{
  kind: 'none' | 'freeze' | 'refresh-db' | 'scroll-to';
  payload?: Extract<ZSpectRuntimeMessage, { type: 'ZSPECT_SCROLL_TO_PIN' }>;
  ts: number;
}>({ kind: 'none', ts: 0 });

export function triggerExternalHudAction(
  action: 'toggle' | 'freeze' | 'refresh-db' | 'scroll-to',
  payload?: Extract<ZSpectRuntimeMessage, { type: 'ZSPECT_SCROLL_TO_PIN' }>,
): void {
  if (action === 'toggle') {
    hudVisible.value = !hudVisible.value;
    return;
  }
  if (action === 'freeze') {
    hudVisible.value = true;
    externalEventTick.value = { kind: 'freeze', ts: Date.now() };
    return;
  }
  if (action === 'refresh-db') {
    externalEventTick.value = { kind: 'refresh-db', ts: Date.now() };
    return;
  }
  if (action === 'scroll-to') {
    hudVisible.value = true;
    externalEventTick.value = { kind: 'scroll-to', payload, ts: Date.now() };
  }
}

function getElementBox(el: Element): BoundingBox {
  const r = el.getBoundingClientRect();
  return {
    x: Math.round(r.left),
    y: Math.round(r.top),
    width: Math.round(r.width),
    height: Math.round(r.height),
    pageX: Math.round(r.left + window.scrollX),
    pageY: Math.round(r.top + window.scrollY),
  };
}

async function dataUrlToPngBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

export function HudApp() {
  const { theme } = useZSpectTheme();
  const { t } = useZSpectI18n();
  const probe = useMemo(() => new MainWorldProbeClient(), []);
  const tweakEngine = useMemo(() => new VisBugTweakEngine(), []);

  const [mode, setMode] = useState<InspectorToolMode>('inspect');
  const [totalPinsCount, setTotalPinsCount] = useState(0);
  const [pagePins, setPagePins] = useState<HudPinMarker[]>([]);
  const [references, setReferences] = useState<HudRefSummary[]>([]);

  // Draggable HUD Position (null = docked bottom-center)
  const dockRef = useRef<HTMLDivElement>(null);
  const [dockPos, setDockPos] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingDock, setIsDraggingDock] = useState(false);

  // Draggable Popover Position override
  const [popoverCustomPos, setPopoverCustomPos] = useState<{ x: number; y: number } | null>(null);

  // Instant Custom Hover Tooltip
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  // Hovered & Selected State
  const [hoveredEl, setHoveredEl] = useState<Element | null>(null);
  const [hoveredBox, setHoveredBox] = useState<BoundingBox | null>(null);
  const [selectedEls, setSelectedEls] = useState<HTMLElement[]>([]);
  const [activeBox, setActiveBox] = useState<BoundingBox | null>(null);
  const [selectedText, setSelectedText] = useState('');

  // Area Drag State
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragRect, setDragRect] = useState<BoundingBox | null>(null);

  // VisBug Tool States
  const [spacingTarget, setSpacingTarget] = useState<'padding' | 'margin'>('padding');
  const [redlineData, setRedlineData] = useState<RedlineMeasurement | null>(null);
  const [liveA11y, setLiveA11y] = useState<A11yAuditSnapshot | null>(null);
  const [tweakVersion, setTweakVersion] = useState(0);

  // Freeze & Motion Scrubber States
  const [domFrozen, setDomFrozen] = useState(false);
  const [cdpStates, setCdpStates] = useState<CdpPseudoState[]>([]);
  const [animations, setAnimations] = useState<AnimationSummary[]>([]);
  const [scrubProgress, setScrubProgress] = useState(50);

  // Diff Overlay States
  const [overlayImgUrl, setOverlayImgUrl] = useState<string | null>(null);
  const [overlayMode, setOverlayMode] = useState<'onion' | 'split'>('onion');
  const [overlayOpacity, setOverlayOpacity] = useState(50);
  const [splitPercent, setSplitPercent] = useState(50);
  const [overlayOffset, setOverlayOffset] = useState({ x: 0, y: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Popover Composer State
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerTab, setComposerTab] = useState<'pin' | 'ref'>('pin');
  const [pinType, setPinType] = useState<PinType>('bug');
  const [pinSeverity, setPinSeverity] = useState<PinSeverity>('medium');
  const [pinNote, setPinNote] = useState('');
  const [attachedRefIds, setAttachedRefIds] = useState<string[]>([]);
  const [refAliasInput, setRefAliasInput] = useState('');
  const [frameworkMeta, setFrameworkMeta] = useState<FrameworkMeta>({
    framework: 'unknown',
    componentStack: [],
  });
  const [flightCapsule, setFlightCapsule] = useState<FlightCapsule | undefined>(undefined);
  const [savingStatus, setSavingStatus] = useState<'idle' | 'saving' | 'copying-img'>('idle');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [scrollTick, setScrollTick] = useState(0);

  const primarySelectedEl = selectedEls[0] ?? null;

  const showToast = (msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => {
      setToastMsg((curr) => (curr === msg ? null : curr));
    }, 2400);
  };

  const showHoverTooltip = (e: MouseEvent, label: string, shortcut?: string) => {
    if (isDraggingDock) return;
    const btnRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const placeBelow = btnRect.top < 72;
    setTooltip({
      label,
      shortcut,
      x: Math.min(window.innerWidth - 80, Math.max(80, btnRect.left + btnRect.width / 2)),
      y: placeBelow ? btnRect.bottom + 10 : btnRect.top - 38,
      placement: placeBelow ? 'bottom' : 'top',
    });
  };

  const hideHoverTooltip = () => setTooltip(null);

  // Start Dragging the Floating HUD Dock
  const handleStartDockDrag = (e: MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setTooltip(null);

    const dockEl = dockRef.current;
    if (!dockEl) return;
    const rect = dockEl.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    setIsDraggingDock(true);

    const onMove = (ev: MouseEvent) => {
      const nextX = Math.max(12, Math.min(window.innerWidth - rect.width - 12, ev.clientX - offsetX));
      const nextY = Math.max(12, Math.min(window.innerHeight - rect.height - 12, ev.clientY - offsetY));
      setDockPos({ x: Math.round(nextX), y: Math.round(nextY) });
    };

    const onUp = () => {
      setIsDraggingDock(false);
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('mouseup', onUp, true);
    };

    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('mouseup', onUp, true);
  };

  // Start Dragging the Pin Composer Popover Header
  const handleStartPopoverDrag = (e: MouseEvent, currentLeft: number, currentTop: number) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    e.stopPropagation();

    const offsetX = e.clientX - currentLeft;
    const offsetY = e.clientY - currentTop;

    const onMove = (ev: MouseEvent) => {
      const nextX = Math.max(12, Math.min(window.innerWidth - 340, ev.clientX - offsetX));
      const nextY = Math.max(12, Math.min(window.innerHeight - 180, ev.clientY - offsetY));
      setPopoverCustomPos({ x: Math.round(nextX), y: Math.round(nextY) });
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('mouseup', onUp, true);
    };

    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('mouseup', onUp, true);
  };

  const refreshHudState = async () => {
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'ZSPECT_GET_HUD_STATE',
        pageUrl: window.location.href,
      } satisfies ZSpectRuntimeMessage);
      if (res?.ok) {
        setTotalPinsCount(res.totalPinsCount ?? 0);
        setPagePins(res.pagePins ?? []);
        setReferences(res.references ?? []);
      }
    } catch {
      // Ignore if extension context reloaded
    }
  };

  useEffect(() => {
    void probe.connect();
    void refreshHudState();

    const onScrollOrResize = () => {
      setScrollTick((n) => n + 1);
      // Keep custom-dragged dock inside viewport on resize
      setDockPos((prev) => {
        if (!prev || !dockRef.current) return prev;
        const r = dockRef.current.getBoundingClientRect();
        return {
          x: Math.max(12, Math.min(window.innerWidth - r.width - 12, prev.x)),
          y: Math.max(12, Math.min(window.innerHeight - r.height - 12, prev.y)),
        };
      });
    };
    window.addEventListener('scroll', onScrollOrResize, { passive: true, capture: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, { capture: true });
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, []);

  const extTick = externalEventTick.value;
  useEffect(() => {
    if (extTick.kind === 'freeze') {
      setMode('freeze');
      setDomFrozen((prev) => !prev);
      void probe.scrubAnimations(scrubProgress / 100, true).then(setAnimations);
      showToast(t.toastFrozen);
    } else if (extTick.kind === 'refresh-db') {
      void refreshHudState();
    } else if (extTick.kind === 'scroll-to' && extTick.payload) {
      const el = queryDeepSelector(extTick.payload.selector);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setSelectedEls([el as HTMLElement]);
        setActiveBox(getElementBox(el));
      } else if (extTick.payload.pageY !== undefined) {
        window.scrollTo({ top: Math.max(0, extTick.payload.pageY - 160), behavior: 'smooth' });
      }
    }
  }, [extTick.ts]);

  useEffect(() => {
    if (!domFrozen) return;
    const swallowDismissEvent = (e: Event) => {
      if (isZSpectInternalNode(e.target as Node | null)) return;
      e.stopImmediatePropagation();
      e.stopPropagation();
    };
    const events = ['mouseleave', 'mouseout', 'pointerleave', 'pointerout', 'blur', 'focusout'];
    for (const ev of events) {
      window.addEventListener(ev, swallowDismissEvent, true);
    }
    return () => {
      for (const ev of events) {
        window.removeEventListener(ev, swallowDismissEvent, true);
      }
    };
  }, [domFrozen]);

  useEffect(() => {
    if (mode === 'freeze') {
      const sel = primarySelectedEl ? buildResilientSelector(primarySelectedEl) : undefined;
      void probe.listAnimations(sel).then(setAnimations);
    }
  }, [mode, primarySelectedEl]);

  const isVisible = hudVisible.value;
  useEffect(() => {
    if (!isVisible && cdpStates.length > 0) {
      setCdpStates([]);
      chrome.runtime
        .sendMessage({
          type: 'ZSPECT_CDP_FORCE_PSEUDO',
          selector: 'body',
          states: [],
          enable: false,
        } satisfies ZSpectRuntimeMessage)
        .catch(() => {});
    }
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible) return;

    const onMouseMove = (e: MouseEvent) => {
      if (isDraggingDock) return;
      if (isZSpectInternalNode(e.target as Node | null)) return;

      if (mode === 'area' && dragStart) {
        const x = Math.min(dragStart.x, e.clientX);
        const y = Math.min(dragStart.y, e.clientY);
        const width = Math.abs(e.clientX - dragStart.x);
        const height = Math.abs(e.clientY - dragStart.y);
        setDragRect({
          x,
          y,
          width,
          height,
          pageX: Math.round(x + window.scrollX),
          pageY: Math.round(y + window.scrollY),
        });
        return;
      }

      if (composerOpen) return;

      const hit = deepElementFromPoint(e.clientX, e.clientY);
      if (!hit || hit === document.documentElement || hit === document.body) {
        setHoveredEl(null);
        setHoveredBox(null);
        setRedlineData(null);
        return;
      }

      setHoveredEl(hit);
      const box = getElementBox(hit);
      setHoveredBox(box);

      if (mode === 'guides' && primarySelectedEl && hit !== primarySelectedEl) {
        setRedlineData(computeRedlineGuides(getElementBox(primarySelectedEl), box));
      } else {
        setRedlineData(null);
      }

      if (mode === 'a11y') {
        setLiveA11y(auditElementAccessibility(hit));
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (isZSpectInternalNode(e.target as Node | null)) return;

      if (mode === 'area') {
        e.preventDefault();
        e.stopPropagation();
        setComposerOpen(false);
        setDragStart({ x: e.clientX, y: e.clientY });
        setDragRect({ x: e.clientX, y: e.clientY, width: 0, height: 0 });
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (mode === 'area' && dragStart) {
        e.preventDefault();
        e.stopPropagation();
        const finalRect = dragRect;
        setDragStart(null);
        if (finalRect && finalRect.width >= 12 && finalRect.height >= 12) {
          setActiveBox(finalRect);
          setPopoverCustomPos(null);
          const centerHit = deepElementFromPoint(
            finalRect.x + finalRect.width / 2,
            finalRect.y + finalRect.height / 2,
          );
          if (centerHit instanceof HTMLElement) {
            setSelectedEls([centerHit]);
            void inspectAndOpenComposer(centerHit, finalRect, 'bug');
          } else {
            setComposerOpen(true);
          }
        }
        setDragRect(null);
      }
    };

    const onClick = (e: MouseEvent) => {
      if (isZSpectInternalNode(e.target as Node | null)) return;
      if (mode === 'area' || mode === 'diff') return;

      const winSel = window.getSelection()?.toString().trim() ?? '';
      if (mode === 'inspect' && winSel.length > 1) {
        const hit = deepElementFromPoint(e.clientX, e.clientY);
        if (hit instanceof HTMLElement) {
          e.preventDefault();
          e.stopPropagation();
          setSelectedText(winSel);
          setSelectedEls([hit]);
          void inspectAndOpenComposer(hit, getElementBox(hit), 'copy');
          return;
        }
      }

      if (mode === 'text-edit') {
        const hit = deepElementFromPoint(e.clientX, e.clientY);
        if (hit instanceof HTMLElement) {
          e.preventDefault();
          e.stopPropagation();
          setSelectedEls([hit]);
          setActiveBox(getElementBox(hit));
          enableLiveTextEditing(hit);
        }
        return;
      }

      const hit = deepElementFromPoint(e.clientX, e.clientY);
      if (!(hit instanceof HTMLElement)) return;

      e.preventDefault();
      e.stopPropagation();

      if (e.metaKey || e.ctrlKey || (e.shiftKey && mode === 'spacing')) {
        setSelectedEls((prev) =>
          prev.includes(hit) ? prev.filter((item) => item !== hit) : [...prev, hit],
        );
        setActiveBox(getElementBox(hit));
        return;
      }

      setSelectedText('');
      setSelectedEls([hit]);
      const box = getElementBox(hit);
      setActiveBox(box);

      if (mode === 'guides' || mode === 'spacing' || mode === 'flexbox' || mode === 'freeze') {
        void probe.inspectElement(buildResilientSelector(hit)).then(({ frameworkMeta: fm }) => {
          setFrameworkMeta(fm);
        });
        return;
      }

      if (mode === 'a11y') {
        const audit = auditElementAccessibility(hit);
        setLiveA11y(audit);
        void inspectAndOpenComposer(hit, box, 'a11y', audit);
        return;
      }

      void inspectAndOpenComposer(hit, box, 'bug');
    };

    window.addEventListener('mousemove', onMouseMove, true);
    window.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('mouseup', onMouseUp, true);
    window.addEventListener('click', onClick, true);

    return () => {
      window.removeEventListener('mousemove', onMouseMove, true);
      window.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('mouseup', onMouseUp, true);
      window.removeEventListener('click', onClick, true);
    };
  }, [isVisible, isDraggingDock, mode, dragStart, dragRect, composerOpen, primarySelectedEl]);

  useEffect(() => {
    if (!isVisible) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        isZSpectInternalNode(target) ||
        target?.isContentEditable ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      ) {
        if (e.key === 'Escape' && composerOpen) {
          setComposerOpen(false);
        }
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) tweakEngine.redo();
        else tweakEngine.undo();
        setTweakVersion((v) => v + 1);
        if (primarySelectedEl) setActiveBox(getElementBox(primarySelectedEl));
        return;
      }

      if (e.key === 'Escape') {
        if (composerOpen) setComposerOpen(false);
        else if (selectedEls.length > 0) {
          setSelectedEls([]);
          setActiveBox(null);
        } else {
          hudVisible.value = false;
        }
        return;
      }

      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'i') setMode('inspect');
        else if (k === 'r') setMode('area');
        else if (k === 'g') setMode('guides');
        else if (k === 'a') setMode('a11y');
        else if (k === 'p') {
          setMode('spacing');
          setSpacingTarget('padding');
        } else if (k === 'm') {
          setMode('spacing');
          setSpacingTarget('margin');
        } else if (k === 'f') setMode('flexbox');
        else if (k === 't') setMode('text-edit');
        else if (k === 'd') setMode('diff');
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        if (mode === 'diff' && overlayImgUrl) {
          e.preventDefault();
          const step = e.shiftKey ? 8 : 1;
          setOverlayOffset((prev) => ({
            x: prev.x + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0),
            y: prev.y + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0),
          }));
          return;
        }

        if (mode === 'spacing' && selectedEls.length > 0) {
          e.preventDefault();
          const step = (e.shiftKey ? 4 : 1) * (e.altKey ? -1 : 1);
          const sideMap: Record<string, 'top' | 'bottom' | 'left' | 'right'> = {
            ArrowUp: 'top',
            ArrowDown: 'bottom',
            ArrowLeft: 'left',
            ArrowRight: 'right',
          };
          tweakEngine.nudgeBoxSpacing(selectedEls, spacingTarget, sideMap[e.key]!, step);
          setTweakVersion((v) => v + 1);
          if (primarySelectedEl) setActiveBox(getElementBox(primarySelectedEl));
          return;
        }

        if (mode === 'flexbox' && primarySelectedEl) {
          e.preventDefault();
          const dir = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
          if (tweakEngine.moveElementAmongSiblings(primarySelectedEl, dir)) {
            setTweakVersion((v) => v + 1);
            setActiveBox(getElementBox(primarySelectedEl));
          }
        }
      }
    };

    const onPaste = (e: ClipboardEvent) => {
      if (mode !== 'diff') return;
      const items = Array.from(e.clipboardData?.items ?? []);
      const imgItem = items.find((it) => it.type.startsWith('image/'));
      if (imgItem) {
        const file = imgItem.getAsFile();
        if (file) {
          e.preventDefault();
          const url = URL.createObjectURL(file);
          setOverlayImgUrl(url);
          showToast(t.toastPastedOverlay);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('paste', onPaste, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('paste', onPaste, true);
    };
  }, [isVisible, mode, composerOpen, selectedEls, spacingTarget, overlayImgUrl, primarySelectedEl, t]);

  const enableLiveTextEditing = (el: HTMLElement) => {
    const beforeText = el.innerText ?? el.textContent ?? '';
    el.contentEditable = 'true';
    el.focus();
    showToast(t.toastEditingText);

    const onBlur = () => {
      el.removeAttribute('contenteditable');
      const afterText = el.innerText ?? el.textContent ?? '';
      if (beforeText !== afterText) {
        tweakEngine.recordTextEdit(el, beforeText, afterText);
        setTweakVersion((v) => v + 1);
        setActiveBox(getElementBox(el));
      }
      el.removeEventListener('blur', onBlur);
    };
    el.addEventListener('blur', onBlur);
  };

  const inspectAndOpenComposer = async (
    el: HTMLElement,
    box: BoundingBox,
    suggestedType: PinType,
    precomputedA11y?: A11yAuditSnapshot,
  ) => {
    const selector = buildResilientSelector(el);
    const diff = tweakEngine.extractDiff(el);
    const a11y = precomputedA11y ?? auditElementAccessibility(el);

    setPopoverCustomPos(null);
    setLiveA11y(a11y);
    setPinType(diff ? 'visual-tweak' : suggestedType);
    setPinSeverity(
      suggestedType === 'a11y' && !a11y.wcagAA ? 'high' : suggestedType === 'bug' ? 'medium' : 'low',
    );
    setComposerTab('pin');
    setRefAliasInput(
      `${window.location.hostname.replace(/^www\./, '').split('.')[0] || 'site'}-${el.tagName.toLowerCase()}`,
    );
    setComposerOpen(true);

    const inspected = await probe.inspectElement(selector);
    setFrameworkMeta(inspected.frameworkMeta);
    setFlightCapsule(inspected.flightCapsule);
  };

  const buildPinDraftPayload = (): Omit<
    PinRecord,
    'id' | 'sessionId' | 'orderIndex' | 'createdAt' | 'croppedImageBlob' | 'fullViewportBlob'
  > | null => {
    const targetEl = primarySelectedEl;
    const box = activeBox ?? (targetEl ? getElementBox(targetEl) : null);
    if (!box) return null;

    const selector = targetEl ? buildResilientSelector(targetEl) : 'viewport-region';
    const extraSelectors =
      selectedEls.length > 1 ? selectedEls.slice(1).map((el) => buildResilientSelector(el)) : undefined;
    const styleGroups = targetEl
      ? extractStyleGroups(targetEl)
      : { combined: {}, layoutStyles: {}, visualStyles: {}, typographyStyles: {} };
    const resolvedCssVars = targetEl ? extractResolvedCssVariables(targetEl) : undefined;
    const visualDiff = targetEl ? tweakEngine.extractDiff(targetEl) : undefined;
    const a11yAudit = targetEl ? (liveA11y ?? auditElementAccessibility(targetEl)) : undefined;

    return {
      type: pinType,
      severity: pinSeverity,
      status: 'open',
      note: pinNote.trim(),
      selectedText: selectedText || undefined,
      pageUrl: window.location.href,
      pageTitle: document.title || window.location.hostname,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        dpr: window.devicePixelRatio || 1,
      },
      boundingBox: box,
      selector,
      extraSelectors,
      cleanHtml: targetEl ? extractCleanHtml(targetEl) : '',
      computedStyles: styleGroups.combined,
      resolvedCssVars,
      tailwindHint: targetEl ? stylesToTailwindHint(styleGroups.combined) : undefined,
      frameworkMeta,
      visualDiff,
      a11yAudit,
      flightCapsule,
      attachedRefIds,
    };
  };

  const handleCopyRegionImageOnly = async () => {
    const targetEl = primarySelectedEl;
    const box = activeBox ?? (targetEl ? getElementBox(targetEl) : null);
    if (!box) return;

    setSavingStatus('copying-img');
    try {
      setComposerOpen(false);
      await new Promise((r) => setTimeout(r, 70));

      const accentColor =
        pinSeverity === 'critical' || pinSeverity === 'high' ? '#b64400' : '#0071e3';
      const res = await chrome.runtime.sendMessage({
        type: 'ZSPECT_CAPTURE_REGION',
        rect: box,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          dpr: window.devicePixelRatio || 1,
        },
        badgeNumber: totalPinsCount + 1,
        accentColor,
      } satisfies ZSpectRuntimeMessage);

      setComposerOpen(true);

      if (res?.ok && res.dataUrl) {
        const pngBlob = await dataUrlToPngBlob(res.dataUrl);
        const copied = await copyImageAndOrTextToClipboard({ imageBlob: pngBlob });
        showToast(copied === 'failed' ? t.clipboardImgDenied : t.copiedImageToast);
      }
    } finally {
      setSavingStatus('idle');
    }
  };

  const handleSavePin = async (alsoCopyToAi = false) => {
    const draft = buildPinDraftPayload();
    if (!draft) return;

    setSavingStatus('saving');
    try {
      setComposerOpen(false);
      await new Promise((r) => setTimeout(r, 70));

      const accentColor =
        draft.severity === 'critical' || draft.severity === 'high' ? '#b64400' : '#0071e3';
      const res = await chrome.runtime.sendMessage({
        type: 'ZSPECT_CREATE_PIN_FROM_HUD',
        pinDraft: draft,
        captureRect: draft.boundingBox,
        accentColor,
      } satisfies ZSpectRuntimeMessage);

      if (res?.ok && res.pin) {
        setPagePins((prev) => [...prev, res.pin]);
        setTotalPinsCount(res.totalPinsCount);

        if (alsoCopyToAi) {
          const tempRecord: PinRecord = {
            ...draft,
            id: res.pin.id,
            sessionId: 'active',
            orderIndex: res.pin.orderIndex,
            createdAt: Date.now(),
          };
          const md = compileSinglePinSection(tempRecord, 'standard');
          const imgBlob = res.croppedDataUrl ? await dataUrlToPngBlob(res.croppedDataUrl) : null;
          await copyImageAndOrTextToClipboard({ imageBlob: imgBlob, text: md });
          showToast(`${t.copiedBothToast} (#${res.pin.orderIndex})`);
        } else {
          showToast(`${t.toastSavedPin} #${res.pin.orderIndex}`);
        }

        setPinNote('');
        setAttachedRefIds([]);
        setSavingStatus('idle');
      }
    } catch {
      setSavingStatus('idle');
    }
  };

  const handleSaveReference = async () => {
    if (!primarySelectedEl) return;
    setSavingStatus('saving');
    const box = getElementBox(primarySelectedEl);
    const groups = extractStyleGroups(primarySelectedEl);

    try {
      setComposerOpen(false);
      await new Promise((r) => setTimeout(r, 70));

      const res = await chrome.runtime.sendMessage({
        type: 'ZSPECT_CREATE_REF_FROM_HUD',
        captureRect: box,
        refDraft: {
          alias: refAliasInput || 'ui-sample',
          sourceUrl: window.location.href,
          sourceTitle: document.title,
          domSkeleton: extractCleanHtml(primarySelectedEl, { maxDepth: 3, skeletonOnly: true }),
          resolvedCssVars: extractResolvedCssVariables(primarySelectedEl),
          layoutStyles: groups.layoutStyles,
          visualStyles: groups.visualStyles,
          typographyStyles: groups.typographyStyles,
          pseudoElements: extractPseudoStyles(primarySelectedEl),
          motionRules: extractMotionRules(primarySelectedEl),
          tailwindHint: stylesToTailwindHint(groups.combined),
        },
      } satisfies ZSpectRuntimeMessage);

      if (res?.ok && res.reference) {
        setReferences((prev) => [res.reference, ...prev]);
        setSavingStatus('idle');
        showToast(`${t.toastSavedRef} @ref:${res.reference.alias}`);
      }
    } catch {
      setSavingStatus('idle');
    }
  };

  const handleToggleCdpPseudo = async (pseudo: CdpPseudoState) => {
    if (!primarySelectedEl) {
      showToast(t.toastSelectFirst);
      return;
    }
    const next = cdpStates.includes(pseudo)
      ? cdpStates.filter((s) => s !== pseudo)
      : [...cdpStates, pseudo];

    const res = await chrome.runtime.sendMessage({
      type: 'ZSPECT_CDP_FORCE_PSEUDO',
      selector: buildResilientSelector(primarySelectedEl),
      states: next,
      enable: next.length > 0,
    } satisfies ZSpectRuntimeMessage);

    if (res?.ok) {
      setCdpStates(next);
    } else if (res?.error) {
      showToast(res.error);
    }
  };

  const handleCaptureBeforeSnapshot = async () => {
    hudVisible.value = false;
    await new Promise((r) => setTimeout(r, 90));
    const res = await chrome.runtime.sendMessage({
      type: 'ZSPECT_CAPTURE_FULL_VIEWPORT',
    } satisfies ZSpectRuntimeMessage);
    hudVisible.value = true;
    if (res?.ok && res.dataUrl) {
      setOverlayImgUrl(res.dataUrl);
      showToast(t.toastSnapshotTaken);
    }
  };

  if (!isVisible) return null;

  const currentDiff =
    primarySelectedEl && tweakVersion >= 0 ? tweakEngine.extractDiff(primarySelectedEl) : undefined;

  const renderedPinBadges = pagePins.map((pin) => {
    const liveEl = scrollTick >= 0 ? queryDeepSelector(pin.selector) : null;
    if (liveEl) {
      const r = liveEl.getBoundingClientRect();
      return { ...pin, x: r.left, y: r.top, visible: r.width > 0 && r.height > 0 };
    }
    return {
      ...pin,
      x: (pin.boundingBox.pageX ?? pin.boundingBox.x) - window.scrollX,
      y: (pin.boundingBox.pageY ?? pin.boundingBox.y) - window.scrollY,
      visible: true,
    };
  });

  // Compute Popover Position (supports dragging!)
  const popoverGeometry = (() => {
    const width = Math.min(404, Math.max(300, window.innerWidth - 24));
    if (popoverCustomPos) {
      return {
        left: popoverCustomPos.x,
        top: popoverCustomPos.y,
        width,
      };
    }
    const refBox = activeBox ?? {
      x: Math.round((window.innerWidth - width) / 2),
      y: 120,
      width: 40,
      height: 40,
    };
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, refBox.x));
    const preferBelow = refBox.y + refBox.height + 14;
    const top =
      preferBelow + 400 < window.innerHeight ? preferBelow : Math.max(12, refBox.y - 390);
    return { left, top, width };
  })();

  // Compute Sub-Bar anchor relative to Slim 38px Dock position
  const subBarStyle = (() => {
    if (!dockPos) {
      return {
        position: 'fixed' as const,
        left: '50%',
        bottom: '58px',
        transform: 'translateX(-50%)',
      };
    }
    const dockEl = dockRef.current;
    const dockW = dockEl ? dockEl.offsetWidth : 420;
    const dockH = dockEl ? dockEl.offsetHeight : 38;
    const centerLeft = Math.max(16, Math.min(window.innerWidth - 260, dockPos.x + dockW / 2));
    const placeBelow = dockPos.y < 64;
    return {
      position: 'fixed' as const,
      left: `${centerLeft}px`,
      top: placeBelow ? `${dockPos.y + dockH + 6}px` : `${dockPos.y - 40}px`,
      transform: 'translateX(-50%)',
    };
  })();

  const captureTools = [
    { id: 'inspect', label: t.toolInspect, shortcut: 'I', icon: Crosshair },
    { id: 'area', label: t.toolArea, shortcut: 'R', icon: Scan },
    { id: 'guides', label: t.toolGuides, shortcut: 'G', icon: Ruler },
    { id: 'a11y', label: t.toolA11y, shortcut: 'A', icon: Accessibility },
  ] as const;

  const tweakTools = [
    { id: 'spacing', label: t.toolSpacing, shortcut: 'P', icon: Move },
    { id: 'flexbox', label: t.toolFlex, shortcut: 'F', icon: LayoutGrid },
    { id: 'text-edit', label: t.toolText, shortcut: 'T', icon: TypeIcon },
    { id: 'freeze', label: t.toolFreeze, shortcut: '⌥⇧F', icon: Snowflake },
    { id: 'diff', label: t.toolDiff, shortcut: 'D', icon: Layers },
  ] as const;

  return (
    <div
      data-theme={theme}
      class="fixed inset-0 pointer-events-none select-none font-sans"
      style={{ color: 'var(--zs-text)' }}
    >
      {/* 1. Design Diff Overlay Layer */}
      {mode === 'diff' && overlayImgUrl && (
        <div class="fixed inset-0 pointer-events-none overflow-hidden">
          <img
            src={overlayImgUrl}
            alt="ZSpect Design Diff Overlay"
            style={{
              position: 'fixed',
              left: `${overlayOffset.x}px`,
              top: `${overlayOffset.y}px`,
              width: '100vw',
              height: 'auto',
              opacity: overlayMode === 'onion' ? overlayOpacity / 100 : 1,
              clipPath:
                overlayMode === 'split' ? `inset(0 ${100 - splitPercent}% 0 0)` : undefined,
            }}
          />
          {overlayMode === 'split' && (
            <div
              style={{ left: `${splitPercent}%` }}
              class="fixed top-0 bottom-0 w-[2px] bg-[#0071e3] pointer-events-auto cursor-ew-resize"
              onMouseDown={(e) => {
                e.preventDefault();
                const move = (ev: MouseEvent) => {
                  setSplitPercent(
                    Math.max(2, Math.min(98, Math.round((ev.clientX / window.innerWidth) * 100))),
                  );
                };
                const up = () => {
                  window.removeEventListener('mousemove', move);
                  window.removeEventListener('mouseup', up);
                };
                window.addEventListener('mousemove', move);
                window.addEventListener('mouseup', up);
              }}
            />
          )}
        </div>
      )}

      {/* 2. Smooth Spring Hover Highlight Box */}
      {hoveredBox && !composerOpen && !isDraggingDock && (
        <div
          style={{
            left: `${hoveredBox.x}px`,
            top: `${hoveredBox.y}px`,
            width: `${hoveredBox.width}px`,
            height: `${hoveredBox.height}px`,
            transition:
              'left 85ms cubic-bezier(0.22, 1, 0.36, 1), top 85ms cubic-bezier(0.22, 1, 0.36, 1), width 85ms cubic-bezier(0.22, 1, 0.36, 1), height 85ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
          class="fixed border-[1.5px] border-[#0071e3] bg-[#0071e3]/[0.05] pointer-events-none"
        >
          <div
            style={{
              position: 'absolute',
              top: hoveredBox.y < 30 ? '4px' : '-26px',
              left: '0',
              padding: '3px 9px',
              borderRadius: '9999px',
              backgroundColor: '#1d1d1f',
              color: '#ffffff',
              fontSize: '11px',
              fontWeight: 500,
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 10px rgba(0,0,0,0.16)',
            }}
          >
            {hoveredEl?.tagName.toLowerCase()}
            {hoveredEl?.id ? `#${hoveredEl.id.slice(0, 16)}` : ''} · {hoveredBox.width}×
            {hoveredBox.height}
          </div>
        </div>
      )}

      {/* 3. Selected Element(s) Bounding Frame + VisBug Box-Model Tint */}
      {selectedEls.map((el) => {
        const b = scrollTick >= 0 && tweakVersion >= 0 ? getElementBox(el) : getElementBox(el);
        const cs = mode === 'spacing' ? window.getComputedStyle(el) : null;
        const padTop = cs ? parseFloat(cs.paddingTop) || 0 : 0;
        const padBottom = cs ? parseFloat(cs.paddingBottom) || 0 : 0;
        const padLeft = cs ? parseFloat(cs.paddingLeft) || 0 : 0;
        const padRight = cs ? parseFloat(cs.paddingRight) || 0 : 0;

        return (
          <div
            key={buildResilientSelector(el)}
            style={{
              left: `${b.x}px`,
              top: `${b.y}px`,
              width: `${b.width}px`,
              height: `${b.height}px`,
            }}
            class="fixed border-2 border-[#0071e3] pointer-events-none"
          >
            <span class="absolute -top-1 -left-1 w-2 h-2 bg-white border border-[#0071e3]" />
            <span class="absolute -top-1 -right-1 w-2 h-2 bg-white border border-[#0071e3]" />
            <span class="absolute -bottom-1 -left-1 w-2 h-2 bg-white border border-[#0071e3]" />
            <span class="absolute -bottom-1 -right-1 w-2 h-2 bg-white border border-[#0071e3]" />

            {mode === 'spacing' && (
              <div
                style={{
                  borderTopWidth: `${padTop}px`,
                  borderBottomWidth: `${padBottom}px`,
                  borderLeftWidth: `${padLeft}px`,
                  borderRightWidth: `${padRight}px`,
                }}
                class="w-full h-full border-[#0071e3]/20"
              />
            )}
          </div>
        );
      })}

      {/* 4. Area Drag Marquee */}
      {dragRect && (
        <div
          style={{
            left: `${dragRect.x}px`,
            top: `${dragRect.y}px`,
            width: `${dragRect.width}px`,
            height: `${dragRect.height}px`,
          }}
          class="fixed border-[1.5px] border-dashed border-[#0071e3] bg-[#0071e3]/10 pointer-events-none"
        />
      )}

      {/* 5. VisBug Redline Distance Guides */}
      {mode === 'guides' && redlineData && (
        <svg class="fixed inset-0 w-screen h-screen pointer-events-none">
          {redlineData.alignments.map((al, i) =>
            al.orientation === 'horizontal' ? (
              <line
                key={`al-${i}`}
                x1={0}
                y1={al.pos}
                x2={window.innerWidth}
                y2={al.pos}
                stroke="#b64400"
                stroke-width="1"
                stroke-dasharray="3 3"
              />
            ) : (
              <line
                key={`al-${i}`}
                x1={al.pos}
                y1={0}
                x2={al.pos}
                y2={window.innerHeight}
                stroke="#b64400"
                stroke-width="1"
                stroke-dasharray="3 3"
              />
            ),
          )}
          {redlineData.lines.map((ln, idx) => {
            const mx = (ln.x1 + ln.x2) / 2;
            const my = (ln.y1 + ln.y2) / 2;
            return (
              <g key={`ln-${idx}`}>
                <line
                  x1={ln.x1}
                  y1={ln.y1}
                  x2={ln.x2}
                  y2={ln.y2}
                  stroke="#0071e3"
                  stroke-width="1.5"
                />
                <rect x={mx - 22} y={my - 10} width="44" height="20" rx="10" fill="#0071e3" />
                <text
                  x={mx}
                  y={my + 4}
                  text-anchor="middle"
                  fill="#ffffff"
                  font-size="11"
                  font-weight="600"
                >
                  {ln.label}
                </text>
              </g>
            );
          })}
        </svg>
      )}

      {/* 6. Live Accessibility WCAG Floating Card */}
      {mode === 'a11y' && hoveredBox && liveA11y && !composerOpen && (
        <div
          style={{
            left: `${Math.min(window.innerWidth - 284, Math.max(12, hoveredBox.x))}px`,
            top: `${Math.min(window.innerHeight - 165, hoveredBox.y + hoveredBox.height + 10)}px`,
          }}
          class="fixed w-[272px] zs-popover-surface zs-anim-popover p-4 pointer-events-none text-[12px]"
        >
          <div class="flex items-center justify-between mb-1.5">
            <span class="font-semibold">WCAG Contrast</span>
            <span class={liveA11y.wcagAA ? 'font-semibold' : 'zs-status-urgent'}>
              {liveA11y.contrastRatio}:1 ·{' '}
              {liveA11y.wcagAAA ? 'AAA' : liveA11y.wcagAA ? 'AA Pass' : 'AA FAIL'}
            </span>
          </div>
          <div class="flex items-center gap-2 text-[11px] zs-muted mb-1">
            <span
              class="w-3.5 h-3.5 rounded-full border border-[#86868b]"
              style={{ backgroundColor: liveA11y.foregroundColor }}
            />
            <span>{liveA11y.foregroundColor}</span>
            <span>on</span>
            <span
              class="w-3.5 h-3.5 rounded-full border border-[#86868b]"
              style={{ backgroundColor: liveA11y.effectiveBackgroundColor }}
            />
            <span>{liveA11y.effectiveBackgroundColor}</span>
          </div>
          <div class="text-[11px] zs-muted truncate">
            Role: <strong style={{ color: 'var(--zs-text)' }}>{liveA11y.role}</strong> · Target:{' '}
            {liveA11y.dimensions.width}×{liveA11y.dimensions.height}px
          </div>
          {liveA11y.issues[0] && (
            <div class="mt-1.5 zs-status-urgent text-[11px] line-clamp-2">{liveA11y.issues[0]}</div>
          )}
        </div>
      )}

      {/* 7. Persistent Numbered Pin Markers on Page */}
      {renderedPinBadges.map((pin) =>
        pin.visible ? (
          <button
            key={pin.id}
            type="button"
            onMouseEnter={(e) =>
              showHoverTooltip(e, `#${pin.orderIndex}: ${(pin.note || pin.type).slice(0, 36)}`)
            }
            onMouseLeave={hideHoverTooltip}
            style={{
              left: `${Math.max(4, Math.min(window.innerWidth - 28, pin.x - 12))}px`,
              top: `${Math.max(4, Math.min(window.innerHeight - 28, pin.y - 12))}px`,
              width: '24px',
              height: '24px',
              boxShadow: '0 3px 8px rgba(0,0,0,0.25)',
            }}
            onClick={(e) => {
              e.stopPropagation();
              chrome.runtime
                .sendMessage({ type: 'ZSPECT_OPEN_SIDEPANEL' } satisfies ZSpectRuntimeMessage)
                .catch(() => {});
            }}
            class={`fixed rounded-full border-2 border-white text-white text-[11px] font-semibold flex items-center justify-center pointer-events-auto cursor-pointer zs-anim-pin zs-pressable ${
              pin.severity === 'critical' || pin.severity === 'high'
                ? 'bg-[#b64400]'
                : 'bg-[#0071e3]'
            }`}
          >
            {pin.orderIndex}
          </button>
        ) : null,
      )}

      {/* 8. Slim Contextual Sub-Bar (34px height) */}
      {(mode === 'spacing' || mode === 'flexbox' || mode === 'freeze' || mode === 'diff') && (
        <div
          style={subBarStyle}
          class="max-w-[calc(100vw-20px)] overflow-x-auto zs-no-scrollbar whitespace-nowrap zs-hud-subbar zs-anim-dock pointer-events-auto"
        >
          {mode === 'spacing' && (
            <>
              <button
                type="button"
                onClick={() => setSpacingTarget('padding')}
                class={`zs-subbar-pill ${spacingTarget === 'padding' ? 'zs-subbar-pill-active' : ''}`}
              >
                Padding (P)
              </button>
              <button
                type="button"
                onClick={() => setSpacingTarget('margin')}
                class={`zs-subbar-pill ${spacingTarget === 'margin' ? 'zs-subbar-pill-active' : ''}`}
              >
                Margin (M)
              </button>
              <span class="zs-muted text-[11px] shrink-0">↑↓←→ (Shift +4 · Alt -)</span>
              {primarySelectedEl && currentDiff && (
                <button
                  type="button"
                  onClick={() =>
                    void inspectAndOpenComposer(
                      primarySelectedEl,
                      getElementBox(primarySelectedEl),
                      'visual-tweak',
                    )
                  }
                  style={{ height: '24px', padding: '0 10px', fontSize: '11.5px' }}
                  class="zs-btn-primary zs-pressable shrink-0 cursor-pointer"
                >
                  {t.pinDiffBtn}
                </button>
              )}
            </>
          )}

          {mode === 'flexbox' && (
            <>
              {(['row', 'column'] as const).map((dir) => (
                <button
                  key={dir}
                  type="button"
                  onClick={() => {
                    if (primarySelectedEl) {
                      tweakEngine.updateFlexContainer(primarySelectedEl, { direction: dir });
                      setTweakVersion((v) => v + 1);
                    }
                  }}
                  class="zs-subbar-pill"
                >
                  {dir}
                </button>
              ))}
              {(['flex-start', 'center', 'space-between'] as const).map((jc) => (
                <button
                  key={jc}
                  type="button"
                  onClick={() => {
                    if (primarySelectedEl) {
                      tweakEngine.updateFlexContainer(primarySelectedEl, { justifyContent: jc });
                      setTweakVersion((v) => v + 1);
                    }
                  }}
                  class="zs-subbar-pill"
                >
                  {jc.replace('flex-', '')}
                </button>
              ))}
              <span class="zs-muted text-[11px] shrink-0">{t.flexMoveHint}</span>
              {primarySelectedEl && currentDiff && (
                <button
                  type="button"
                  onClick={() =>
                    void inspectAndOpenComposer(
                      primarySelectedEl,
                      getElementBox(primarySelectedEl),
                      'visual-tweak',
                    )
                  }
                  style={{ height: '24px', padding: '0 10px', fontSize: '11.5px' }}
                  class="zs-btn-primary zs-pressable shrink-0 cursor-pointer"
                >
                  {t.pinDiffBtn}
                </button>
              )}
            </>
          )}

          {mode === 'freeze' && (
            <>
              <button
                type="button"
                onClick={() => setDomFrozen((f) => !f)}
                class={`zs-subbar-pill ${domFrozen ? 'zs-subbar-pill-active' : ''}`}
              >
                {domFrozen ? <Pause size={11} /> : <Play size={11} />}
                <span>{domFrozen ? t.domLocked : t.lockTooltip}</span>
              </button>

              <div class="h-3.5 w-[1px] zs-divider shrink-0" />

              {(['hover', 'focus', 'active'] as CdpPseudoState[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => void handleToggleCdpPseudo(st)}
                  class={`zs-subbar-pill ${
                    cdpStates.includes(st) ? '!bg-[#0071e3] !text-white !border-transparent' : ''
                  }`}
                >
                  :{st}
                </button>
              ))}

              <div class="h-3.5 w-[1px] zs-divider shrink-0" />

              <span class="zs-muted text-[11px] shrink-0">
                {t.motionLabel} ({animations.length})
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={scrubProgress}
                onInput={(e) => {
                  const val = Number((e.target as HTMLInputElement).value);
                  setScrubProgress(val);
                  const sel = primarySelectedEl
                    ? buildResilientSelector(primarySelectedEl)
                    : undefined;
                  void probe.scrubAnimations(val / 100, true, sel).then(setAnimations);
                }}
                style={{ width: '72px', height: '4px' }}
                class="accent-[#0071e3] shrink-0 cursor-pointer"
              />
              <span class="w-7 text-right tabular-nums text-[11px] shrink-0">{scrubProgress}%</span>
              <button
                type="button"
                onClick={() => void probe.resumeAnimations()}
                class="zs-link text-[11px] px-0.5 shrink-0 cursor-pointer"
              >
                Play
              </button>
            </>
          )}

          {mode === 'diff' && (
            <>
              <button
                type="button"
                onClick={() => void handleCaptureBeforeSnapshot()}
                class="zs-subbar-pill"
              >
                {t.captureBeforeBtn}
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                class="zs-subbar-pill"
              >
                {t.uploadFigmaBtn}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                class="hidden"
                onChange={(e) => {
                  const f = (e.target as HTMLInputElement).files?.[0];
                  if (f) setOverlayImgUrl(URL.createObjectURL(f));
                }}
              />
              {overlayImgUrl && (
                <>
                  <button
                    type="button"
                    onClick={() => setOverlayMode(overlayMode === 'onion' ? 'split' : 'onion')}
                    class="zs-subbar-pill"
                  >
                    {overlayMode === 'onion' ? 'Onion-Skin' : 'Split Wipe'}
                  </button>
                  {overlayMode === 'onion' && (
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={overlayOpacity}
                      onInput={(e) => setOverlayOpacity(Number((e.target as HTMLInputElement).value))}
                      style={{ width: '68px', height: '4px' }}
                      class="accent-[#0071e3] shrink-0"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setOverlayImgUrl(null)}
                    class="zs-link text-[11px] px-0.5 shrink-0 cursor-pointer"
                  >
                    {t.clearOverlayBtn}
                  </button>
                </>
              )}
              {!overlayImgUrl && (
                <span class="zs-muted text-[11px] shrink-0">{t.pasteMockupHint}</span>
              )}
            </>
          )}
        </div>
      )}

      {/* 9. Draggable Pin & Cross-Tab @ref Composer Popover */}
      {composerOpen && (
        <div
          style={{
            left: `${popoverGeometry.left}px`,
            top: `${popoverGeometry.top}px`,
            width: `${popoverGeometry.width}px`,
          }}
          class="fixed zs-popover-surface zs-anim-popover p-5 pointer-events-auto flex flex-col gap-3.5"
        >
          {/* Draggable Header */}
          <div
            onMouseDown={(e) =>
              handleStartPopoverDrag(e, popoverGeometry.left, popoverGeometry.top)
            }
            class="flex items-center justify-between pb-3 gap-2 cursor-grab active:cursor-grabbing"
            style={{ borderBottom: '1px solid var(--zs-border)' }}
          >
            <div class="flex items-center gap-1.5 min-w-0">
              <GripVertical size={14} class="zs-muted shrink-0" />
              <button
                type="button"
                onClick={() => setComposerTab('pin')}
                class={`h-8 px-3.5 rounded-full text-[13px] font-medium whitespace-nowrap cursor-pointer zs-pressable ${
                  composerTab === 'pin' ? 'zs-icon-btn-active' : 'zs-icon-btn zs-muted'
                }`}
              >
                {t.pinTabTitle} #{totalPinsCount + 1}
              </button>
              <button
                type="button"
                onClick={() => setComposerTab('ref')}
                class={`h-8 px-3.5 rounded-full text-[13px] font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer zs-pressable ${
                  composerTab === 'ref' ? 'zs-icon-btn-active' : 'zs-icon-btn zs-muted'
                }`}
              >
                <BookmarkPlus size={14} />
                <span>{t.refTabTitle}</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setComposerOpen(false)}
              class="w-8 h-8 flex items-center justify-center shrink-0 zs-icon-btn zs-muted cursor-pointer zs-pressable"
            >
              <X size={16} />
            </button>
          </div>

          {/* Detected Component & IDE Deep-Link */}
          <div class="zs-subtle-box rounded-[14px] px-3.5 py-2.5 text-[12px] flex flex-col gap-1.5">
            <div class="flex items-center justify-between gap-2">
              <span class="font-medium truncate">
                {frameworkMeta.componentName
                  ? `<${frameworkMeta.componentName}> (${frameworkMeta.framework})`
                  : primarySelectedEl
                    ? buildResilientSelector(primarySelectedEl)
                    : 'Viewport Region'}
              </span>
              {frameworkMeta.sourceLocation && (
                <a
                  href={buildIdeDeepLink(frameworkMeta.sourceLocation, 'cursor')}
                  class="zs-link flex items-center gap-1 shrink-0 font-medium"
                >
                  Cursor <ExternalLink size={12} />
                </a>
              )}
            </div>
            {flightCapsule &&
              (flightCapsule.consoleErrors.length > 0 || flightCapsule.networkIssues.length > 0) && (
                <div class="zs-status-urgent text-[12px] truncate">
                  {t.flightAttachedMsg} {flightCapsule.consoleErrors.length} {t.consoleErrLabel} ·{' '}
                  {flightCapsule.networkIssues.length} {t.netErrLabel}
                </div>
              )}
            {currentDiff && (
              <div class="zs-link font-medium truncate">
                {t.diffRecordedMsg} {currentDiff.styleChanges.length} {t.cssChangesLabel}{' '}
                {currentDiff.textChange ? t.textChangeLabel : ''} (Before → After)
              </div>
            )}
          </div>

          {composerTab === 'pin' ? (
            <>
              <div class="flex items-center gap-2.5">
                <select
                  value={pinType}
                  onChange={(e) => setPinType((e.target as HTMLSelectElement).value as PinType)}
                  class="flex-1 min-w-0 h-9 zs-input zs-select rounded-full pl-3.5 text-[13px]"
                >
                  <option value="bug">{t.filterBug}</option>
                  <option value="ui-polish">{t.filterUiPolish}</option>
                  <option value="visual-tweak">{t.filterVisualTweak}</option>
                  <option value="copy">{t.filterCopy}</option>
                  <option value="a11y">{t.filterA11y}</option>
                  <option value="design-diff">{t.filterDesignDiff}</option>
                </select>

                <select
                  value={pinSeverity}
                  onChange={(e) =>
                    setPinSeverity((e.target as HTMLSelectElement).value as PinSeverity)
                  }
                  class="h-9 shrink-0 zs-input zs-select rounded-full pl-3.5 text-[13px]"
                >
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>

              <textarea
                rows={3}
                value={pinNote}
                onInput={(e) => setPinNote((e.target as HTMLTextAreaElement).value)}
                placeholder={t.notePlaceholder}
                class="w-full zs-input rounded-[14px] px-3.5 py-2.5 text-[13px] placeholder:text-[#86868b] resize-none"
              />

              {references.length > 0 && (
                <div class="flex flex-wrap items-center gap-1.5">
                  <span class="text-[12px] zs-muted">{t.attachRefLabel}</span>
                  {references.slice(0, 5).map((ref) => {
                    const active = attachedRefIds.includes(ref.id);
                    return (
                      <button
                        key={ref.id}
                        type="button"
                        onClick={() =>
                          setAttachedRefIds((prev) =>
                            active ? prev.filter((id) => id !== ref.id) : [...prev, ref.id],
                          )
                        }
                        class={`px-2.5 py-1 rounded-full text-[12px] cursor-pointer zs-pressable ${
                          active ? 'bg-[#0071e3] text-white' : 'zs-subtle-box'
                        }`}
                      >
                        @ref:{ref.alias}
                      </button>
                    );
                  })}
                </div>
              )}

              <div class="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  disabled={savingStatus !== 'idle'}
                  onClick={() => void handleCopyRegionImageOnly()}
                  class="zs-btn-outline zs-pressable h-9 px-3 gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <ImageIcon size={14} />
                  <span>{t.copyImgBtn}</span>
                </button>

                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={savingStatus !== 'idle'}
                    onClick={() => void handleSavePin(true)}
                    class="zs-btn-outline zs-pressable h-9 px-3.5 gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <Copy size={13} />
                    <span>{t.saveAndCopyBtn}</span>
                  </button>
                  <button
                    type="button"
                    disabled={savingStatus !== 'idle'}
                    onClick={() => void handleSavePin(false)}
                    class="zs-btn-primary zs-pressable h-9 px-4 gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <Check size={14} />
                    <span>{savingStatus === 'saving' ? t.savingBtn : t.savePinBtn}</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div class="text-[13px] zs-muted leading-relaxed">{t.saveRefDesc}</div>
              <div class="flex items-center gap-2">
                <span class="text-[13px] font-medium zs-muted shrink-0">@ref:</span>
                <input
                  type="text"
                  value={refAliasInput}
                  onInput={(e) => setRefAliasInput((e.target as HTMLInputElement).value)}
                  placeholder="stripe-card"
                  class="flex-1 min-w-0 h-9 zs-input rounded-full px-3.5 text-[13px]"
                />
              </div>
              <div class="flex justify-end pt-1">
                <button
                  type="button"
                  disabled={savingStatus !== 'idle'}
                  onClick={() => void handleSaveReference()}
                  class="zs-btn-primary zs-pressable h-9 px-5 whitespace-nowrap cursor-pointer"
                >
                  {savingStatus === 'saving' ? t.extractingBtn : t.saveRefBtn}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* 10. Toast Feedback Capsule */}
      {toastMsg && (
        <div
          style={{ position: 'fixed', top: '24px', left: '50%', transform: 'translateX(-50%)' }}
          class="zs-frosted-hud px-5 py-2.5 text-[13px] font-medium whitespace-nowrap"
        >
          {toastMsg}
        </div>
      )}

      {/* 11. Instant Portal Hover Tooltip (Never clipped by overflow) */}
      {tooltip && !isDraggingDock && (
        <div
          class="zs-tooltip"
          style={{
            left: `${tooltip.x}px`,
            top: `${tooltip.y}px`,
            transform: 'translateX(-50%)',
          }}
        >
          <span>{tooltip.label}</span>
          {tooltip.shortcut && <kbd class="zs-tooltip-kbd">{tooltip.shortcut}</kbd>}
        </div>
      )}

      {/* 12. Main Draggable Compact Floating Dock (38px height) */}
      <div
        ref={dockRef}
        style={
          dockPos
            ? {
                position: 'fixed',
                left: `${dockPos.x}px`,
                top: `${dockPos.y}px`,
              }
            : {
                position: 'fixed',
                left: '50%',
                bottom: '14px',
                transform: 'translateX(-50%)',
              }
        }
        class="max-w-[calc(100vw-16px)] whitespace-nowrap pointer-events-auto"
      >
        <div class="zs-hud-dock zs-anim-dock max-w-full overflow-x-auto zs-no-scrollbar">
          {/* Compact Draggable Grip + Logo Icon */}
          <div
            onMouseDown={handleStartDockDrag}
            onDblClick={() => setDockPos(null)}
            onMouseEnter={(e) => showHoverTooltip(e, `ZSpect · ${t.dragHudHint}`)}
            onMouseLeave={hideHoverTooltip}
            class="flex items-center gap-1 pl-0.5 pr-2 cursor-grab active:cursor-grabbing shrink-0"
            style={{ borderRight: '1px solid var(--zs-border-strong)' }}
          >
            <GripVertical size={13} class="zs-muted shrink-0" />
            <svg viewBox="0 0 512 512" style={{ width: '20px', height: '20px' }} class="shrink-0" fill="none">
              <rect
                x="16"
                y="16"
                width="480"
                height="480"
                rx="120"
                fill="#1d1d1f"
                stroke="#545458"
                stroke-width="14"
              />
              <path fill="#ffffff" d="M124 128H286V166H162V248H124V128Z" />
              <path fill="#ffffff" d="M124 290H162V346H214V384H124V290Z" />
              <path fill="#ffffff" d="M232 346H350V276H388V384H232V346Z" />
              <line x1="178" y1="330" x2="314" y2="194" stroke="#ffffff" stroke-width="40" />
              <circle cx="358" cy="158" r="34" fill="#0071e3" />
            </svg>
          </div>

          {/* Cluster 1: Inspect, Area, Redlines, A11y */}
          <div class="zs-tool-cluster shrink-0">
            {captureTools.map(({ id, label, shortcut, icon: Icon }) => {
              const active = mode === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-label={label}
                  onMouseEnter={(e) => showHoverTooltip(e, label, shortcut)}
                  onMouseLeave={hideHoverTooltip}
                  onClick={() => {
                    setMode(id);
                    setComposerOpen(false);
                  }}
                  class={`zs-hud-btn ${active ? 'zs-hud-btn-active' : ''}`}
                >
                  <Icon size={15} strokeWidth={1.9} />
                </button>
              );
            })}
          </div>

          <div class="h-4 w-[1px] zs-divider shrink-0" />

          {/* Cluster 2: VisBug Tweaks, Freeze & Overlay Diff */}
          <div class="zs-tool-cluster shrink-0">
            {tweakTools.map(({ id, label, shortcut, icon: Icon }) => {
              const active = mode === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-label={label}
                  onMouseEnter={(e) => showHoverTooltip(e, label, shortcut)}
                  onMouseLeave={hideHoverTooltip}
                  onClick={() => {
                    setMode(id);
                    setComposerOpen(false);
                  }}
                  class={`zs-hud-btn ${active ? 'zs-hud-btn-active' : ''}`}
                >
                  <Icon size={15} strokeWidth={1.9} />
                </button>
              );
            })}
          </div>

          {/* Undo / Reset Controls (when VisBug tweaks exist) */}
          {tweakEngine.canUndo() && (
            <>
              <div class="h-4 w-[1px] zs-divider shrink-0" />
              <div class="zs-tool-cluster shrink-0">
                <button
                  type="button"
                  aria-label={t.undoTooltip}
                  onMouseEnter={(e) => showHoverTooltip(e, t.undoTooltip, '⌘Z')}
                  onMouseLeave={hideHoverTooltip}
                  onClick={() => {
                    tweakEngine.undo();
                    setTweakVersion((v) => v + 1);
                  }}
                  class="zs-hud-btn"
                >
                  <Undo2 size={14} />
                </button>
                <button
                  type="button"
                  aria-label={t.resetTooltip}
                  onMouseEnter={(e) => showHoverTooltip(e, t.resetTooltip)}
                  onMouseLeave={hideHoverTooltip}
                  onClick={() => {
                    tweakEngine.resetAll();
                    setTweakVersion((v) => v + 1);
                    showToast(t.toastResetTweaks);
                  }}
                  class="zs-hud-btn"
                >
                  <RotateCcw size={14} />
                </button>
              </div>
            </>
          )}

          {/* Compact Workspace CTA + Close (Theme & Language live in Side Panel) */}
          <div
            class="flex items-center gap-1 pl-1.5 shrink-0"
            style={{ borderLeft: '1px solid var(--zs-border-strong)' }}
          >
            <button
              type="button"
              onMouseEnter={(e) => showHoverTooltip(e, t.openSidePanelTooltip)}
              onMouseLeave={hideHoverTooltip}
              onClick={() => {
                chrome.runtime
                  .sendMessage({ type: 'ZSPECT_OPEN_SIDEPANEL' } satisfies ZSpectRuntimeMessage)
                  .catch(() => {});
              }}
              style={{ height: '28px', padding: '0 10px', gap: '5px', fontSize: '12px' }}
              class="zs-btn-primary zs-pressable shrink-0 whitespace-nowrap cursor-pointer"
            >
              <PanelRightOpen size={13} />
              <span>{totalPinsCount}</span>
            </button>

            <button
              type="button"
              aria-label={t.closeHudTooltip}
              onMouseEnter={(e) => showHoverTooltip(e, t.closeHudTooltip, 'Esc')}
              onMouseLeave={hideHoverTooltip}
              onClick={() => {
                hudVisible.value = false;
              }}
              style={{ width: '28px', height: '28px' }}
              class="zs-hud-btn zs-muted"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
