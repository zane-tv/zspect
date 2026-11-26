import { useEffect, useMemo, useState } from 'preact/hooks';
import {
  Bookmark,
  Check,
  Copy,
  Crosshair,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  FolderArchive,
  Image as ImageIcon,
  LocateFixed,
  Moon,
  Pencil,
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

function ZSpectLogoIcon({ className = 'w-5 h-5' }: { className?: string }) {
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
        stroke-width="14"
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
    <article class="zs-card zs-anim-card p-2.5 flex flex-col gap-2">
      {/* Compact Header Row */}
      <div class="flex items-center justify-between gap-1.5">
        <div class="flex items-center gap-1.5 min-w-0">
          <span
            class={`w-5 h-5 rounded-[6px] text-white text-[11px] font-semibold flex items-center justify-center shrink-0 ${
              pin.severity === 'critical' || pin.severity === 'high'
                ? 'bg-[#b64400]'
                : 'bg-[#0071e3]'
            }`}
          >
            #{pin.orderIndex}
          </span>
          <span class="text-[11px] font-semibold uppercase tracking-tight truncate">
            {pin.type}
          </span>
          {(pin.severity === 'critical' || pin.severity === 'high') && (
            <span class="zs-status-urgent text-[10.5px] uppercase shrink-0">{pin.severity}</span>
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
            class="h-6 zs-input-subtle zs-select pl-2 text-[11px] font-medium"
          >
            <option value="open">Open</option>
            <option value="in-progress">WIP</option>
            <option value="resolved">Done</option>
          </select>

          <button
            type="button"
            title={t.scrollToPinTooltip}
            onClick={() => void handleJumpToElement()}
            class="w-6 h-6 flex items-center justify-center zs-icon-btn zs-muted zs-pressable cursor-pointer"
          >
            <LocateFixed size={13} />
          </button>

          <button
            type="button"
            title={t.deleteItemTooltip}
            onClick={() => void deletePin(pin.id).then(onReload)}
            class="w-6 h-6 flex items-center justify-center zs-icon-btn zs-muted hover:text-[#ff453a] zs-pressable cursor-pointer"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Cropped Annotated Screenshot */}
      {imgUrl && (
        <div class="relative rounded-[8px] overflow-hidden zs-subtle-box">
          <img
            src={imgUrl}
            alt={`Pin #${pin.orderIndex}`}
            class="w-full max-h-[140px] object-contain block"
          />
          <button
            type="button"
            onClick={() => void handleCopyImage()}
            class="absolute bottom-1.5 right-1.5 zs-frosted-hud zs-pressable h-6 px-2 text-[11px] font-medium flex items-center gap-1 cursor-pointer"
          >
            <ImageIcon size={11} />
            <span>{t.copyImgShort}</span>
          </button>
        </div>
      )}

      {/* Component / File / Page Metadata */}
      <div class="zs-subtle-box rounded-[8px] px-2.5 py-1.5 text-[11px] flex flex-col gap-0.5">
        <div class="flex items-center justify-between gap-2">
          <span class="font-medium truncate" title={pin.selector}>
            {pin.frameworkMeta.componentName
              ? `<${pin.frameworkMeta.componentName}> (${pin.frameworkMeta.framework})`
              : pin.selector}
          </span>
          {pin.frameworkMeta.sourceLocation && (
            <a
              href={buildIdeDeepLink(pin.frameworkMeta.sourceLocation, ide)}
              class="zs-link text-[11px] flex items-center gap-0.5 font-medium shrink-0"
            >
              {ide} <ExternalLink size={10} />
            </a>
          )}
        </div>
        <div class="zs-muted truncate text-[10.5px]" title={pin.pageUrl}>
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
        class="w-full zs-input px-2.5 py-1.5 text-[12px] leading-snug resize-y"
      />

      {/* VisBug Before -> After Diff Preview */}
      {pin.visualDiff && (
        <div class="zs-subtle-box rounded-[8px] px-2.5 py-1.5 text-[11px] flex flex-col gap-0.5">
          <span class="font-semibold">VisBug Diff (Before → After)</span>
          {pin.visualDiff.styleChanges.slice(0, 3).map((sc) => (
            <div key={sc.property} class="font-mono text-[10.5px] zs-muted truncate">
              {sc.property}: {sc.before} → <strong class="zs-link">{sc.after}</strong>
            </div>
          ))}
          {pin.visualDiff.textChange && (
            <div class="zs-muted truncate">
              "{pin.visualDiff.textChange.before}" →{' '}
              <strong class="zs-link">"{pin.visualDiff.textChange.after}"</strong>
            </div>
          )}
        </div>
      )}

      {/* A11y Snapshot */}
      {pin.a11yAudit && (pin.type === 'a11y' || pin.a11yAudit.issues.length > 0) && (
        <div class="text-[11px] zs-muted flex items-center justify-between zs-subtle-box px-2.5 py-1 rounded-[7px]">
          <span class="truncate">WCAG {pin.a11yAudit.contrastRatio}:1</span>
          <span class={`shrink-0 ${pin.a11yAudit.wcagAA ? 'font-medium' : 'zs-status-urgent text-[11px]'}`}>
            {pin.a11yAudit.wcagAA ? 'AA Pass' : 'AA FAIL'}
          </span>
        </div>
      )}

      {/* Attached @ref Chips */}
      {pin.attachedRefIds.length > 0 && (
        <div class="flex flex-wrap gap-1">
          {pin.attachedRefIds.map((rid) => {
            const ref = refMap.get(rid);
            return ref ? (
              <span
                key={rid}
                class="px-2 py-0.5 rounded-[6px] zs-subtle-box text-[11px] zs-link font-medium truncate max-w-full"
              >
                @ref:{ref.alias}
              </span>
            ) : null;
          })}
        </div>
      )}

      {/* Bottom Action & Diagnostics Row */}
      <div
        class="flex items-center justify-between gap-1.5 pt-1.5"
        style={{ borderTop: '1px solid var(--zs-border)' }}
      >
        {errorCount > 0 ? (
          <button
            type="button"
            onClick={() => setShowLogs((s) => !s)}
            class="zs-status-urgent text-[11px] cursor-pointer hover:underline truncate"
          >
            {errorCount} {t.errorsAttached} {showLogs ? '▲' : '▼'}
          </button>
        ) : (
          <span class="text-[11px] zs-muted truncate">{t.readyForExport}</span>
        )}

        <div class="flex items-center gap-1 shrink-0 ml-auto">
          {pin.croppedImageBlob && (
            <button
              type="button"
              onClick={() => void handleCopyImage()}
              class="zs-btn-outline zs-pressable h-6.5 px-2 gap-1 text-[11px] whitespace-nowrap cursor-pointer"
            >
              <ImageIcon size={11} />
              <span>{t.copyImgShort}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleCopySingleAi()}
            class="zs-btn-outline zs-pressable h-6.5 px-2 gap-1 text-[11px] whitespace-nowrap cursor-pointer"
          >
            <Copy size={11} />
            <span>{t.copyAiShort}</span>
          </button>
        </div>
      </div>

      {showLogs && pin.flightCapsule && (
        <div class="zs-subtle-box rounded-[8px] p-2 text-[10.5px] font-mono flex flex-col gap-1 max-h-36 overflow-auto">
          {pin.flightCapsule.consoleErrors.map((err, idx) => (
            <div key={`ce-${idx}`} class="zs-status-urgent text-[10.5px] break-words">
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
    <article class="zs-card zs-anim-card p-2.5 flex flex-col gap-2">
      <div class="flex items-center justify-between gap-1.5">
        <div class="flex items-center gap-1 flex-1 min-w-0">
          <span class="text-[11.5px] font-semibold zs-link shrink-0">@ref:</span>
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
            class="flex-1 min-w-0 h-6.5 zs-input-subtle px-2 text-[12px] font-medium"
          />
        </div>
        <button
          type="button"
          title={t.deleteItemTooltip}
          onClick={() => void deleteReference(refItem.id).then(onReload)}
          class="w-6 h-6 shrink-0 flex items-center justify-center zs-icon-btn zs-muted hover:text-[#ff453a] zs-pressable cursor-pointer"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {previewUrl && (
        <div class="relative rounded-[8px] overflow-hidden zs-subtle-box">
          <img
            src={previewUrl}
            alt={refItem.alias}
            class="w-full max-h-[130px] object-contain block"
          />
          <button
            type="button"
            onClick={() => void handleCopyRefImg()}
            class="absolute bottom-1.5 right-1.5 zs-frosted-hud zs-pressable h-6 px-2 text-[11px] font-medium flex items-center gap-1 cursor-pointer"
          >
            <ImageIcon size={11} />
            <span>{t.copyImgShort}</span>
          </button>
        </div>
      )}

      <div class="text-[11px] zs-muted truncate" title={refItem.sourceUrl}>
        {t.sourcePrefix} {refItem.sourceUrl}
      </div>

      {refItem.tailwindHint && (
        <div class="zs-subtle-box rounded-[8px] p-2 font-mono text-[10.5px] break-words">
          {refItem.tailwindHint}
        </div>
      )}

      <div class="flex items-center justify-between gap-2 pt-0.5">
        <span class="text-[11px] zs-muted truncate">
          {Object.keys(refItem.resolvedCssVars).length} vars ·{' '}
          {refItem.motionRules.transitions.length + refItem.motionRules.animations.length} motion
        </span>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(refItem.tailwindHint || refItem.domSkeleton);
            onNotify(`@ref:${refItem.alias} — DNA copied`);
          }}
          class="zs-btn-outline zs-pressable h-6.5 px-2.5 gap-1 text-[11px] whitespace-nowrap cursor-pointer"
        >
          <Copy size={11} />
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
    }, 2200);
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
    <div data-theme={theme} class="min-h-screen flex flex-col zs-canvas overflow-x-hidden text-[12px]">
      {/* 1. High-Density Pro Inspector Header */}
      <header class="sticky top-0 z-20 zs-header px-3 py-2 flex flex-col gap-1.5">
        {/* Top Row: Brand + Quick Theme/Lang + Inspect */}
        <div class="flex items-center justify-between gap-1.5 min-w-0">
          <div class="flex items-center gap-1.5 min-w-0">
            <ZSpectLogoIcon className="w-5 h-5 shrink-0" />
            <span class="text-[13.5px] font-semibold tracking-[-0.15px] truncate">ZSpect</span>
          </div>

          <div class="flex items-center gap-1 shrink-0">
            <button
              type="button"
              title={t.switchLangTooltip}
              onClick={toggleLocale}
              class="zs-btn-outline zs-pressable h-7 px-2 text-[10.5px] font-semibold uppercase tracking-wide cursor-pointer"
            >
              {locale}
            </button>

            <button
              type="button"
              title={theme === 'light' ? t.toggleDarkTooltip : t.toggleLightTooltip}
              aria-label="Toggle Light/Dark Theme"
              onClick={toggleTheme}
              class="zs-btn-outline zs-pressable w-7 h-7 p-0 cursor-pointer"
            >
              {theme === 'light' ? <Moon size={13} /> : <Sun size={13} />}
            </button>

            <button
              type="button"
              onClick={() => void handleToggleInspectOnActiveTab()}
              class="zs-btn-primary zs-pressable h-7 px-2.5 gap-1 whitespace-nowrap cursor-pointer"
            >
              <Crosshair size={12} />
              <span>{t.inspectTab}</span>
            </button>
          </div>
        </div>

        {/* Session Row (Compact 28px) */}
        <div class="flex items-center gap-1 min-w-0">
          <select
            value={currentSession?.id ?? ''}
            onChange={async (e) => {
              const nextId = (e.target as HTMLSelectElement).value;
              await setStoredSessionId(nextId);
              await loadWorkspace();
            }}
            class="flex-1 min-w-0 h-7 zs-input-subtle zs-select pl-2.5 text-[12px] font-medium truncate"
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>

          {currentSession && (
            <button
              type="button"
              title={t.sessionNameLabel}
              onClick={async () => {
                const nextName = window.prompt(t.sessionNameLabel, currentSession.title);
                if (nextName && nextName.trim() !== currentSession.title) {
                  await renameSession(currentSession.id, nextName.trim());
                  await loadWorkspace();
                }
              }}
              class="zs-btn-outline zs-pressable w-7 h-7 p-0 shrink-0 zs-muted cursor-pointer"
            >
              <Pencil size={12} />
            </button>
          )}

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
            class="zs-btn-outline zs-pressable w-7 h-7 p-0 shrink-0 cursor-pointer"
          >
            <Plus size={13} />
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
              class="zs-btn-outline zs-pressable w-7 h-7 p-0 shrink-0 zs-muted hover:text-[#ff453a] cursor-pointer"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>

        {/* Sleek 28px Segmented Tab Bar */}
        <nav class="grid grid-cols-3 zs-segmented">
          <button
            type="button"
            onClick={() => setActiveTab('pins')}
            class={`h-6.5 px-1.5 truncate zs-segmented-btn zs-pressable cursor-pointer ${
              activeTab === 'pins' ? 'zs-segmented-btn-active' : ''
            }`}
          >
            {t.tabPins} ({pins.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('refs')}
            class={`h-6.5 px-1.5 truncate zs-segmented-btn zs-pressable cursor-pointer ${
              activeTab === 'refs' ? 'zs-segmented-btn-active' : ''
            }`}
          >
            {t.tabRefs} ({references.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('export')}
            class={`h-6.5 px-1.5 truncate zs-segmented-btn zs-pressable cursor-pointer ${
              activeTab === 'export' ? 'zs-segmented-btn-active' : ''
            }`}
          >
            {t.tabExport}
          </button>
        </nav>
      </header>

      {restrictedTabNotice && (
        <div class="mx-2.5 mt-2 zs-card zs-anim-card p-2.5 text-[11.5px] zs-muted leading-snug">
          {t.restrictedTabMsg}
        </div>
      )}

      {/* 2. Tight Pro-Density Main Content (px-2.5 py-2.5, gap-2) */}
      <main class="flex-1 p-2.5 flex flex-col gap-2 min-w-0">
        {activeTab === 'pins' && (
          <>
            {/* Compact Search & Filter Row (30px) */}
            <div class="flex items-center gap-1.5 min-w-0">
              <div class="relative flex-1 min-w-0">
                <Search
                  size={13}
                  class="absolute left-2.5 top-1/2 -translate-y-1/2 zs-muted"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
                  placeholder={t.searchPlaceholder}
                  class="w-full h-7.5 zs-input pl-7.5 pr-2.5 text-[12px]"
                />
              </div>

              <select
                value={typeFilter}
                onChange={(e) =>
                  setTypeFilter((e.target as HTMLSelectElement).value as 'all' | PinType)
                }
                class="h-7.5 shrink-0 max-w-[118px] zs-input zs-select pl-2.5 text-[11.5px] truncate"
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
              <div class="zs-card zs-anim-card px-4 py-6 text-center flex flex-col items-center gap-2">
                <div class="w-8 h-8 rounded-[8px] zs-subtle-box flex items-center justify-center">
                  <Crosshair size={16} class="zs-muted" />
                </div>
                <div class="text-[13px] font-semibold">{t.emptyPinsTitle}</div>
                <p class="text-[11.5px] zs-muted m-0 max-w-[240px] leading-relaxed">
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
            <div class="text-[11.5px] zs-muted leading-snug px-0.5">{t.refsIntro}</div>

            {references.length === 0 ? (
              <div class="zs-card zs-anim-card px-4 py-6 text-center flex flex-col items-center gap-2">
                <div class="w-8 h-8 rounded-[8px] zs-subtle-box flex items-center justify-center">
                  <Bookmark size={16} class="zs-muted" />
                </div>
                <div class="text-[13px] font-semibold">{t.emptyRefsTitle}</div>
                <p class="text-[11.5px] zs-muted m-0 max-w-[240px] leading-relaxed">
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
            {/* 1. Compact Single-Row Preferences Strip (IDE + Theme + Language) */}
            <section class="zs-card zs-anim-card px-3 py-2 flex items-center justify-between gap-2">
              <span class="text-[12px] font-medium zs-muted whitespace-nowrap">
                {t.openSourceIdeLabel}
              </span>
              <select
                value={ideTarget}
                onChange={(e) =>
                  setIdeTarget((e.target as HTMLSelectElement).value as IdeTarget)
                }
                class="h-7 zs-input-subtle zs-select pl-2.5 text-[12px] font-medium"
              >
                <option value="cursor">Cursor</option>
                <option value="vscode">VS Code</option>
                <option value="windsurf">Windsurf</option>
              </select>
            </section>

            {/* 2. AI Prompt & Image Clipboard Studio */}
            <section class="zs-card zs-anim-card p-3 flex flex-col gap-2">
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-1.5 min-w-0">
                  <Sparkles size={13} class="text-[#0071e3] shrink-0" />
                  <span class="text-[12.5px] font-semibold truncate">{t.aiCompilerTitle}</span>
                </div>
                <span class="text-[11px] font-medium zs-muted tabular-nums shrink-0">
                  ~{compiledAi.estimatedTokens} tok
                </span>
              </div>

              {/* Compact Density Selector */}
              <div class="grid grid-cols-3 zs-segmented">
                {(['compact', 'standard', 'forensic'] as PromptDensity[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDensity(d)}
                    class={`h-6 px-1 truncate zs-segmented-btn zs-pressable text-[11px] capitalize cursor-pointer ${
                      density === d ? 'zs-segmented-btn-active' : ''
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>

              <pre class="zs-subtle-box rounded-[8px] p-2.5 text-[11px] leading-[1.45] font-mono max-h-[175px] overflow-auto whitespace-pre-wrap break-words m-0">
                {compiledAi.prompt}
              </pre>

              {/* Dual Action Row: Copy Image + Copy Prompt */}
              <div class="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  disabled={!hasAnyPinImage || exportBusy !== null}
                  onClick={() => void handleCopyCompositeImageSheet()}
                  class="zs-btn-outline zs-pressable h-8 px-2.5 gap-1.5 min-w-0 cursor-pointer"
                >
                  <ImageIcon size={13} class="shrink-0" />
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
                  class="zs-btn-primary zs-pressable h-8 px-2.5 gap-1.5 min-w-0 cursor-pointer"
                >
                  <Check size={13} class="shrink-0" />
                  <span class="truncate">{t.copyPromptBtn}</span>
                </button>
              </div>
            </section>

            {/* 3. Export Report Card (.xlsx, .md, .zip) */}
            <section class="zs-card zs-anim-card p-3 flex flex-col gap-2">
              <div class="flex items-center justify-between gap-2">
                <span class="text-[12.5px] font-semibold truncate">
                  {t.exportFilesTitle} ({filteredPins.length})
                </span>
              </div>

              <button
                type="button"
                disabled={filteredPins.length === 0 || exportBusy !== null}
                onClick={() => void handleDownloadExcel()}
                class="zs-btn-primary zs-pressable h-8 px-3 gap-1.5 w-full cursor-pointer"
              >
                <FileSpreadsheet size={13} class="shrink-0" />
                <span class="truncate">
                  {exportBusy === 'xlsx' ? t.exportExcelBusy : t.exportExcelBtn}
                </span>
              </button>

              <div class="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  disabled={filteredPins.length === 0}
                  onClick={handleDownloadMarkdown}
                  class="zs-btn-outline zs-pressable h-7.5 px-2.5 gap-1.5 min-w-0 cursor-pointer"
                >
                  <FileText size={13} class="shrink-0" />
                  <span class="truncate">{t.exportMdBtn}</span>
                </button>

                <button
                  type="button"
                  disabled={filteredPins.length === 0 || exportBusy !== null}
                  onClick={() => void handleDownloadZipBundle()}
                  class="zs-btn-outline zs-pressable h-7.5 px-2.5 gap-1.5 min-w-0 cursor-pointer"
                >
                  <FolderArchive size={13} class="shrink-0" />
                  <span class="truncate">
                    {exportBusy === 'zip' ? t.exportZipBusy : t.exportZipBtn}
                  </span>
                </button>
              </div>
            </section>
          </>
        )}
      </main>

      {toast && (
        <div class="fixed bottom-3 left-3 right-3 zs-frosted-hud zs-anim-dock px-3 py-1.5 text-center text-[11.5px] font-medium truncate">
          {toast}
        </div>
      )}
    </div>
  );
}
