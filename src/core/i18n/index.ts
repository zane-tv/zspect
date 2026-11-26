import { useEffect, useState } from 'preact/hooks';

export type ZSpectLocale = 'en' | 'vi';

const LOCALE_STORAGE_KEY = 'zspect_locale';

export const DICTIONARY = {
  en: {
    inspectTab: 'Inspect',
    newSessionPrompt: 'New QA / Inspection session title:',
    deleteSessionConfirm: 'Delete this session and all pins inside it?',
    newSessionTooltip: 'Create new session',
    deleteSessionTooltip: 'Delete current session',
    toggleDarkTooltip: 'Switch to Dark mode',
    toggleLightTooltip: 'Switch to Light mode',
    switchLangTooltip: 'Switch language (EN / VI)',
    tabPins: 'Pins',
    tabRefs: '@ref',
    tabExport: 'AI & Export',
    restrictedTabMsg:
      'Browser internal pages (chrome://) block extensions. Switch to any http/https webpage to launch the Inspector HUD.',
    searchPlaceholder: 'Search notes, URL, component...',
    filterAll: 'All types',
    filterBug: 'Bug',
    filterUiPolish: 'UI Polish',
    filterVisualTweak: 'VisBug Diff',
    filterA11y: 'A11y',
    filterCopy: 'Copy / Text',
    filterDesignDiff: 'Design Diff',
    emptyPinsTitle: 'No pins in this session yet',
    emptyPinsDesc:
      'Click Inspect (or press Alt+Z) on any webpage to pin bugs, measure redlines, tweak styles, or capture UI.',
    refsIntro:
      'Cross-tab UI Vault — inspect any website (Stripe, Linear, Apple...), save as @ref, and attach its DNA to prompts on your project tab.',
    emptyRefsTitle: '@ref Vault is empty',
    emptyRefsDesc:
      'Open any reference website, activate Inspect, and select "Save @ref" to extract clean DOM, CSS tokens & motion.',
    sessionAndIdeTitle: 'Session & IDE Settings',
    sessionNameLabel: 'Session / Report Name',
    openSourceIdeLabel: 'Open source in:',
    exportFilesTitle: 'Export Report',
    exportExcelBtn: 'Export Excel (.xlsx + Images)',
    exportExcelBusy: 'Generating .xlsx...',
    exportMdBtn: 'Save .md',
    exportZipBtn: 'Bundle .zip',
    exportZipBusy: 'Zipping...',
    aiCompilerTitle: 'AI Coding Prompt',
    copyPromptBtn: 'Copy Prompt',
    copySheetImgBtn: 'Copy Image',
    copySheetBusy: 'Rendering...',
    copiedPromptToast: 'Copied AI Prompt to clipboard',
    copiedImageToast: 'Copied annotated image to clipboard',
    copiedBothToast: 'Saved Pin & copied Prompt + Image',
    copiedSheetToast: 'Copied composite image sheet to clipboard',
    clipboardImgDenied: 'Clipboard image write was blocked by browser',
    exportedMdToast: 'Downloaded .md report',
    exportedZipToast: 'Downloaded .zip bundle (report.md + images)',
    exportedXlsxToast: 'Downloaded .xlsx report with embedded images',
    readyForExport: 'Ready for AI / QA',
    errorsAttached: 'Console/API issues',
    copyImgShort: 'Copy Image',
    copyAiShort: 'Copy Prompt',
    copyDnaShort: 'Copy DNA',
    openIdePrefix: 'Open',
    scrollToPinTooltip: 'Scroll to element on page',
    deleteItemTooltip: 'Delete item',
    notePlaceholder: 'Describe the bug or instruction for AI (e.g. Match padding to @ref)...',
    sourcePrefix: 'Source:',
    // HUD Strings
    toolInspect: 'Inspect Element',
    toolArea: 'Capture Area',
    toolGuides: 'Redline Guides',
    toolA11y: 'WCAG Contrast',
    toolSpacing: 'Box Spacing',
    toolFlex: 'Flex & Reorder',
    toolText: 'Live Text Edit',
    toolFreeze: 'Freeze & Motion',
    toolDiff: 'Overlay Diff',
    dragHudHint: 'Drag to move · Double-click to reset',
    openSidePanelTooltip: 'Open Workspace Panel',
    undoTooltip: 'Undo tweak (Cmd+Z)',
    resetTooltip: 'Reset all visual tweaks',
    closeHudTooltip: 'Close ZSpect HUD (Esc)',
    pinTabTitle: 'Pin',
    refTabTitle: 'Save @ref',
    attachRefLabel: 'Attach:',
    copyImgBtn: 'Copy Image',
    saveAndCopyBtn: 'Save & Copy',
    savePinBtn: 'Save Pin',
    savingBtn: 'Capturing...',
    saveRefDesc:
      'Extract clean DOM skeleton, resolved CSS tokens, Flex/Grid layout, pseudo-elements, and motion curves for cross-tab AI prompts.',
    saveRefBtn: 'Save to @ref Vault',
    extractingBtn: 'Extracting...',
    spacingHint: '↑↓←→ (+1px · Shift +4px · Alt shrink)',
    pinDiffBtn: 'Pin Diff',
    flexMoveHint: '←→ reorder siblings',
    domLocked: 'DOM Locked',
    lockTooltip: 'Lock Tooltip',
    motionLabel: 'Motion',
    captureBeforeBtn: 'Capture Before',
    uploadFigmaBtn: 'Load Mockup',
    clearOverlayBtn: 'Clear',
    pasteMockupHint: 'Or press Cmd/Ctrl+V to paste mockup',
    flightAttachedMsg: '30s Capsule:',
    consoleErrLabel: 'console',
    netErrLabel: 'API issues',
    diffRecordedMsg: 'Recorded',
    cssChangesLabel: 'CSS tweaks',
    textChangeLabel: '+ text edit',
    toastSavedPin: 'Saved Pin',
    toastSavedRef: 'Saved to @ref Vault:',
    toastFrozen: 'Froze ephemeral UI & animations',
    toastResetTweaks: 'Reset all visual tweaks',
    toastSelectFirst: 'Click an element first before locking :hover/:focus',
    toastSnapshotTaken: 'Captured Before snapshot',
    toastPastedOverlay: 'Pasted design overlay from clipboard',
    toastEditingText: 'Editing text live — click outside to record diff',
  },
  vi: {
    inspectTab: 'Soi trang',
    newSessionPrompt: 'Tên phiên kiểm thử / dự án mới:',
    deleteSessionConfirm: 'Xóa phiên này và toàn bộ ghim bên trong?',
    newSessionTooltip: 'Tạo phiên mới',
    deleteSessionTooltip: 'Xóa phiên hiện tại',
    toggleDarkTooltip: 'Chuyển sang giao diện Tối',
    toggleLightTooltip: 'Chuyển sang giao diện Sáng',
    switchLangTooltip: 'Đổi ngôn ngữ (EN / VI)',
    tabPins: 'Ghim',
    tabRefs: '@ref',
    tabExport: 'AI & Xuất',
    restrictedTabMsg:
      'Trang nội bộ trình duyệt (chrome://) chặn extension. Hãy mở trang web http/https bất kỳ để bật thanh Inspect.',
    searchPlaceholder: 'Tìm ghi chú, URL, Component...',
    filterAll: 'Tất cả',
    filterBug: 'Bug / Lỗi',
    filterUiPolish: 'UI Polish',
    filterVisualTweak: 'VisBug Diff',
    filterA11y: 'A11y',
    filterCopy: 'Nội dung',
    filterDesignDiff: 'Design Diff',
    emptyPinsTitle: 'Chưa có mục Bug / Feedback nào',
    emptyPinsDesc:
      'Nhấn Soi trang (hoặc phím tắt Alt+Z) trên bất kỳ website nào để chấm ghim lỗi, đo khoảng cách hoặc lưu mẫu UI.',
    refsIntro:
      'Kho mẫu giao diện xuyên tab — soi website bất kỳ (Stripe, Linear...), bấm Lưu @ref để gắn vào câu lệnh AI ở tab dự án.',
    emptyRefsTitle: 'Kho @ref đang trống',
    emptyRefsDesc:
      'Mở một trang web mẫu bất kỳ, bật Inspect rồi chọn tab "Lưu @ref" để trích xuất DOM, CSS Tokens & chuyển động.',
    sessionAndIdeTitle: 'Thiết lập Phiên & IDE',
    sessionNameLabel: 'Tên báo cáo / Phiên kiểm thử',
    openSourceIdeLabel: 'Mở mã nguồn bằng:',
    exportFilesTitle: 'Xuất Báo cáo',
    exportExcelBtn: 'Xuất Excel (.xlsx kèm ảnh)',
    exportExcelBusy: 'Đang tạo .xlsx...',
    exportMdBtn: 'Lưu .md',
    exportZipBtn: 'Gói .zip',
    exportZipBusy: 'Đang nén...',
    aiCompilerTitle: 'AI Coding Prompt',
    copyPromptBtn: 'Chép Prompt',
    copySheetImgBtn: 'Chép ảnh',
    copySheetBusy: 'Đang ghép ảnh...',
    copiedPromptToast: 'Đã chép AI Prompt vào Clipboard',
    copiedImageToast: 'Đã chép ảnh đánh dấu vào Clipboard',
    copiedBothToast: 'Đã lưu Ghim & chép Prompt + Ảnh',
    copiedSheetToast: 'Đã chép ảnh tổng hợp vào Clipboard',
    clipboardImgDenied: 'Trình duyệt chặn quyền ghi ảnh trực tiếp',
    exportedMdToast: 'Đã tải xuống báo cáo .md',
    exportedZipToast: 'Đã tải gói .zip (report.md + ảnh)',
    exportedXlsxToast: 'Đã tải file Excel .xlsx kèm ảnh nhúng',
    readyForExport: 'Sẵn sàng xuất AI / QA',
    errorsAttached: 'lỗi Console/API',
    copyImgShort: 'Chép ảnh',
    copyAiShort: 'Chép Prompt',
    copyDnaShort: 'Chép DNA',
    openIdePrefix: 'Mở',
    scrollToPinTooltip: 'Cuộn tới phần tử trên trang',
    deleteItemTooltip: 'Xóa mục này',
    notePlaceholder: 'Mô tả lỗi hoặc yêu cầu cho AI (VD: Căn padding giống @ref)...',
    sourcePrefix: 'Nguồn:',
    // HUD Strings
    toolInspect: 'Soi phần tử',
    toolArea: 'Khoanh vùng chụp',
    toolGuides: 'Thước đo khoảng cách',
    toolA11y: 'Độ tương phản WCAG',
    toolSpacing: 'Chỉnh Margin / Padding',
    toolFlex: 'Bố cục Flex & Đổi chỗ',
    toolText: 'Sửa thử văn bản',
    toolFreeze: 'Đóng băng & Motion',
    toolDiff: 'Phủ ảnh đối chiếu',
    dragHudHint: 'Kéo để di chuyển · Nhấp đúp để về giữa',
    openSidePanelTooltip: 'Mở bảng quản lý Side Panel',
    undoTooltip: 'Hoàn tác (Cmd+Z)',
    resetTooltip: 'Khôi phục mặc định',
    closeHudTooltip: 'Đóng ZSpect (Esc)',
    pinTabTitle: 'Ghim',
    refTabTitle: 'Lưu @ref',
    attachRefLabel: 'Mẫu:',
    copyImgBtn: 'Chép ảnh',
    saveAndCopyBtn: 'Lưu & Chép',
    savePinBtn: 'Lưu Ghim',
    savingBtn: 'Đang chụp...',
    saveRefDesc:
      'Trích xuất DOM sạch, CSS Tokens, bố cục Flex/Grid, pseudo-elements và chuyển động để dùng ở tab dự án.',
    saveRefBtn: 'Lưu vào @ref Vault',
    extractingBtn: 'Đang lưu...',
    spacingHint: '↑↓←→ (+1px · Shift +4px · Alt giảm)',
    pinDiffBtn: 'Ghim Diff',
    flexMoveHint: '←→ đổi chỗ',
    domLocked: 'Đã khóa DOM',
    lockTooltip: 'Khóa Tooltip',
    motionLabel: 'Motion',
    captureBeforeBtn: 'Chụp Before',
    uploadFigmaBtn: 'Ảnh Figma',
    clearOverlayBtn: 'Xóa',
    pasteMockupHint: 'Hoặc nhấn Cmd/Ctrl+V để dán ảnh',
    flightAttachedMsg: 'Hộp đen 30s:',
    consoleErrLabel: 'Console',
    netErrLabel: 'API lỗi',
    diffRecordedMsg: 'Đã ghi',
    cssChangesLabel: 'thay đổi CSS',
    textChangeLabel: '+ sửa chữ',
    toastSavedPin: 'Đã lưu Ghim',
    toastSavedRef: 'Đã lưu mẫu @ref:',
    toastFrozen: 'Đã đóng băng trạng thái & chuyển động',
    toastResetTweaks: 'Đã khôi phục toàn bộ chỉnh sửa',
    toastSelectFirst: 'Hãy click chọn phần tử trước khi khóa :hover/:focus',
    toastSnapshotTaken: 'Đã chụp ảnh Before',
    toastPastedOverlay: 'Đã dán ảnh đối chiếu từ Clipboard',
    toastEditingText: 'Đang sửa chữ trực tiếp — bấm ra ngoài để ghi Diff',
  },
} as const;

export type TranslationKeys = keyof (typeof DICTIONARY)['en'];

export function useZSpectI18n(): {
  locale: ZSpectLocale;
  t: (typeof DICTIONARY)[ZSpectLocale];
  toggleLocale: () => void;
  setLocale: (next: ZSpectLocale) => void;
} {
  // Default language is English ('en')
  const [locale, setLocaleState] = useState<ZSpectLocale>('en');

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local
        .get(LOCALE_STORAGE_KEY)
        .then((res) => {
          const saved = res[LOCALE_STORAGE_KEY];
          if (saved === 'en' || saved === 'vi') {
            setLocaleState(saved);
          }
        })
        .catch(() => {});

      const onStorageChanged = (
        changes: Record<string, chrome.storage.StorageChange>,
        area: string,
      ) => {
        if (area === 'local' && changes[LOCALE_STORAGE_KEY]) {
          const next = changes[LOCALE_STORAGE_KEY].newValue;
          if (next === 'en' || next === 'vi') {
            setLocaleState(next);
          }
        }
      };

      chrome.storage.onChanged.addListener(onStorageChanged);
      return () => chrome.storage.onChanged.removeListener(onStorageChanged);
    }
  }, []);

  const setLocale = (next: ZSpectLocale) => {
    setLocaleState(next);
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ [LOCALE_STORAGE_KEY]: next }).catch(() => {});
    }
  };

  const toggleLocale = () => {
    setLocale(locale === 'en' ? 'vi' : 'en');
  };

  return {
    locale,
    t: DICTIONARY[locale],
    toggleLocale,
    setLocale,
  };
}
