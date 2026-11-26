import { stylesToTailwindHint } from '@/core/style-dna';
import type { StyleChangeEntry, VisualTweakDiff } from '@/types/zspect';

interface ElementBaseline {
  inlineStyleMap: Record<string, string>;
  computedSnapshot: Record<string, string>;
  originalText: string;
  originalChildIndex: number;
}

interface HistoryCommand {
  el: HTMLElement;
  undo: () => void;
  redo: () => void;
}

const TRACKED_TWEAK_PROPS = [
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'display',
  'flex-direction',
  'justify-content',
  'align-items',
  'flex-wrap',
  'gap',
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
  'color',
  'background-color',
  'border-radius',
] as const;

export class VisBugTweakEngine {
  private baselines = new WeakMap<HTMLElement, ElementBaseline>();
  private touchedElements = new Set<HTMLElement>();
  private undoStack: HistoryCommand[] = [];
  private redoStack: HistoryCommand[] = [];

  private ensureBaseline(el: HTMLElement): ElementBaseline {
    let base = this.baselines.get(el);
    if (base) return base;

    const cs = window.getComputedStyle(el);
    const inlineStyleMap: Record<string, string> = {};
    const computedSnapshot: Record<string, string> = {};

    for (const prop of TRACKED_TWEAK_PROPS) {
      inlineStyleMap[prop] = el.style.getPropertyValue(prop);
      computedSnapshot[prop] = cs.getPropertyValue(prop).trim();
    }
    // Also store shorthand snapshots for Tailwind hint comparison
    computedSnapshot['padding'] = cs.getPropertyValue('padding').trim();
    computedSnapshot['margin'] = cs.getPropertyValue('margin').trim();

    const parent = el.parentElement;
    const originalChildIndex = parent ? Array.from(parent.children).indexOf(el) : -1;

    base = {
      inlineStyleMap,
      computedSnapshot,
      originalText: el.innerText ?? el.textContent ?? '',
      originalChildIndex,
    };

    this.baselines.set(el, base);
    this.touchedElements.add(el);
    return base;
  }

  setStyleProperty(el: HTMLElement, prop: string, nextValue: string): void {
    this.ensureBaseline(el);
    const prevInline = el.style.getPropertyValue(prop);
    if (prevInline === nextValue) return;

    const cmd: HistoryCommand = {
      el,
      undo: () => {
        if (prevInline) el.style.setProperty(prop, prevInline);
        else el.style.removeProperty(prop);
      },
      redo: () => {
        el.style.setProperty(prop, nextValue);
      },
    };

    cmd.redo();
    this.undoStack.push(cmd);
    this.redoStack = [];
  }

  nudgeBoxSpacing(
    elements: HTMLElement[],
    boxType: 'margin' | 'padding',
    side: 'top' | 'right' | 'bottom' | 'left',
    deltaPx: number,
  ): void {
    const prop = `${boxType}-${side}`;
    for (const el of elements) {
      this.ensureBaseline(el);
      const currentPx = parseFloat(window.getComputedStyle(el).getPropertyValue(prop)) || 0;
      const nextPx = boxType === 'padding' ? Math.max(0, currentPx + deltaPx) : currentPx + deltaPx;
      this.setStyleProperty(el, prop, `${Math.round(nextPx)}px`);
    }
  }

  updateFlexContainer(
    el: HTMLElement,
    patch: Partial<{
      direction: 'row' | 'column';
      justifyContent: string;
      alignItems: string;
      gap: string;
    }>,
  ): void {
    this.ensureBaseline(el);
    const currentDisplay = window.getComputedStyle(el).display;
    if (!currentDisplay.includes('flex') && !currentDisplay.includes('grid')) {
      this.setStyleProperty(el, 'display', 'flex');
    }
    if (patch.direction) this.setStyleProperty(el, 'flex-direction', patch.direction);
    if (patch.justifyContent) this.setStyleProperty(el, 'justify-content', patch.justifyContent);
    if (patch.alignItems) this.setStyleProperty(el, 'align-items', patch.alignItems);
    if (patch.gap !== undefined) this.setStyleProperty(el, 'gap', patch.gap);
  }

  moveElementAmongSiblings(el: HTMLElement, direction: -1 | 1): boolean {
    const parent = el.parentElement;
    if (!parent) return false;
    this.ensureBaseline(el);

    const siblings = Array.from(parent.children);
    const idx = siblings.indexOf(el);
    const targetIdx = idx + direction;
    if (idx < 0 || targetIdx < 0 || targetIdx >= siblings.length) return false;

    const refSibling = siblings[targetIdx]!;
    const cmd: HistoryCommand = {
      el,
      undo: () => {
        if (direction === -1) {
          parent.insertBefore(refSibling, el);
        } else {
          parent.insertBefore(el, refSibling);
        }
      },
      redo: () => {
        if (direction === -1) {
          parent.insertBefore(el, refSibling);
        } else {
          parent.insertBefore(refSibling, el);
        }
      },
    };

    cmd.redo();
    this.undoStack.push(cmd);
    this.redoStack = [];
    return true;
  }

  recordTextEdit(el: HTMLElement, previousText: string, nextText: string): void {
    if (previousText === nextText) return;
    this.ensureBaseline(el);
    const cmd: HistoryCommand = {
      el,
      undo: () => {
        el.textContent = previousText;
      },
      redo: () => {
        el.textContent = nextText;
      },
    };
    this.undoStack.push(cmd);
    this.redoStack = [];
  }

  undo(): boolean {
    const cmd = this.undoStack.pop();
    if (!cmd) return false;
    cmd.undo();
    this.redoStack.push(cmd);
    return true;
  }

  redo(): boolean {
    const cmd = this.redoStack.pop();
    if (!cmd) return false;
    cmd.redo();
    this.undoStack.push(cmd);
    return true;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  resetAll(): void {
    while (this.undoStack.length > 0) {
      this.undoStack.pop()?.undo();
    }
    this.redoStack = [];
  }

  extractDiff(el: HTMLElement): VisualTweakDiff | undefined {
    const base = this.baselines.get(el);
    if (!base) return undefined;

    const cs = window.getComputedStyle(el);
    const styleChanges: StyleChangeEntry[] = [];

    for (const prop of TRACKED_TWEAK_PROPS) {
      const before = base.computedSnapshot[prop] ?? '';
      const after = cs.getPropertyValue(prop).trim();
      if (before !== after) {
        styleChanges.push({ property: prop, before, after });
      }
    }

    const currentText = el.innerText ?? el.textContent ?? '';
    const textChange =
      base.originalText !== currentText
        ? { before: base.originalText.trim(), after: currentText.trim() }
        : undefined;

    const parent = el.parentElement;
    const currentIndex = parent ? Array.from(parent.children).indexOf(el) : -1;
    const domMoved =
      base.originalChildIndex >= 0 &&
      currentIndex >= 0 &&
      base.originalChildIndex !== currentIndex
        ? { fromIndex: base.originalChildIndex, toIndex: currentIndex }
        : undefined;

    if (styleChanges.length === 0 && !textChange && !domMoved) {
      return undefined;
    }

    const afterSnapshot: Record<string, string> = {
      ...Object.fromEntries(TRACKED_TWEAK_PROPS.map((p) => [p, cs.getPropertyValue(p).trim()])),
      padding: cs.getPropertyValue('padding').trim(),
      margin: cs.getPropertyValue('margin').trim(),
    };

    const tailwindBefore = stylesToTailwindHint(base.computedSnapshot);
    const tailwindAfter = stylesToTailwindHint(afterSnapshot);

    return {
      styleChanges,
      tailwindBefore: tailwindBefore !== tailwindAfter ? tailwindBefore : undefined,
      tailwindAfter: tailwindBefore !== tailwindAfter ? tailwindAfter : undefined,
      textChange,
      domMoved,
    };
  }
}
