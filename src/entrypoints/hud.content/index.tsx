import { defineContentScript } from 'wxt/sandbox';
import { render } from 'preact';
import hudCss from '@/styles/design-tokens.css?inline';
import { ZSPECT_HOST_ATTR } from '@/core/dom-cleaner';
import { HudApp, triggerExternalHudAction } from './HudApp';
import type { ZSpectRuntimeMessage } from '@/types/zspect';

declare global {
  interface Window {
    __ZSPECT_HUD_MOUNTED__?: boolean;
  }
}

export default defineContentScript({
  matches: ['<all_urls>'],
  registration: 'runtime',
  cssInjectionMode: 'manual',
  main() {
    if (window.__ZSPECT_HUD_MOUNTED__) return;
    window.__ZSPECT_HUD_MOUNTED__ = true;

    const host = document.createElement('div');
    host.setAttribute(ZSPECT_HOST_ATTR, 'true');
    Object.assign(host.style, {
      position: 'fixed',
      inset: '0',
      width: '0',
      height: '0',
      zIndex: '2147483647',
      pointerEvents: 'none',
    });
    document.documentElement.appendChild(host);

    const shadow = host.attachShadow({ mode: 'closed' });
    const styleEl = document.createElement('style');
    styleEl.textContent = hudCss;
    shadow.appendChild(styleEl);

    const appContainer = document.createElement('div');
    shadow.appendChild(appContainer);

    render(<HudApp />, appContainer);

    chrome.runtime.onMessage.addListener((msg: ZSpectRuntimeMessage, _sender, sendResponse) => {
      if (msg.type === 'ZSPECT_TOGGLE_HUD') {
        triggerExternalHudAction('toggle');
        sendResponse({ handled: true });
        return false;
      }
      if (msg.type === 'ZSPECT_FREEZE_HOTKEY') {
        triggerExternalHudAction('freeze');
        sendResponse({ handled: true });
        return false;
      }
      if (msg.type === 'ZSPECT_SCROLL_TO_PIN') {
        triggerExternalHudAction('scroll-to', msg);
        sendResponse({ handled: true });
        return false;
      }
      if (msg.type === 'ZSPECT_DB_UPDATED') {
        triggerExternalHudAction('refresh-db');
        return false;
      }
      return false;
    });
  },
});
