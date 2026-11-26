import { signal } from '@preact/signals';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  Accessibility,
  BookmarkPlus,
  Check,
  Copy,
  Crosshair,
  ExternalLink,
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
import { buildIdeDeepLink, compileSinglePinSection } from '@/core/prompt-compiler';
import {
  extractMotionRules,
  extractPseudoStyles,
  extractResolvedCssVariables,
  extractStyleGroups,
  stylesToTailwindHint,
} from '@/core/style-dna';
import { auditElementAccessibility } from '@/core/visbug-tools/a11y-inspector';
import { computeRedlineGuides, type RedlineMeasurement } from '@/core/visbug-tools/guides';
import { VisBugTweakEngine } from '@/core/visbug-tools/tweak-engine';
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

export function HudApp() {
  const probe = useMemo(() => new MainWorldProbeClient(), []);
  const tweakEngine = useMemo(() => new VisBugTweakEngine(), []);

  const [mode, setMode] = useState<InspectorToolMode>('inspect');
  const [totalPinsCount, setTotalPinsCount] = useState(0);
  const [pagePins, setPagePins] = useState<HudPinMarker[]>([]);
  const [references, setReferences] = useState<HudRefSummary[]>([]);

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
  const [savingStatus, setSavingStatus] = useState<'idle' | 'saving' | 'saved' | 'copied'>('idle');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [scrollTick, setScrollTick] = useState(0);

  const primarySelectedEl = selectedEls[0] ?? null;

  const showToast = (msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => {
      setToastMsg((curr) => (curr === msg ? null : curr));
    }, 2400);
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

    const onScrollOrResize = () => setScrollTick((n) => n + 1);
    window.addEventListener('scroll', onScrollOrResize, { passive: true, capture: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, { capture: true });
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, []);

  // React to external triggers (Alt+Shift+F freeze, DB updates, SidePanel scroll-to)
  const extTick = externalEventTick.value;
  useEffect(() => {
    if (extTick.kind === 'freeze') {
      setMode('freeze');
      setDomFrozen((prev) => !prev);
      void probe.scrubAnimations(scrubProgress / 100, true).then(setAnimations);
      showToast('Đã đóng băng trạng thái giao diện & chuyển động');
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

  // Ghost-State DOM Freeze event interceptor
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

  // Load animations when entering Freeze mode
  useEffect(() => {
    if (mode === 'freeze') {
      const sel = primarySelectedEl ? buildResilientSelector(primarySelectedEl) : undefined;
      void probe.listAnimations(sel).then(setAnimations);
    }
  }, [mode, primarySelectedEl]);

  // Cleanup CDP pseudo-states when HUD hides
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

  // Inspect Element / Guides / A11y pointer tracking
  useEffect(() => {
    if (!isVisible) return;

    const onMouseMove = (e: MouseEvent) => {
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

      // Check if user just highlighted text in Inspect mode
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

      // Multi-select support via Meta/Ctrl/Shift
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
  }, [isVisible, mode, dragStart, dragRect, composerOpen, primarySelectedEl]);

  // Keyboard shortcuts for VisBug Tools, Undo/Redo, Overlay nudge & Escape
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

      // Undo / Redo for VisBug tweaks
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

      // Single-letter quick tool hotkeys (VisBug style)
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'i') setMode('inspect');
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

      // Arrow keys for VisBug Spacing / Sibling Move / Diff Overlay Nudge
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

    // Paste Figma / Clipboard image directly in Diff mode
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
          showToast('Đã dán ảnh đối chiếu thiết kế từ Clipboard');
        }
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('paste', onPaste, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('paste', onPaste, true);
    };
  }, [isVisible, mode, composerOpen, selectedEls, spacingTarget, overlayImgUrl, primarySelectedEl]);

  const enableLiveTextEditing = (el: HTMLElement) => {
    const beforeText = el.innerText ?? el.textContent ?? '';
    el.contentEditable = 'true';
    el.focus();
    showToast('Đang sửa thử văn bản trực tiếp — bấm ra ngoài để chốt Diff');

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

  const handleSavePin = async (alsoCopyToAi = false) => {
    const draft = buildPinDraftPayload();
    if (!draft) return;

    setSavingStatus('saving');
    try {
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
          await navigator.clipboard.writeText(md);
          setSavingStatus('copied');
          showToast(`Đã lưu Ghim #${res.pin.orderIndex} & Copy Prompt cho AI`);
        } else {
          setSavingStatus('saved');
          showToast(`Đã lưu Ghim #${res.pin.orderIndex} vào danh sách`);
        }

        setPinNote('');
        setAttachedRefIds([]);
        setComposerOpen(false);
        setSavingStatus('idle');
      }
    } catch {
      setSavingStatus('idle');
      showToast('Không thể lưu ghim — vui lòng thử lại');
    }
  };

  const handleSaveReference = async () => {
    if (!primarySelectedEl) return;
    setSavingStatus('saving');
    const box = getElementBox(primarySelectedEl);
    const groups = extractStyleGroups(primarySelectedEl);

    try {
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
        setComposerOpen(false);
        setSavingStatus('idle');
        showToast(`Đã lưu mẫu @ref:${res.reference.alias} vào Kho xuyên tab`);
      }
    } catch {
      setSavingStatus('idle');
    }
  };

  const handleToggleCdpPseudo = async (pseudo: CdpPseudoState) => {
    if (!primarySelectedEl) {
      showToast('Hãy click chọn 1 phần tử trước khi khóa trạng thái :hover/:focus');
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
      showToast('Đã chụp ảnh Before Snapshot để đối chiếu');
    }
  };

  if (!isVisible) return null;

  const currentDiff =
    primarySelectedEl && tweakVersion >= 0 ? tweakEngine.extractDiff(primarySelectedEl) : undefined;

  // Compute live pin positions on scroll/resize
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

  // Position Popover cleanly inside viewport
  const popoverStyle = (() => {
    const refBox = activeBox ?? { x: window.innerWidth / 2 - 180, y: 120, width: 40, height: 40 };
    const width = 368;
    const left = Math.max(16, Math.min(window.innerWidth - width - 16, refBox.x));
    const preferBelow = refBox.y + refBox.height + 12;
    const top =
      preferBelow + 370 < window.innerHeight
        ? preferBelow
        : Math.max(16, refBox.y - 360);
    return { left: `${left}px`, top: `${top}px`, width: `${width}px` };
  })();

  return (
    <div class="fixed inset-0 pointer-events-none select-none font-sans text-[#1d1d1f]">
      {/* 1. Design Diff Overlay Layer (Onion-Skin or Split Wipe) */}
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
              class="fixed top-0 bottom-0 w-[1.5px] bg-[#0071e3] pointer-events-auto cursor-ew-resize"
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

      {/* 2. Hover Highlight Box & Quick Metadata Tag */}
      {hoveredBox && !composerOpen && (
        <div
          style={{
            left: `${hoveredBox.x}px`,
            top: `${hoveredBox.y}px`,
            width: `${hoveredBox.width}px`,
            height: `${hoveredBox.height}px`,
          }}
          class="fixed border-[1.5px] border-[#0071e3] bg-[#0071e3]/[0.05] pointer-events-none transition-[left,top,width,height] duration-75"
        >
          <div class="absolute -top-6 left-0 px-2 py-0.5 rounded-full bg-[#1d1d1f] text-white text-[11px] font-medium whitespace-nowrap tracking-[-0.12px]">
            {hoveredEl?.tagName.toLowerCase()}
            {hoveredEl?.id ? `#${hoveredEl.id.slice(0, 16)}` : ''} · {hoveredBox.width}×{hoveredBox.height}
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
            {/* Corner Resize-Style Inspector Handles */}
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

      {/* 4. Area Drag Selection Marquee */}
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

      {/* 5. VisBug Redline Distance Guides (SVG Overlay) */}
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
                <rect
                  x={mx - 20}
                  y={my - 10}
                  width="40"
                  height="20"
                  rx="10"
                  fill="#0071e3"
                />
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

      {/* 6. Live Accessibility WCAG Floating Card (in A11y Mode) */}
      {mode === 'a11y' && hoveredBox && liveA11y && !composerOpen && (
        <div
          style={{
            left: `${Math.min(window.innerWidth - 280, Math.max(12, hoveredBox.x))}px`,
            top: `${Math.min(window.innerHeight - 150, hoveredBox.y + hoveredBox.height + 10)}px`,
          }}
          class="fixed w-[264px] zs-card p-3 pointer-events-none text-[12px]"
        >
          <div class="flex items-center justify-between mb-1.5">
            <span class="font-semibold text-[#1d1d1f]">WCAG Contrast</span>
            <span class={liveA11y.wcagAA ? 'font-semibold text-[#1d1d1f]' : 'zs-status-urgent'}>
              {liveA11y.contrastRatio}:1 · {liveA11y.wcagAAA ? 'AAA' : liveA11y.wcagAA ? 'AA Pass' : 'AA FAIL'}
            </span>
          </div>
          <div class="flex items-center gap-2 text-[11px] text-[#707070] mb-1">
            <span
              class="w-3 h-3 rounded-full border border-[#d6d6d6]"
              style={{ backgroundColor: liveA11y.foregroundColor }}
            />
            <span>{liveA11y.foregroundColor}</span>
            <span>on</span>
            <span
              class="w-3 h-3 rounded-full border border-[#d6d6d6]"
              style={{ backgroundColor: liveA11y.effectiveBackgroundColor }}
            />
            <span>{liveA11y.effectiveBackgroundColor}</span>
          </div>
          <div class="text-[11px] text-[#707070] truncate">
            Role: <strong class="text-[#1d1d1f]">{liveA11y.role}</strong> · Target: {liveA11y.dimensions.width}×{liveA11y.dimensions.height}px
          </div>
          {liveA11y.issues[0] && (
            <div class="mt-1.5 zs-status-urgent text-[11px]">{liveA11y.issues[0]}</div>
          )}
        </div>
      )}

      {/* 7. Persistent Numbered Pin Markers on Page (#1, #2...) */}
      {renderedPinBadges.map((pin) =>
        pin.visible ? (
          <button
            key={pin.id}
            type="button"
            title={`#${pin.orderIndex}: ${pin.note || pin.type}`}
            style={{
              left: `${Math.max(4, Math.min(window.innerWidth - 28, pin.x - 11))}px`,
              top: `${Math.max(4, Math.min(window.innerHeight - 28, pin.y - 11))}px`,
            }}
            onClick={(e) => {
              e.stopPropagation();
              chrome.runtime
                .sendMessage({ type: 'ZSPECT_OPEN_SIDEPANEL' } satisfies ZSpectRuntimeMessage)
                .catch(() => {});
            }}
            class={`fixed w-[22px] h-[22px] rounded-full border border-white text-white text-[11px] font-semibold flex items-center justify-center pointer-events-auto cursor-pointer ${
              pin.severity === 'critical' || pin.severity === 'high'
                ? 'bg-[#b64400]'
                : 'bg-[#0071e3]'
            }`}
          >
            {pin.orderIndex}
          </button>
        ) : null,
      )}

      {/* 8. Contextual Sub-Bar for VisBug Spacing / Flexbox / Freeze / Diff */}
      {(mode === 'spacing' || mode === 'flexbox' || mode === 'freeze' || mode === 'diff') && (
        <div class="fixed bottom-[68px] left-1/2 -translate-x-1/2 zs-frosted-hud px-4 py-2 flex items-center gap-3 pointer-events-auto text-[12px]">
          {mode === 'spacing' && (
            <>
              <span class="font-medium">Spacing:</span>
              <button
                type="button"
                onClick={() => setSpacingTarget('padding')}
                class={`px-2.5 py-1 rounded-full cursor-pointer ${
                  spacingTarget === 'padding' ? 'bg-[#1d1d1f] text-white' : 'text-[#707070]'
                }`}
              >
                Padding (P)
              </button>
              <button
                type="button"
                onClick={() => setSpacingTarget('margin')}
                class={`px-2.5 py-1 rounded-full cursor-pointer ${
                  spacingTarget === 'margin' ? 'bg-[#1d1d1f] text-white' : 'text-[#707070]'
                }`}
              >
                Margin (M)
              </button>
              <span class="text-[#707070]">↑↓←→ (+1px · Shift +4px · Alt giảm)</span>
              {primarySelectedEl && currentDiff && (
                <button
                  type="button"
                  onClick={() => void inspectAndOpenComposer(primarySelectedEl, getElementBox(primarySelectedEl), 'visual-tweak')}
                  class="zs-btn-primary px-3 py-1 cursor-pointer"
                >
                  Chốt Diff thành Ghim
                </button>
              )}
            </>
          )}

          {mode === 'flexbox' && (
            <>
              <span class="font-medium">Flex / Move:</span>
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
                  class="zs-btn-outline px-2.5 py-0.5 cursor-pointer"
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
                  class="zs-btn-outline px-2.5 py-0.5 cursor-pointer"
                >
                  {jc.replace('flex-', '')}
                </button>
              ))}
              <span class="text-[#707070]">←→ đổi chỗ phần tử</span>
              {primarySelectedEl && currentDiff && (
                <button
                  type="button"
                  onClick={() => void inspectAndOpenComposer(primarySelectedEl, getElementBox(primarySelectedEl), 'visual-tweak')}
                  class="zs-btn-primary px-3 py-1 cursor-pointer"
                >
                  Chốt Diff
                </button>
              )}
            </>
          )}

          {mode === 'freeze' && (
            <>
              <button
                type="button"
                onClick={() => setDomFrozen((f) => !f)}
                class={`px-3 py-1 rounded-full flex items-center gap-1.5 cursor-pointer ${
                  domFrozen ? 'bg-[#1d1d1f] text-white' : 'zs-btn-outline'
                }`}
              >
                {domFrozen ? <Pause size={12} /> : <Play size={12} />}
                {domFrozen ? 'DOM Locked' : 'Lock Tooltip'}
              </button>

              <div class="h-4 w-[1px] bg-[#d6d6d6]" />

              <span class="text-[#707070]">CDP:</span>
              {(['hover', 'focus', 'active'] as CdpPseudoState[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => void handleToggleCdpPseudo(st)}
                  class={`px-2.5 py-0.5 rounded-full cursor-pointer ${
                    cdpStates.includes(st) ? 'bg-[#0071e3] text-white' : 'zs-btn-outline'
                  }`}
                >
                  :{st}
                </button>
              ))}

              <div class="h-4 w-[1px] bg-[#d6d6d6]" />

              <span class="text-[#707070]">Motion ({animations.length}):</span>
              <input
                type="range"
                min={0}
                max={100}
                value={scrubProgress}
                onInput={(e) => {
                  const val = Number((e.target as HTMLInputElement).value);
                  setScrubProgress(val);
                  const sel = primarySelectedEl ? buildResilientSelector(primarySelectedEl) : undefined;
                  void probe.scrubAnimations(val / 100, true, sel).then(setAnimations);
                }}
                class="w-24 accent-[#0071e3] cursor-pointer"
              />
              <span class="w-8 text-right tabular-nums">{scrubProgress}%</span>
              <button
                type="button"
                onClick={() => void probe.resumeAnimations()}
                class="zs-link cursor-pointer"
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
                class="zs-btn-outline px-3 py-1 cursor-pointer"
              >
                Chụp Before
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                class="zs-btn-outline px-3 py-1 cursor-pointer"
              >
                Tải ảnh Figma
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
                    class="zs-btn-outline px-2.5 py-1 cursor-pointer"
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
                      class="w-20 accent-[#0071e3]"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setOverlayImgUrl(null)}
                    class="zs-link cursor-pointer"
                  >
                    Xóa lớp phủ
                  </button>
                </>
              )}
              {!overlayImgUrl && (
                <span class="text-[#707070]">Hoặc nhấn Cmd/Ctrl+V để dán ảnh Figma</span>
              )}
            </>
          )}
        </div>
      )}

      {/* 9. Pin & Cross-Tab @ref Composer Popover (Apple Gallery Card) */}
      {composerOpen && (
        <div
          style={popoverStyle}
          class="fixed zs-card p-4 pointer-events-auto flex flex-col gap-3"
        >
          {/* Header: Mode Switch + Close */}
          <div class="flex items-center justify-between border-b border-[#e6e6e8] pb-2.5">
            <div class="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setComposerTab('pin')}
                class={`px-3 py-1 rounded-full text-[12px] font-medium cursor-pointer ${
                  composerTab === 'pin' ? 'bg-[#1d1d1f] text-white' : 'text-[#707070]'
                }`}
              >
                Gắn Ghim #{totalPinsCount + 1}
              </button>
              <button
                type="button"
                onClick={() => setComposerTab('ref')}
                class={`px-3 py-1 rounded-full text-[12px] font-medium flex items-center gap-1 cursor-pointer ${
                  composerTab === 'ref' ? 'bg-[#1d1d1f] text-white' : 'text-[#707070]'
                }`}
              >
                <BookmarkPlus size={12} />
                Lưu mẫu @ref
              </button>
            </div>
            <button
              type="button"
              onClick={() => setComposerOpen(false)}
              class="p-1 text-[#707070] hover:text-[#1d1d1f] cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>

          {/* Detected Component & IDE Deep-Link */}
          <div class="bg-[#f5f5f7] rounded-[12px] px-3 py-2 text-[11px] flex flex-col gap-1">
            <div class="flex items-center justify-between gap-2">
              <span class="font-medium text-[#1d1d1f] truncate">
                {frameworkMeta.componentName
                  ? `<${frameworkMeta.componentName}> (${frameworkMeta.framework})`
                  : primarySelectedEl
                    ? buildResilientSelector(primarySelectedEl)
                    : ' vùng chọn màn hình'}
              </span>
              {frameworkMeta.sourceLocation && (
                <a
                  href={buildIdeDeepLink(frameworkMeta.sourceLocation, 'cursor')}
                  class="zs-link flex items-center gap-0.5 shrink-0 font-medium"
                >
                  Cursor <ExternalLink size={10} />
                </a>
              )}
            </div>
            {flightCapsule &&
              (flightCapsule.consoleErrors.length > 0 || flightCapsule.networkIssues.length > 0) && (
                <div class="zs-status-urgent text-[11px]">
                  Hộp đen 30s: {flightCapsule.consoleErrors.length} lỗi Console ·{' '}
                  {flightCapsule.networkIssues.length} API lỗi/chậm được đính kèm
                </div>
              )}
            {currentDiff && (
              <div class="text-[#0066cc] font-medium">
                Đã ghi nhận {currentDiff.styleChanges.length} thay đổi CSS
                {currentDiff.textChange ? ' + nội dung chữ' : ''} (Before → After)
              </div>
            )}
          </div>

          {composerTab === 'pin' ? (
            <>
              {/* Type & Severity */}
              <div class="flex items-center gap-2">
                <select
                  value={pinType}
                  onChange={(e) => setPinType((e.target as HTMLSelectElement).value as PinType)}
                  class="flex-1 bg-white border border-[#86868b] rounded-full px-3 py-1 text-[12px] text-[#1d1d1f]"
                >
                  <option value="bug">Bug / Lỗi</option>
                  <option value="ui-polish">UI Polish</option>
                  <option value="visual-tweak">Visual Tweak (Diff)</option>
                  <option value="copy">Copy / Nội dung</option>
                  <option value="a11y">Accessibility (WCAG)</option>
                  <option value="design-diff">Design Diff</option>
                </select>

                <select
                  value={pinSeverity}
                  onChange={(e) =>
                    setPinSeverity((e.target as HTMLSelectElement).value as PinSeverity)
                  }
                  class="bg-white border border-[#86868b] rounded-full px-3 py-1 text-[12px] text-[#1d1d1f]"
                >
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>

              {/* Feedback Note */}
              <textarea
                rows={3}
                value={pinNote}
                onInput={(e) => setPinNote((e.target as HTMLTextAreaElement).value)}
                placeholder="Mô tả lỗi hoặc yêu cầu cho AI (VD: Căn lại padding nút này giống @ref)..."
                class="w-full bg-white border border-[#86868b] rounded-[14px] px-3 py-2 text-[13px] text-[#1d1d1f] placeholder:text-[#86868b] focus:outline-none focus:border-[#0071e3] resize-none"
              />

              {/* Cross-Tab @ref Quick Attach Pills */}
              {references.length > 0 && (
                <div class="flex flex-wrap items-center gap-1.5">
                  <span class="text-[11px] text-[#707070]">Gắn mẫu:</span>
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
                        class={`px-2.5 py-0.5 rounded-full text-[11px] cursor-pointer ${
                          active
                            ? 'bg-[#0071e3] text-white'
                            : 'bg-[#f5f5f7] text-[#1d1d1f] border border-[#d6d6d6]'
                        }`}
                      >
                        @ref:{ref.alias}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Actions */}
              <div class="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={savingStatus === 'saving'}
                  onClick={() => void handleSavePin(true)}
                  class="zs-btn-outline px-3 py-1.5 flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy size={12} />
                  Lưu & Copy AI
                </button>
                <button
                  type="button"
                  disabled={savingStatus === 'saving'}
                  onClick={() => void handleSavePin(false)}
                  class="zs-btn-primary px-4 py-1.5 flex items-center gap-1.5 cursor-pointer"
                >
                  <Check size={12} />
                  {savingStatus === 'saving' ? 'Đang chụp...' : 'Lưu Ghim'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div class="text-[12px] text-[#707070]">
                Trích xuất cấu trúc DOM sạch, CSS Tokens, Flexbox/Grid, pseudo-elements và hiệu ứng chuyển động của phần tử này để dùng ở tab dự án.
              </div>
              <div class="flex items-center gap-2">
                <span class="text-[12px] font-medium text-[#707070]">@ref:</span>
                <input
                  type="text"
                  value={refAliasInput}
                  onInput={(e) => setRefAliasInput((e.target as HTMLInputElement).value)}
                  placeholder="stripe-card"
                  class="flex-1 bg-white border border-[#86868b] rounded-full px-3 py-1.5 text-[12px]"
                />
              </div>
              <div class="flex justify-end pt-1">
                <button
                  type="button"
                  disabled={savingStatus === 'saving'}
                  onClick={() => void handleSaveReference()}
                  class="zs-btn-primary px-4 py-1.5 cursor-pointer"
                >
                  {savingStatus === 'saving' ? 'Đang trích xuất...' : 'Lưu vào @ref Vault'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* 10. Toast Feedback Capsule */}
      {toastMsg && (
        <div class="fixed top-5 left-1/2 -translate-x-1/2 zs-frosted-hud px-4 py-1.5 text-[12px] font-medium text-[#1d1d1f]">
          {toastMsg}
        </div>
      )}

      {/* 11. Main Floating Apple-Gallery Pill Toolbar (Bottom Center) */}
      <div class="fixed bottom-4 left-1/2 -translate-x-1/2 zs-frosted-hud px-2.5 py-1.5 flex items-center gap-1 pointer-events-auto">
        {/* Brand Emblem */}
        <div class="flex items-center gap-1.5 pl-1.5 pr-2 border-r border-[#d6d6d6]">
          <svg viewBox="0 0 512 512" class="w-5 h-5 shrink-0" fill="none">
            <rect x="16" y="16" width="480" height="480" rx="120" fill="#1d1d1f" />
            <path fill="#ffffff" d="M124 128H286V166H162V248H124V128Z" />
            <path fill="#ffffff" d="M124 290H162V346H214V384H124V290Z" />
            <path fill="#ffffff" d="M232 346H350V276H388V384H232V346Z" />
            <line x1="178" y1="330" x2="314" y2="194" stroke="#ffffff" stroke-width="40" />
            <circle cx="358" cy="158" r="34" fill="#0071e3" />
          </svg>
          <span class="text-[12px] font-semibold tracking-[-0.12px]">ZSpect</span>
        </div>

        {/* Tool Buttons */}
        {(
          [
            { id: 'inspect', label: 'Inspect (I)', icon: Crosshair },
            { id: 'area', label: 'Khoanh vùng', icon: Scan },
            { id: 'guides', label: 'Thước đo (G)', icon: Ruler },
            { id: 'a11y', label: 'WCAG A11y (A)', icon: Accessibility },
            { id: 'spacing', label: 'Spacing (P/M)', icon: Move },
            { id: 'flexbox', label: 'Flex / Move (F)', icon: LayoutGrid },
            { id: 'text-edit', label: 'Sửa chữ (T)', icon: TypeIcon },
            { id: 'freeze', label: 'Freeze & Motion', icon: Snowflake },
            { id: 'diff', label: 'Overlay Diff (D)', icon: Layers },
          ] as const
        ).map(({ id, label, icon: Icon }) => {
          const active = mode === id;
          return (
            <button
              key={id}
              type="button"
              title={label}
              onClick={() => {
                setMode(id);
                setComposerOpen(false);
              }}
              class={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                active
                  ? 'bg-[#1d1d1f] text-white'
                  : 'text-[#1d1d1f] hover:bg-[#e6e6e8]/70'
              }`}
            >
              <Icon size={15} strokeWidth={1.8} />
            </button>
          );
        })}

        {/* VisBug Undo / Reset Controls */}
        {tweakEngine.canUndo() && (
          <>
            <div class="h-4 w-[1px] bg-[#d6d6d6] mx-0.5" />
            <button
              type="button"
              title="Hoàn tác chỉnh sửa (Cmd+Z)"
              onClick={() => {
                tweakEngine.undo();
                setTweakVersion((v) => v + 1);
              }}
              class="w-7 h-7 rounded-full flex items-center justify-center hover:bg-[#e6e6e8]/70 cursor-pointer"
            >
              <Undo2 size={14} />
            </button>
            <button
              type="button"
              title="Khôi phục giao diện gốc"
              onClick={() => {
                tweakEngine.resetAll();
                setTweakVersion((v) => v + 1);
                showToast('Đã khôi phục toàn bộ CSS/Text về mặc định');
              }}
              class="w-7 h-7 rounded-full flex items-center justify-center hover:bg-[#e6e6e8]/70 cursor-pointer"
            >
              <RotateCcw size={14} />
            </button>
          </>
        )}

        <div class="h-4 w-[1px] bg-[#d6d6d6] mx-1" />

        {/* Open Side Panel Workspace (Pricing Blue Pill) */}
        <button
          type="button"
          onClick={() => {
            chrome.runtime
              .sendMessage({ type: 'ZSPECT_OPEN_SIDEPANEL' } satisfies ZSpectRuntimeMessage)
              .catch(() => {});
          }}
          class="zs-btn-primary px-3 py-1.5 flex items-center gap-1.5 cursor-pointer"
        >
          <PanelRightOpen size={13} />
          <span>Pins ({totalPinsCount})</span>
        </button>

        {/* Hide HUD */}
        <button
          type="button"
          title="Đóng thanh ZSpect (Esc)"
          onClick={() => {
            hudVisible.value = false;
          }}
          class="w-7 h-7 rounded-full flex items-center justify-center text-[#707070] hover:text-[#1d1d1f] cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
