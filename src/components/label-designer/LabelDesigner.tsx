'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/ui/Toast';
import { labelTemplateService } from '@/services/label-template.service';
import { ArrowLeft, Save, FileDown, Eye, ChevronDown, ChevronUp, RefreshCw, Type, Barcode, QrCode } from 'lucide-react';
import { AxiosError } from 'axios';
import type { Template, Font } from '@pdfme/common';

/* ── Load Thai font (Sarabun) for pdfme ── */
async function loadThaiFont(): Promise<Font> {
  const [regularRes, boldRes] = await Promise.all([
    fetch('/fonts/Sarabun-Regular.ttf'),
    fetch('/fonts/Sarabun-Bold.ttf'),
  ]);
  const [regularBuf, boldBuf] = await Promise.all([
    regularRes.arrayBuffer(),
    boldRes.arrayBuffer(),
  ]);
  return {
    'Sarabun': {
      data: regularBuf,
      fallback: true,
      subset: false,
    },
    'Sarabun-Bold': {
      data: boldBuf,
      subset: false,
    },
  };
}

/* ── Paper sizes ── */
const PAPER_PRESETS = [
  { label: '50 × 30 mm', w: 50, h: 30 },
  { label: '70 × 40 mm', w: 70, h: 40 },
  { label: '100 × 50 mm', w: 100, h: 50 },
  { label: '80 × 60 mm', w: 80, h: 60 },
  { label: '100 × 70 mm', w: 100, h: 70 },
];

/* ── Placeholder tokens for label data ── */
const LABEL_FIELDS = [
  { name: 'serial_number', label: 'Serial Number', example: 'B001-2602-00000045', fieldType: 'text' as const },
  { name: 'po_number', label: 'เลขที่ใบสั่งผลิต', example: 'PO-2026-0042', fieldType: 'text' as const },
  { name: 'product_name', label: 'ชื่อสินค้า', example: 'แผ่นพื้น (แพหน้า) 0.05*1 เมตร', fieldType: 'text' as const },
  { name: 'product_code', label: 'รหัสสินค้า', example: 'CON-240', fieldType: 'text' as const },
  { name: 'category_name', label: 'หมวดหมู่สินค้า', example: 'แผ่นพื้น', fieldType: 'text' as const },
  { name: 'steel_type', label: 'ประเภทลวด/เหล็ก', example: 'ลวด 5 เส้น', fieldType: 'text' as const },
  { name: 'product_length', label: 'ความยาวสินค้า', example: '1.00', fieldType: 'text' as const },
  { name: 'product_thickness', label: 'ความหนาสินค้า', example: '0.05', fieldType: 'text' as const },
  { name: 'product_width', label: 'ความกว้างสินค้า', example: '0.35', fieldType: 'text' as const },
  { name: 'location_name', label: 'ตำแหน่งคลัง', example: 'B001-1', fieldType: 'text' as const },
  { name: 'print_date', label: 'วันที่ปริ้น', example: '27/02/2026', fieldType: 'text' as const },
  { name: 'serial_barcode', label: 'Barcode (Code128)', example: 'PO2026-001-0001', fieldType: 'barcode' as const },
  { name: 'serial_qr', label: 'QR Code', example: 'PO2026-001-0001', fieldType: 'qr' as const },
];

/**
 * Get the base field name by stripping the _N suffix.
 * e.g. 'serial_number_2' → 'serial_number', 'product_name_3' → 'product_name'
 */
function getBaseFieldName(name: string): string {
  // Match known field names with optional _N suffix
  const match = name.match(/^(.+?)(?:_(\d+))?$/);
  if (!match) return name;
  const base = match[1];
  // Only strip suffix if base is a known LABEL_FIELDS name
  if (LABEL_FIELDS.some(f => f.name === base)) return base;
  return name;
}

function getBlankTemplate(widthMm: number, heightMm: number): Template {
  return {
    basePdf: {
      width: widthMm,
      height: heightMm,
      padding: [0, 0, 0, 0],
    },
    schemas: [
      [
        {
          name: 'serial_number',
          type: 'text',
          position: { x: 5, y: 3 },
          width: widthMm - 10,
          height: 6,
          fontSize: 9,
          alignment: 'center',
          content: 'PO2026-001-0001',
        },
      ],
    ],
  } as unknown as Template;
}

/**
 * Sanitize a template loaded from DB or modified by Designer.
 * - Converts null/undefined string properties to safe defaults (pdfme rejects null)
 * - Ensures schemas is always an array
 */
function sanitizeTemplate(tmpl: Template): Template {
  if (!tmpl) return tmpl;
  // Ensure schemas is always an array
  const rawSchemas = tmpl.schemas || [];
  const schemas = (Array.isArray(rawSchemas) ? rawSchemas : []).map((page: unknown) => {
    if (!Array.isArray(page)) return page;
    return page.map((schema: Record<string, unknown>) => {
      const cleaned = { ...schema };
      // Convert ALL null values to safe defaults so pdfme never calls .slice() on null
      for (const key of Object.keys(cleaned)) {
        if (cleaned[key] === null) {
          cleaned[key] = undefined;
        }
      }
      // Replace any fontName not in our font set with 'Sarabun'
      if (cleaned.fontName && cleaned.fontName !== 'Sarabun' && cleaned.fontName !== 'Sarabun-Bold') {
        cleaned.fontName = 'Sarabun';
      }
      // Ensure content is always a string
      if (cleaned.content === null || cleaned.content === undefined) {
        cleaned.content = '';
      }
      if (typeof cleaned.content !== 'string') {
        cleaned.content = String(cleaned.content);
      }
      return cleaned;
    });
  });
  return { ...tmpl, schemas } as Template;
}

interface LabelDesignerProps {
  templateId?: number;
}

export default function LabelDesigner({ templateId }: LabelDesignerProps) {
  const router = useRouter();
  const isEdit = !!templateId;

  const designerRef = useRef<HTMLDivElement>(null);
  const designerInstance = useRef<unknown>(null);
  const currentTemplateRef = useRef<Template | null>(null);
  const fontRef = useRef<Font | null>(null);

  const [name, setName] = useState('');
  const [paperWidth, setPaperWidth] = useState(50);
  const [paperHeight, setPaperHeight] = useState(30);
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingTemplate, setLoadingTemplate] = useState(isEdit);
  const [designerReady, setDesignerReady] = useState(false);
  const [initialTemplate, setInitialTemplate] = useState<Template | null>(null);
  const [showSampleData, setShowSampleData] = useState(true);
  const [sampleData, setSampleData] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    LABEL_FIELDS.forEach(f => { init[f.name] = f.example; });
    return init;
  });

  /* ── Load existing template ── */
  useEffect(() => {
    if (!isEdit) return;
    setLoadingTemplate(true);
    labelTemplateService.get(templateId)
      .then(res => {
        const t = res.data;
        setName(t.name);
        setPaperWidth(Number(t.paper_width));
        setPaperHeight(Number(t.paper_height));
        setIsDefault(t.is_default);
        const tmpl = sanitizeTemplate(t.template_json as unknown as Template);
        setInitialTemplate(tmpl);
        currentTemplateRef.current = tmpl;
      })
      .catch(() => {
        toast('โหลด Template ไม่สำเร็จ', 'error');
        router.push('/label-templates');
      })
      .finally(() => setLoadingTemplate(false));
  }, [isEdit, templateId, router]);

  /* ── Get plugins ── */
  const getPlugins = useCallback(async () => {
    const { text, barcodes, image, line, rectangle, ellipse } = await import('@pdfme/schemas');
    return {
      Text: text,
      Barcode: barcodes.code128,
      QR: barcodes.qrcode,
      Image: image,
      Line: line,
      Rectangle: rectangle,
      Ellipse: ellipse,
    };
  }, []);

  /* ── Initialize pdfme Designer ── */
  const initDesigner = useCallback(async () => {
    if (!designerRef.current) return;

    // Clean up previous
    if (designerInstance.current) {
      try {
        (designerInstance.current as { destroy: () => void }).destroy();
      } catch { /* ignore */ }
      designerInstance.current = null;
    }
    designerRef.current.innerHTML = '';

    try {
      const { Designer } = await import('@pdfme/ui');
      const plugins = await getPlugins();

      // Load Thai font if not already loaded
      if (!fontRef.current) {
        fontRef.current = await loadThaiFont();
      }

      const template = initialTemplate || getBlankTemplate(paperWidth, paperHeight);
      const safeTemplate = sanitizeTemplate(template);
      currentTemplateRef.current = safeTemplate;

      const designer = new Designer({
        domContainer: designerRef.current,
        template: safeTemplate,
        plugins: plugins,
        options: {
          font: fontRef.current,
          lang: 'en',
          theme: {
            token: {
              colorPrimary: '#2563eb',
            },
          },
        },
      });

      designer.onChangeTemplate((updated: Template) => {
        currentTemplateRef.current = sanitizeTemplate(updated);
      });

      designer.onSaveTemplate((saved: Template) => {
        currentTemplateRef.current = sanitizeTemplate(saved);
      });

      designerInstance.current = designer;
      setDesignerReady(true);
    } catch (err) {
      console.error('pdfme Designer init error:', err);
      toast('ไม่สามารถโหลด Designer ได้', 'error');
    }
  }, [initialTemplate, paperWidth, paperHeight, getPlugins]);

  useEffect(() => {
    if (loadingTemplate) return;
    initDesigner();

    return () => {
      if (designerInstance.current) {
        try {
          (designerInstance.current as { destroy: () => void }).destroy();
        } catch { /* ignore */ }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingTemplate]);

  /* ── Get sample inputs for PDF generation ── */
  const getSampleInputs = useCallback((template: Template): Record<string, string>[] => {
    const inputs: Record<string, string> = {};
    const schemas = template.schemas;
    if (schemas && schemas.length > 0) {
      const firstPage = schemas[0];
      if (Array.isArray(firstPage)) {
        for (const field of firstPage) {
          const f = field as { name?: string; content?: string };
          if (f.name) {
            const baseName = getBaseFieldName(f.name);
            // Use sampleData first (try exact name, then base name), then LABEL_FIELDS example, then content
            inputs[f.name] = sampleData[f.name]
              || sampleData[baseName]
              || LABEL_FIELDS.find(lf => lf.name === baseName)?.example
              || f.content || f.name;
          }
        }
      }
    }
    return [inputs];
  }, [sampleData]);

  /* ── Save template ── */
  const handleSave = async () => {
    if (!name.trim()) {
      toast('กรุณาระบุชื่อ Template', 'error');
      return;
    }

    // Trigger save on designer to get latest
    if (designerInstance.current) {
      try {
        (designerInstance.current as { saveTemplate: () => void }).saveTemplate();
      } catch { /* ignore */ }
    }

    // Small delay to let state update from save callback
    await new Promise(r => setTimeout(r, 50));

    const templateJson = currentTemplateRef.current;
    if (!templateJson) {
      toast('ไม่มีข้อมูล Template กรุณาออกแบบก่อนบันทึก', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        paper_width: String(paperWidth),
        paper_height: String(paperHeight),
        template_json: templateJson as unknown as Record<string, unknown>,
        is_default: isDefault,
      };

      if (isEdit) {
        await labelTemplateService.update(templateId, payload);
        toast('อัปเดต Template สำเร็จ', 'success');
      } else {
        const res = await labelTemplateService.create(payload);
        toast('สร้าง Template สำเร็จ', 'success');
        router.push(`/label-templates/${res.data.id}`);
      }
    } catch (err: unknown) {
      const axiosErr = err as AxiosError<{ message: string }>;
      toast(axiosErr.response?.data?.message || 'บันทึกไม่สำเร็จ', 'error');
    } finally {
      setSaving(false);
    }
  };

  /* ── Preview PDF ── */
  const handlePreview = async () => {
    const template = currentTemplateRef.current;
    if (!template) {
      toast('กรุณาออกแบบ Template ก่อน preview', 'error');
      return;
    }

    try {
      const { generate } = await import('@pdfme/generator');
      const plugins = await getPlugins();
      const inputs = getSampleInputs(template);

      // Load Thai font if not already loaded
      if (!fontRef.current) {
        fontRef.current = await loadThaiFont();
      }

      const pdf = await generate({
        template: template,
        inputs: inputs,
        plugins: plugins,
        options: { font: fontRef.current },
      });

      const blob = new Blob([pdf.buffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err) {
      console.error('PDF preview error:', err);
      toast('ไม่สามารถสร้าง PDF preview ได้', 'error');
    }
  };

  /* ── Download PDF ── */
  const handleDownload = async () => {
    const template = currentTemplateRef.current;
    if (!template) {
      toast('กรุณาออกแบบ Template ก่อน download', 'error');
      return;
    }

    try {
      const { generate } = await import('@pdfme/generator');
      const plugins = await getPlugins();
      const inputs = getSampleInputs(template);

      // Load Thai font if not already loaded
      if (!fontRef.current) {
        fontRef.current = await loadThaiFont();
      }

      const pdf = await generate({
        template: template,
        inputs: inputs,
        plugins: plugins,
        options: { font: fontRef.current },
      });

      const blob = new Blob([pdf.buffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name || 'label-template'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF download error:', err);
      toast('ไม่สามารถสร้าง PDF ได้', 'error');
    }
  };

  /* ── Apply sample data to canvas (update content of matching fields) ── */
  const applySampleDataToCanvas = useCallback((data?: Record<string, string>) => {
    if (!designerInstance.current || !currentTemplateRef.current) return;

    const dataToApply = data || sampleData;
    const template = currentTemplateRef.current;
    const schemas = template.schemas;
    if (!Array.isArray(schemas) || schemas.length === 0) return;

    const firstPage = schemas[0] as Array<Record<string, unknown>>;
    if (!Array.isArray(firstPage)) return;
    const updatedPage = firstPage.map(schema => {
      const s = schema as { name?: string };
      if (s.name) {
        const baseName = getBaseFieldName(s.name);
        const value = dataToApply[s.name] || dataToApply[baseName];
        if (value) return { ...schema, content: value };
      }
      return schema;
    });

    const newTemplate = sanitizeTemplate({
      ...template,
      schemas: [updatedPage, ...((schemas || []).slice(1) || [])],
    } as Template);

    (designerInstance.current as { updateTemplate: (t: Template) => void }).updateTemplate(newTemplate);
    currentTemplateRef.current = newTemplate;
  }, [sampleData]);

  /* ── Auto-apply sample data to canvas when user changes values (debounced) ── */
  useEffect(() => {
    if (!designerReady) return;
    const timer = setTimeout(() => {
      applySampleDataToCanvas(sampleData);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampleData, designerReady]);

  /* ── Update a single sample field and apply ── */
  const handleSampleFieldChange = useCallback((fieldName: string, value: string) => {
    setSampleData(prev => ({ ...prev, [fieldName]: value }));
  }, []);

  /* ── Apply paper size change ── */
  const handlePaperSizeChange = useCallback((w: number, h: number) => {
    setPaperWidth(w);
    setPaperHeight(h);

    if (designerInstance.current) {
      try {
        const cur = currentTemplateRef.current || getBlankTemplate(w, h);
        const newTemplate = sanitizeTemplate({
          ...cur,
          basePdf: {
            width: w,
            height: h,
            padding: [0, 0, 0, 0],
          },
        } as Template);
        (designerInstance.current as { updateTemplate: (t: Template) => void }).updateTemplate(newTemplate);
        currentTemplateRef.current = newTemplate;
      } catch { /* ignore */ }
    }
  }, []);

  /* ── Auto-apply paper size when user types in inputs (debounced) ── */
  useEffect(() => {
    if (!designerReady) return;
    if (paperWidth < 10 || paperHeight < 10) return;

    const timer = setTimeout(() => {
      if (designerInstance.current) {
        try {
          const cur = currentTemplateRef.current || getBlankTemplate(paperWidth, paperHeight);
          const newTemplate = sanitizeTemplate({
            ...cur,
            basePdf: {
              width: paperWidth,
              height: paperHeight,
              padding: [0, 0, 0, 0],
            },
          } as Template);
          (designerInstance.current as { updateTemplate: (t: Template) => void }).updateTemplate(newTemplate);
          currentTemplateRef.current = newTemplate;
        } catch { /* ignore */ }
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [paperWidth, paperHeight, designerReady]);

  /* ── Add placeholder field to designer ── */
  const addPlaceholderField = useCallback((field: typeof LABEL_FIELDS[number]) => {
    if (!designerInstance.current || !currentTemplateRef.current) {
      toast('กรุณารอ Designer โหลดก่อน', 'error');
      return;
    }

    const template = currentTemplateRef.current;
    const schemas = template.schemas;
    if (!Array.isArray(schemas) || schemas.length === 0) return;

    const firstPage = schemas[0] as Array<Record<string, unknown>>;
    if (!Array.isArray(firstPage)) return;

    // Allow duplicate fields: auto-generate unique name with _N suffix
    const existingNames = firstPage.map(s => (s as { name?: string }).name || '');
    let fieldName = field.name;
    if (existingNames.includes(fieldName)) {
      let suffix = 2;
      while (existingNames.includes(`${field.name}_${suffix}`)) suffix++;
      fieldName = `${field.name}_${suffix}`;
    }

    // Calculate position (stack below existing fields)
    const lastField = firstPage.length > 0
      ? firstPage[firstPage.length - 1] as { position?: { x: number; y: number }; height?: number }
      : null;
    const yPos = lastField?.position
      ? (lastField.position.y + (lastField.height || 6) + 2)
      : 3;

    let newSchema: Record<string, unknown>;
    if (field.fieldType === 'barcode') {
      newSchema = {
        name: fieldName,
        type: 'code128',
        content: field.example,
        position: { x: 5, y: Math.min(yPos, paperHeight - 12) },
        width: Math.min(paperWidth - 10, 40),
        height: 10,
      };
    } else if (field.fieldType === 'qr') {
      newSchema = {
        name: fieldName,
        type: 'qrcode',
        content: field.example,
        position: { x: 5, y: Math.min(yPos, paperHeight - 12) },
        width: 10,
        height: 10,
      };
    } else {
      newSchema = {
        name: fieldName,
        type: 'text',
        content: field.example,
        position: { x: 5, y: Math.min(yPos, paperHeight - 8) },
        width: Math.min(paperWidth - 10, 40),
        height: 6,
        fontSize: 9,
        alignment: 'left',
      };
    }

    const newSchemas = [
      [...firstPage, newSchema],
      ...((schemas || []).slice(1) || []),
    ];

    const newTemplate = sanitizeTemplate({
      ...template,
      schemas: newSchemas,
    } as Template);

    (designerInstance.current as { updateTemplate: (t: Template) => void }).updateTemplate(newTemplate);
    currentTemplateRef.current = newTemplate;
    toast(`เพิ่ม "${fieldName}" แล้ว`, 'success');
  }, [paperWidth, paperHeight]);

  if (loadingTemplate) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-2rem)] flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b bg-white px-4 py-3">
        <button onClick={() => router.push('/label-templates')}
          className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
          <ArrowLeft size={16} /> กลับ
        </button>

        <div className="h-6 w-px bg-gray-200" />

        {/* Name */}
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ชื่อ Template..."
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-48"
        />

        {/* Paper size preset */}
        <select
          value={PAPER_PRESETS.find(p => p.w === paperWidth && p.h === paperHeight) ? `${paperWidth}x${paperHeight}` : 'custom'}
          onChange={(e) => {
            if (e.target.value === 'custom') {
              // Switch to custom mode – keep current values
              return;
            }
            const [w, h] = e.target.value.split('x').map(Number);
            if (w && h) handlePaperSizeChange(w, h);
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          {PAPER_PRESETS.map(p => (
            <option key={`${p.w}x${p.h}`} value={`${p.w}x${p.h}`}>{p.label}</option>
          ))}
          <option value="custom">กำหนดเอง</option>
        </select>

        {/* Custom size inputs — auto-applies after 400ms */}
        <div className="flex items-center gap-1 text-sm text-gray-500">
          <input type="number" value={paperWidth} min={10} max={300}
            onChange={(e) => setPaperWidth(Number(e.target.value))}
            className="w-16 rounded border border-gray-300 px-2 py-1.5 text-center text-sm focus:border-blue-500 focus:outline-none" />
          <span>×</span>
          <input type="number" value={paperHeight} min={10} max={300}
            onChange={(e) => setPaperHeight(Number(e.target.value))}
            className="w-16 rounded border border-gray-300 px-2 py-1.5 text-center text-sm focus:border-blue-500 focus:outline-none" />
          <span>mm</span>
        </div>

        <div className="h-6 w-px bg-gray-200" />

        {/* Default checkbox */}
        <label className="flex items-center gap-1.5 cursor-pointer text-sm text-gray-600">
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600" />
          เริ่มต้น
        </label>

        <div className="flex-1" />

        {/* Actions */}
        <button onClick={handlePreview} disabled={!designerReady}
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
          <Eye size={16} /> Preview
        </button>
        <button onClick={handleDownload} disabled={!designerReady}
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
          <FileDown size={16} /> PDF
        </button>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50">
          <Save size={16} /> {saving ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
      </div>

      {/* Placeholder fields — click to add */}
      <div className="border-b bg-blue-50 px-4 py-2">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-blue-700">
            <strong>คลิกเพื่อเพิ่ม field ลงใน Label:</strong>
          </p>
          <button
            type="button"
            onClick={() => setShowSampleData(!showSampleData)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors"
          >
            {showSampleData ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            ข้อมูลตัวอย่าง
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          {LABEL_FIELDS.map(f => (
            <button
              key={f.name}
              type="button"
              onClick={() => addPlaceholderField(f)}
              disabled={!designerReady}
              className="inline-flex items-center gap-1 rounded bg-blue-100 px-2 py-1 font-mono text-xs text-blue-800 hover:bg-blue-200 active:bg-blue-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              title={`${f.label} — ตัวอย่าง: ${f.example}`}
            >
              {f.fieldType === 'barcode' ? '▮ ' : f.fieldType === 'qr' ? '⊞ ' : ''}
              {f.name}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-blue-500 mt-1">
          ระบบจะแทนค่าจริงให้อัตโนมัติตอนปริ้น · ชื่อ field ต้องตรงกับ placeholder
        </p>

        {/* Sample data panel */}
        {showSampleData && (
          <div className="mt-2 rounded-lg border border-blue-200 bg-white p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-gray-700">
                กรอกข้อมูล Mockup แล้วระบบจะอัพเดตบน Canvas อัตโนมัติ
              </p>
              <button
                type="button"
                onClick={() => {
                  const reset: Record<string, string> = {};
                  LABEL_FIELDS.forEach(f => { reset[f.name] = f.example; });
                  setSampleData(reset);
                }}
                className="flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-[10px] text-gray-500 hover:bg-gray-50 transition-colors"
              >
                <RefreshCw size={10} /> รีเซ็ต
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
              {LABEL_FIELDS.map(f => (
                <div key={f.name}>
                  <label className="mb-0.5 flex items-center gap-1 text-[10px] font-medium text-gray-500">
                    {f.fieldType === 'barcode' ? <Barcode size={10} className="text-gray-400" /> 
                     : f.fieldType === 'qr' ? <QrCode size={10} className="text-gray-400" /> 
                     : <Type size={10} className="text-gray-400" />}
                    {f.label}
                  </label>
                  <input
                    type="text"
                    value={sampleData[f.name] || ''}
                    onChange={(e) => handleSampleFieldChange(f.name, e.target.value)}
                    placeholder={f.example}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-xs font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/20 transition-colors"
                  />
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] text-gray-400">
              พิมพ์แล้วรอ 0.3 วิ จะอัพเดตอัตโนมัติ · ค่าเหล่านี้ใช้แสดงตัวอย่างเท่านั้น ไม่บันทึกลง Template
            </p>
          </div>
        )}
      </div>

      {/* Designer canvas */}
      <div className="flex-1 overflow-hidden bg-gray-100">
        <div ref={designerRef} className="h-full w-full" />
      </div>
    </div>
  );
}
