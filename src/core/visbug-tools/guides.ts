import type { BoundingBox } from '@/types/zspect';

export interface DistanceLine {
  orientation: 'horizontal' | 'vertical';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  distancePx: number;
  label: string;
}

export interface AlignmentGuide {
  orientation: 'horizontal' | 'vertical';
  pos: number;
}

export interface RedlineMeasurement {
  anchor: BoundingBox;
  target: BoundingBox;
  lines: DistanceLine[];
  alignments: AlignmentGuide[];
}

function rectsOverlap1D(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return Math.max(aStart, bStart) < Math.min(aEnd, bEnd);
}

export function computeRedlineGuides(anchor: BoundingBox, target: BoundingBox): RedlineMeasurement {
  const lines: DistanceLine[] = [];
  const alignments: AlignmentGuide[] = [];

  const aLeft = anchor.x;
  const aRight = anchor.x + anchor.width;
  const aTop = anchor.y;
  const aBottom = anchor.y + anchor.height;
  const aMidX = anchor.x + anchor.width / 2;
  const aMidY = anchor.y + anchor.height / 2;

  const tLeft = target.x;
  const tRight = target.x + target.width;
  const tTop = target.y;
  const tBottom = target.y + target.height;
  const tMidX = target.x + target.width / 2;
  const tMidY = target.y + target.height / 2;

  const containsTarget =
    aLeft <= tLeft && aRight >= tRight && aTop <= tTop && aBottom >= tBottom;
  const containsAnchor =
    tLeft <= aLeft && tRight >= aRight && tTop <= aTop && tBottom >= aBottom;

  if (containsTarget || containsAnchor) {
    const outer = containsTarget ? anchor : target;
    const inner = containsTarget ? target : anchor;

    const topGap = Math.round(inner.y - outer.y);
    const bottomGap = Math.round(outer.y + outer.height - (inner.y + inner.height));
    const leftGap = Math.round(inner.x - outer.x);
    const rightGap = Math.round(outer.x + outer.width - (inner.x + inner.width));
    const cx = inner.x + inner.width / 2;
    const cy = inner.y + inner.height / 2;

    if (topGap > 0) {
      lines.push({ orientation: 'vertical', x1: cx, y1: outer.y, x2: cx, y2: inner.y, distancePx: topGap, label: `${topGap}px` });
    }
    if (bottomGap > 0) {
      lines.push({
        orientation: 'vertical',
        x1: cx,
        y1: inner.y + inner.height,
        x2: cx,
        y2: outer.y + outer.height,
        distancePx: bottomGap,
        label: `${bottomGap}px`,
      });
    }
    if (leftGap > 0) {
      lines.push({ orientation: 'horizontal', x1: outer.x, y1: cy, x2: inner.x, y2: cy, distancePx: leftGap, label: `${leftGap}px` });
    }
    if (rightGap > 0) {
      lines.push({
        orientation: 'horizontal',
        x1: inner.x + inner.width,
        y1: cy,
        x2: outer.x + outer.width,
        y2: cy,
        distancePx: rightGap,
        label: `${rightGap}px`,
      });
    }
  } else {
    // Horizontal gap between anchor and target
    if (tLeft >= aRight) {
      const dist = Math.round(tLeft - aRight);
      const y = rectsOverlap1D(aTop, aBottom, tTop, tBottom)
        ? (Math.max(aTop, tTop) + Math.min(aBottom, tBottom)) / 2
        : aMidY;
      lines.push({ orientation: 'horizontal', x1: aRight, y1: y, x2: tLeft, y2: y, distancePx: dist, label: `${dist}px` });
    } else if (aLeft >= tRight) {
      const dist = Math.round(aLeft - tRight);
      const y = rectsOverlap1D(aTop, aBottom, tTop, tBottom)
        ? (Math.max(aTop, tTop) + Math.min(aBottom, tBottom)) / 2
        : aMidY;
      lines.push({ orientation: 'horizontal', x1: tRight, y1: y, x2: aLeft, y2: y, distancePx: dist, label: `${dist}px` });
    }

    // Vertical gap between anchor and target
    if (tTop >= aBottom) {
      const dist = Math.round(tTop - aBottom);
      const x = rectsOverlap1D(aLeft, aRight, tLeft, tRight)
        ? (Math.max(aLeft, tLeft) + Math.min(aRight, tRight)) / 2
        : aMidX;
      lines.push({ orientation: 'vertical', x1: x, y1: aBottom, x2: x, y2: tTop, distancePx: dist, label: `${dist}px` });
    } else if (aTop >= tBottom) {
      const dist = Math.round(aTop - tBottom);
      const x = rectsOverlap1D(aLeft, aRight, tLeft, tRight)
        ? (Math.max(aLeft, tLeft) + Math.min(aRight, tRight)) / 2
        : aMidX;
      lines.push({ orientation: 'vertical', x1: x, y1: tBottom, x2: x, y2: aTop, distancePx: dist, label: `${dist}px` });
    }
  }

  // Alignment snap hairlines (within 1px tolerance)
  const checkAlign = (a: number, b: number, orientation: 'horizontal' | 'vertical') => {
    if (Math.abs(a - b) <= 1) {
      alignments.push({ orientation, pos: Math.round(a) });
    }
  };

  checkAlign(aLeft, tLeft, 'vertical');
  checkAlign(aRight, tRight, 'vertical');
  checkAlign(aMidX, tMidX, 'vertical');
  checkAlign(aTop, tTop, 'horizontal');
  checkAlign(aBottom, tBottom, 'horizontal');
  checkAlign(aMidY, tMidY, 'horizontal');

  return { anchor, target, lines, alignments };
}
