# Privacy Policy for ZSpect

**Last Updated:** November 26, 2026  
**Developer:** Zane (`@zane-tv` · [zanedev.pro](https://zanedev.pro))  
**Contact:** [tientv.63.work@gmail.com](mailto:tientv.63.work@gmail.com)

## 1. Overview

**ZSpect** ("the Extension") is a client-side developer and QA browser extension for inspecting user interfaces, auditing accessibility contrast, saving UI design references, and exporting bug/feedback reports.

ZSpect is designed with a strict **100% local-first, zero-telemetry architecture**. We do **not** collect, transmit, store on external servers, sell, or share any personal data, browsing history, or website content.

## 2. Data Collection & Storage

- **No External Data Transmission:** ZSpect makes zero network requests to any developer-owned, analytics, or third-party server.
- **Local-Only Storage:**
  - User interface preferences (`theme`, `locale`, and active session ID) are stored locally in your browser via `chrome.storage.local`.
  - Captured pins, annotated element screenshots, DOM/CSS metadata, and `@ref` UI blueprints created by you are stored exclusively inside your local browser's `IndexedDB` (`ZSpectDB`).
- **User-Controlled Exports:** Data leaves your browser only when you explicitly copy a prompt/image to your clipboard or download an export file (`.xlsx`, `.zip`, or `.md`) to your own device.

## 3. Automatic Secret Redaction

When capturing page diagnostics (such as failed API calls or DOM snippets) during an active inspection session, ZSpect automatically scrubs sensitive values—including `Authorization` headers, `Bearer` tokens, JWTs, API keys, cookies, sensitive URL query parameters, and `input[type="password"]` fields—replacing them with `[REDACTED]` before storing them in local `IndexedDB`.

## 4. Permissions Usage

- **`activeTab` & `scripting`:** Used only when you activate ZSpect (via toolbar click, `Alt+Z`, or the Side Panel) to mount the inspector HUD on the current tab.
- **`host_permissions` (`<all_urls>`):** Enables inspecting and capturing annotated region screenshots across `localhost`, staging environments, production apps, and reference websites on any domain.
- **`sidePanel`:** Provides the docked ZSpect Workspace panel for managing multi-page QA sessions and exports.
- **`offscreen`:** Crops high-DPI element screenshots and renders numbered pin markers locally in memory using `OffscreenCanvas`.
- **`clipboardWrite`:** Copies annotated PNG screenshots or Markdown prompts to your clipboard only when you click a Copy button.
- **`storage`:** Saves your theme and language settings locally.
- **`debugger` (Optional):** Requested at runtime only if you explicitly toggle the `:hover` / `:focus` / `:active` pseudo-class lock inside the Freeze tool.

## 5. Changes & Contact

Any updates to this Privacy Policy will be published in the official repository at [https://github.com/zane-tv/zspect](https://github.com/zane-tv/zspect). For questions, contact **Zane** at [tientv.63.work@gmail.com](mailto:tientv.63.work@gmail.com).
