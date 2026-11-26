import 'fake-indexeddb/auto';
import ExcelJS from 'exceljs';
import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  addPin,
  clearPinsBySession,
  createSession,
  deletePin,
  listPinsBySession,
  listReferences,
  saveReference,
} from '@/db/schema';
import { exportExcelReport } from '@/exporters/excel-exporter';
import {
  exportMarkdownZipBundle,
  generateMarkdownReport,
} from '@/exporters/markdown-exporter';

// Minimal valid 1x1 transparent PNG bytes
const TINY_PNG_BYTES = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
);

describe('ZSpect IndexedDB + Markdown (.md / .zip) + Excel (.xlsx) Exporters', () => {
  it('persists multi-page sessions, @ref vault & blobs, and exports valid .md, .zip, and 2-sheet .xlsx with embedded images', async () => {
    const session = await createSession('Checkout Multi-Page QA');

    const ref = await saveReference({
      alias: 'Stripe Pay Card',
      sourceUrl: 'https://stripe.com/payments',
      domSkeleton: '<section class="pay-card"><button>Pay</button></section>',
      resolvedCssVars: { '--accent': '#0071e3' },
      layoutStyles: { display: 'flex', gap: '20px' },
      visualStyles: { 'border-radius': '28px' },
      typographyStyles: { 'font-size': '17px' },
      pseudoElements: {},
      motionRules: { transitions: [], animations: [], keyframesCss: [] },
      tailwindHint: 'flex gap-5 rounded-[28px]',
      previewBlob: new Blob([TINY_PNG_BYTES], { type: 'image/png' }),
    });

    expect(ref.alias).toBe('stripe-pay-card');

    const pin1 = await addPin({
      sessionId: session.id,
      type: 'bug',
      severity: 'critical',
      status: 'open',
      note: 'Nút thanh toán trả lỗi 500 khi bấm submit',
      pageUrl: 'https://staging.shop.local/checkout',
      pageTitle: 'Checkout',
      viewport: { width: 1440, height: 900, dpr: 2 },
      boundingBox: { x: 400, y: 520, width: 220, height: 48 },
      selector: 'button#submit-order',
      cleanHtml: '<button id="submit-order">Thanh toán</button>',
      computedStyles: { 'background-color': '#0071e3', 'border-radius': '9999px' },
      tailwindHint: 'bg-[#0071e3] rounded-full',
      frameworkMeta: {
        framework: 'react',
        componentName: 'SubmitOrderButton',
        componentStack: ['CheckoutPage', 'SubmitOrderButton'],
        sourceLocation: { filePath: '/src/checkout/SubmitOrderButton.tsx', line: 88 },
      },
      flightCapsule: {
        breadcrumbs: [{ ts: Date.now() - 1200, action: 'click', targetLabel: 'button#submit-order("Thanh toán")' }],
        consoleErrors: [{ ts: Date.now() - 900, level: 'error', message: 'Uncaught CheckoutError: Order failed' }],
        networkIssues: [
          {
            ts: Date.now() - 950,
            method: 'POST',
            url: 'https://staging.shop.local/api/orders',
            status: 500,
            durationMs: 420,
            responseSnippet: '{"error":"Payment gateway timeout"}',
          },
        ],
      },
      attachedRefIds: [ref.id],
      croppedImageBlob: new Blob([TINY_PNG_BYTES], { type: 'image/png' }),
    });

    expect(pin1.orderIndex).toBe(1);

    const storedPins = await listPinsBySession(session.id);
    const storedRefs = await listReferences();
    expect(storedPins).toHaveLength(1);
    expect(storedRefs.length).toBeGreaterThanOrEqual(1);

    // 1. Verify Markdown (.md) export
    const md = generateMarkdownReport({
      session,
      pins: storedPins,
      references: storedRefs,
    });
    expect(md).toContain('# Checkout Multi-Page QA');
    expect(md).toContain('SubmitOrderButton');
    expect(md).toContain('POST https://staging.shop.local/api/orders');
    expect(md).toContain('@ref:stripe-pay-card');

    // 2. Verify Markdown + Images (.zip) bundle
    const zipBlob = await exportMarkdownZipBundle({
      session,
      pins: storedPins,
      references: storedRefs,
    });
    const unzipped = unzipSync(new Uint8Array(await zipBlob.arrayBuffer()));
    expect(unzipped['report.md']).toBeDefined();
    expect(unzipped['screenshots/pin-01.png']).toBeDefined();
    expect(unzipped['references/ref-stripe-pay-card.png']).toBeDefined();
    expect(strFromU8(unzipped['report.md']!)).toContain('screenshots/pin-01.png');

    // 3. Verify Excel (.xlsx) 2-sheet report with embedded image (Default English + Vietnamese)
    const xlsxBlob = await exportExcelReport({
      session,
      pins: storedPins,
      references: storedRefs,
    });
    expect(xlsxBlob.size).toBeGreaterThan(1000);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await xlsxBlob.arrayBuffer());

    const sheet1 = wb.getWorksheet('Feedback & Bug List');
    const sheet2 = wb.getWorksheet('Technical Context');
    expect(sheet1).toBeDefined();
    expect(sheet2).toBeDefined();

    expect(sheet1!.getRow(1).getCell(1).value).toBe('ID');
    expect(sheet1!.getRow(2).getCell(1).value).toBe('#1');
    expect(sheet1!.getRow(2).getCell(3).value).toBe('CRITICAL');
    expect(String(sheet1!.getRow(2).getCell(7).value)).toContain('Nút thanh toán trả lỗi 500');
    expect(String(sheet1!.getRow(2).getCell(9).value)).toContain('POST https://staging.shop.local/api/orders');
    expect(sheet1!.getImages().length).toBe(1);

    const xlsxViBlob = await exportExcelReport({
      session,
      pins: storedPins,
      references: storedRefs,
      locale: 'vi',
    });
    const wbVi = new ExcelJS.Workbook();
    await wbVi.xlsx.load(await xlsxViBlob.arrayBuffer());
    expect(wbVi.getWorksheet('Feedback & Bug List')!.getRow(1).getCell(1).value).toBe('Mã');

    // 4. Verify single pin deletion (re-indexing) and Clear All Pins
    const pin2 = await addPin({
      ...pin1,
      note: 'Second pin to test clear all',
    });
    expect(pin2.orderIndex).toBe(2);
    await deletePin(pin1.id);
    const afterOneDelete = await listPinsBySession(session.id);
    expect(afterOneDelete).toHaveLength(1);
    expect(afterOneDelete[0]!.orderIndex).toBe(1);

    await clearPinsBySession(session.id);
    expect(await listPinsBySession(session.id)).toHaveLength(0);
  });
});
