# ZSpect — Kế hoạch Triển khai Chi tiết (Implementation Plan)

- **Đặc tả gốc:** [2026-11-26-zspect-extension-design.md](../specs/2026-11-26-zspect-extension-design.md)
- **Hệ thống giao diện:** [DESIGN.md](../../../DESIGN.md) (Apple Gallery Light — Tailwind CSS v4 + Preact + `@preact/signals`)

---

## Giai đoạn 1: Khởi tạo Nền tảng Dự án (`WXT` + `Preact` + `Tailwind v4`)
- Thiết lập `package.json`, `tsconfig.json`, `wxt.config.ts`, `vitest.config.ts`, `.gitignore`.
- Đồng bộ bộ icon từ `assets/brand/icons/` sang `public/icon/` (`16.png`, `32.png`, `48.png`, `128.png`).
- Khai báo `src/styles/design-tokens.css` chứa đầy đủ `@theme` từ `DESIGN.md` (Gallery White `#ffffff`, Studio Mist `#f5f5f7`, Paper Frost `#fafafc`, Hairline Silver `#d6d6d6`, Ink `#1d1d1f`, Pricing Blue `#0071e3`, Apple Blue `#0066cc`, Launch Orange `#b64400`, font SF Pro scale & negative tracking).

## Giai đoạn 2: Core Engines & Tầng Lưu trữ (`Dexie IndexedDB`)
- `src/types/zspect.ts`: Toàn bộ kiểu dữ liệu `SessionRecord`, `PinRecord`, `ReferenceDNA`, `FlightCapsule`, `FrameworkMeta`, `VisualTweakDiff`, `A11yAuditSnapshot`, và giao thức bản tin RPC.
- `src/db/schema.ts`: Cơ sở dữ liệu `Dexie` (`sessions`, `pins`, `references`) kèm hàm khởi tạo phiên mặc định, thêm/sửa/xóa/sắp xếp ghim và quản lý kho `@ref`.
- `src/core/redactor/`: Bộ lọc bảo mật che `[REDACTED]` cho headers, query string, JSON payload nhạy cảm.
- `src/core/dom-cleaner/`: Rút gọn HTML/SVG lớn, tạo selector bền vững, xuyên qua `open ShadowRoot`.
- `src/core/style-dna/`: Trích xuất biến CSS thực tế, bố cục Flex/Grid, `::before`/`::after`, `@keyframes`/`cubic-bezier` và trình dịch ngược CSS sang gợi ý class Tailwind v4.
- `src/core/visbug-tools/`:
  - `guides.ts`: Tính toán đường gióng và khoảng cách pixel 4 phía giữa hai hộp (`AnchorRect` vs `TargetRect`).
  - `a11y-inspector.ts`: Tính độ tương phản tương đối theo chuẩn WCAG 2.1 (hỗ trợ pha trộn alpha qua nhiều lớp cha), kiểm tra AA/AAA, `role`/`aria-*`/`alt` và vùng chạm `44×44px`.
  - `tweak-engine.ts`: Quản lý chỉnh sửa trực tiếp Margin, Padding, Flexbox/Grid, Thứ tự DOM, Văn bản/Typography kèm ngăn xếp `Undo/Redo/Reset` và xuất `VisualTweakDiff` (`Before -> After`).
- `src/core/prompt-compiler/`: Đếm token ước tính và biên dịch Prompt ở 3 chế độ (`Compact`, `Standard`, `Forensic`) kèm nhúng mẫu `@ref` và IDE URI (`cursor://`, `vscode://`).

## Giai đoạn 3: `MAIN` World Micro-Probe & Hộp đen 30s
- `src/entrypoints/probe.content.ts` (`world: 'MAIN'`, tiêm theo nhu cầu):
  - Bắt tay qua `MessageChannel` riêng + khóa `nonce` một lần.
  - Dò cây Component và tọa độ mã nguồn (`_debugSource`/sourcemap) cho React 16–19, Vue 3, Svelte, Astro.
  - Vòng đệm 30 giây (`RingBuffer` 50 mục): ghi nhận User Breadcrumbs, `console.error`/`warn`/`unhandledrejection`, và `fetch`/`XHR` lỗi hoặc chậm `>= 1500ms` (đã qua `redactor`).
  - Điều khiển `document.getAnimations()` (tạm dừng, tiếp tục, tua đến `progress 0..100%` và trích xuất thông số animation).

## Giai đoạn 4: Background Worker, Chụp ảnh GPU & CDP Deep Lock
- `src/entrypoints/background.ts` + `src/entrypoints/offscreen/`:
  - Lắng nghe lệnh bật/tắt ZSpect (`Alt+Z` hoặc click biểu tượng extension) để tiêm `probe` + `hud` và mở nhanh Side Panel.
  - Điều tiết chụp màn hình `chrome.tabs.captureVisibleTab` (throttle `600ms`), gửi sang `OffscreenCanvas` cắt ảnh vùng chọn sắc nét và vẽ khung + huy hiệu số `#1, #2`.
  - Quản lý quyền tùy chọn `debugger`: gắn/gỡ `CSS.forcePseudoState` (`:hover`, `:focus`, `:active`, `:focus-within`) an toàn, tự động gỡ ngay khi tắt chế độ khóa.

## Giai đoạn 5: In-Page Floating HUD (`Closed Shadow DOM`)
- `src/entrypoints/hud.content/`:
  - Thanh điều khiển viên thuốc kính mờ `Paper Frost` (`#fafafc` + `blur(20px)`, bo `36px`, viền `1px #d6d6d6`) có thể kéo vị trí gọn gàng.
  - 6 chế độ trực quan: `Inspect / Pin` (đơn, đa phần tử `Cmd/Shift+Click`, bôi đen văn bản), `Area Capture`, `VisBug Tools` (`G` Guides, `A` A11y, `M/P` Spacing, `F` Flex, `T` Text Edit + `Cmd+Z` Undo), `Freeze & Motion Scrubber` (`Alt+Shift+F` + CDP `:hover` toggle + thanh tua `0–100%`), `Design Overlay Diff` (dán ảnh Figma / chụp Before Snapshot với Onion-Skin & Split Wipe), và nút mở `Side Panel`.
  - Khung nhập nhanh Pin Popover: chọn loại (`Bug`, `UI Polish`, `Copy`, `A11y`, `Visual Tweak`, `Design Diff`), mức độ ưu tiên, gắn mẫu `@ref`, Lưu Ghim, Lưu vào `@ref` Vault, hoặc Copy nhanh cho AI.

## Giai đoạn 6: Side Panel Workspace & Xuất Báo cáo `.md` / `.xlsx`
- `src/entrypoints/sidepanel/`:
  - Giao diện chuẩn `DESIGN.md` (`#f5f5f7` Studio Mist + thẻ `#ffffff` Gallery White bo góc `20px–28px`, nút `#0071e3` Pricing Blue).
  - Quản lý nhiều Session kiểm thử xuyên trang, lọc theo loại/mức độ/trạng thái, xem chi tiết ảnh chụp, mở nhanh file nguồn trong Cursor/VS Code (`cursor://`, `vscode://`).
  - Tab `@ref Vault`: Xem trước ảnh mẫu, xem CSS/Tailwind DNA, đổi bí danh `@ref:<alias>`, sao chép nhanh DNA.
  - Tab `AI & Export`: Chọn chế độ nén token (`Compact` / `Standard` / `Forensic`), Dual-Copy (Prompt + Ảnh tổng hợp), xuất **`.md`**, gói **`.zip` (`report.md` + `screenshots/`)**, và bảng tính **`.xlsx` 2 Sheets có nhúng ảnh trực tiếp vào ô Excel** (`src/exporters/markdown-exporter.ts`, `src/exporters/excel-exporter.ts`).

## Giai đoạn 7: Kiểm thử Tự động & Xác minh Bản Build
- Chạy bộ Unit Tests với `Vitest` kiểm chứng toàn bộ thuật toán lõi và đọc ngược file `.xlsx` xuất ra bằng `ExcelJS`.
- Build bản sản phẩm hoàn chỉnh (`wxt build`) cho Chrome/Chromium Manifest V3, kiểm tra cấu trúc `manifest.json`, dung lượng bundle và chạy kiểm thử tích hợp xác nhận hoạt động trơn tru.
