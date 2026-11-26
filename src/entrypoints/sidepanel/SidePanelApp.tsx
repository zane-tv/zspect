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
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-preact';
import {
  buildIdeDeepLink,
  compileAiPrompt,
  compileSinglePinSection,
} from '@/core/prompt-compiler';
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
  onReload,
  onNotify,
}: {
  pin: PinRecord;
  ide: IdeTarget;
  references: ReferenceDNA[];
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
    onNotify(`Đã chép Prompt mục #${pin.orderIndex}`);
  };

  const handleCopyImage = async () => {
    if (!pin.croppedImageBlob) return;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': pin.croppedImageBlob }),
      ]);
      onNotify(`Đã chép ảnh chụp #${pin.orderIndex} vào Clipboard`);
    } catch {
      onNotify('Trình duyệt từ chối ghi ảnh Clipboard trực tiếp');
    }
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
      .catch(() => {
        onNotify('Hãy bật ZSpect trên đúng trang của mục này để cuộn tới phần tử');
      });
  };

  const errorCount =
    (pin.flightCapsule?.consoleErrors.length ?? 0) +
    (pin.flightCapsule?.networkIssues.length ?? 0);

  return (
    <article class="zs-card p-4 flex flex-col gap-3">
      {/* Top Meta Row */}
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 min-w-0">
          <span
            class={`w-6 h-6 rounded-full text-white text-[11px] font-semibold flex items-center justify-center shrink-0 ${
              pin.severity === 'critical' || pin.severity === 'high'
                ? 'bg-[#b64400]'
                : 'bg-[#0071e3]'
            }`}
          >
            #{pin.orderIndex}
          </span>
          <span class="text-[12px] font-medium text-[#1d1d1f] uppercase tracking-tight">
            {pin.type}
          </span>
          {(pin.severity === 'critical' || pin.severity === 'high') && (
            <span class="zs-status-urgent uppercase">{pin.severity}</span>
          )}
        </div>

        <div class="flex items-center gap-1.5 shrink-0">
          <select
            value={pin.status}
            onChange={(e) => {
              void updatePin(pin.id, {
                status: (e.target as HTMLSelectElement).value as PinStatus,
              }).then(onReload);
            }}
            class="bg-[#f5f5f7] border border-[#d6d6d6] rounded-full px-2.5 py-0.5 text-[11px] text-[#1d1d1f]"
          >
            <option value="open">Open</option>
            <option value="in-progress">In Progress</option>
            <option value="resolved">Resolved</option>
          </select>

          <button
            type="button"
            title="Cuộn tới phần tử trên trang"
            onClick={() => void handleJumpToElement()}
            class="p-1.5 rounded-full hover:bg-[#f5f5f7] text-[#707070] hover:text-[#1d1d1f] cursor-pointer"
          >
            <LocateFixed size={13} />
          </button>

          <button
            type="button"
            title="Xóa mục này"
            onClick={() => void deletePin(pin.id).then(onReload)}
            class="p-1.5 rounded-full hover:bg-[#f5f5f7] text-[#707070] hover:text-[#b64400] cursor-pointer"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Cropped Annotated Screenshot */}
      {imgUrl && (
        <div class="relative rounded-[14px] overflow-hidden border border-[#e6e6e8] bg-[#f5f5f7]">
          <img
            src={imgUrl}
            alt={`Pin #${pin.orderIndex}`}
            class="w-full max-h-[180px] object-contain block"
          />
          <button
            type="button"
            onClick={() => void handleCopyImage()}
            class="absolute bottom-2 right-2 zs-frosted-hud px-2.5 py-1 text-[11px] font-medium flex items-center gap-1 cursor-pointer"
          >
            <ImageIcon size={11} />
            Copy ảnh
          </button>
        </div>
      )}

      {/* Component / File / Page Metadata */}
      <div class="bg-[#f5f5f7] rounded-[12px] px-3 py-2 text-[11px] flex flex-col gap-1">
        <div class="flex items-center justify-between gap-2">
          <span class="font-medium text-[#1d1d1f] truncate" title={pin.selector}>
            {pin.frameworkMeta.componentName
              ? `<${pin.frameworkMeta.componentName}> (${pin.frameworkMeta.framework})`
              : pin.selector}
          </span>
          {pin.frameworkMeta.sourceLocation && (
            <a
              href={buildIdeDeepLink(pin.frameworkMeta.sourceLocation, ide)}
              class="zs-link flex items-center gap-0.5 font-medium shrink-0"
            >
              Mở {ide} <ExternalLink size={10} />
            </a>
          )}
        </div>
        <div class="text-[#707070] truncate" title={pin.pageUrl}>
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
        placeholder="Nhập mô tả lỗi hoặc hướng dẫn sửa cho AI..."
        class="w-full bg-white border border-[#d6d6d6] rounded-[12px] px-3 py-2 text-[13px] text-[#1d1d1f] focus:outline-none focus:border-[#0071e3] resize-y"
      />

      {/* VisBug Before -> After Diff Preview */}
      {pin.visualDiff && (
        <div class="bg-[#fafafc] border border-[#e6e6e8] rounded-[12px] px-3 py-2 text-[11px] flex flex-col gap-1">
          <span class="font-semibold text-[#1d1d1f]">VisBug Diff (Before → After)</span>
          {pin.visualDiff.styleChanges.slice(0, 4).map((sc) => (
            <div key={sc.property} class="font-mono text-[#707070] truncate">
              {sc.property}: {sc.before} → <strong class="text-[#0066cc]">{sc.after}</strong>
            </div>
          ))}
          {pin.visualDiff.textChange && (
            <div class="text-[#707070] truncate">
              Text: "{pin.visualDiff.textChange.before}" →{' '}
              <strong class="text-[#0066cc]">"{pin.visualDiff.textChange.after}"</strong>
            </div>
          )}
        </div>
      )}

      {/* A11y Snapshot */}
      {pin.a11yAudit && (pin.type === 'a11y' || pin.a11yAudit.issues.length > 0) && (
        <div class="text-[11px] text-[#707070] flex items-center justify-between bg-[#f5f5f7] px-3 py-1.5 rounded-[10px]">
          <span>WCAG Contrast: {pin.a11yAudit.contrastRatio}:1</span>
          <span class={pin.a11yAudit.wcagAA ? 'text-[#1d1d1f]' : 'zs-status-urgent'}>
            {pin.a11yAudit.wcagAA ? 'AA Pass' : 'AA FAIL'}
          </span>
        </div>
      )}

      {/* Attached @ref Chips */}
      {pin.attachedRefIds.length > 0 && (
        <div class="flex flex-wrap gap-1.5">
          {pin.attachedRefIds.map((rid) => {
            const ref = refMap.get(rid);
            return ref ? (
              <span
                key={rid}
                class="px-2.5 py-0.5 rounded-full bg-[#f5f5f7] border border-[#d6d6d6] text-[11px] text-[#0066cc] font-medium"
              >
                @ref:{ref.alias}
              </span>
            ) : null;
          })}
        </div>
      )}

      {/* Bottom Action & Diagnostics Row */}
      <div class="flex items-center justify-between pt-1 border-t border-[#e6e6e8]">
        {errorCount > 0 ? (
          <button
            type="button"
            onClick={() => setShowLogs((s) => !s)}
            class="zs-status-urgent cursor-pointer hover:underline"
          >
            {errorCount} lỗi Console/API {showLogs ? '▲' : '▼'}
          </button>
        ) : (
          <span class="text-[11px] text-[#707070]">Sẵn sàng xuất AI / QA</span>
        )}

        <button
          type="button"
          onClick={() => void handleCopySingleAi()}
          class="zs-btn-outline px-3 py-1 flex items-center gap-1 cursor-pointer"
        >
          <Copy size={11} />
          Copy AI Prompt
        </button>
      </div>

      {showLogs && pin.flightCapsule && (
        <div class="bg-[#f5f5f7] rounded-[12px] p-2.5 text-[11px] font-mono text-[#1d1d1f] flex flex-col gap-1.5 max-h-40 overflow-auto">
          {pin.flightCapsule.consoleErrors.map((err, idx) => (
            <div key={`ce-${idx}`} class="text-[#b64400] break-words">
              [{err.level}] {err.message}
            </div>
          ))}
          {pin.flightCapsule.networkIssues.map((net, idx) => (
            <div key={`ne-${idx}`} class="text-[#1d1d1f] break-words">
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
  onReload,
  onNotify,
}: {
  refItem: ReferenceDNA;
  onReload: () => void;
  onNotify: (msg: string) => void;
}) {
  const previewUrl = useBlobUrl(refItem.previewBlob);
  const [aliasDraft, setAliasDraft] = useState(refItem.alias);

  return (
    <article class="zs-card p-4 flex flex-col gap-3">
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-1 flex-1 min-w-0">
          <span class="text-[12px] font-semibold text-[#0066cc]">@ref:</span>
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
            class="flex-1 min-w-0 bg-[#f5f5f7] rounded-full px-2.5 py-0.5 text-[12px] font-medium text-[#1d1d1f]"
          />
        </div>
        <button
          type="button"
          onClick={() => void deleteReference(refItem.id).then(onReload)}
          class="p-1.5 text-[#707070] hover:text-[#b64400] cursor-pointer"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {previewUrl && (
        <div class="rounded-[14px] overflow-hidden border border-[#e6e6e8] bg-[#f5f5f7]">
          <img
            src={previewUrl}
            alt={refItem.alias}
            class="w-full max-h-[150px] object-contain block"
          />
        </div>
      )}

      <div class="text-[11px] text-[#707070] truncate" title={refItem.sourceUrl}>
        Nguồn: {refItem.sourceUrl}
      </div>

      {refItem.tailwindHint && (
        <div class="bg-[#f5f5f7] rounded-[10px] p-2 font-mono text-[11px] text-[#1d1d1f] break-words">
          {refItem.tailwindHint}
        </div>
      )}

      <div class="flex items-center justify-between pt-1">
        <span class="text-[11px] text-[#707070]">
          {Object.keys(refItem.resolvedCssVars).length} CSS vars ·{' '}
          {refItem.motionRules.transitions.length + refItem.motionRules.animations.length} motion rules
        </span>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(refItem.tailwindHint || refItem.domSkeleton);
            onNotify(`Đã chép Tailwind/DNA của @ref:${refItem.alias}`);
          }}
          class="zs-btn-outline px-3 py-1 flex items-center gap-1 cursor-pointer"
        >
          <Copy size={11} />
          Copy DNA
        </button>
      </div>
    </article>
  );
}

export function SidePanelApp() {
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
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const handleToggleInspectOnActiveTab = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    if (!tab.url || (!tab.url.startsWith('http://') && !tab.url.startsWith('https://') && !tab.url.startsWith('file://'))) {
      setRestrictedTabNotice(true);
      notify('Trang hệ thống trình duyệt không cho phép tiêm thanh Inspect');
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
    });
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    triggerBrowserDownload(blob, `${slugifyFilename(currentSession.title)}.md`);
    notify('Đã xuất báo cáo .md');
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
      notify('Đã xuất gói .zip (report.md + thư mục ảnh)');
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
      });
      triggerBrowserDownload(xlsxBlob, `${slugifyFilename(currentSession.title)}-qa.xlsx`);
      notify('Đã xuất file Excel .xlsx kèm ảnh nhúng');
    } finally {
      setExportBusy(null);
    }
  };

  return (
    <div class="min-h-screen flex flex-col bg-[#f5f5f7] text-[#1d1d1f]">
      {/* 1. Apple Product Local Navigation Header */}
      <header class="sticky top-0 z-20 bg-white/95 backdrop-blur-xl border-b border-[#e6e6e8] px-4 py-3 flex flex-col gap-2.5">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <img src="/icon/32.png" alt="ZSpect" class="w-6 h-6 rounded-[6px]" />
            <h1 class="text-[18px] font-semibold tracking-[0.2px]">ZSpect</h1>
          </div>

          <button
            type="button"
            onClick={() => void handleToggleInspectOnActiveTab()}
            class="zs-btn-primary px-3.5 py-1.5 flex items-center gap-1.5 cursor-pointer"
          >
            <Crosshair size={13} />
            <span>Inspect Tab</span>
          </button>
        </div>

        {/* Session Selector Row */}
        <div class="flex items-center gap-1.5">
          <select
            value={currentSession?.id ?? ''}
            onChange={async (e) => {
              const nextId = (e.target as HTMLSelectElement).value;
              await setStoredSessionId(nextId);
              await loadWorkspace();
            }}
            class="flex-1 min-w-0 bg-[#f5f5f7] border border-[#d6d6d6] rounded-full px-3 py-1 text-[12px] font-medium truncate"
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>

          <button
            type="button"
            title="Tạo phiên kiểm thử mới"
            onClick={async () => {
              const name = window.prompt(
                'Tên phiên kiểm thử / dự án mới:',
                `Session QA — ${new Date().toISOString().slice(0, 10)}`,
              );
              if (name !== null) {
                await createSession(name);
                await loadWorkspace();
              }
            }}
            class="zs-btn-outline p-1.5 cursor-pointer"
          >
            <Plus size={13} />
          </button>

          {currentSession && sessions.length > 1 && (
            <button
              type="button"
              title="Xóa phiên hiện tại"
              onClick={async () => {
                if (window.confirm(`Xóa phiên "${currentSession.title}" và toàn bộ ghim bên trong?`)) {
                  await deleteSession(currentSession.id);
                  await loadWorkspace();
                }
              }}
              class="zs-btn-outline p-1.5 text-[#707070] hover:text-[#b64400] cursor-pointer"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>

        {/* Segmented Tab Bar */}
        <nav class="grid grid-cols-3 bg-[#f5f5f7] p-1 rounded-full border border-[#e6e6e8] text-[12px]">
          <button
            type="button"
            onClick={() => setActiveTab('pins')}
            class={`py-1 rounded-full font-medium cursor-pointer transition-colors ${
              activeTab === 'pins' ? 'bg-white text-[#1d1d1f] border border-[#e6e6e8]' : 'text-[#707070]'
            }`}
          >
            Pins ({pins.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('refs')}
            class={`py-1 rounded-full font-medium cursor-pointer transition-colors ${
              activeTab === 'refs' ? 'bg-white text-[#1d1d1f] border border-[#e6e6e8]' : 'text-[#707070]'
            }`}
          >
            @ref ({references.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('export')}
            class={`py-1 rounded-full font-medium cursor-pointer transition-colors ${
              activeTab === 'export' ? 'bg-white text-[#1d1d1f] border border-[#e6e6e8]' : 'text-[#707070]'
            }`}
          >
            AI & Xuất file
          </button>
        </nav>
      </header>

      {restrictedTabNotice && (
        <div class="mx-4 mt-3 zs-card p-3 text-[12px] text-[#707070]">
          Tab hiện tại là trang nội bộ của trình duyệt (<code class="text-[#1d1d1f]">chrome://</code>). Hãy chuyển sang bất kỳ trang web <code class="text-[#1d1d1f]">http/https</code> nào để bật thanh công cụ Inspect.
        </div>
      )}

      {/* 2. Main Tab Content */}
      <main class="flex-1 p-4 flex flex-col gap-3">
        {activeTab === 'pins' && (
          <>
            {/* Search & Filter */}
            <div class="flex items-center gap-2">
              <div class="relative flex-1">
                <Search
                  size={13}
                  class="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
                  placeholder="Tìm theo ghi chú, URL, Component..."
                  class="w-full bg-white border border-[#86868b] rounded-full pl-8 pr-3 py-1.5 text-[12px] focus:outline-none focus:border-[#0071e3]"
                />
              </div>

              <select
                value={typeFilter}
                onChange={(e) =>
                  setTypeFilter((e.target as HTMLSelectElement).value as 'all' | PinType)
                }
                class="bg-white border border-[#86868b] rounded-full px-3 py-1.5 text-[12px]"
              >
                <option value="all">Tất cả</option>
                <option value="bug">Bug</option>
                <option value="ui-polish">UI Polish</option>
                <option value="visual-tweak">VisBug Diff</option>
                <option value="a11y">A11y</option>
                <option value="copy">Copy</option>
                <option value="design-diff">Design Diff</option>
              </select>
            </div>

            {filteredPins.length === 0 ? (
              <div class="zs-card p-8 text-center flex flex-col items-center gap-2 my-4">
                <Crosshair size={24} class="text-[#86868b]" />
                <div class="text-[14px] font-medium">Chưa có mục Bug / Feedback nào</div>
                <p class="text-[12px] text-[#707070] m-0 max-w-[240px]">
                  Nhấn nút <strong>Inspect Tab</strong> (hoặc phím tắt <strong>Alt+Z</strong>) trên bất kỳ trang web nào để chấm ghim lỗi, đo khoảng cách hoặc lưu mẫu UI.
                </p>
              </div>
            ) : (
              filteredPins.map((pin) => (
                <PinCard
                  key={pin.id}
                  pin={pin}
                  ide={ideTarget}
                  references={references}
                  onReload={() => void loadWorkspace()}
                  onNotify={notify}
                />
              ))
            )}
          </>
        )}

        {activeTab === 'refs' && (
          <>
            <div class="text-[12px] text-[#707070] px-1">
              Kho mẫu giao diện xuyên tab — soi bất kỳ website nào (Stripe, Linear, Apple...), bấm <strong>Lưu mẫu @ref</strong> để ghép trực tiếp vào câu lệnh AI ở dự án của bạn.
            </div>

            {references.length === 0 ? (
              <div class="zs-card p-8 text-center flex flex-col items-center gap-2 my-4">
                <Bookmark size={24} class="text-[#86868b]" />
                <div class="text-[14px] font-medium">Kho @ref đang trống</div>
                <p class="text-[12px] text-[#707070] m-0 max-w-[240px]">
                  Mở một trang web đẹp bất kỳ, bật Inspect rồi chọn tab <strong>Lưu mẫu @ref</strong> để trích xuất cấu trúc DOM, CSS Tokens & chuyển động.
                </p>
              </div>
            ) : (
              references.map((refItem) => (
                <ReferenceCard
                  key={refItem.id}
                  refItem={refItem}
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
              <section class="zs-card p-4 flex flex-col gap-3">
                <div class="text-[13px] font-semibold">Thiết lập Phiên & IDE</div>
                <div class="flex flex-col gap-1">
                  <label class="text-[11px] text-[#707070]">Tên báo cáo / Phiên kiểm thử</label>
                  <input
                    type="text"
                    value={currentSession.title}
                    onBlur={(e) => {
                      const val = (e.target as HTMLInputElement).value.trim();
                      if (val && val !== currentSession.title) {
                        void renameSession(currentSession.id, val).then(loadWorkspace);
                      }
                    }}
                    class="bg-[#f5f5f7] border border-[#d6d6d6] rounded-full px-3 py-1.5 text-[12px]"
                  />
                </div>

                <div class="flex items-center justify-between gap-2">
                  <span class="text-[12px] text-[#707070]">Mở mã nguồn bằng IDE:</span>
                  <select
                    value={ideTarget}
                    onChange={(e) => setIdeTarget((e.target as HTMLSelectElement).value as IdeTarget)}
                    class="bg-white border border-[#86868b] rounded-full px-3 py-1 text-[12px]"
                  >
                    <option value="cursor">Cursor (cursor://)</option>
                    <option value="vscode">VS Code (vscode://)</option>
                    <option value="windsurf">Windsurf (windsurf://)</option>
                  </select>
                </div>
              </section>
            )}

            {/* Export Files Card (.xlsx, .md, .zip) */}
            <section class="zs-card p-4 flex flex-col gap-3">
              <div class="flex items-center justify-between">
                <span class="text-[13px] font-semibold">Xuất file Bug / Feedback ({filteredPins.length} mục)</span>
                <Download size={14} class="text-[#707070]" />
              </div>

              <div class="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  disabled={filteredPins.length === 0 || exportBusy !== null}
                  onClick={() => void handleDownloadExcel()}
                  class="zs-btn-primary py-2.5 px-4 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <FileSpreadsheet size={15} />
                  <span>
                    {exportBusy === 'xlsx'
                      ? 'Đang tạo bảng Excel...'
                      : 'Tải file Excel (.xlsx kèm ảnh chụp)'}
                  </span>
                </button>

                <div class="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={filteredPins.length === 0}
                    onClick={handleDownloadMarkdown}
                    class="zs-btn-outline py-2 px-3 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <FileText size={13} />
                    <span>Lưu file .md</span>
                  </button>

                  <button
                    type="button"
                    disabled={filteredPins.length === 0 || exportBusy !== null}
                    onClick={() => void handleDownloadZipBundle()}
                    class="zs-btn-outline py-2 px-3 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <FolderArchive size={13} />
                    <span>{exportBusy === 'zip' ? 'Đang nén...' : 'Gói .zip (.md + ảnh)'}</span>
                  </button>
                </div>
              </div>
            </section>

            {/* AI Prompt Compiler Card */}
            <section class="zs-card p-4 flex flex-col gap-3">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-1.5">
                  <Sparkles size={14} class="text-[#0071e3]" />
                  <span class="text-[13px] font-semibold">AI Coding Prompt</span>
                </div>
                <span class="text-[11px] font-medium text-[#707070] tabular-nums">
                  ~{compiledAi.estimatedTokens} tokens
                </span>
              </div>

              {/* Density Selector */}
              <div class="grid grid-cols-3 bg-[#f5f5f7] p-1 rounded-full border border-[#e6e6e8] text-[11px]">
                {(['compact', 'standard', 'forensic'] as PromptDensity[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDensity(d)}
                    class={`py-1 rounded-full capitalize cursor-pointer ${
                      density === d ? 'bg-white font-medium text-[#1d1d1f]' : 'text-[#707070]'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>

              <pre class="bg-[#f5f5f7] border border-[#e6e6e8] rounded-[14px] p-3 text-[11px] font-mono text-[#1d1d1f] max-h-[240px] overflow-auto whitespace-pre-wrap break-words m-0">
                {compiledAi.prompt}
              </pre>

              <button
                type="button"
                disabled={filteredPins.length === 0}
                onClick={async () => {
                  await navigator.clipboard.writeText(compiledAi.prompt);
                  notify('Đã chép toàn bộ AI Prompt vào Clipboard');
                }}
                class="zs-btn-primary py-2 px-4 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Check size={14} />
                <span>Copy toàn bộ Prompt cho AI Agent</span>
              </button>
            </section>
          </>
        )}
      </main>

      {toast && (
        <div class="fixed bottom-4 left-4 right-4 zs-frosted-hud px-4 py-2 text-center text-[12px] font-medium">
          {toast}
        </div>
      )}
    </div>
  );
}
