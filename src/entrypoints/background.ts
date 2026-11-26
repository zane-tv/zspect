import { defineBackground } from 'wxt/sandbox';
import {
  addPin,
  ensureActiveSession,
  listPinsBySession,
  listReferences,
  saveReference,
} from '@/db/schema';
import type { CdpPseudoState, ZSpectRuntimeMessage } from '@/types/zspect';

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

export default defineBackground(() => {
  let lastCaptureTs = 0;
  let lastCachedScreenshot: { tabId: number; dataUrl: string; ts: number } | null = null;
  const attachedDebuggerTabs = new Set<number>();

  async function ensureOffscreenDocument(): Promise<void> {
    const offscreenUrl = chrome.runtime.getURL('offscreen.html');
    if ('getContexts' in chrome.runtime) {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
        documentUrls: [offscreenUrl],
      });
      if (contexts.length > 0) return;
    }

    try {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: [chrome.offscreen.Reason.BLOBS],
        justification: 'Crop and draw numbered pin markers onto captured tab screenshots.',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('Only a single offscreen')) {
        throw err;
      }
    }
  }

  async function captureTabThrottled(tabId: number, windowId: number): Promise<string> {
    const now = Date.now();
    if (
      lastCachedScreenshot &&
      lastCachedScreenshot.tabId === tabId &&
      now - lastCachedScreenshot.ts < 550
    ) {
      return lastCachedScreenshot.dataUrl;
    }

    const elapsed = now - lastCaptureTs;
    if (elapsed < 600) {
      await new Promise((r) => setTimeout(r, 600 - elapsed));
    }

    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
    lastCaptureTs = Date.now();
    lastCachedScreenshot = { tabId, dataUrl, ts: lastCaptureTs };
    return dataUrl;
  }

  async function cropRegionFromTab(
    tabId: number,
    windowId: number,
    rect: Extract<ZSpectRuntimeMessage, { type: 'ZSPECT_CAPTURE_REGION' }>['rect'],
    viewport: Extract<ZSpectRuntimeMessage, { type: 'ZSPECT_CAPTURE_REGION' }>['viewport'],
    badgeNumber?: number,
    accentColor?: string,
  ): Promise<string | undefined> {
    try {
      const rawDataUrl = await captureTabThrottled(tabId, windowId);
      await ensureOffscreenDocument();
      const cropped = (await chrome.runtime.sendMessage({
        type: 'ZSPECT_OFFSCREEN_CROP',
        dataUrl: rawDataUrl,
        rect,
        viewport,
        badgeNumber,
        accentColor,
      } satisfies ZSpectRuntimeMessage)) as { ok: boolean; dataUrl?: string };
      return cropped.ok ? cropped.dataUrl : undefined;
    } catch {
      return undefined;
    }
  }

  function isInjectableUrl(url?: string): boolean {
    if (!url) return false;
    return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://');
  }

  async function injectAndToggleHud(
    tab: chrome.tabs.Tab,
    initialAction: 'ZSPECT_TOGGLE_HUD' | 'ZSPECT_FREEZE_HOTKEY' = 'ZSPECT_TOGGLE_HUD',
  ): Promise<void> {
    if (!tab.id) return;

    if (!isInjectableUrl(tab.url)) {
      if (chrome.sidePanel?.open) {
        await chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
      }
      return;
    }

    try {
      const pong = await chrome.tabs.sendMessage(tab.id, { type: initialAction });
      if (pong?.handled) return;
    } catch {
      // Inject runtime scripts on first activation
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content-scripts/probe.js'],
      world: 'MAIN',
    });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content-scripts/hud.js'],
    });

    if (initialAction === 'ZSPECT_FREEZE_HOTKEY') {
      setTimeout(() => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, { type: 'ZSPECT_FREEZE_HOTKEY' }).catch(() => {});
        }
      }, 80);
    }
  }

  async function detachDebuggerSafe(tabId: number): Promise<void> {
    if (!attachedDebuggerTabs.has(tabId)) return;
    attachedDebuggerTabs.delete(tabId);
    try {
      await chrome.debugger.detach({ tabId });
    } catch {
      // Already detached
    }
  }

  async function setCdpPseudoState(
    tabId: number,
    selector: string,
    states: CdpPseudoState[],
    enable: boolean,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!enable || states.length === 0) {
      await detachDebuggerSafe(tabId);
      return { ok: true };
    }

    const hasPerm = await chrome.permissions.contains({ permissions: ['debugger'] });
    if (!hasPerm) {
      const granted = await chrome.permissions.request({ permissions: ['debugger'] });
      if (!granted) {
        return { ok: false, error: 'Chưa cấp quyền tùy chọn debugger' };
      }
    }

    try {
      if (!attachedDebuggerTabs.has(tabId)) {
        await chrome.debugger.attach({ tabId }, '1.3');
        attachedDebuggerTabs.add(tabId);
      }

      await chrome.debugger.sendCommand({ tabId }, 'DOM.enable');
      await chrome.debugger.sendCommand({ tabId }, 'CSS.enable');
      const doc = (await chrome.debugger.sendCommand({ tabId }, 'DOM.getDocument')) as {
        root: { nodeId: number };
      };
      const found = (await chrome.debugger.sendCommand({ tabId }, 'DOM.querySelector', {
        nodeId: doc.root.nodeId,
        selector,
      })) as { nodeId?: number };

      if (!found?.nodeId) {
        return { ok: false, error: 'Không tìm thấy DOM node qua CDP selector' };
      }

      await chrome.debugger.sendCommand({ tabId }, 'CSS.forcePseudoState', {
        nodeId: found.nodeId,
        forcedPseudoClasses: states,
      });

      return { ok: true };
    } catch (err) {
      await detachDebuggerSafe(tabId);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  chrome.action.onClicked.addListener((tab) => {
    void injectAndToggleHud(tab, 'ZSPECT_TOGGLE_HUD');
  });

  chrome.commands.onCommand.addListener(async (command) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    if (command === 'toggle-zspect') {
      await injectAndToggleHud(tab, 'ZSPECT_TOGGLE_HUD');
    } else if (command === 'freeze-state') {
      await injectAndToggleHud(tab, 'ZSPECT_FREEZE_HOTKEY');
    }
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    void detachDebuggerSafe(tabId);
  });

  chrome.debugger?.onDetach?.addListener((source) => {
    if (source.tabId) attachedDebuggerTabs.delete(source.tabId);
  });

  chrome.runtime.onMessage.addListener((message: ZSpectRuntimeMessage, sender, sendResponse) => {
    const tabId = sender.tab?.id;
    const windowId = sender.tab?.windowId ?? chrome.windows.WINDOW_ID_CURRENT;

    if (message.type === 'ZSPECT_OPEN_SIDEPANEL') {
      if (tabId && chrome.sidePanel?.open) {
        chrome.sidePanel
          .open({ tabId })
          .then(() => sendResponse({ ok: true }))
          .catch((err) => sendResponse({ ok: false, error: String(err) }));
        return true;
      }
      sendResponse({ ok: false, error: 'SidePanel API unavailable' });
      return false;
    }

    if (message.type === 'ZSPECT_GET_HUD_STATE') {
      (async () => {
        const session = await ensureActiveSession();
        const allPins = await listPinsBySession(session.id);
        const pagePins = allPins
          .filter((p) => p.pageUrl === message.pageUrl)
          .map((p) => ({
            id: p.id,
            orderIndex: p.orderIndex,
            selector: p.selector,
            note: p.note,
            type: p.type,
            severity: p.severity,
            boundingBox: p.boundingBox,
          }));
        const refs = (await listReferences()).map((r) => ({
          id: r.id,
          alias: r.alias,
          sourceUrl: r.sourceUrl,
          tailwindHint: r.tailwindHint,
        }));
        sendResponse({
          ok: true,
          session,
          totalPinsCount: allPins.length,
          pagePins,
          references: refs,
        });
      })().catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }

    if (message.type === 'ZSPECT_CREATE_PIN_FROM_HUD') {
      (async () => {
        const session = await ensureActiveSession();
        const existingPins = await listPinsBySession(session.id);
        const nextBadge = existingPins.length + 1;

        let croppedImageBlob: Blob | undefined;
        let croppedDataUrl: string | undefined;
        if (tabId) {
          croppedDataUrl = await cropRegionFromTab(
            tabId,
            windowId,
            message.captureRect,
            message.pinDraft.viewport,
            nextBadge,
            message.accentColor,
          );
          if (croppedDataUrl) {
            croppedImageBlob = await dataUrlToBlob(croppedDataUrl);
          }
        }

        const saved = await addPin({
          ...message.pinDraft,
          sessionId: session.id,
          croppedImageBlob,
        });

        sendResponse({
          ok: true,
          pin: {
            id: saved.id,
            orderIndex: saved.orderIndex,
            selector: saved.selector,
            note: saved.note,
            type: saved.type,
            severity: saved.severity,
            boundingBox: saved.boundingBox,
          },
          croppedDataUrl,
          totalPinsCount: existingPins.length + 1,
        });
      })().catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }

    if (message.type === 'ZSPECT_CREATE_REF_FROM_HUD') {
      (async () => {
        let previewBlob: Blob | undefined;
        if (tabId) {
          const croppedUrl = await cropRegionFromTab(
            tabId,
            windowId,
            message.captureRect,
            {
              width: sender.tab?.width || 1280,
              height: sender.tab?.height || 800,
              dpr: 2,
            },
            undefined,
            '#1d1d1f',
          );
          if (croppedUrl) {
            previewBlob = await dataUrlToBlob(croppedUrl);
          }
        }

        const savedRef = await saveReference({
          ...message.refDraft,
          previewBlob,
        });

        sendResponse({
          ok: true,
          reference: {
            id: savedRef.id,
            alias: savedRef.alias,
            sourceUrl: savedRef.sourceUrl,
            tailwindHint: savedRef.tailwindHint,
          },
        });
      })().catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }

    if (message.type === 'ZSPECT_CAPTURE_FULL_VIEWPORT') {
      if (!tabId) {
        sendResponse({ ok: false, error: 'Missing sender tabId' });
        return false;
      }
      captureTabThrottled(tabId, windowId)
        .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
        .catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }

    if (message.type === 'ZSPECT_CAPTURE_REGION') {
      if (!tabId) {
        sendResponse({ ok: false, error: 'Missing sender tabId' });
        return false;
      }
      cropRegionFromTab(
        tabId,
        windowId,
        message.rect,
        message.viewport,
        message.badgeNumber,
        message.accentColor,
      )
        .then((dataUrl) => sendResponse({ ok: Boolean(dataUrl), dataUrl }))
        .catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }

    if (message.type === 'ZSPECT_CDP_FORCE_PSEUDO') {
      if (!tabId) {
        sendResponse({ ok: false, error: 'Missing sender tabId' });
        return false;
      }
      setCdpPseudoState(tabId, message.selector, message.states, message.enable)
        .then((res) => sendResponse(res))
        .catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }

    return false;
  });
});
