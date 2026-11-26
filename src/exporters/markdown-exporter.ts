import { strToU8, zipSync } from 'fflate';
import { compileSinglePinSection } from '@/core/prompt-compiler';
import { binaryToArrayBuffer } from '@/exporters/binary-utils';
import type { PinRecord, ReferenceDNA, SessionRecord } from '@/types/zspect';

export function slugifyFilename(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'zspect-report'
  );
}

export function generateMarkdownReport(options: {
  session: SessionRecord;
  pins: PinRecord[];
  references?: ReferenceDNA[];
  includeRelativeImages?: boolean;
}): string {
  const { session, pins, references = [], includeRelativeImages = false } = options;
  const lines: string[] = [];

  const createdDate = new Date(session.updatedAt).toISOString().replace('T', ' ').slice(0, 19);
  lines.push(`# ${session.title}`);
  lines.push('');
  lines.push(`> Báo cáo được xuất từ **ZSpect** vào \`${createdDate} UTC\` · Tổng số mục: **${pins.length}**`);
  lines.push('');

  // Summary table
  lines.push('## Tổng quan danh sách Bug & Feedback');
  lines.push('');
  lines.push('| Mã | Phân loại | Mức độ | Trạng thái | Trang (URL) | Component / Selector | Tóm tắt |');
  lines.push('|---|---|---|---|---|---|---|');

  for (const pin of pins) {
    const compOrSel = pin.frameworkMeta.componentName
      ? `<${pin.frameworkMeta.componentName}>`
      : pin.selector.slice(0, 38);
    const shortNote = (pin.note || '(Chưa nhập mô tả)').replace(/\|/g, '\\|').replace(/\n+/g, ' ').slice(0, 70);
    lines.push(
      `| **#${pin.orderIndex}** | \`${pin.type}\` | **${pin.severity.toUpperCase()}** | ${pin.status} | ${pin.pageUrl} | \`${compOrSel.replace(/\|/g, '\\|')}\` | ${shortNote} |`,
    );
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Chi tiết từng mục');
  lines.push('');

  for (const pin of pins) {
    lines.push(compileSinglePinSection(pin, 'forensic'));
    if (includeRelativeImages && pin.croppedImageBlob) {
      const padded = String(pin.orderIndex).padStart(2, '0');
      lines.push('');
      lines.push(`![Pin #${pin.orderIndex}](screenshots/pin-${padded}.png)`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  const usedRefIds = new Set(pins.flatMap((p) => p.attachedRefIds));
  const attachedRefs = references.filter(
    (r) => usedRefIds.has(r.id) || pins.some((p) => p.note.includes(`@ref:${r.alias}`)),
  );

  if (attachedRefs.length > 0) {
    lines.push('## Mẫu giao diện tham chiếu (`@ref` Vault)');
    lines.push('');
    for (const ref of attachedRefs) {
      lines.push(`### @ref:${ref.alias}`);
      lines.push(`- **Nguồn:** ${ref.sourceUrl}`);
      if (ref.tailwindHint) lines.push(`- **Tailwind Hint:** \`${ref.tailwindHint}\``);
      if (includeRelativeImages && ref.previewBlob) {
        lines.push(`- **Ảnh mẫu:** ![${ref.alias}](references/ref-${ref.alias}.png)`);
      }
      if (ref.domSkeleton) {
        lines.push('');
        lines.push('```html\n' + ref.domSkeleton + '\n```');
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

export async function exportMarkdownZipBundle(options: {
  session: SessionRecord;
  pins: PinRecord[];
  references?: ReferenceDNA[];
}): Promise<Blob> {
  const { session, pins, references = [] } = options;
  const files: Record<string, Uint8Array> = {};

  const markdown = generateMarkdownReport({
    session,
    pins,
    references,
    includeRelativeImages: true,
  });
  files['report.md'] = strToU8(markdown);

  for (const pin of pins) {
    if (pin.croppedImageBlob) {
      const padded = String(pin.orderIndex).padStart(2, '0');
      const buf = await binaryToArrayBuffer(pin.croppedImageBlob);
      files[`screenshots/pin-${padded}.png`] = new Uint8Array(buf);
    }
  }

  const usedRefIds = new Set(pins.flatMap((p) => p.attachedRefIds));
  for (const ref of references) {
    if (ref.previewBlob && (usedRefIds.has(ref.id) || pins.some((p) => p.note.includes(`@ref:${ref.alias}`)))) {
      const buf = await binaryToArrayBuffer(ref.previewBlob);
      files[`references/ref-${ref.alias}.png`] = new Uint8Array(buf);
    }
  }

  const zipped = zipSync(files, { level: 6 });
  return new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' });
}
