'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import QRCode from 'qrcode';

/* ─────────── Constants ─────────── */
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
const TOKEN_KEY = 'stock_concrete_token';

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

const TYPE_LABELS: Record<string, string> = {
  SOLD: 'ขาย', LOST: 'สูญหาย', DAMAGED: 'ชำรุด/ทำลาย', OTHER: 'อื่นๆ',
};
const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'แบบร่าง', PENDING: 'รอสแกน', IN_PROGRESS: 'กำลังสแกน',
  COMPLETED: 'สแกนครบ', APPROVED: 'อนุมัติแล้ว', CANCELLED: 'ยกเลิก',
};

interface Product { id: number; product_code: string; name: string; counting_unit?: string; }
interface Line { id: number; product_id: number; product?: Product; quantity: number; scanned_qty: number; note?: string; }
interface Scan { id: number; serial_number: string; scanned_at: string; stock_deduction_line_id?: number; }
interface Creator { id: number; name: string; }
interface Deduction {
  id: number; code: string; type: string; status: string;
  customer_name?: string; reference_doc?: string; reason?: string; note?: string;
  pda_token?: string | null;
  created_at: string; approved_at?: string;
  creator?: Creator; approver?: Creator;
  lines?: Line[]; scans?: Scan[];
}

export default function StockDeductionPrintPage() {
  const params = useParams();
  const id = Number(params.id);
  const [data, setData] = useState<Deduction | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [pdaLink, setPdaLink] = useState<string | null>(null);
  const [tokenExpiresAt, setTokenExpiresAt] = useState<string | null>(null);
  const hasPrinted = useRef(false);

  const getAuthToken = () => getCookie(TOKEN_KEY);

  const fetchData = useCallback(async () => {
    try {
      const token = getAuthToken();
      const res = await fetch(`${API}/stock-deductions/${id}`, {
        headers: { 'Accept': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
      });
      const json = await res.json();
      setData(json.data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [id]);

  /* ── Generate/refresh PDA token on print ── */
  const generatePrintToken = useCallback(async (deduction: Deduction) => {
    // ถ้าสถานะเสร็จแล้ว/ยกเลิก → ไม่ต้องสร้าง QR
    if (['APPROVED', 'CANCELLED'].includes(deduction.status)) return;

    try {
      const token = getAuthToken();
      const res = await fetch(`${API}/stock-deductions/${id}/generate-print-token`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
      });
      const json = await res.json();

      if (json.success && json.pda_token) {
        const base = typeof window !== 'undefined' ? window.location.origin : '';
        const link = `${base}/pda/stock-deduction?token=${json.pda_token}&id=${id}`;
        setPdaLink(link);

        // Format expiry date/time
        if (json.expires_at) {
          const exp = new Date(json.expires_at);
          setTokenExpiresAt(exp.toLocaleString('th-TH', {
            year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
          }));
        }

        // Generate QR code as data URL
        const dataUrl = await QRCode.toDataURL(link, {
          width: 200,
          margin: 1,
          color: { dark: '#000000', light: '#ffffff' },
          errorCorrectionLevel: 'M',
        });
        setQrDataUrl(dataUrl);
      }
    } catch { /* ignore — QR just won't show */ }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Generate token after data loaded
  useEffect(() => {
    if (data) {
      generatePrintToken(data);
    }
  }, [data, generatePrintToken]);

  // Auto-print after data + QR ready (or status doesn't need QR)
  useEffect(() => {
    if (!data || hasPrinted.current) return;
    const needsQr = !['APPROVED', 'CANCELLED'].includes(data.status);
    if (needsQr && !qrDataUrl) return; // wait for QR
    hasPrinted.current = true;
    setTimeout(() => window.print(), 800);
  }, [data, qrDataUrl]);

  if (loading) return <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', fontFamily: 'Sarabun, sans-serif', color: '#666' }}>กำลังโหลด...</div>;
  if (!data) return <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', fontFamily: 'Sarabun, sans-serif', color: '#c00' }}>ไม่พบข้อมูลเอกสาร</div>;

  const lines = data.lines || [];
  const scans = data.scans || [];
  const totalQty = lines.reduce((s, l) => s + l.quantity, 0);

  // Group scans by line_id
  const scansByLine = new Map<number, Scan[]>();
  scans.forEach(s => {
    const lid = s.stock_deduction_line_id;
    if (lid) {
      if (!scansByLine.has(lid)) scansByLine.set(lid, []);
      scansByLine.get(lid)!.push(s);
    }
  });
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
  const fmtShortDate = (d: string) => new Date(d).toLocaleDateString('th-TH', { year: 'numeric', month: '2-digit', day: '2-digit' });

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body {
          font-family: 'Sarabun', 'Noto Sans Thai', Tahoma, sans-serif;
          font-size: 11pt; color: #111; line-height: 1.6; background: #ddd;
        }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

        @page { size: A4 portrait; margin: 0 5mm 5mm 5mm; }
        @media print {
          html, body { background: #fff; margin: 0; padding: 0; }
          .toolbar { display: none !important; }
          .spacer { display: none !important; }
          .paper { box-shadow: none !important; border: none !important; outline: none !important; margin: 0; padding: 0; width: auto; }
          .sigs { position: fixed; bottom: 0; left: 0; right: 0; margin: 0; padding: 0 8mm 2mm 8mm; }
        }

        .paper {
          width: 210mm;
          margin: 10mm auto; background: #fff;
          box-shadow: 0 1px 10px rgba(0,0,0,.12);
          padding: 10mm 10mm 8mm 10mm;
          position: relative;
        }

        /* ── Toolbar ── */
        .toolbar {
          position: fixed; top: 0; left: 0; right: 0; z-index: 999;
          background: #1e293b; padding: 8px 20px;
          display: flex; align-items: center; gap: 10px;
          box-shadow: 0 2px 8px rgba(0,0,0,.25);
        }
        .toolbar button {
          border: none; border-radius: 5px; padding: 7px 16px;
          font-size: 13px; font-weight: 600; cursor: pointer;
          font-family: inherit;
        }
        .toolbar .bp { background: #2563eb; color: #fff; }
        .toolbar .bp:hover { background: #1d4ed8; }
        .toolbar .bb { background: transparent; color: #94a3b8; border: 1px solid #475569; }
        .toolbar .bb:hover { background: #334155; color: #fff; }
        .toolbar span { margin-left: auto; color: #64748b; font-size: 12px; }

        /* ════════ Document ════════ */

        /* Header */
        .hdr { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2pt solid #222; padding-bottom: 6pt; margin-bottom: 8pt; }
        .hdr-left h1 { font-size: 15pt; font-weight: 700; color: #111; line-height: 1.2; }
        .hdr-left p { font-size: 8pt; color: #999; letter-spacing: 1.5pt; text-transform: uppercase; }
        .hdr-right { text-align: right; }
        .hdr-right .no { font-size: 14pt; font-weight: 700; font-family: 'Courier New', monospace; color: #1d4ed8; }
        .hdr-right .dt { font-size: 9pt; color: #666; margin-top: 2pt; }

        /* Info block */
        .info { display: grid; grid-template-columns: 1fr 1fr; border: 1pt solid #ccc; margin-bottom: 12pt; }
        .info-item { display: flex; border-bottom: 0.5pt solid #e5e5e5; }
        .info-item:last-child { border-bottom: none; }
        .info-item .k { width: 65pt; padding: 2.5pt 6pt; font-size: 8pt; font-weight: 600; color: #666; background: #fafafa; border-right: 0.5pt solid #e5e5e5; flex-shrink: 0; }
        .info-item .v { flex: 1; padding: 2.5pt 6pt; font-size: 9pt; color: #111; }
        .info-left { border-right: 1pt solid #ccc; }

        /* Table */
        table.items { width: 100%; border-collapse: collapse; margin-bottom: 8pt; }
        table.items thead th {
          background: #222; color: #fff; font-size: 7.5pt; font-weight: 600;
          padding: 3pt 4pt; text-transform: uppercase; letter-spacing: 0.3pt;
        }
        table.items thead th:first-child { border-radius: 3pt 0 0 0; }
        table.items thead th:last-child { border-radius: 0 3pt 0 0; }
        table.items tbody td { padding: 2.5pt 4pt; border-bottom: 0.5pt solid #e8e8e8; font-size: 8.5pt; }
        table.items tbody tr:nth-child(even) { background: #fafbfc; }
        table.items tbody td.sn { font-family: 'Courier New', monospace; font-size: 7.5pt; word-break: break-all; }
        table.items tfoot td {
          padding: 3pt 4pt; font-weight: 700; font-size: 9pt;
          border-top: 1.5pt solid #222; background: #f5f5f5;
        }
        .al { text-align: left; }
        .ac { text-align: center; }
        .ar { text-align: right; }
        .mono { font-family: 'Courier New', monospace; font-size: 8.5pt; }
        .muted { color: #999; }

        /* Note */
        .note-box { border: 1pt solid #ddd; border-radius: 4pt; padding: 8pt 10pt; margin: 12pt 0; font-size: 9pt; color: #444; background: #fafafa; min-height: 40pt; }
        .note-box .note-label { font-size: 7.5pt; font-weight: 600; color: #999; text-transform: uppercase; margin-bottom: 3pt; }

        /* Signatures */
        .sigs { display: flex; justify-content: space-between; margin-top: 30pt; padding-top: 20pt; }
        .sig { width: 140pt; text-align: center; }
        .sig .line { margin-top: 36pt; border-bottom: 0.8pt solid #444; margin-bottom: 4pt; }
        .sig .role { font-size: 9pt; font-weight: 700; }
        .sig .name { font-size: 7.5pt; color: #888; margin-top: 2pt; }
        .sig .date { font-size: 7pt; color: #aaa; margin-top: 1pt; }

        /* Watermark */
        .wm { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%) rotate(-30deg); font-size: 60pt; font-weight: 900; opacity: 0.08; pointer-events: none; letter-spacing: 8pt; color: #666; }
        .wm-cancel { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%) rotate(-25deg); font-size: 72pt; font-weight: 900; opacity: 0.15; pointer-events: none; letter-spacing: 12pt; color: #dc2626; border: 6pt solid rgba(220,38,38,0.15); padding: 10pt 40pt; border-radius: 12pt; }

        /* QR Code */
        .qr-section { display: flex; align-items: center; gap: 10pt; border: 1.5pt solid #2563eb; border-radius: 6pt; padding: 8pt 12pt; margin-bottom: 12pt; background: #eff6ff; }
        .qr-section img { width: 80pt; height: 80pt; flex-shrink: 0; }
        .qr-info { flex: 1; }
        .qr-info .qr-title { font-size: 10pt; font-weight: 700; color: #1d4ed8; margin-bottom: 2pt; }
        .qr-info .qr-desc { font-size: 7.5pt; color: #555; line-height: 1.5; }
        .qr-info .qr-link { font-size: 6pt; color: #999; word-break: break-all; margin-top: 3pt; font-family: 'Courier New', monospace; }
        .qr-info .qr-expire { font-size: 7pt; color: #dc2626; font-weight: 600; margin-top: 2pt; }
      `}</style>

      {/* Toolbar */}
      <div className="toolbar">
        <button className="bp" onClick={() => window.print()}>🖨️ พิมพ์</button>
        <button className="bb" onClick={() => window.history.back()}>← กลับ</button>
        <span>{data.code}</span>
      </div>
      <div className="spacer" style={{ height: 48 }} />

      {/* ════════ DOCUMENT ════════ */}
      <div className="paper">

        {data.status === 'DRAFT' && <div className="wm">DRAFT</div>}
        {data.status === 'CANCELLED' && <div className="wm-cancel">ยกเลิก</div>}

        {/* Header */}
        <div className="hdr">
          <div className="hdr-left">
            <h1>ใบตัดสต๊อกสินค้า</h1>
            <p>Stock Deduction Document</p>
          </div>
          <div className="hdr-right">
            <div className="no">{data.code}</div>
            <div className="dt">{fmtDate(data.created_at)}</div>
          </div>
        </div>

        {/* Info */}
        <div className="info">
          <div className="info-left">
            <div className="info-item"><div className="k">ประเภท</div><div className="v">{TYPE_LABELS[data.type] || data.type}</div></div>
            <div className="info-item"><div className="k">สถานะ</div><div className="v" style={{ fontWeight: 700 }}>{STATUS_LABELS[data.status] || data.status}</div></div>
            {data.customer_name && <div className="info-item"><div className="k">ลูกค้า</div><div className="v">{data.customer_name}</div></div>}
            {data.reference_doc && <div className="info-item"><div className="k">เลขที่อ้างอิง</div><div className="v">{data.reference_doc}</div></div>}
          </div>
          <div className="info-right">
            <div className="info-item"><div className="k">ผู้จัดทำ</div><div className="v">{data.creator?.name || '-'}</div></div>
            <div className="info-item"><div className="k">วันที่สร้าง</div><div className="v">{fmtShortDate(data.created_at)}</div></div>
            {data.approver && <div className="info-item"><div className="k">ผู้อนุมัติ</div><div className="v">{data.approver.name}</div></div>}
            {data.approved_at && <div className="info-item"><div className="k">วันที่อนุมัติ</div><div className="v">{fmtShortDate(data.approved_at)}</div></div>}
          </div>
        </div>

        {/* QR Code — PDA Scan Link */}
        {qrDataUrl && pdaLink && !['APPROVED', 'CANCELLED'].includes(data.status) && (
          <div className="qr-section">
            <img src={qrDataUrl} alt="QR Code สแกนตัดสต๊อก" />
            <div className="qr-info">
              <div className="qr-title">📱 สแกน QR Code เพื่อตัดสต๊อกสินค้า</div>
              <div className="qr-desc">
                ใช้ PDA หรือโทรศัพท์มือถือสแกน QR Code นี้<br />
                เพื่อเข้าสู่หน้าสแกน Barcode ตัดสต๊อกสินค้า
              </div>
              <div className="qr-expire">⏱ หมดอายุ: {tokenExpiresAt || '24 ชั่วโมงนับจากเวลาปริ้น'}</div>
              <div className="qr-link">{pdaLink}</div>
            </div>
          </div>
        )}

        {/* Items table */}
        <table className="items">
          <thead>
            <tr>
              <th className="ac" style={{ width: 22 }}>ลำดับ</th>
              <th className="al" style={{ width: 55 }}>รหัสสินค้า</th>
              <th className="al" style={{ width: 140 }}>S/N</th>
              <th className="al">รายการ</th>
              <th className="ac" style={{ width: 32 }}>หน่วย</th>
              <th className="ac" style={{ width: 34 }}>จำนวน</th>
              <th className="al" style={{ width: 140 }}>หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              let rowNum = 0;
              return lines.flatMap((line) => {
                const lineScans = scansByLine.get(line.id) || [];
                if (lineScans.length === 0) {
                  rowNum++;
                  return [(
                    <tr key={line.id}>
                      <td className="ac muted">{rowNum}</td>
                      <td className="mono">{line.product?.product_code || '-'}</td>
                      <td className="sn muted">-</td>
                      <td>{line.product?.name || '-'}</td>
                      <td className="ac muted">{line.product?.counting_unit || 'ชิ้น'}</td>
                      <td className="ac" style={{ fontWeight: 700 }}>{line.quantity}</td>
                      <td className="muted" style={{ fontSize: '8.5pt' }}>{line.note || '-'}</td>
                    </tr>
                  )];
                }
                return lineScans.map((s) => {
                  rowNum++;
                  return (
                    <tr key={`sn-${s.id}`}>
                      <td className="ac muted">{rowNum}</td>
                      <td className="mono">{line.product?.product_code || '-'}</td>
                      <td className="sn">{s.serial_number}</td>
                      <td>{line.product?.name || '-'}</td>
                      <td className="ac muted">{line.product?.counting_unit || 'ชิ้น'}</td>
                      <td className="ac" style={{ fontWeight: 700 }}>1</td>
                      <td className="muted" style={{ fontSize: '8.5pt' }}>{line.note || '-'}</td>
                    </tr>
                  );
                });
              });
            })()}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} className="ar">รวมทั้งสิ้น</td>
              <td className="ac">{totalQty}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>

        {/* Reason / Note */}
        {(data.reason || data.note) && (
          <div className="note-box">
            {data.reason && <><div className="note-label">เหตุผล</div><div>{data.reason}</div></>}
            {data.reason && data.note && <div style={{ height: 6 }} />}
            {data.note && <><div className="note-label">หมายเหตุ</div><div>{data.note}</div></>}
          </div>
        )}

        {/* Signatures */}
        <div className="sigs">
          <div className="sig">
            <div className="line" />
            <div className="role">ผู้จัดทำ</div>
            <div className="name">( {data.creator?.name || '..............................'} )</div>
            <div className="date">วันที่ {fmtShortDate(data.created_at)}</div>
          </div>
          <div className="sig">
            <div className="line" />
            <div className="role">ผู้ตรวจสอบ</div>
            <div className="name">( .............................. )</div>
            <div className="date">วันที่ ........./........./..........</div>
          </div>
          <div className="sig">
            <div className="line" />
            <div className="role">ผู้อนุมัติ</div>
            <div className="name">( {data.approver?.name || '..............................'} )</div>
            <div className="date">{data.approved_at ? `วันที่ ${fmtShortDate(data.approved_at)}` : 'วันที่ ........./........./..........'}</div>
          </div>
        </div>

      </div>
    </>
  );
}
