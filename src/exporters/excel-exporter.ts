import ExcelJS from 'exceljs';
import { binaryToArrayBuffer } from '@/exporters/binary-utils';
import type { PinRecord, ReferenceDNA, SessionRecord } from '@/types/zspect';

function formatVisualDiffSummary(pin: PinRecord, refMap: Map<string, ReferenceDNA>): string {
  const parts: string[] = [];
  if (pin.note) parts.push(pin.note);

  if (pin.selectedText) {
    parts.push(`[Văn bản chọn]: "${pin.selectedText}"`);
  }

  if (pin.visualDiff) {
    const diffLines: string[] = ['[VisBug Diff Before → After]:'];
    for (const sc of pin.visualDiff.styleChanges) {
      diffLines.push(`• ${sc.property}: ${sc.before} → ${sc.after}`);
    }
    if (pin.visualDiff.tailwindBefore || pin.visualDiff.tailwindAfter) {
      diffLines.push(
        `• Tailwind: ${pin.visualDiff.tailwindBefore || '(none)'} → ${pin.visualDiff.tailwindAfter || '(none)'}`,
      );
    }
    if (pin.visualDiff.textChange) {
      diffLines.push(`• Copy: "${pin.visualDiff.textChange.before}" → "${pin.visualDiff.textChange.after}"`);
    }
    parts.push(diffLines.join('\n'));
  }

  if (pin.attachedRefIds.length > 0) {
    const aliases = pin.attachedRefIds
      .map((id) => refMap.get(id)?.alias)
      .filter(Boolean)
      .map((a) => `@ref:${a} (${refMap.get(pin.attachedRefIds[0]!)?.sourceUrl ?? ''})`);
    if (aliases.length > 0) {
      parts.push(`[Tham chiếu UI]: ${aliases.join(', ')}`);
    }
  }

  return parts.join('\n\n') || '(Chưa nhập mô tả)';
}

function formatReproSteps(pin: PinRecord): string {
  const crumbs = pin.flightCapsule?.breadcrumbs ?? [];
  if (crumbs.length === 0) {
    return `1. Mở trang ${pin.pageUrl}\n2. Kiểm tra phần tử ${pin.selector}`;
  }
  return crumbs
    .map((b, idx) => `${idx + 1}. [${b.action.toUpperCase()}] ${b.targetLabel}`)
    .join('\n');
}

function formatDiagnosticsSummary(pin: PinRecord): string {
  const items: string[] = [];
  if (pin.a11yAudit && (pin.type === 'a11y' || pin.a11yAudit.issues.length > 0)) {
    items.push(
      `[A11y] Contrast ${pin.a11yAudit.contrastRatio}:1 (${pin.a11yAudit.wcagAA ? 'AA Pass' : 'AA FAIL'})`,
    );
    for (const iss of pin.a11yAudit.issues) items.push(`• ${iss}`);
  }
  if (pin.flightCapsule) {
    for (const err of pin.flightCapsule.consoleErrors.slice(0, 3)) {
      items.push(`[Console ${err.level}] ${err.message.slice(0, 120)}`);
    }
    for (const net of pin.flightCapsule.networkIssues.slice(0, 3)) {
      items.push(`[API ${net.status}] ${net.method} ${net.url} (${net.durationMs}ms)`);
    }
  }
  return items.join('\n') || 'Không ghi nhận lỗi runtime';
}

export async function exportExcelReport(options: {
  session: SessionRecord;
  pins: PinRecord[];
  references?: ReferenceDNA[];
}): Promise<Blob> {
  const { session, pins, references = [] } = options;
  const refMap = new Map(references.map((r) => [r.id, r]));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ZSpect Browser Extension';
  workbook.created = new Date();

  // =========================================================================
  // SHEET 1: Feedback & Bug List (Apple Gallery Light clean styling)
  // =========================================================================
  const sheet1 = workbook.addWorksheet('Feedback & Bug List', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet1.columns = [
    { header: 'Mã', key: 'code', width: 9 },
    { header: 'Phân loại', key: 'type', width: 15 },
    { header: 'Mức độ', key: 'severity', width: 13 },
    { header: 'Trạng thái', key: 'status', width: 14 },
    { header: 'Trang & Màn hình', key: 'page', width: 34 },
    { header: 'Component / Selector', key: 'target', width: 32 },
    { header: 'Nội dung Feedback & Đề xuất', key: 'feedback', width: 46 },
    { header: 'Các bước tái hiện', key: 'steps', width: 30 },
    { header: 'Console / API / A11y', key: 'diagnostics', width: 34 },
    { header: 'Ảnh minh họa', key: 'screenshot', width: 32 },
  ];

  // Style Header Row (#F5F5F7 Studio Mist fill, #1D1D1F Ink text, #D6D6D6 Hairline Silver border)
  const headerRow1 = sheet1.getRow(1);
  headerRow1.height = 28;
  headerRow1.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF1D1D1F' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF5F5F7' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FFD6D6D6' } },
      right: { style: 'thin', color: { argb: 'FFE6E6E8' } },
    };
  });

  sheet1.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: 10 },
  };

  // =========================================================================
  // SHEET 2: Technical Context (Deep Engineering Forensics)
  // =========================================================================
  const sheet2 = workbook.addWorksheet('Technical Context', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet2.columns = [
    { header: 'Mã', key: 'code', width: 9 },
    { header: 'Source File', key: 'source', width: 36 },
    { header: 'Tailwind Hint', key: 'tailwind', width: 36 },
    { header: 'Computed CSS', key: 'css', width: 42 },
    { header: 'Clean HTML', key: 'html', width: 48 },
    { header: 'Full Console & Network Logs', key: 'logs', width: 50 },
  ];

  const headerRow2 = sheet2.getRow(1);
  headerRow2.height = 26;
  headerRow2.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF1D1D1F' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F7' } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFD6D6D6' } } };
  });

  // Populate Rows
  for (let i = 0; i < pins.length; i++) {
    const pin = pins[i]!;
    const excelRowNumber = i + 2;

    const compLine = pin.frameworkMeta.componentName
      ? `<${pin.frameworkMeta.componentName}> (${pin.frameworkMeta.framework})`
      : '';
    const srcLine = pin.frameworkMeta.sourceLocation
      ? `${pin.frameworkMeta.sourceLocation.filePath}:${pin.frameworkMeta.sourceLocation.line}`
      : '';
    const targetCellText = [compLine, srcLine, pin.selector].filter(Boolean).join('\n');

    const row1 = sheet1.addRow({
      code: `#${pin.orderIndex}`,
      type: pin.type,
      severity: pin.severity.toUpperCase(),
      status: pin.status,
      page: `${pin.pageUrl}\n(${pin.viewport.width}×${pin.viewport.height} @${pin.viewport.dpr}x)`,
      target: targetCellText,
      feedback: formatVisualDiffSummary(pin, refMap),
      steps: formatReproSteps(pin),
      diagnostics: formatDiagnosticsSummary(pin),
      screenshot: pin.croppedImageBlob ? '' : '(Không có ảnh)',
    });

    const hasImage = Boolean(pin.croppedImageBlob);
    row1.height = hasImage ? 115 : 54;

    row1.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.font = { name: 'Arial', size: 10, color: { argb: 'FF1D1D1F' } };
      cell.alignment = { vertical: 'top', horizontal: colNumber === 1 ? 'center' : 'left', wrapText: true };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE6E6E8' } },
        right: { style: 'thin', color: { argb: 'FFE6E6E8' } },
      };

      if (colNumber === 1) {
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF0071E3' } };
      }
      if (colNumber === 3 && (pin.severity === 'critical' || pin.severity === 'high')) {
        // Launch Orange (#B64400) accent per DESIGN.md
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFB64400' } };
      }
    });

    if (pin.croppedImageBlob) {
      const imgBuffer = await binaryToArrayBuffer(pin.croppedImageBlob);
      if (imgBuffer.byteLength > 0) {
        const imageId = workbook.addImage({
          buffer: imgBuffer,
          extension: 'png',
        });

        sheet1.addImage(imageId, {
          tl: { col: 9.06, row: excelRowNumber - 0.92 },
          ext: { width: 210, height: 136 },
          editAs: 'oneCell',
        });
      }
    }

    // Populate Technical Sheet 2
    const fullLogs: string[] = [];
    if (pin.flightCapsule) {
      for (const c of pin.flightCapsule.consoleErrors) {
        fullLogs.push(`[${c.level.toUpperCase()}] ${c.message}${c.stack ? `\n${c.stack}` : ''}`);
      }
      for (const n of pin.flightCapsule.networkIssues) {
        fullLogs.push(
          `[${n.method} ${n.url}] -> ${n.status} (${n.durationMs}ms)${n.responseSnippet ? `\n${n.responseSnippet}` : ''}`,
        );
      }
    }

    const row2 = sheet2.addRow({
      code: `#${pin.orderIndex}`,
      source: srcLine || '(N/A)',
      tailwind: pin.tailwindHint || '(N/A)',
      css: Object.entries(pin.computedStyles)
        .map(([k, v]) => `${k}: ${v};`)
        .join('\n'),
      html: pin.cleanHtml,
      logs: fullLogs.join('\n\n') || '(None)',
    });
    row2.height = 68;
    row2.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: 'Menlo', size: 9, color: { argb: 'FF1D1D1F' } };
      cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE6E6E8' } } };
    });
  }

  // Add subtle metadata note in Sheet 1 footer
  const metaRow = sheet1.addRow([
    '',
    `Session: ${session.title}`,
    `Total: ${pins.length}`,
    '',
    `Generated by ZSpect`,
  ]);
  metaRow.font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF707070' } };

  const outBuffer = await workbook.xlsx.writeBuffer();
  return new Blob([outBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
