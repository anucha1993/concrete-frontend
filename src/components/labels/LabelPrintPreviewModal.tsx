'use client';

import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { toast } from '@/components/ui/Toast';
import type { LabelTemplate as CustomTemplate } from '@/services/label-template.service';
import type { Inventory } from '@/lib/types';
import { Printer, AlertTriangle, X } from 'lucide-react';

export const PAPER_SIZES = [
  { value: '50x30', label: '50 x 30 mm' },
  { value: '70x40', label: '70 x 40 mm' },
  { value: '100x50', label: '100 x 50 mm' },
  { value: '80x60', label: '80 x 60 mm' },
  { value: '100x70', label: '100 x 70 mm' },
  { value: 'custom', label: 'กำหนดเอง' },
];

/* ── Print Preview Modal ──
   Shared by /labels (print by PO) and /stock-counts (reprint lost stickers).
   po_number on the label falls back to inv.production_order when poOrderNumber is not given. */
export default function LabelPrintPreviewModal({
  items, paperSize, customTemplateData, pairMode, printing, onConfirm, onClose,
  poOrderNumber = '', canReprint, reprintHint, toolbar,
}: {
  items: Inventory[];
  paperSize: string;
  customTemplateData?: CustomTemplate;
  pairMode: boolean;
  printing: boolean;
  onConfirm: (reprintReason?: string) => void;
  onClose: () => void;
  poOrderNumber?: string;
  /** Show the reprint warning + reason input for already-printed serials */
  canReprint: boolean;
  reprintHint?: string;
  /** Extra controls rendered above the preview (e.g. template picker) */
  toolbar?: ReactNode;
}) {
  const paperLabel = PAPER_SIZES.find(p => p.value === paperSize)?.label || `${paperSize} mm`;
  const templateLabel = customTemplateData?.name || 'Template กำหนดเอง';
  const reprintItems = useMemo(() => items.filter(i => i.label_print_count > 0), [items]);
  const hasReprints = reprintItems.length > 0;
  const [reprintReason, setReprintReason] = useState('');
  const previewContainerRef = useRef<HTMLDivElement>(null);

  /* ── Render barcodes & QR in preview after DOM update ── */
  useEffect(() => {
    const container = previewContainerRef.current;
    if (!container) return;

    const renderBarcodes = () => {
      container.querySelectorAll<SVGSVGElement>('svg.barcode').forEach(svg => {
        if (svg.childElementCount > 0) return; // already rendered
        const value = svg.dataset.value || '';
        const fmt = svg.dataset.format || 'CODE128';
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).JsBarcode(svg, value, {
            format: fmt, width: 1, height: 60,
            displayValue: true, fontSize: 14, textMargin: 2, margin: 0,
          });
          const rw = svg.getAttribute('width');
          const rh = svg.getAttribute('height');
          if (rw && rh) {
            svg.setAttribute('viewBox', '0 0 ' + rw.replace('px', '') + ' ' + rh.replace('px', ''));
            svg.setAttribute('preserveAspectRatio', 'none');
          }
          svg.removeAttribute('width');
          svg.removeAttribute('height');
          svg.style.width = '100%';
          svg.style.height = '100%';
        } catch (e) { console.error('Preview barcode error:', e); }
      });

      container.querySelectorAll<HTMLDivElement>('.qr').forEach(el => {
        if (el.childElementCount > 0) return;
        const value = el.dataset.value || '';
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const qr = (window as any).qrcode(0, 'M');
          qr.addData(value);
          qr.make();
          el.innerHTML = qr.createSvgTag({ scalable: true });
          const svgEl = el.querySelector('svg');
          if (svgEl) { svgEl.style.width = '100%'; svgEl.style.height = '100%'; }
        } catch (e) { console.error('Preview QR error:', e); }
      });
    };

    // Load JsBarcode & qrcode-generator CDN if not already loaded
    const loadScript = (src: string): Promise<void> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (src.includes('JsBarcode') && (window as any).JsBarcode) return Promise.resolve();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (src.includes('qrcode') && (window as any).qrcode) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
        if (existing) {
          // Script tag exists — wait for it to actually load
          const checkGlobal = () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if ((src.includes('JsBarcode') && (window as any).JsBarcode) ||
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (src.includes('qrcode') && (window as any).qrcode)) {
              resolve();
            } else {
              existing.addEventListener('load', () => resolve(), { once: true });
              existing.addEventListener('error', reject, { once: true });
              // Fallback: poll in case events already fired
              setTimeout(() => resolve(), 500);
            }
          };
          checkGlobal();
          return;
        }
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => resolve();
        s.onerror = reject;
        document.head.appendChild(s);
      });
    };

    Promise.all([
      loadScript('https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js'),
      loadScript('https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js'),
    ]).then(() => {
      // Small delay to ensure DOM is fully painted
      setTimeout(renderBarcodes, 50);
    }).catch(err => console.error('Failed to load barcode/QR scripts:', err));
  }, [items, customTemplateData, pairMode]);

  /* ── Get template schemas ── */
  const getTemplateInfo = () => {
    if (!customTemplateData) return null;
    const template = customTemplateData.template_json as {
      basePdf?: { width?: number; height?: number };
      schemas?: Array<Array<Record<string, unknown>>>;
    };
    const w = Number(customTemplateData.paper_width) || template.basePdf?.width || 100;
    const h = Number(customTemplateData.paper_height) || template.basePdf?.height || 50;
    const schemas = template.schemas;
    const firstPage = (schemas && schemas.length > 0 && Array.isArray(schemas[0])) ? schemas[0] : [];
    return { w, h, firstPage };
  };

  /* ── Build input data and HTML for a single label from template ── */
  const buildLabelHtml = (inv: Inventory, firstPage: Array<Record<string, unknown>>) => {
    console.log('[buildLabelHtml] firstPage fields:', firstPage.map(f => ({ name: f.name, type: f.type, position: f.position, width: f.width, height: f.height, rotate: f.rotate })));
    const now = new Date();
    const dateStr = now.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const rawSteelType = inv.product?.steel_type?.trim();
    const nameSteelType = inv.product?.name?.match(/ลวด\s*\d+\s*เส้น/)?.[0]?.replace(/\s+/g, ' ').trim();
    const categorySteelType = inv.product?.category?.name?.includes('ลวด') ? inv.product.category.name : '';
    const steelType = rawSteelType || nameSteelType || categorySteelType || '-';
    const sideSteelMap: Record<string, string> = { SHOW: 'แสดงเหล็กข้าง', HIDE: 'ไม่แสดงเหล็กข้าง', NONE: '-' };
    const sideSteelType = sideSteelMap[inv.product?.side_steel_type ?? 'NONE'] ?? '-';
    const input: Record<string, string> = {
      serial_number: inv.serial_number,
      po_number: poOrderNumber || inv.production_order?.order_number || '-',
      product_name: inv.product?.name || '-',
      product_code: inv.product?.product_code || '-',
      category_name: inv.product?.category?.name || '-',
      steel_type: steelType,
      side_steel_type: sideSteelType,
      product_length: inv.product?.length != null ? `${inv.product.length}` : '-',
      product_thickness: inv.product?.thickness != null ? `${inv.product.thickness}` : '-',
      product_width: inv.product?.width != null ? `${inv.product.width}` : '-',
      location_name: inv.location?.name || '-',
      print_date: dateStr,
      serial_barcode: inv.serial_number,
      serial_qr: inv.serial_number,
    };
    for (const field of firstPage) {
      const fname = field.name as string | undefined;
      if (fname && !(fname in input)) {
        const baseMatch = fname.match(/^(.+?)(?:_(\d+))?$/);
        const baseName = baseMatch ? baseMatch[1] : fname;
        if (baseName in input) { input[fname] = input[baseName]; }
        else { input[fname] = (field.content as string) || fname; }
      }
    }

    const fieldsHtml = firstPage.map(field => {
      const fname = field.name as string || '';
      const ftype = field.type as string || 'text';
      const pos = field.position as { x: number; y: number } | undefined;
      const fw = Number(field.width) || 20;
      const fh = Number(field.height) || 6;
      const x = pos?.x ?? 0;
      const y = pos?.y ?? 0;
      const rotate = Number(field.rotate) || 0;
      const opacity = field.opacity !== undefined ? Number(field.opacity) : 1;
      const value = input[fname] || (field.content as string) || '';
      const fontSize = Number(field.fontSize) || 9;
      const alignment = (field.alignment as string) || 'left';
      const fontColor = (field.fontColor as string) || '#000000';
      const fontName = (field.fontName as string) || 'Sarabun';
      const lineHeight = Number(field.lineHeight) || 1.2;
      const bgColor = (field.backgroundColor as string) || '';
      const isBold = fontName.includes('Bold');
      const rotateStyle = rotate ? `transform:rotate(${rotate}deg);` : '';
      const opacityStyle = opacity < 1 ? `opacity:${opacity};` : '';

      if (ftype === 'code128' || ftype === 'code39') {
        const barcodeFormat = ftype === 'code39' ? 'CODE39' : 'CODE128';
        return `<div style="position:absolute; left:${x}mm; top:${y}mm; width:${fw}mm; height:${fh}mm; overflow:hidden; display:flex; align-items:center; justify-content:center; ${rotateStyle} ${opacityStyle}">
          <svg class="barcode" data-value="${escapeHtml(value)}" data-format="${barcodeFormat}"></svg>
        </div>`;
      }
      if (ftype === 'qrcode') {
        return `<div style="position:absolute; left:${x}mm; top:${y}mm; width:${fw}mm; height:${fh}mm; overflow:hidden; ${rotateStyle} ${opacityStyle}">
          <div class="qr" data-value="${escapeHtml(value)}" style="width:100%; height:100%;"></div>
        </div>`;
      }
      if (ftype === 'line') {
        const color = (field.color as string) || '#000';
        return `<div style="position:absolute; left:${x}mm; top:${y}mm; width:${fw}mm; height:0; border-top:0.3mm solid ${color}; ${rotateStyle} ${opacityStyle}"></div>`;
      }
      if (ftype === 'rectangle') {
        const borderColor = (field.borderColor as string) || '#000';
        const borderWidth = Number(field.borderWidth) || 0.3;
        return `<div style="position:absolute; left:${x}mm; top:${y}mm; width:${fw}mm; height:${fh}mm; border:${borderWidth}mm solid ${borderColor}; ${bgColor ? `background:${bgColor};` : ''} ${rotateStyle} ${opacityStyle}"></div>`;
      }
      if (ftype === 'ellipse') {
        const borderColor = (field.borderColor as string) || '#000';
        return `<div style="position:absolute; left:${x}mm; top:${y}mm; width:${fw}mm; height:${fh}mm; border-radius:50%; border:0.3mm solid ${borderColor}; ${bgColor ? `background:${bgColor};` : ''} ${rotateStyle} ${opacityStyle}"></div>`;
      }
      const vAlign = (field.verticalAlignment as string) || 'top';
      const justifyMap: Record<string, string> = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };
      const pad = field.padding as { top?: number; right?: number; bottom?: number; left?: number } | undefined;
      const padStyle = pad ? `padding:${pad.top ?? 0}mm ${pad.right ?? 0}mm ${pad.bottom ?? 0}mm ${pad.left ?? 0}mm;` : '';
      return `<div style="
        position:absolute; left:${x}mm; top:${y}mm; width:${fw}mm; height:${fh}mm;
        display:flex; flex-direction:column; justify-content:${justifyMap[vAlign] || 'flex-start'};
        font-size:${fontSize}pt; font-family:'${fontName}',Sarabun,sans-serif;
        color:${fontColor}; text-align:${alignment}; line-height:${lineHeight};
        ${isBold ? 'font-weight:bold;' : ''}
        ${bgColor ? `background:${bgColor};` : ''}
        ${padStyle}
        ${rotateStyle} ${opacityStyle}
        overflow:hidden; white-space:pre-wrap; word-break:break-word;
      "><span>${escapeHtml(value)}</span></div>`;
    }).join('');

    return fieldsHtml;
  };


  const handleConfirmAndPrint = () => {
    if (customTemplateData) {
      handleCustomTemplatePrint();
    }
    onConfirm(hasReprints ? reprintReason : undefined);
  };

  /* ── Custom Template → HTML print ── */
  const handleCustomTemplatePrint = () => {
    const info = getTemplateInfo();
    if (!info) return;
    const { w, h, firstPage } = info;
    const pageW = pairMode ? w * 2 : w;

    // Render each label to HTML — in pairMode, group 2 serials side-by-side per physical sheet
    let labelsHtml: string;
    if (pairMode) {
      let sheets = '';
      for (let i = 0; i < items.length; i += 2) {
        const left = items[i];
        const right = items[i + 1];
        sheets += `<div class="sheet">
          <div class="label">${buildLabelHtml(left, firstPage)}</div>
          <div class="label">${right ? buildLabelHtml(right, firstPage) : ''}</div>
        </div>`;
      }
      labelsHtml = sheets;
    } else {
      labelsHtml = items.map(inv =>
        `<div class="sheet"><div class="label">${buildLabelHtml(inv, firstPage)}</div></div>`
      ).join('');
    }

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <title>Labels${poOrderNumber ? ` - ${escapeHtml(poOrderNumber)}` : ''}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap');
    @page { size: ${pageW}mm ${h}mm; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Sarabun', sans-serif; }
    .sheet {
      display: flex;
      flex-wrap: nowrap;
      width: ${pageW}mm; height: ${h}mm;
      page-break-after: always;
    }
    .sheet:last-child { page-break-after: auto; }
    .label {
      position: relative;
      flex: 0 0 ${w}mm;
      width: ${w}mm; height: ${h}mm;
      overflow: hidden;
    }
    @media screen {
      body { background: #f3f4f6; padding: 20px; display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
      .sheet { background: white; border: 1px solid #d1d5db; border-radius: 4px; }
      .label + .label { border-left: 1px dashed #d1d5db; }
    }
  </style>
</head>
<body>
  ${labelsHtml}
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"><\/script>
  <script>
    function waitForScripts(cb, attempts) {
      attempts = attempts || 0;
      if (typeof JsBarcode !== 'undefined' && typeof qrcode !== 'undefined') { cb(); return; }
      if (attempts > 50) { console.error('Scripts failed to load'); cb(); return; }
      setTimeout(function() { waitForScripts(cb, attempts + 1); }, 100);
    }
    waitForScripts(function() {
      // Render barcodes — stretch to fill container exactly like pdfme
      document.querySelectorAll('svg.barcode').forEach(function(svg) {
        var value = svg.dataset.value || '';
        var fmt = svg.dataset.format || 'CODE128';
        try {
          JsBarcode(svg, value, {
            format: fmt,
            width: 1,
            height: 60,
            displayValue: true,
            fontSize: 14,
            textMargin: 2,
            margin: 0,
          });
          var rw = svg.getAttribute('width');
          var rh = svg.getAttribute('height');
          if (rw && rh) {
            svg.setAttribute('viewBox', '0 0 ' + rw.replace('px','') + ' ' + rh.replace('px',''));
            svg.setAttribute('preserveAspectRatio', 'none');
          }
          svg.removeAttribute('width');
          svg.removeAttribute('height');
          svg.style.width = '100%';
          svg.style.height = '100%';
        } catch(e) { console.error('Barcode error:', e); }
      });
      // Render QR codes
      document.querySelectorAll('.qr').forEach(function(el) {
        var value = el.dataset.value || '';
        try {
          var q = qrcode(0, 'M');
          q.addData(value);
          q.make();
          el.innerHTML = q.createSvgTag({ scalable: true });
          var svg = el.querySelector('svg');
          if (svg) { svg.style.width = '100%'; svg.style.height = '100%'; }
        } catch(e) { console.error('QR error:', e); }
      });
      // Auto print after rendering
      setTimeout(function() { window.print(); }, 300);
    });
  <\/script>
</body>
</html>`;

    // ใช้ Blob URL แทน about:blank เพื่อให้ browser จัดการ printer settings ได้ถูกต้อง
    const blob = new Blob([htmlContent], { type: 'text/html; charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const printWindow = window.open(blobUrl, '_blank');
    if (!printWindow) {
      URL.revokeObjectURL(blobUrl);
      toast('ไม่สามารถเปิดหน้าต่างปริ้นได้ กรุณาอนุญาต popup', 'error');
      return;
    }
    // Clean up blob URL after window loads
    printWindow.addEventListener('afterprint', () => URL.revokeObjectURL(blobUrl));
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000); // fallback cleanup after 1 min
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div className="flex max-h-[95vh] sm:max-h-[90vh] w-full max-w-4xl flex-col rounded-t-2xl sm:rounded-2xl bg-white shadow-xl sm:mx-4" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start sm:items-center justify-between border-b px-4 sm:px-6 py-3 sm:py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-base sm:text-lg font-bold text-gray-800">ตัวอย่าง Label ก่อนปริ้น</h2>
            <p className="text-xs sm:text-sm text-gray-500 break-words">
              {items.length} รายการ | {templateLabel} | {paperLabel}{poOrderNumber && ` | ${poOrderNumber}`}
              {pairMode && ` | ดวงคู่ (${Math.ceil(items.length / 2)} แผ่น)`}
            </p>
          </div>
          <button onClick={onClose} className="ml-2 shrink-0 rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Preview grid */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {toolbar && <div className="mb-4">{toolbar}</div>}

          {/* Admin reprint warning */}
          {hasReprints && canReprint && (
            <div className="mb-4 rounded-lg border border-orange-200 bg-orange-50 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-orange-500" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-orange-800">
                    มี {reprintItems.length} รายการที่เคยปริ้นแล้ว (ปริ้นซ้ำ)
                  </p>
                  <p className="mt-1 text-xs text-orange-600">
                    {reprintHint ?? 'คุณสามารถปริ้นซ้ำได้โดยตรงเนื่องจากเป็น Admin กรุณาระบุเหตุผล'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {reprintItems.map(inv => (
                      <span key={inv.id} className="rounded bg-orange-100 px-2 py-0.5 font-mono text-xs text-orange-700">
                        {inv.serial_number}
                      </span>
                    ))}
                  </div>
                  <input
                    type="text"
                    placeholder="เหตุผลในการปริ้นซ้ำ..."
                    value={reprintReason}
                    onChange={e => setReprintReason(e.target.value)}
                    className="mt-3 w-full rounded-lg border border-orange-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Real template preview */}
          {customTemplateData && (() => {
            const info = getTemplateInfo();
            if (!info) return null;
            const { w, h, firstPage } = info;
            // Scale to fit preview nicely (max ~250px width)
            const scaleFactor = Math.min(250 / (w * 3.78), 200 / (h * 3.78), 1);
            const displayW = w * 3.78 * scaleFactor;
            const displayH = h * 3.78 * scaleFactor;

            const renderLabelBox = (inv: Inventory) => (
              <div key={inv.id} className="relative" style={{ width: displayW, height: displayH }}>
                {inv.label_print_count > 0 && (
                  <span className="absolute -top-2 -right-2 z-10 rounded bg-orange-200 px-1.5 py-0.5 text-[8px] font-semibold text-orange-700">ปริ้นซ้ำ</span>
                )}
                <div
                  className="origin-top-left bg-white"
                  style={{
                    width: `${w}mm`,
                    height: `${h}mm`,
                    position: 'relative',
                    overflow: 'hidden',
                    transform: `scale(${scaleFactor})`,
                    transformOrigin: 'top left',
                    fontFamily: "'Sarabun', sans-serif",
                  }}
                  dangerouslySetInnerHTML={{ __html: buildLabelHtml(inv, firstPage) }}
                />
              </div>
            );

            if (pairMode) {
              const pairs: Inventory[][] = [];
              for (let i = 0; i < items.length; i += 2) pairs.push([items[i], items[i + 1]].filter(Boolean));
              return (
                <div className="flex flex-wrap gap-4 justify-center" ref={previewContainerRef}>
                  {pairs.map((pair, idx) => (
                    <div key={idx} className="flex divide-x divide-dashed divide-gray-300 rounded border border-gray-300 bg-white shadow-sm">
                      {pair.map(renderLabelBox)}
                    </div>
                  ))}
                </div>
              );
            }

            return (
              <div className="flex flex-wrap gap-4 justify-center" ref={previewContainerRef}>
                {items.map(inv => (
                  <div key={inv.id} className="rounded border border-gray-300 bg-white shadow-sm">
                    {renderLabelBox(inv)}
                  </div>
                ))}
              </div>
            );
          })()}
          {!customTemplateData && (
            <div className="flex items-center justify-center py-12 text-gray-400">
              ไม่พบข้อมูล Template
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2 border-t px-4 sm:px-6 py-3 sm:py-4">
          <button onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            ยกเลิก
          </button>
          <button onClick={handleConfirmAndPrint}
            disabled={printing}
            className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            <Printer size={16} /> {printing ? 'กำลังบันทึก...' : `ยืนยันและปริ้น (${items.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Escape HTML entities ── */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
