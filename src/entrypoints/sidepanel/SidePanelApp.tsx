import { useEffect, useMemo, useState } from 'preact/hooks';
import {
  Bookmark,
  Check,
  Copy,
  Crosshair,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  FolderArchive,
  Image as ImageIcon,
  LocateFixed,
  Moon,
  Plus,
  Search,
  Sparkles,
  Sun,
  Trash2,
} from 'lucide-preact';
import { useZSpectI18n } from '@/core/i18n';
import {
  buildIdeDeepLink,
  compileAiPrompt,
  compileSinglePinSection,
} from '@/core/prompt-compiler';
import { useZSpectTheme } from '@/core/theme/useTheme';
import {
  createSession,
  deletePin,
  deleteReference,
  deleteSession,
  ensureActiveSession,
  listPinsBySession,
  listReferences,
  listSessions,
  renameReference,
  renameSession,
  setStoredSessionId,
  updatePin,
} from '@/db/schema';
import {
  buildCompositePinsImageBlob,
  copyImageAndOrTextToClipboard,
} from '@/exporters/image-sheet';
import {
  exportMarkdownZipBundle,
  generateMarkdownReport,
  slugifyFilename,
} from '@/exporters/markdown-exporter';
import type {
  IdeTarget,
  PinRecord,
  PinStatus,
  PinType,
  PromptDensity,
  ReferenceDNA,
  SessionRecord,
  ZSpectRuntimeMessage,
} from '@/types/zspect';

function ZSpectLogoIcon({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" class={className} fill="none" aria-hidden="true">
      <rect
        x="16"
        y="16"
        width="480"
        height="480"
        rx="120"
        fill="#1d1d1f"
        stroke="#545458"
        stroke-width="12"
      />
      <path fill="#ffffff" d="M124 128H286V166H162V248H124V128Z" />
      <path fill="#ffffff" d="M124 290H162V346H214V384H124V290Z" />
      <path fill="#ffffff" d="M232 346H350V276H388V384H232V346Z" />
      <line x1="178" y1="330" x2="314" y2="194" stroke="#ffffff" stroke-width="40" />
      <circle cx="358" cy="158" r="34" fill="#0071e3" />
    </svg>
  );
}

function useBlobUrl(blob?: Blob): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);
  return url;
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function PinCard({
  pin,
  ide,
  references,
  t,
  onReload,
  onNotify,
}: {
  pin: PinRecord;
  ide: IdeTarget;
  references: ReferenceDNA[];
  t: ReturnType<typeof useZSpectI18n>['t'];
  onReload: () => void;
  onNotify: (msg: string) => void;
}) {
  const imgUrl = useBlobUrl(pin.croppedImageBlob);
  const [noteDraft, setNoteDraft] = useState(pin.note);
  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => {
    setNoteDraft(pin.note);
  }, [pin.note]);

  const refMap = useMemo(() => new Map(references.map((r) => [r.id, r])), [references]);

  const handleCopySingleAi = async () => {
    const md = compileSinglePinSection(pin, 'standard');
    await navigator.clipboard.writeText(md);
    onNotify(`${t.copiedPromptToast} (#${pin.orderIndex})`);
  };

  const handleCopyImage = async () => {
    if (!pin.croppedImageBlob) return;
    const res = await copyImageAndOrTextToClipboard({ imageBlob: pin.croppedImageBlob });
    onNotify(res === 'failed' ? t.clipboardImgDenied : `${t.copiedImageToast} (#${pin.orderIndex})`);
  };

  const handleJumpToElement = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    chrome.tabs
      .sendMessage(tab.id, {
        type: 'ZSPECT_SCROLL_TO_PIN',
        selector: pin.selector,
        pageX: pin.boundingBox.pageX,
        pageY: pin.boundingBox.pageY,
      } satisfies ZSpectRuntimeMessage)
      .catch(() => {});
  };

  const errorCount =
    (pin.flightCapsule?.consoleErrors.length ?? 0) +
    (pin.flightCapsule?.networkIssues.length ?? 0);

  return (
    <article class="zs-card zs-anim-card p-5 flex flex-col gap-3.5">
      {/* Top Meta Row */}
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 min-w-0">
          <span
            class={`w-7 h-7 rounded-full text-white text-[12px] font-semibold flex items-center justify-center shrink-0 ${
              pin.severity === 'critical' || pin.severity === 'high'
                ? 'bg-[#b64400]'
                : 'bg-[#0071e3]'
            }`}
          >
            #{pin.orderIndex}
          </span>
          <span class="text-[12px] font-semibold uppercase tracking-tight truncate">
            {pin.type}
          </span>
          {(pin.severity === 'critical' || pin.severity === 'high') && (
            <span class="zs-status-urgent uppercase shrink-0">{pin.severity}</span>
          )}
        </div>

        <div class="flex items-center gap-1 shrink-0">
          <select
            value={pin.status}
            onChange={(e) => {
              void updatePin(pin.id, {
                status: (e.target as HTMLSelectElement).value as PinStatus,
              }).then(onReload);
            }}
            class="h-8 zs-input-subtle zs-select rounded-full pl-3 text-[12px] font-medium"
          >
            <option value="open">Open</option>
            <option value="in-progress">In Progress</option>
            <option value="resolved">Resolved</option>
          </select>

          <button
            type="button"
            title={t.scrollToPinTooltip}
            onClick={() => void handleJumpToElement()}
            class="w-8 h-8 flex items-center justify-center zs-icon-btn zs-muted zs-pressable cursor-pointer"
          >
            <LocateFixed size={15} />
          </button>

          <button
            type="button"
            title={t.deleteItemTooltip}
            onClick={() => void deletePin(pin.id).then(onReload)}
            class="w-8 h-8 flex items-center justify-center zs-icon-btn zs-muted hover:text-[#ff453a] zs-pressable cursor-pointer"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* Cropped Annotated Screenshot */}
      {imgUrl && (
        <div class="relative rounded-[16px] overflow-hidden zs-subtle-box">
          <img
            src={imgUrl}
            alt={`Pin #${pin.orderIndex}`}
            class="w-full max-h-[190px] object-contain block"
          />
          <button
            type="button"
            onClick={() => void handleCopyImage()}
            class="absolute bottom-2.5 right-2.5 zs-frosted-hud zs-pressable h-8 px-3 text-[12px] font-medium flex items-center gap-1.5 cursor-pointer"
          >
            <ImageIcon size={13} />
            <span>{t.copyImgShort}</span>
          </button>
        </div>
      )}

      {/* Component / File / Page Metadata */}
      <div class="zs-subtle-box rounded-[14px] px-3.5 py-2.5 text-[12px] flex flex-col gap-1">
        <div class="flex items-center justify-between gap-2">
          <span class="font-medium truncate" title={pin.selector}>
            {pin.frameworkMeta.componentName
              ? `<${pin.frameworkMeta.componentName}> (${pin.frameworkMeta.framework})`
              : pin.selector}
          </span>
          {pin.frameworkMeta.sourceLocation && (
            <a
              href={buildIdeDeepLink(pin.frameworkMeta.sourceLocation, ide)}
              class="zs-link flex items-center gap-1 font-medium shrink-0"
            >
              {t.openIdePrefix} {ide} <ExternalLink size={12} />
            </a>
          )}
        </div>
        <div class="zs-muted truncate text-[11px]" title={pin.pageUrl}>
          {pin.pageUrl} · {pin.viewport.width}×{pin.viewport.height}
        </div>
      </div>

      {/* Editable Feedback Note */}
      <textarea
        rows={2}
        value={noteDraft}
        onInput={(e) => setNoteDraft((e.target as HTMLTextAreaElement).value)}
        onBlur={() => {
          if (noteDraft.trim() !== pin.note) {
            void updatePin(pin.id, { note: noteDraft.trim() }).then(onReload);
          }
        }}
        placeholder={t.notePlaceholder}
        class="w-full zs-input rounded-[14px] px-3.5 py-2.5 text-[13px] resize-y"
      />

      {/* VisBug Before -> After Diff Preview */}
      {pin.visualDiff && (
        <div class="zs-subtle-box rounded-[14px] px-3.5 py-2.5 text-[12px] flex flex-col gap-1">
          <span class="font-semibold">VisBug Diff (Before → After)</span>
          {pin.visualDiff.styleChanges.slice(0, 4).map((sc) => (
            <div key={sc.property} class="font-mono text-[11px] zs-muted truncate">
              {sc.property}: {sc.before} → <strong class="zs-link">{sc.after}</strong>
            </div>
          ))}
          {pin.visualDiff.textChange && (
            <div class="zs-muted truncate">
              Text: "{pin.visualDiff.textChange.before}" →{' '}
              <strong class="zs-link">"{pin.visualDiff.textChange.after}"</strong>
            </div>
          )}
        </div>
      )}

      {/* A11y Snapshot */}
      {pin.a11yAudit && (pin.type === 'a11y' || pin.a11yAudit.issues.length > 0) && (
        <div class="text-[12px] zs-muted flex items-center justify-between zs-subtle-box px-3.5 py-2 rounded-[12px]">
          <span class="truncate">WCAG Contrast: {pin.a11yAudit.contrastRatio}:1</span>
          <span class={`shrink-0 ${pin.a11yAudit.wcagAA ? 'font-medium' : 'zs-status-urgent'}`}>
            {pin.a11yAudit.wcagAA ? 'AA Pass' : 'AA FAIL'}
          </span>
        </div>
      )}

      {/* Attached @ref Chips */}
      {pin.attachedRefIds.length > 0 && (
        <div class="flex flex-wrap gap-2">
          {pin.attachedRefIds.map((rid) => {
            const ref = refMap.get(rid);
            return ref ? (
              <span
                key={rid}
                class="px-3 py-1 rounded-full zs-subtle-box text-[12px] zs-link font-medium truncate max-w-full"
              >
                @ref:{ref.alias}
              </span>
            ) : null;
          })}
        </div>
      )}

      {/* Bottom Action & Diagnostics Row (Wrap-safe on narrow panels) */}
      <div
        class="flex flex-wrap items-center justify-between gap-2 pt-2.5"
        style={{ borderTop: '1px solid var(--zs-border)' }}
      >
        {errorCount > 0 ? (
          <button
            type="button"
            onClick={() => setShowLogs((s) => !s)}
            class="zs-status-urgent cursor-pointer hover:underline truncate"
          >
            {errorCount} {t.errorsAttached} {showLogs ? '▲' : '▼'}
          </button>
        ) : (
          <span class="text-[12px] zs-muted truncate">{t.readyForExport}</span>
        )}

        <div class="flex items-center gap-1.5 shrink-0 ml-auto">
          {pin.croppedImageBlob && (
            <button
              type="button"
              onClick={() => void handleCopyImage()}
              class="zs-btn-outline zs-pressable h-8 px-3 gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <ImageIcon size={13} />
              <span>{t.copyImgShort}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleCopySingleAi()}
            class="zs-btn-outline zs-pressable h-8 px-3 gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Copy size={13} />
            <span>{t.copyAiShort}</span>
          </button>
        </div>
      </div>

      {showLogs && pin.flightCapsule && (
        <div class="zs-subtle-box rounded-[14px] p-3 text-[11px] font-mono flex flex-col gap-1.5 max-h-44 overflow-auto">
          {pin.flightCapsule.consoleErrors.map((err, idx) => (
            <div key={`ce-${idx}`} class="zs-status-urgent break-words">
              [{err.level}] {err.message}
            </div>
          ))}
          {pin.flightCapsule.networkIssues.map((net, idx) => (
            <div key={`ne-${idx}`} class="break-words">
              [{net.status}] {net.method} {net.url} ({net.durationMs}ms)
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function ReferenceCard({
  refItem,
  t,
  onReload,
  onNotify,
}: {
  refItem: ReferenceDNA;
  t: ReturnType<typeof useZSpectI18n>['t'];
  onReload: () => void;
  onNotify: (msg: string) => void;
}) {
  const previewUrl = useBlobUrl(refItem.previewBlob);
  const [aliasDraft, setAliasDraft] = useState(refItem.alias);

  const handleCopyRefImg = async () => {
    if (!refItem.previewBlob) return;
    const res = await copyImageAndOrTextToClipboard({ imageBlob: refItem.previewBlob });
    onNotify(res === 'failed' ? t.clipboardImgDenied : t.copiedImageToast);
  };

  return (
    <article class="zs-card zs-anim-card p-5 flex flex-col gap-3.5">
      <div class="flex items-center justify-between gap-2.5">
        <div class="flex items-center gap-1.5 flex-1 min-w-0">
          <span class="text-[13px] font-semibold zs-link shrink-0">@ref:</span>
          <input
            type="text"
            value={aliasDraft}
            onInput={(e) => setAliasDraft((e.target as HTMLInputElement).value)}
            onBlur={() => {
              if (aliasDraft !== refItem.alias) {
                void renameReference(refItem.id, aliasDraft).then((clean) => {
                  setAliasDraft(clean);
                  onReload();
                });
              }
            }}
            class="flex-1 min-w-0 h-8 zs-input-subtle rounded-full px-3 text-[13px] font-medium"
          />
        </div>
        <button
          type="button"
          title={t.deleteItemTooltip}
          onClick={() => void deleteReference(refItem.id).then(onReload)}
          class="w-8 h-8 shrink-0 flex items-center justify-center zs-icon-btn zs-muted hover:text-[#ff453a] zs-pressable cursor-pointer"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {previewUrl && (
        <div class="relative rounded-[16px] overflow-hidden zs-subtle-box">
          <img
            src={previewUrl}
            alt={refItem.alias}
            class="w-full max-h-[160px] object-contain block"
          />
          <button
            type="button"
            onClick={() => void handleCopyRefImg()}
            class="absolute bottom-2.5 right-2.5 zs-frosted-hud zs-pressable h-8 px-3 text-[12px] font-medium flex items-center gap-1.5 cursor-pointer"
          >
            <ImageIcon size={13} />
            <span>{t.copyImgShort}</span>
          </button>
        </div>
      )}

      <div class="text-[12px] zs-muted truncate" title={refItem.sourceUrl}>
        {t.sourcePrefix} {refItem.sourceUrl}
      </div>

      {refItem.tailwindHint && (
        <div class="zs-subtle-box rounded-[12px] p-3 font-mono text-[11px] break-words">
          {refItem.tailwindHint}
        </div>
      )}

      <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
        <span class="text-[12px] zs-muted">
          {Object.keys(refItem.resolvedCssVars).length} CSS vars ·{' '}
          {refItem.motionRules.transitions.length + refItem.motionRules.animations.length} motion
        </span>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(refItem.tailwindHint || refItem.domSkeleton);
            onNotify(`@ref:${refItem.alias} — DNA copied`);
          }}
          class="zs-btn-outline zs-pressable h-8 px-3.5 gap-1.5 whitespace-nowrap cursor-pointer"
        >
          <Copy size={13} />
          <span>{t.copyDnaShort}</span>
        </button>
      </div>
    </article>
  );
}

export function SidePanelApp() {
  const { theme, toggleTheme } = useZSpectTheme();
  const { locale, t, toggleLocale } = useZSpectI18n();
  const [activeTab, setActiveTab] = useState<'pins' | 'refs' | 'export'>('pins');
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [currentSession, setCurrentSession] = useState<SessionRecord | null>(null);
  const [pins, setPins] = useState<PinRecord[]>([]);
  const [references, setReferences] = useState<ReferenceDNA[]>([]);

  // Filters & Preferences
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | PinType>('all');
  const [ideTarget, setIdeTarget] = useState<IdeTarget>('cursor');
  const [density, setDensity] = useState<PromptDensity>('standard');
  const [exportBusy, setExportBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [restrictedTabNotice, setRestrictedTabNotice] = useState(false);

  const notify = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => {
      setToast((curr) => (curr === msg ? null : curr));
    }, 2400);
  };

  const loadWorkspace = async () => {
    const active = await ensureActiveSession();
    const [allSessions, sessionPins, allRefs] = await Promise.all([
      listSessions(),
      listPinsBySession(active.id),
      listReferences(),
    ]);
    setCurrentSession(active);
    setSessions(allSessions);
    setPins(sessionPins);
    setReferences(allRefs);
  };

  useEffect(() => {
    void loadWorkspace();

    const listener = (msg: ZSpectRuntimeMessage) => {
      if (msg?.type === 'ZSPECT_DB_UPDATED') {
        void loadWorkspace();
      }
    };
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(listener);
      return () => chrome.runtime.onMessage.removeListener(listener);
    }
  }, []);

  const handleToggleInspectOnActiveTab = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    if (
      !tab.url ||
      (!tab.url.startsWith('http://') &&
        !tab.url.startsWith('https://') &&
        !tab.url.startsWith('file://'))
    ) {
      setRestrictedTabNotice(true);
      notify(t.restrictedTabMsg);
      return;
    }
    setRestrictedTabNotice(false);

    try {
      const pong = await chrome.tabs.sendMessage(tab.id, { type: 'ZSPECT_TOGGLE_HUD' });
      if (pong?.handled) return;
    } catch {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content-scripts/probe.js'],
        world: 'MAIN',
      });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content-scripts/hud.js'],
      });
    }
  };

  const filteredPins = useMemo(() => {
    return pins.filter((p) => {
      if (typeFilter !== 'all' && p.type !== typeFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        p.note.toLowerCase().includes(q) ||
        p.pageUrl.toLowerCase().includes(q) ||
        p.selector.toLowerCase().includes(q) ||
        (p.frameworkMeta.componentName?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [pins, typeFilter, searchQuery]);

  const hasAnyPinImage = useMemo(
    () => filteredPins.some((p) => Boolean(p.croppedImageBlob)),
    [filteredPins],
  );

  const compiledAi = useMemo(
    () =>
      compileAiPrompt({
        sessionTitle: currentSession?.title,
        pins: filteredPins,
        references,
        density,
      }),
    [currentSession?.title, filteredPins, references, density],
  );

  const handleDownloadMarkdown = () => {
    if (!currentSession) return;
    const md = generateMarkdownReport({
      session: currentSession,
      pins: filteredPins,
      references,
      includeRelativeImages: false,
      locale,
    });
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    triggerBrowserDownload(blob, `${slugifyFilename(currentSession.title)}.md`);
    notify(t.exportedMdToast);
  };

  const handleDownloadZipBundle = async () => {
    if (!currentSession) return;
    setExportBusy('zip');
    try {
      const zipBlob = await exportMarkdownZipBundle({
        session: currentSession,
        pins: filteredPins,
        references,
      });
      triggerBrowserDownload(zipBlob, `${slugifyFilename(currentSession.title)}-bundle.zip`);
      notify(t.exportedZipToast);
    } finally {
      setExportBusy(null);
    }
  };

  const handleDownloadExcel = async () => {
    if (!currentSession) return;
    setExportBusy('xlsx');
    try {
      const { exportExcelReport } = await import('@/exporters/excel-exporter');
      const xlsxBlob = await exportExcelReport({
        session: currentSession,
        pins: filteredPins,
        references,
        locale,
      });
      triggerBrowserDownload(xlsxBlob, `${slugifyFilename(currentSession.title)}-qa.xlsx`);
      notify(t.exportedXlsxToast);
    } finally {
      setExportBusy(null);
    }
  };

  const handleCopyCompositeImageSheet = async () => {
    if (!currentSession) return;
    setExportBusy('sheet');
    try {
      const sheetBlob = await buildCompositePinsImageBlob(currentSession.title, filteredPins);
      if (!sheetBlob) return;
      const res = await copyImageAndOrTextToClipboard({ imageBlob: sheetBlob });
      notify(res === 'failed' ? t.clipboardImgDenied : t.copiedSheetToast);
    } finally {
      setExportBusy(null);
    }
  };

  return (
    <div data-theme={theme} class="min-h-screen flex flex-col zs-canvas overflow-x-hidden">
      {/* 1. Apple Product Local Navigation Header */}
      <header class="sticky top-0 z-20 zs-header px-5 pt-4 pb-3.5 flex flex-col gap-3">
        <div class="flex items-center justify-between gap-2 min-w-0">
          <div class="flex items-center gap-2 min-w-0">
            <ZSpectLogoIcon className="w-7 h-7 shrink-0" />
            <h1 class="text-[18px] font-semibold tracking-[0.1px] m-0 truncate">ZSpect</h1>
          </div>

          <div class="flex items-center gap-1.5 shrink-0">
            {/* Language Switcher (Default EN) */}
            <button
              type="button"
              title={t.switchLangTooltip}
              onClick={toggleLocale}
              class="zs-btn-outline zs-pressable h-9 px-2.5 text-[11px] font-semibold uppercase tracking-wide shrink-0 cursor-pointer"
            >
              {locale}
            </button>

            {/* Light / Dark Mode Switch */}
            <button
              type="button"
              title={theme === 'light' ? t.toggleDarkTooltip : t.toggleLightTooltip}
              aria-label="Toggle Light/Dark Theme"
              onClick={toggleTheme}
              class="zs-btn-outline zs-pressable w-9 h-9 p-0 shrink-0 cursor-pointer"
            >
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            </button>

            <button
              type="button"
              onClick={() => void handleToggleInspectOnActiveTab()}
              class="zs-btn-primary zs-pressable h-9 px-3.5 gap-1.5 shrink-0 whitespace-nowrap cursor-pointer"
            >
              <Crosshair size={14} />
              <span>{t.inspectTab}</span>
            </button>
          </div>
        </div>

        {/* Session Selector Row */}
        <div class="flex items-center gap-2 min-w-0">
          <select
            value={currentSession?.id ?? ''}
            onChange={async (e) => {
              const nextId = (e.target as HTMLSelectElement).value;
              await setStoredSessionId(nextId);
              await loadWorkspace();
            }}
            class="flex-1 min-w-0 h-9 zs-input-subtle zs-select rounded-full pl-3.5 text-[13px] font-medium truncate"
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>

          <button
            type="button"
            title={t.newSessionTooltip}
            onClick={async () => {
              const name = window.prompt(
                t.newSessionPrompt,
                `QA Session — ${new Date().toISOString().slice(0, 10)}`,
              );
              if (name !== null) {
                await createSession(name);
                await loadWorkspace();
              }
            }}
            class="zs-btn-outline zs-pressable w-9 h-9 p-0 shrink-0 cursor-pointer"
          >
            <Plus size={16} />
          </button>

          {currentSession && sessions.length > 1 && (
            <button
              type="button"
              title={t.deleteSessionTooltip}
              onClick={async () => {
                if (window.confirm(t.deleteSessionConfirm)) {
                  await deleteSession(currentSession.id);
                  await loadWorkspace();
                }
              }}
              class="zs-btn-outline zs-pressable w-9 h-9 p-0 shrink-0 zs-muted hover:text-[#ff453a] cursor-pointer"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>

        {/* Segmented Tab Bar (Overflow-proof with truncate) */}
        <nav class="grid grid-cols-3 zs-segmented text-[12.5px]">
          <button
            type="button"
            onClick={() => setActiveTab('pins')}
            class={`h-8 px-1.5 truncate zs-segmented-btn zs-pressable cursor-pointer ${
              activeTab === 'pins' ? 'zs-segmented-btn-active' : ''
            }`}
          >
            {t.tabPins} ({pins.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('refs')}
            class={`h-8 px-1.5 truncate zs-segmented-btn zs-pressable cursor-pointer ${
              activeTab === 'refs' ? 'zs-segmented-btn-active' : ''
            }`}
          >
            {t.tabRefs} ({references.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('export')}
            class={`h-8 px-1.5 truncate zs-segmented-btn zs-pressable cursor-pointer ${
              activeTab === 'export' ? 'zs-segmented-btn-active' : ''
            }`}
          >
            {t.tabExport}
          </button>
        </nav>
      </header>

      {restrictedTabNotice && (
        <div class="mx-5 mt-4 zs-card zs-anim-card p-4 text-[13px] zs-muted leading-relaxed">
          {t.restrictedTabMsg}
        </div>
      )}

      {/* 2. Main Tab Content */}
      <main class="flex-1 p-5 flex flex-col gap-4 min-w-0">
        {activeTab === 'pins' && (
          <>
            {/* Search & Filter */}
            <div class="flex items-center gap-2 min-w-0">
              <div class="relative flex-1 min-w-0">
                <Search
                  size={15}
                  class="absolute left-3.5 top-1/2 -translate-y-1/2 zs-muted"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
                  placeholder={t.searchPlaceholder}
                  class="w-full h-10 zs-input rounded-full pl-9 pr-3.5 text-[13px]"
                />
              </div>

              <select
                value={typeFilter}
                onChange={(e) =>
                  setTypeFilter((e.target as HTMLSelectElement).value as 'all' | PinType)
                }
                class="h-10 shrink-0 max-w-[138px] zs-input zs-select rounded-full pl-3.5 text-[12.5px] truncate"
              >
                <option value="all">{t.filterAll}</option>
                <option value="bug">{t.filterBug}</option>
                <option value="ui-polish">{t.filterUiPolish}</option>
                <option value="visual-tweak">{t.filterVisualTweak}</option>
                <option value="a11y">{t.filterA11y}</option>
                <option value="copy">{t.filterCopy}</option>
                <option value="design-diff">{t.filterDesignDiff}</option>
              </select>
            </div>

            {filteredPins.length === 0 ? (
              <div class="zs-card zs-anim-card p-8 text-center flex flex-col items-center gap-3 my-2">
                <div class="w-11 h-11 rounded-full zs-subtle-box flex items-center justify-center">
                  <Crosshair size={22} class="zs-muted" />
                </div>
                <div class="text-[15px] font-semibold">{t.emptyPinsTitle}</div>
                <p class="text-[13px] zs-muted m-0 max-w-[260px] leading-relaxed">
                  {t.emptyPinsDesc}
                </p>
              </div>
            ) : (
              filteredPins.map((pin) => (
                <PinCard
                  key={pin.id}
                  pin={pin}
                  ide={ideTarget}
                  references={references}
                  t={t}
                  onReload={() => void loadWorkspace()}
                  onNotify={notify}
                />
              ))
            )}
          </>
        )}

        {activeTab === 'refs' && (
          <>
            <div class="text-[13px] zs-muted leading-relaxed px-0.5">{t.refsIntro}</div>

            {references.length === 0 ? (
              <div class="zs-card zs-anim-card p-8 text-center flex flex-col items-center gap-3 my-2">
                <div class="w-11 h-11 rounded-full zs-subtle-box flex items-center justify-center">
                  <Bookmark size={22} class="zs-muted" />
                </div>
                <div class="text-[15px] font-semibold">{t.emptyRefsTitle}</div>
                <p class="text-[13px] zs-muted m-0 max-w-[260px] leading-relaxed">
                  {t.emptyRefsDesc}
                </p>
              </div>
            ) : (
              references.map((refItem) => (
                <ReferenceCard
                  key={refItem.id}
                  refItem={refItem}
                  t={t}
                  onReload={() => void loadWorkspace()}
                  onNotify={notify}
                />
              ))
            )}
          </>
        )}

        {activeTab === 'export' && (
          <>
            {/* Session Title Editor & IDE Preference */}
            {currentSession && (
              <section class="zs-card zs-anim-card p-5 flex flex-col gap-4">
                <div class="text-[15px] font-semibold tracking-[-0.2px]">
                  {t.sessionAndIdeTitle}
                </div>

                <div class="flex flex-col gap-1.5">
                  <label class="text-[12px] font-medium zs-muted">{t.sessionNameLabel}</label>
                  <input
                    type="text"
                    value={currentSession.title}
                    onBlur={(e) => {
                      const val = (e.target as HTMLInputElement).value.trim();
                      if (val && val !== currentSession.title) {
                        void renameSession(currentSession.id, val).then(loadWorkspace);
                      }
                    }}
                    class="h-10 w-full zs-input-subtle rounded-full px-4 text-[13px]"
                  />
                </div>

                <div class="flex items-center justify-between gap-2.5 min-w-0">
                  <span class="text-[13px] zs-muted whitespace-nowrap">{t.openSourceIdeLabel}</span>
                  <select
                    value={ideTarget}
                    onChange={(e) =>
                      setIdeTarget((e.target as HTMLSelectElement).value as IdeTarget)
                    }
                    class="h-9 shrink-0 zs-input zs-select rounded-full pl-3.5 text-[13px] font-medium"
                  >
                    <option value="cursor">Cursor</option>
                    <option value="vscode">VS Code</option>
                    <option value="windsurf">Windsurf</option>
                  </select>
                </div>
              </section>
            )}

            {/* Export Files Card (.xlsx, .md, .zip) */}
            <section class="zs-card zs-anim-card p-5 flex flex-col gap-4">
              <div class="flex items-center justify-between gap-2">
                <span class="text-[15px] font-semibold tracking-[-0.2px] truncate">
                  {t.exportFilesTitle} ({filteredPins.length})
                </span>
                <Download size={16} class="zs-muted shrink-0" />
              </div>

              <div class="flex flex-col gap-2.5">
                <button
                  type="button"
                  disabled={filteredPins.length === 0 || exportBusy !== null}
                  onClick={() => void handleDownloadExcel()}
                  class="zs-btn-primary zs-pressable h-10 px-4 gap-2 w-full cursor-pointer"
                >
                  <FileSpreadsheet size={16} class="shrink-0" />
                  <span class="truncate">
                    {exportBusy === 'xlsx' ? t.exportExcelBusy : t.exportExcelBtn}
                  </span>
                </button>

                <div class="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    disabled={filteredPins.length === 0}
                    onClick={handleDownloadMarkdown}
                    class="zs-btn-outline zs-pressable h-10 px-3 gap-1.5 min-w-0 cursor-pointer"
                  >
                    <FileText size={15} class="shrink-0" />
                    <span class="truncate">{t.exportMdBtn}</span>
                  </button>

                  <button
                    type="button"
                    disabled={filteredPins.length === 0 || exportBusy !== null}
                    onClick={() => void handleDownloadZipBundle()}
                    class="zs-btn-outline zs-pressable h-10 px-3 gap-1.5 min-w-0 cursor-pointer"
                  >
                    <FolderArchive size={15} class="shrink-0" />
                    <span class="truncate">
                      {exportBusy === 'zip' ? t.exportZipBusy : t.exportZipBtn}
                    </span>
                  </button>
                </div>
              </div>
            </section>

            {/* AI Prompt & Image Clipboard Card */}
            <section class="zs-card zs-anim-card p-5 flex flex-col gap-4">
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2 min-w-0">
                  <Sparkles size={16} class="text-[#0071e3] shrink-0" />
                  <span class="text-[15px] font-semibold tracking-[-0.2px] truncate">
                    {t.aiCompilerTitle}
                  </span>
                </div>
                <span class="text-[12px] font-medium zs-muted tabular-nums shrink-0">
                  ~{compiledAi.estimatedTokens} tokens
                </span>
              </div>

              {/* Density Selector */}
              <div class="grid grid-cols-3 zs-segmented text-[12px]">
                {(['compact', 'standard', 'forensic'] as PromptDensity[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDensity(d)}
                    class={`h-8 px-1 truncate zs-segmented-btn zs-pressable capitalize cursor-pointer ${
                      density === d ? 'zs-segmented-btn-active' : ''
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>

              <pre class="zs-subtle-box rounded-[16px] p-4 text-[12px] leading-relaxed font-mono max-h-[220px] overflow-auto whitespace-pre-wrap break-words m-0">
                {compiledAi.prompt}
              </pre>

              {/* Copy Annotated Image Sheet + Copy Prompt Row */}
              <div class="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={!hasAnyPinImage || exportBusy !== null}
                  onClick={() => void handleCopyCompositeImageSheet()}
                  class="zs-btn-outline zs-pressable h-10 px-3 gap-1.5 min-w-0 cursor-pointer"
                >
                  <ImageIcon size={15} class="shrink-0" />
                  <span class="truncate">
                    {exportBusy === 'sheet' ? t.copySheetBusy : t.copySheetImgBtn}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={filteredPins.length === 0}
                  onClick={async () => {
                    await navigator.clipboard.writeText(compiledAi.prompt);
                    notify(t.copiedPromptToast);
                  }}
                  class="zs-btn-primary zs-pressable h-10 px-3 gap-1.5 min-w-0 cursor-pointer"
                >
                  <Check size={15} class="shrink-0" />
                  <span class="truncate">{t.copyPromptBtn}</span>
                </button>
              </div>
            </section>
          </>
        )}
      </main>

      {toast && (
        <div class="fixed bottom-5 left-5 right-5 zs-frosted-hud zs-anim-hud px-4 py-2.5 text-center text-[13px] font-medium truncate">
          {toast}
        </div>
      )}
    </div>
  );
}
