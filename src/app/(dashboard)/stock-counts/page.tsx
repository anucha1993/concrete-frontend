'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AuthGuard from '@/components/AuthGuard';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import Pagination from '@/components/ui/Pagination';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { stockCountService } from '@/services/stock-count.service';
import { categoryService, locationService } from '@/services/master.service';
import { productService } from '@/services/product.service';
import { labelService } from '@/services/label.service';
import type {
  StockCount,
  StockCountScan,
  StockCountStats,
  StockCountPayload,
  StockCountUnresolved,
  Category,
  Location,
  Product,
} from '@/lib/types';
import { AxiosError } from 'axios';
import {
  Plus, Search, Eye, Play, Square, CheckCircle, XCircle,
  AlertTriangle, Copy, Check, Link, Printer,
  Package, ScanBarcode, ChevronRight, ChevronDown,
} from 'lucide-react';

/* ─── Status / Type maps ─── */
const STATUS_MAP: Record<string, { label: string; variant: 'gray' | 'info' | 'warning' | 'success' | 'danger' }> = {
  DRAFT:       { label: 'แบบร่าง', variant: 'gray' },
  IN_PROGRESS: { label: 'กำลังนับ', variant: 'info' },
  COMPLETED:   { label: 'นับเสร็จ', variant: 'warning' },
  APPROVED:    { label: 'อนุมัติแล้ว', variant: 'success' },
  CANCELLED:   { label: 'ยกเลิก', variant: 'danger' },
};

const TYPE_MAP: Record<string, string> = {
  FULL:  'นับทั้งคลัง',
  CYCLE: 'นับบางหมวด/ที่',
  SPOT:  'นับเฉพาะรายการ',
};

const RESOLUTION_MAP: Record<string, { label: string; variant: 'gray' | 'info' | 'warning' | 'success' | 'danger' }> = {
  PENDING:   { label: 'รอตรวจสอบ', variant: 'warning' },
  MATCHED:   { label: 'ตรงกัน', variant: 'success' },
  ADJUSTED:  { label: 'ปรับปรุงแล้ว', variant: 'info' },
  IGNORED:   { label: 'ข้าม', variant: 'gray' },
  WRITE_OFF: { label: 'ตัดสต๊อก', variant: 'danger' },
  KEEP:      { label: 'คงไว้', variant: 'info' },
};

const SCAN_RESOLUTION_MAP: Record<string, { label: string; variant: 'gray' | 'info' | 'warning' | 'success' | 'danger' }> = {
  IMPORT: { label: 'นำเข้า', variant: 'success' },
  IGNORE: { label: 'ไม่นำเข้า', variant: 'gray' },
};

export default function StockCountsPage() {
  return (
    <AuthGuard permission="view_operations">
      <StockCountsContent />
    </AuthGuard>
  );
}

function StockCountsContent() {
  /* ─── List state ─── */
  const [counts, setCounts] = useState<StockCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  /* ─── Detail state ─── */
  const [selectedCount, setSelectedCount] = useState<StockCount | null>(null);
  const [stats, setStats] = useState<StockCountStats | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  /* ─── Create modal ─── */
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<StockCountPayload>({
    name: '',
    type: 'FULL',
    note: '',
  });
  const [creating, setCreating] = useState(false);

  /* ─── Master data for filters ─── */
  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  /* ─── Scans modal ─── */
  const [showScans, setShowScans] = useState(false);
  const [scans, setScans] = useState<StockCountScan[]>([]);
  const [scansLoading, setScansLoading] = useState(false);
  const [scanFilter, setScanFilter] = useState('');

  /* ─── Action loading ─── */
  const [actionLoading, setActionLoading] = useState(false);

  /* ─── PDA tokens for copy URL ─── */
  const [pdaTokens, setPdaTokens] = useState<Array<{ id: number; token: string; name: string; is_valid: boolean }>>([]);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  /* ─── Resolution state ─── */
  const [unexpectedScans, setUnexpectedScans] = useState<StockCountScan[]>([]);
  const [unresolved, setUnresolved] = useState<StockCountUnresolved>({ missing_serials: 0, unexpected_scans: 0, total: 0 });
  const [missingByProduct, setMissingByProduct] = useState<Record<number, { missing_count: number; resolved_count: number }>>({});

  /* ═══ Fetch list ═══ */
  const fetchCounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await stockCountService.list({
        page,
        per_page: 15,
        search: search || undefined,
        status: statusFilter || undefined,
      });
      setCounts(res.data);
      setLastPage(res.meta?.last_page ?? res.last_page ?? 1);
      setTotal(res.meta?.total ?? res.total ?? 0);
    } catch {
      toast('โหลดรอบนับไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => { fetchCounts(); }, [fetchCounts]);

  /* ═══ Fetch master data for create modal ═══ */
  const fetchMasterData = useCallback(async () => {
    try {
      const [catRes, locRes, prodRes] = await Promise.all([
        categoryService.list(),
        locationService.list(),
        productService.list({ per_page: 500 }),
      ]);
      setCategories(catRes.data ?? []);
      setLocations(locRes.data ?? []);
      setProducts(prodRes.data ?? []);
    } catch { /* silently fail */ }
  }, []);

  useEffect(() => { fetchMasterData(); }, [fetchMasterData]);

  /* ═══ Fetch PDA tokens ═══ */
  const fetchPdaTokens = useCallback(async () => {
    try {
      const res = await labelService.listPdaTokens();
      setPdaTokens((res.data ?? []).filter((t: { is_valid: boolean }) => t.is_valid));
    } catch { /* silently fail */ }
  }, []);

  useEffect(() => { fetchPdaTokens(); }, [fetchPdaTokens]);

  /* ═══ Copy PDA URL ═══ */
  const copyPdaUrl = async (scId: number) => {
    if (pdaTokens.length === 0) {
      toast('ไม่มี PDA Token ที่ใช้งานได้ — กรุณาสร้าง Token ในหน้า ปริ้น Label > PDA Token ก่อน', 'error');
      return;
    }
    const tkn = pdaTokens[0].token;
    const url = `${window.location.origin}/pda/stock-count?token=${tkn}&sc=${scId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(scId);
      toast('คัดลอก URL สำหรับ PDA แล้ว', 'success');
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast('ไม่สามารถคัดลอกได้', 'error');
    }
  };

  /* ═══ Fetch detail ═══ */
  const openDetail = async (id: number) => {
    setDetailLoading(true);
    setShowDetail(true);
    try {
      const res = await stockCountService.get(id);
      setSelectedCount(res.data);
      setStats(res.stats);
      setUnexpectedScans(res.unexpected_scans ?? []);
      setMissingByProduct(res.missing_by_product ?? {});
      setUnresolved(res.unresolved ?? { missing_serials: 0, unexpected_scans: 0, total: 0 });
    } catch {
      toast('โหลดรายละเอียดไม่สำเร็จ', 'error');
      setShowDetail(false);
    } finally {
      setDetailLoading(false);
    }
  };

  /** Refresh detail data silently (no loading spinner, keeps component mounted) */
  const refreshDetail = async (id: number) => {
    try {
      const res = await stockCountService.get(id);
      setSelectedCount(res.data);
      setStats(res.stats);
      setUnexpectedScans(res.unexpected_scans ?? []);
      setMissingByProduct(res.missing_by_product ?? {});
      setUnresolved(res.unresolved ?? { missing_serials: 0, unexpected_scans: 0, total: 0 });
    } catch { /* silent */ }
  };

  /* ═══ Fetch scans ═══ */
  const openScans = async (scId: number, filter = '') => {
    setScansLoading(true);
    setShowScans(true);
    setScanFilter(filter);
    try {
      const res = await stockCountService.scans(scId, { per_page: 100, filter: filter || undefined });
      setScans(res.data ?? []);
    } catch {
      toast('โหลดรายการสแกนไม่สำเร็จ', 'error');
    } finally {
      setScansLoading(false);
    }
  };

  /* ═══ Create ═══ */
  const handleCreate = async () => {
    if (!createForm.name.trim()) {
      toast('กรุณาตั้งชื่อรอบนับ', 'error');
      return;
    }
    setCreating(true);
    try {
      const res = await stockCountService.create(createForm);
      toast(res.message || 'สร้างรอบนับแล้ว', 'success');
      setShowCreate(false);
      setCreateForm({ name: '', type: 'FULL', note: '' });
      fetchCounts();
    } catch (err) {
      const msg = err instanceof AxiosError ? err.response?.data?.message : 'เกิดข้อผิดพลาด';
      toast(msg || 'สร้างรอบนับไม่สำเร็จ', 'error');
    } finally {
      setCreating(false);
    }
  };

  /* ═══ Workflow actions ═══ */
  const handleAction = async (action: 'start' | 'complete' | 'cancel', sc: StockCount) => {
    const confirmMsg: Record<string, string> = {
      start: `เริ่มนับรอบ "${sc.code}" — ระบบจะ snapshot สต๊อกปัจจุบัน`,
      complete: `ปิดรอบนับ "${sc.code}" — จะคำนวณผลต่าง`,
      cancel: `ยกเลิกรอบนับ "${sc.code}"`,
    };
    if (!confirm(confirmMsg[action])) return;

    setActionLoading(true);
    try {
      const res = await stockCountService[action](sc.id);
      toast(res.message || 'ดำเนินการสำเร็จ', 'success');
      fetchCounts();
      if (showDetail) openDetail(sc.id);
    } catch (err) {
      const msg = err instanceof AxiosError ? err.response?.data?.message : 'เกิดข้อผิดพลาด';
      toast(msg || 'ดำเนินการไม่สำเร็จ', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  /* ═══ Approve ═══ */
  const handleApprove = async (sc: StockCount) => {
    if (!confirm(`อนุมัติปรับปรุงรอบ "${sc.code}" — ระบบจะดำเนินการตามที่กำหนดไว้ (ตัดสต๊อก/นำเข้า)`)) return;

    setActionLoading(true);
    try {
      const res = await stockCountService.approve(sc.id);
      toast(res.message || 'อนุมัติแล้ว', 'success');
      fetchCounts();
      if (showDetail) openDetail(sc.id);
    } catch (err) {
      const msg = err instanceof AxiosError ? err.response?.data?.message : 'เกิดข้อผิดพลาด';
      toast(msg || 'อนุมัติไม่สำเร็จ', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  /* ═══ Resolve discrepancies ═══ */
  const handleResolveSerial = async (inventoryId: number, action: 'WRITE_OFF' | 'KEEP') => {
    if (!selectedCount) return;
    setActionLoading(true);
    try {
      const res = await stockCountService.resolveSerial(selectedCount.id, { inventory_id: inventoryId, action });
      toast(res.message || 'บันทึกแล้ว', 'success');
      await refreshDetail(selectedCount.id);
    } catch (err) {
      const msg = err instanceof AxiosError ? err.response?.data?.message : 'เกิดข้อผิดพลาด';
      toast(msg || 'บันทึกไม่สำเร็จ', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolveScan = async (scanId: number, action: 'IMPORT' | 'IGNORE', productId?: number, locationId?: number) => {
    if (!selectedCount) return;
    // Optimistic update — show selected value + product immediately
    const resolvedProduct = productId ? products.find(p => p.id === productId) : undefined;
    setUnexpectedScans(prev => prev.map(s => s.id === scanId ? {
      ...s,
      resolution: action,
      ...(resolvedProduct ? { resolution_product: { id: resolvedProduct.id, product_code: resolvedProduct.product_code, name: resolvedProduct.name } } : {}),
    } : s));
    setActionLoading(true);
    try {
      const res = await stockCountService.resolveScan(selectedCount.id, {
        scan_id: scanId,
        action,
        product_id: productId,
        location_id: locationId,
      });
      toast(res.message || 'บันทึกแล้ว', 'success');
      await refreshDetail(selectedCount.id);
    } catch (err) {
      const msg = err instanceof AxiosError ? err.response?.data?.message : 'เกิดข้อผิดพลาด';
      toast(msg || 'บันทึกไม่สำเร็จ', 'error');
      // Revert on error
      await refreshDetail(selectedCount.id);
    } finally {
      setActionLoading(false);
    }
  };

  /* ═══ Print Report ═══ */
  const handlePrintReport = async (id: number) => {
    try {
      const res = await stockCountService.report(id);
      const d = res.data;

      const TYPE_LABELS: Record<string, string> = { FULL: 'นับทั้งคลัง', CYCLE: 'นับบางหมวด/ที่', SPOT: 'นับเฉพาะรายการ' };
      const STATUS_LABELS: Record<string, string> = { DRAFT: 'แบบร่าง', IN_PROGRESS: 'กำลังนับ', COMPLETED: 'นับเสร็จ', APPROVED: 'อนุมัติแล้ว', CANCELLED: 'ยกเลิก' };
      const RESOLUTION_LABELS: Record<string, string> = { WRITE_OFF: 'ตัดสต๊อก', KEEP: 'คงไว้', IMPORT: 'นำเข้าสต๊อก', IGNORE: 'ไม่นำเข้า' };

      const fmtDate = (s: string | null) => s ? new Date(s).toLocaleString('th-TH') : '-';

      // Build items rows
      const itemRows = (d.items ?? []).map((item: { product_code: string; product_name: string; category: string; expected_qty: number; scanned_qty: number; difference: number; resolution: string; serial_resolutions: Array<{ serial_number: string; resolution: string }> }) => {
        const diffClass = item.difference === 0 ? 'text-green' : item.difference > 0 ? 'text-yellow' : 'text-red';
        const diffSign  = item.difference > 0 ? '+' : '';

        // Serial resolution sub-rows
        let serialRows = '';
        if (item.serial_resolutions && item.serial_resolutions.length > 0) {
          serialRows = item.serial_resolutions.map((sr: { serial_number: string; resolution: string }) =>
            `<tr class="serial-row">
              <td colspan="3" style="padding-left:40px;font-family:monospace;font-size:11px;color:#555;">↳ ${sr.serial_number}</td>
              <td colspan="2" style="font-size:11px;">
                <span class="badge badge-${sr.resolution === 'WRITE_OFF' ? 'red' : 'blue'}">${RESOLUTION_LABELS[sr.resolution] ?? sr.resolution}</span>
              </td>
            </tr>`
          ).join('');
        }

        return `<tr>
          <td>
            <strong>${item.product_name ?? '-'}</strong><br/>
            <span style="font-size:11px;color:#888;font-family:monospace;">${item.product_code ?? ''}</span>
          </td>
          <td class="text-center">${item.expected_qty}</td>
          <td class="text-center">${item.scanned_qty}</td>
          <td class="text-center ${diffClass}"><strong>${diffSign}${item.difference}</strong></td>
          <td class="text-center">
            ${item.difference === 0 ? '<span class="badge badge-green">ตรง</span>' :
              item.serial_resolutions?.length > 0 ? `<span class="badge badge-blue">กำหนดแล้ว ${item.serial_resolutions.length} serial</span>` :
              (item.resolution ?? '-')}
          </td>
        </tr>${serialRows}`;
      }).join('');

      // Unexpected scans rows
      const unexpectedRows = (d.unexpected_scans ?? []).length > 0
        ? (d.unexpected_scans ?? []).map((s: { serial_number: string; product: string; product_code: string; resolution: string | null; scanned_at: string }) =>
            `<tr>
              <td style="font-family:monospace;font-size:12px;">${s.serial_number}</td>
              <td>${s.product}<br/><span style="font-size:11px;color:#888;">${s.product_code}</span></td>
              <td class="text-center">
                ${s.resolution ? `<span class="badge badge-${s.resolution === 'IMPORT' ? 'green' : 'gray'}">${RESOLUTION_LABELS[s.resolution] ?? s.resolution}</span>` : '<span class="badge badge-yellow">ยังไม่กำหนด</span>'}
              </td>
              <td style="font-size:11px;">${fmtDate(s.scanned_at)}</td>
            </tr>`
          ).join('')
        : '';

      const html = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <title>ใบนับสต๊อก ${d.code}</title>
  <style>
    @page { size: A4; margin: 15mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Sarabun', 'Noto Sans Thai', 'Segoe UI', sans-serif; font-size: 13px; color: #222; line-height: 1.5; }
    h1 { font-size: 20px; margin-bottom: 2px; }
    h2 { font-size: 15px; color: #333; margin: 18px 0 8px; border-bottom: 2px solid #2563eb; padding-bottom: 4px; }
    .subtitle { font-size: 13px; color: #666; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
    .header-left { flex: 1; }
    .header-right { text-align: right; }
    .status-badge { display: inline-block; padding: 3px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; }
    .status-DRAFT { background: #f3f4f6; color: #6b7280; }
    .status-IN_PROGRESS { background: #dbeafe; color: #1d4ed8; }
    .status-COMPLETED { background: #fef3c7; color: #d97706; }
    .status-APPROVED { background: #d1fae5; color: #059669; }
    .status-CANCELLED { background: #fee2e2; color: #dc2626; }

    .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-size: 100px; font-weight: 900; color: rgba(220, 38, 38, 0.15); pointer-events: none; z-index: 999; letter-spacing: 10px; }

    .info-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; background: #f9fafb; border-radius: 8px; padding: 12px; margin-bottom: 16px; border: 1px solid #e5e7eb; }
    .info-item label { font-size: 11px; color: #888; display: block; }
    .info-item span { font-size: 13px; font-weight: 600; }

    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px; }
    .stat-card { border-radius: 8px; padding: 10px; text-align: center; border: 1px solid; }
    .stat-card .value { font-size: 22px; font-weight: 700; }
    .stat-card .label { font-size: 11px; color: #666; }
    .stat-blue { background: #eff6ff; border-color: #bfdbfe; color: #1d4ed8; }
    .stat-green { background: #f0fdf4; border-color: #bbf7d0; color: #16a34a; }
    .stat-yellow { background: #fffbeb; border-color: #fde68a; color: #d97706; }
    .stat-red { background: #fef2f2; border-color: #fecaca; color: #dc2626; }

    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { background: #f9fafb; font-size: 12px; font-weight: 600; color: #555; text-align: left; padding: 8px; border-bottom: 2px solid #e5e7eb; }
    td { padding: 6px 8px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .text-green { color: #16a34a; }
    .text-yellow { color: #d97706; }
    .text-red { color: #dc2626; }
    .serial-row td { background: #fafbfc; border-bottom: 1px solid #f5f5f5; }

    .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
    .badge-green { background: #d1fae5; color: #059669; }
    .badge-red { background: #fee2e2; color: #dc2626; }
    .badge-blue { background: #dbeafe; color: #1d4ed8; }
    .badge-yellow { background: #fef3c7; color: #d97706; }
    .badge-gray { background: #f3f4f6; color: #6b7280; }

    .note-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; margin-bottom: 16px; }
    .note-box label { font-size: 11px; color: #888; }

    .footer { margin-top: 30px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
    .sign-box { border-top: 1px solid #999; padding-top: 8px; text-align: center; font-size: 12px; color: #666; margin-top: 60px; }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  ${d.status === 'CANCELLED' ? '<div class="watermark">ยกเลิก</div>' : ''}
  <div class="header">
    <div class="header-left">
      <h1>ใบตรวจนับสต๊อก</h1>
      <div class="subtitle">${d.code} — ${d.name}</div>
    </div>
    <div class="header-right">
      <span class="status-badge status-${d.status}">${STATUS_LABELS[d.status] ?? d.status}</span>
      <div style="font-size:11px;color:#999;margin-top:4px;">${TYPE_LABELS[d.type] ?? d.type}</div>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-item"><label>สร้างโดย</label><span>${d.creator}</span></div>
    <div class="info-item"><label>เริ่มนับ</label><span>${fmtDate(d.started_at)}</span></div>
    <div class="info-item"><label>นับเสร็จ</label><span>${fmtDate(d.completed_at)}</span></div>
    <div class="info-item"><label>อนุมัติโดย</label><span>${d.approver}</span></div>
  </div>

  ${d.note ? `<div class="note-box"><label>หมายเหตุ:</label> ${d.note}</div>` : ''}

  <div class="stats-grid">
    <div class="stat-card stat-blue"><div class="value">${d.stats.total_expected}</div><div class="label">คาดหวัง</div></div>
    <div class="stat-card stat-green"><div class="value">${d.stats.total_scanned}</div><div class="label">สแกนแล้ว</div></div>
    <div class="stat-card stat-yellow"><div class="value">${d.stats.over}</div><div class="label">ของเกิน</div></div>
    <div class="stat-card stat-red"><div class="value">${d.stats.under}</div><div class="label">ของขาด</div></div>
  </div>

  <h2>รายการสินค้า (${(d.items ?? []).length})</h2>
  <table>
    <thead>
      <tr>
        <th>สินค้า</th>
        <th class="text-center" style="width:80px;">คาดหวัง</th>
        <th class="text-center" style="width:80px;">สแกน</th>
        <th class="text-center" style="width:80px;">ผลต่าง</th>
        <th class="text-center" style="width:120px;">สถานะ</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  ${unexpectedRows ? `
  <h2>สินค้านอกรายการ (${(d.unexpected_scans ?? []).length})</h2>
  <table>
    <thead>
      <tr>
        <th>Serial</th>
        <th>สินค้า</th>
        <th class="text-center" style="width:120px;">การจัดการ</th>
        <th style="width:140px;">เวลาสแกน</th>
      </tr>
    </thead>
    <tbody>${unexpectedRows}</tbody>
  </table>
  ` : ''}

  <div class="footer">
    <div>
      <div class="sign-box">ผู้ตรวจนับ / ผู้ปิดรอบ</div>
    </div>
    <div>
      <div class="sign-box">ผู้อนุมัติ</div>
    </div>
  </div>

  <div style="text-align:center;margin-top:20px;font-size:10px;color:#aaa;">
    พิมพ์เมื่อ ${new Date().toLocaleString('th-TH')} — Stock Concrete ERP
  </div>
</body>
</html>`;

      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        setTimeout(() => { printWindow.print(); }, 400);
      }
    } catch (err) {
      const msg = err instanceof AxiosError ? err.response?.data?.message : 'เกิดข้อผิดพลาด';
      toast(msg || 'โหลดข้อมูลรายงานไม่สำเร็จ', 'error');
    }
  };

  /* ═══ Columns ═══ */
  const columns = [
    {
      key: 'code',
      label: 'รหัส',
      render: (sc: StockCount) => (
        <span className="font-mono text-sm font-semibold text-blue-600">{sc.code}</span>
      ),
    },
    { key: 'name', label: 'ชื่อรอบนับ' },
    {
      key: 'type',
      label: 'ประเภท',
      render: (sc: StockCount) => TYPE_MAP[sc.type] || sc.type,
    },
    {
      key: 'status',
      label: 'สถานะ',
      render: (sc: StockCount) => {
        const s = STATUS_MAP[sc.status];
        return s ? <Badge variant={s.variant}>{s.label}</Badge> : sc.status;
      },
    },
    {
      key: 'items_count',
      label: 'สินค้า',
      render: (sc: StockCount) => (
        <span className="text-sm text-gray-600">{sc.items_count ?? '-'} รายการ</span>
      ),
    },
    {
      key: 'scans_count',
      label: 'สแกน',
      render: (sc: StockCount) => (
        <span className="text-sm text-gray-600">{sc.scans_count ?? 0} ครั้ง</span>
      ),
    },
    {
      key: 'created_at',
      label: 'สร้างเมื่อ',
      render: (sc: StockCount) => (
        <div className="text-sm text-gray-500">
          <div>{new Date(sc.created_at).toLocaleDateString('th-TH')}</div>
          <div className="text-xs">{sc.creator?.name}</div>
        </div>
      ),
    },
    {
      key: 'actions',
      label: '',
      render: (sc: StockCount) => (
        <div className="flex gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); openDetail(sc.id); }}
            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600"
            title="ดูรายละเอียด"
          >
            <Eye size={16} />
          </button>
          {!['DRAFT'].includes(sc.status) && (
            <button
              onClick={(e) => { e.stopPropagation(); handlePrintReport(sc.id); }}
              className="rounded p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600"
              title="พิมพ์ใบนับสต๊อก"
            >
              <Printer size={16} />
            </button>
          )}
          {sc.status === 'IN_PROGRESS' && (
            <button
              onClick={(e) => { e.stopPropagation(); copyPdaUrl(sc.id); }}
              className="rounded p-1.5 text-gray-400 hover:bg-indigo-50 hover:text-indigo-600"
              title="คัดลอก URL สำหรับ PDA"
            >
              {copiedId === sc.id ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
            </button>
          )}
          {sc.status === 'DRAFT' && (
            <button
              onClick={(e) => { e.stopPropagation(); handleAction('start', sc); }}
              className="rounded p-1.5 text-gray-400 hover:bg-green-50 hover:text-green-600"
              disabled={actionLoading}
              title="เริ่มนับ"
            >
              <Play size={16} />
            </button>
          )}
          {sc.status === 'IN_PROGRESS' && (
            <button
              onClick={(e) => { e.stopPropagation(); handleAction('complete', sc); }}
              className="rounded p-1.5 text-gray-400 hover:bg-yellow-50 hover:text-yellow-600"
              disabled={actionLoading}
              title="ปิดรอบนับ"
            >
              <Square size={16} />
            </button>
          )}
          {!['APPROVED', 'CANCELLED'].includes(sc.status) && (
            <button
              onClick={(e) => { e.stopPropagation(); handleAction('cancel', sc); }}
              className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
              disabled={actionLoading}
              title="ยกเลิก"
            >
              <XCircle size={16} />
            </button>
          )}
        </div>
      ),
    },
  ];

  /* ═══════════════════════════════════════════════════════════ */
  return (
    <div className="space-y-6">
      <PageHeader
        title="ตรวจนับสต๊อก"
        description={`ทั้งหมด ${total} รอบ`}
        actions={
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus size={16} /> สร้างรอบนับ
          </button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="ค้นหารหัส / ชื่อรอบ..."
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">ทุกสถานะ</option>
          {Object.entries(STATUS_MAP).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={counts}
        loading={loading}
        emptyMessage="ไม่พบรอบนับ"
        onRowClick={(sc) => openDetail(sc.id)}
      />

      <Pagination currentPage={page} lastPage={lastPage} total={total} onPageChange={setPage} />

      {/* ═══ Create Modal ═══ */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="สร้างรอบตรวจนับใหม่" size="lg">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">ชื่อรอบนับ *</label>
            <input
              value={createForm.name}
              onChange={(e) => setCreateForm(f => ({ ...f, name: e.target.value }))}
              placeholder="เช่น ตรวจนับเดือน ก.พ. 68"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">ประเภท</label>
            <div className="flex gap-3">
              {(['FULL', 'CYCLE', 'SPOT'] as const).map(t => (
                <label key={t} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="type"
                    value={t}
                    checked={createForm.type === t}
                    onChange={() => setCreateForm(f => ({ ...f, type: t }))}
                    className="accent-blue-600"
                  />
                  {TYPE_MAP[t]}
                </label>
              ))}
            </div>
          </div>

          {/* Category filter (CYCLE) */}
          {createForm.type === 'CYCLE' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">เลือกหมวดหมู่</label>
              <div className="max-h-32 overflow-y-auto rounded-lg border border-gray-200 p-2 space-y-1">
                {categories.map(c => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={createForm.filter_category_ids?.includes(c.id) ?? false}
                      onChange={(e) => {
                        setCreateForm(f => ({
                          ...f,
                          filter_category_ids: e.target.checked
                            ? [...(f.filter_category_ids || []), c.id]
                            : (f.filter_category_ids || []).filter(x => x !== c.id),
                        }));
                      }}
                      className="accent-blue-600"
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Location filter (CYCLE) */}
          {createForm.type === 'CYCLE' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">เลือกตำแหน่งคลัง</label>
              <div className="max-h-32 overflow-y-auto rounded-lg border border-gray-200 p-2 space-y-1">
                {locations.map(l => (
                  <label key={l.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={createForm.filter_location_ids?.includes(l.id) ?? false}
                      onChange={(e) => {
                        setCreateForm(f => ({
                          ...f,
                          filter_location_ids: e.target.checked
                            ? [...(f.filter_location_ids || []), l.id]
                            : (f.filter_location_ids || []).filter(x => x !== l.id),
                        }));
                      }}
                      className="accent-blue-600"
                    />
                    {l.name} ({l.code})
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Product filter (SPOT) */}
          {createForm.type === 'SPOT' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">เลือกสินค้า</label>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 p-2 space-y-1">
                {products.map(p => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={createForm.filter_product_ids?.includes(p.id) ?? false}
                      onChange={(e) => {
                        setCreateForm(f => ({
                          ...f,
                          filter_product_ids: e.target.checked
                            ? [...(f.filter_product_ids || []), p.id]
                            : (f.filter_product_ids || []).filter(x => x !== p.id),
                        }));
                      }}
                      className="accent-blue-600"
                    />
                    <span className="font-mono text-xs text-gray-500">{p.product_code}</span>
                    {p.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">หมายเหตุ</label>
            <textarea
              value={createForm.note || ''}
              onChange={(e) => setCreateForm(f => ({ ...f, note: e.target.value }))}
              rows={2}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setShowCreate(false)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              ยกเลิก
            </button>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? 'กำลังสร้าง...' : 'สร้างรอบนับ'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ═══ Detail Modal ═══ */}
      <Modal open={showDetail} onClose={() => { setShowDetail(false); setSelectedCount(null); }} title="" size="xl">
        {detailLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          </div>
        ) : selectedCount ? (
          <DetailView
            sc={selectedCount}
            stats={stats}
            unexpectedScans={unexpectedScans}
            unresolved={unresolved}
            missingByProduct={missingByProduct}
            actionLoading={actionLoading}
            products={products}
            locations={locations}
            onStart={() => handleAction('start', selectedCount)}
            onComplete={() => handleAction('complete', selectedCount)}
            onCancel={() => handleAction('cancel', selectedCount)}
            onApprove={() => handleApprove(selectedCount)}
            onViewScans={(filter) => openScans(selectedCount.id, filter)}
            onCopyPdaUrl={() => copyPdaUrl(selectedCount.id)}
            onPrintReport={() => handlePrintReport(selectedCount.id)}
            onResolveSerial={handleResolveSerial}
            onResolveScan={handleResolveScan}
            pdaTokens={pdaTokens}
            copied={copiedId === selectedCount.id}
          />
        ) : null}
      </Modal>

      {/* ═══ Scans Modal ═══ */}
      <Modal open={showScans} onClose={() => setShowScans(false)} title="รายการสแกน" size="xl">
        <div className="mb-3 flex gap-2">
          {['', 'expected', 'unexpected', 'duplicate'].map(f => (
            <button
              key={f}
              onClick={() => selectedCount && openScans(selectedCount.id, f)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                scanFilter === f ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f === '' ? 'ทั้งหมด' : f === 'expected' ? 'คาดหวัง' : f === 'unexpected' ? 'สินค้านอกรายการ' : 'ซ้ำ'}
            </button>
          ))}
        </div>
        {scansLoading ? (
          <div className="flex items-center justify-center py-6">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Serial</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">สินค้า</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">สถานะ</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">เวลา</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {scans.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-8 text-center text-gray-400">ไม่มีรายการ</td></tr>
                ) : scans.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs">{s.serial_number}</td>
                    <td className="px-3 py-2">
                      {s.product ? (
                        <div>
                          <div className="font-medium">{s.product.name}</div>
                          <div className="text-xs text-gray-400">{s.product.product_code}</div>
                        </div>
                      ) : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1">
                        {s.is_duplicate ? (
                          <Badge variant="warning">ซ้ำ</Badge>
                        ) : s.is_expected ? (
                          <Badge variant="success">OK</Badge>
                        ) : (
                          <Badge variant="danger">สินค้านอกรายการ</Badge>
                        )}
                        {s.inventory?.status && s.inventory.status !== 'IN_STOCK' && (
                          <Badge variant={s.inventory.status === 'SOLD' ? 'info' : s.inventory.status === 'DAMAGED' ? 'danger' : 'gray'}>
                            {s.inventory.status === 'SOLD' ? 'ขายแล้ว' : s.inventory.status === 'DAMAGED' ? 'ชำรุด' : s.inventory.status === 'SCRAPPED' ? 'ทำลาย' : s.inventory.status}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {new Date(s.scanned_at).toLocaleString('th-TH')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Detail View Component
   ═══════════════════════════════════════════════════════════════════ */

interface DetailViewProps {
  sc: StockCount;
  stats: StockCountStats | null;
  unexpectedScans: StockCountScan[];
  unresolved: { missing_serials: number; unexpected_scans: number; total: number };
  missingByProduct: Record<number, { missing_count: number; resolved_count: number }>;
  actionLoading: boolean;
  products: Product[];
  locations: Location[];
  onStart: () => void;
  onComplete: () => void;
  onCancel: () => void;
  onApprove: () => void;
  onViewScans: (filter: string) => void;
  onCopyPdaUrl: () => void;
  onPrintReport: () => void;
  onResolveSerial: (inventoryId: number, action: 'WRITE_OFF' | 'KEEP') => void;
  onResolveScan: (scanId: number, action: 'IMPORT' | 'IGNORE', productId?: number, locationId?: number) => void;
  pdaTokens: Array<{ id: number; token: string; name: string; is_valid: boolean }>;
  copied: boolean;
}

function DetailView({
  sc, stats, unexpectedScans, unresolved, missingByProduct, actionLoading, products, locations,
  onStart, onComplete, onCancel, onApprove, onViewScans, onCopyPdaUrl, onPrintReport,
  onResolveSerial, onResolveScan, pdaTokens, copied,
}: DetailViewProps) {
  const statusInfo = STATUS_MAP[sc.status];
  const isInProgress = sc.status === 'IN_PROGRESS';
  const isCompleted = sc.status === 'COMPLETED';
  const canExpand = isInProgress || isCompleted;

  /* ─── Expandable items state ─── */
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const toggleExpand = (productId: number) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  /* Auto-expand all missing-serial rows in COMPLETED status so approver sees details */
  useEffect(() => {
    if (isCompleted && sc.items) {
      const missingIds = sc.items
        .filter(i => i.difference < 0)
        .map(i => i.product_id);
      if (missingIds.length > 0) {
        setExpandedItems(new Set(missingIds));
      }
    }
  }, [isCompleted, sc.items]);

  /* ─── Import form state (for unexpected scans needing product+location) ─── */
  const [importTarget, setImportTarget] = useState<number | null>(null);
  const [importForm, setImportForm] = useState<{ product_id: number | null; location_id: number | null }>({
    product_id: null,
    location_id: null,
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">{sc.code}</h2>
          <p className="text-sm text-gray-500">{sc.name}</p>
        </div>
        <div className="flex items-center gap-2">
          {statusInfo && <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>}
          <Badge variant="gray">{TYPE_MAP[sc.type]}</Badge>
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-3 rounded-lg bg-gray-50 p-4 sm:grid-cols-4">
        <div>
          <div className="text-xs text-gray-500">สร้างโดย</div>
          <div className="text-sm font-medium">{sc.creator?.name || '-'}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">เริ่มนับ</div>
          <div className="text-sm font-medium">
            {sc.started_at ? new Date(sc.started_at).toLocaleString('th-TH') : '-'}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">นับเสร็จ</div>
          <div className="text-sm font-medium">
            {sc.completed_at ? new Date(sc.completed_at).toLocaleString('th-TH') : '-'}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">อนุมัติโดย</div>
          <div className="text-sm font-medium">{sc.approver?.name || '-'}</div>
        </div>
      </div>

      {sc.note && (
        <div className="rounded-lg border border-gray-200 p-3">
          <div className="text-xs text-gray-500 mb-1">หมายเหตุ</div>
          <div className="text-sm">{sc.note}</div>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="คาดหวัง" value={stats.total_expected} icon={<Package size={18} />} color="blue" />
          <StatCard label="สแกนแล้ว" value={stats.total_scanned} icon={<ScanBarcode size={18} />} color="green" />
          <StatCard label="ของเกิน" value={stats.over} icon={<AlertTriangle size={18} />} color="yellow" />
          <StatCard label="ของขาด" value={stats.under} icon={<AlertTriangle size={18} />} color="red" />
        </div>
      )}

      {/* Progress bar */}
      {stats && stats.total_expected > 0 && (
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>ความคืบหน้า</span>
            <span>{Math.round((stats.total_scanned / stats.total_expected) * 100)}%</span>
          </div>
          <div className="h-2 rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-blue-500 transition-all"
              style={{ width: `${Math.min(100, (stats.total_scanned / stats.total_expected) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* ═══ Unresolved Banner ═══ */}
      {isInProgress && unresolved.total > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
          <div className="flex items-center gap-2 text-amber-800">
            <AlertTriangle size={16} />
            <span className="text-sm font-medium">
              ต้องกำหนดก่อนปิดรอบ: Serial ขาด {unresolved.missing_serials} รายการ, สินค้านอกรายการ {unresolved.unexpected_scans} รายการ
            </span>
          </div>
        </div>
      )}

      {/* Items table */}
      {sc.items && sc.items.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-700">รายการสินค้า ({sc.items.length})</h3>
          <div className="max-h-[40vh] overflow-y-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">สินค้า</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">คาดหวัง</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">สแกน</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">ผลต่าง</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">สถานะ / จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sc.items.map((item) => {
                  const res = RESOLUTION_MAP[item.resolution];
                  const hasMissing = item.difference < 0;
                  const productId = item.product_id;
                  const mbp = missingByProduct[productId];
                  const missingCount = mbp?.missing_count ?? Math.abs(item.difference);
                  const resolvedCount = mbp?.resolved_count ?? 0;
                  const allResolved = hasMissing && resolvedCount >= missingCount;
                  const needsAction = isInProgress && hasMissing && !allResolved;
                  const isExpanded = expandedItems.has(productId);

                  return (
                    <React.Fragment key={item.id}>
                      <tr
                        className={`hover:bg-gray-50 ${needsAction ? 'bg-red-50/50' : ''} ${hasMissing && canExpand ? 'cursor-pointer' : ''}`}
                        onClick={() => { if (hasMissing && canExpand) toggleExpand(productId); }}
                      >
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            {hasMissing && canExpand && (
                              <ChevronDown size={14} className={`text-gray-400 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                            )}
                            <div>
                              <div className="font-medium">{item.product?.name || '-'}</div>
                              <div className="text-xs text-gray-400 font-mono">{item.product?.product_code}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{item.expected_qty}</td>
                        <td className="px-3 py-2 text-right font-mono">{item.scanned_qty}</td>
                        <td className={`px-3 py-2 text-right font-mono font-semibold ${
                          item.difference === 0 ? 'text-green-600' :
                          item.difference > 0 ? 'text-yellow-600' :
                          'text-red-600'
                        }`}>
                          {item.difference > 0 ? '+' : ''}{item.difference}
                        </td>
                        <td className="px-3 py-2">
                          {hasMissing && canExpand ? (
                            <span className={`text-xs font-medium ${allResolved ? 'text-green-600' : 'text-amber-600'}`}>
                              กำหนดแล้ว {resolvedCount}/{missingCount} serial
                            </span>
                          ) : res ? (
                            <Badge variant={res.variant}>{res.label}</Badge>
                          ) : (
                            item.resolution || (item.difference === 0 ? <Badge variant="success">ตรง</Badge> : null)
                          )}
                        </td>
                      </tr>
                      {/* ─ Expanded missing serials ─ */}
                      {isExpanded && canExpand && hasMissing && (
                        <tr>
                          <td colSpan={5} className="p-0">
                            <MissingSerialsRow
                              scId={sc.id}
                              productId={productId}
                              resolvedCount={resolvedCount}
                              actionLoading={actionLoading}
                              onResolveSerial={onResolveSerial}
                              readOnly={!isInProgress}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ Unexpected Scans Resolution ═══ */}
      {(isInProgress || isCompleted) && unexpectedScans.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-700 flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-500" />
            สินค้านอกรายการ ({unexpectedScans.length})
          </h3>
          <div className="max-h-[30vh] overflow-y-auto rounded-lg border border-amber-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-amber-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Serial</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">สินค้า</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">สถานะ</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {unexpectedScans.map((scan) => {
                  const needsProductLocation = !scan.inventory_id && !scan.product_id;
                  const isImportTarget = importTarget === scan.id;

                  return (
                    <tr key={scan.id} className={`hover:bg-gray-50 ${!scan.resolution ? 'bg-amber-50/30' : ''}`}>
                      <td className="px-3 py-2 font-mono text-xs">{scan.serial_number}</td>
                      <td className="px-3 py-2">
                        {(scan.product || scan.resolution_product) ? (
                          <div>
                            <div className="font-medium text-xs">{(scan.product ?? scan.resolution_product)!.name}</div>
                            <div className="text-xs text-gray-400">{(scan.product ?? scan.resolution_product)!.product_code}</div>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">ไม่พบสินค้าในระบบ</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {scan.inventory?.status ? (
                          <Badge variant={scan.inventory.status === 'IN_STOCK' ? 'success' : scan.inventory.status === 'SOLD' ? 'info' : scan.inventory.status === 'DAMAGED' ? 'danger' : 'gray'}>
                            {scan.inventory.status === 'IN_STOCK' ? 'ในคลัง' : scan.inventory.status === 'SOLD' ? 'ขายแล้ว' : scan.inventory.status === 'DAMAGED' ? 'ชำรุด' : scan.inventory.status === 'SCRAPPED' ? 'ทำลาย' : scan.inventory.status}
                          </Badge>
                        ) : (
                          <span className="text-xs text-gray-400">ไม่พบ</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {!isInProgress ? (
                          /* Read-only mode for COMPLETED */
                          scan.resolution === 'IMPORT' ? (
                            <Badge variant="success">นำเข้าสต๊อก</Badge>
                          ) : scan.resolution === 'IGNORE' ? (
                            <Badge variant="gray">ไม่นำเข้า</Badge>
                          ) : (
                            <Badge variant="warning">ยังไม่กำหนด</Badge>
                          )
                        ) : isImportTarget ? (
                          /* Import form for scans needing product + location */
                          <div className="space-y-2">
                            <select
                              value={importForm.product_id ?? ''}
                              onChange={(e) => setImportForm(f => ({ ...f, product_id: e.target.value ? Number(e.target.value) : null }))}
                              className="w-full rounded border border-gray-200 px-2 py-1 text-xs"
                            >
                              <option value="">-- เลือกสินค้า --</option>
                              {products.map(p => (
                                <option key={p.id} value={p.id}>{p.product_code} — {p.name}</option>
                              ))}
                            </select>
                            <select
                              value={importForm.location_id ?? ''}
                              onChange={(e) => setImportForm(f => ({ ...f, location_id: e.target.value ? Number(e.target.value) : null }))}
                              className="w-full rounded border border-gray-200 px-2 py-1 text-xs"
                            >
                              <option value="">-- เลือกคลัง --</option>
                              {locations.map(l => (
                                <option key={l.id} value={l.id}>{l.code} — {l.name}</option>
                              ))}
                            </select>
                            <div className="flex gap-1">
                              <button
                                onClick={() => {
                                  if (importForm.product_id && importForm.location_id) {
                                    onResolveScan(scan.id, 'IMPORT', importForm.product_id, importForm.location_id);
                                    setImportTarget(null);
                                    setImportForm({ product_id: null, location_id: null });
                                  }
                                }}
                                disabled={actionLoading || !importForm.product_id || !importForm.location_id}
                                className="rounded px-2 py-1 text-xs font-medium text-white bg-green-500 hover:bg-green-600 disabled:opacity-50"
                              >
                                ยืนยันนำเข้า
                              </button>
                              <button
                                onClick={() => { setImportTarget(null); setImportForm({ product_id: null, location_id: null }); }}
                                className="rounded px-2 py-1 text-xs font-medium text-gray-600 bg-gray-200 hover:bg-gray-300"
                              >
                                ยกเลิก
                              </button>
                            </div>
                          </div>
                        ) : (
                          <select
                            value={scan.resolution ?? ''}
                            onChange={(e) => {
                              const v = e.target.value as 'IMPORT' | 'IGNORE';
                              if (!v) return;
                              if (v === 'IMPORT' && needsProductLocation && scan.resolution !== 'IMPORT') {
                                setImportTarget(scan.id);
                                setImportForm({ product_id: null, location_id: null });
                              } else if (v === 'IMPORT') {
                                onResolveScan(scan.id, 'IMPORT', scan.product_id ?? undefined, undefined);
                              } else {
                                onResolveScan(scan.id, 'IGNORE');
                              }
                            }}
                            disabled={actionLoading}
                            className={`rounded border px-2 py-1 text-xs font-medium disabled:opacity-50 ${
                              scan.resolution === 'IMPORT' ? 'border-green-300 bg-green-50 text-green-700' :
                              scan.resolution === 'IGNORE' ? 'border-gray-300 bg-gray-50 text-gray-700' :
                              'border-amber-300 bg-amber-50 text-amber-700'
                            }`}
                          >
                            <option value="">-- เลือก --</option>
                            <option value="IMPORT">นำเข้าสต๊อก</option>
                            <option value="IGNORE">ไม่นำเข้า</option>
                          </select>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* View scans link + Print */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => onViewScans('')}
          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
        >
          <ScanBarcode size={14} /> ดูรายการสแกนทั้งหมด ({stats?.total_scans ?? 0} ครั้ง)
          <ChevronRight size={14} />
        </button>
        <button
          onClick={onPrintReport}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Printer size={14} /> พิมพ์ใบนับสต๊อก
        </button>
      </div>

      {/* PDA Link */}
      {sc.status === 'IN_PROGRESS' && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link size={16} className="text-indigo-600" />
              <div>
                <p className="text-sm font-medium text-indigo-900">PDA ตรวจนับ</p>
                <p className="text-xs text-indigo-600">
                  {pdaTokens.length > 0
                    ? `คัดลอก URL เพื่อแชร์ให้พนักงานคลังสแกนนับ (Token: ${pdaTokens[0].name})`
                    : 'ยังไม่มี PDA Token — สร้างได้ที่หน้า ปริ้น Label > PDA Token'}
                </p>
              </div>
            </div>
            <button
              onClick={onCopyPdaUrl}
              disabled={pdaTokens.length === 0}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'คัดลอกแล้ว!' : 'Copy URL'}
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 border-t border-gray-200 pt-4">
        {sc.status === 'DRAFT' && (
          <button
            onClick={onStart}
            disabled={actionLoading}
            className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            <Play size={16} /> เริ่มนับ
          </button>
        )}
        {sc.status === 'IN_PROGRESS' && (
          <div className="flex items-center gap-3">
            <button
              onClick={onComplete}
              disabled={actionLoading || unresolved.total > 0}
              className="flex items-center gap-2 rounded-lg bg-yellow-500 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-600 disabled:opacity-50"
              title={unresolved.total > 0 ? `ยังมี ${unresolved.total} รายการที่ต้องกำหนดก่อนปิดรอบ` : 'ปิดรอบนับ'}
            >
              <Square size={16} /> ปิดรอบนับ
            </button>
            {unresolved.total > 0 && (
              <span className="text-xs text-amber-600">
                ต้องกำหนดอีก {unresolved.total} รายการ
              </span>
            )}
          </div>
        )}
        {sc.status === 'COMPLETED' && (
          <button
            onClick={onApprove}
            disabled={actionLoading}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <CheckCircle size={16} /> อนุมัติปรับปรุง
          </button>
        )}
        {!['APPROVED', 'CANCELLED'].includes(sc.status) && (
          <button
            onClick={onCancel}
            disabled={actionLoading}
            className="flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <XCircle size={16} /> ยกเลิก
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Missing Serials Row (loaded when a product row is expanded) ─── */
function MissingSerialsRow({
  scId, productId, resolvedCount, actionLoading, onResolveSerial, readOnly = false,
}: {
  scId: number;
  productId: number;
  resolvedCount: number;
  actionLoading: boolean;
  onResolveSerial: (inventoryId: number, action: 'WRITE_OFF' | 'KEEP') => void;
  readOnly?: boolean;
}) {
  const [serials, setSerials] = useState<Array<{
    id: number; serial_number: string; status: string;
    product?: { name: string; product_code: string };
    serial_resolution?: { resolution: string } | null;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await stockCountService.missingSerials(scId, { product_id: productId });
        if (!cancelled) setSerials(res.data ?? []);
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [scId, productId, resolvedCount]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-6 py-3 text-xs text-gray-400">
        <div className="h-3 w-3 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
        กำลังโหลด serial...
      </div>
    );
  }

  if (serials.length === 0) {
    return <div className="px-6 py-3 text-xs text-gray-400">ไม่พบ serial ที่ขาด</div>;
  }

  return (
    <div className="bg-red-50/30 border-t border-red-100">
      {serials.map((s) => {
        const currentAction = (s.serial_resolution?.resolution ?? '') as string;

        return (
          <div key={s.id} className="flex items-center justify-between px-6 py-2 border-b border-red-50 last:border-b-0">
            <div className="flex items-center gap-2">
              <span className="text-gray-300">└</span>
              <span className="font-mono text-xs">{s.serial_number}</span>
              <Badge variant="gray">{s.status}</Badge>
            </div>
            {readOnly ? (
              currentAction ? (
                <Badge variant={currentAction === 'WRITE_OFF' ? 'danger' : 'info'}>
                  {currentAction === 'WRITE_OFF' ? 'ตัดสต๊อก' : 'คงไว้'}
                </Badge>
              ) : (
                <Badge variant="warning">ยังไม่กำหนด</Badge>
              )
            ) : (
              <select
                value={currentAction}
                onChange={(e) => {
                  const v = e.target.value as 'WRITE_OFF' | 'KEEP';
                  if (v) {
                    // Optimistic update — show selected value immediately
                    setSerials(prev => prev.map(item =>
                      item.id === s.id
                        ? { ...item, serial_resolution: { resolution: v } }
                        : item
                    ));
                    onResolveSerial(s.id, v);
                  }
                }}
                disabled={actionLoading}
                className={`rounded border px-2 py-1 text-xs font-medium disabled:opacity-50 ${
                  currentAction === 'WRITE_OFF' ? 'border-red-300 bg-red-50 text-red-700' :
                  currentAction === 'KEEP' ? 'border-gray-300 bg-gray-50 text-gray-700' :
                  'border-amber-300 bg-amber-50 text-amber-700'
                }`}
              >
                <option value="">-- เลือก --</option>
                <option value="WRITE_OFF">ตัดสต๊อก</option>
                <option value="KEEP">คงไว้</option>
              </select>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Stat Card ─── */
function StatCard({ label, value, icon, color }: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'yellow' | 'red';
}) {
  const colorMap = {
    blue:   'bg-blue-50 text-blue-600',
    green:  'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    red:    'bg-red-50 text-red-600',
  };

  return (
    <div className={`rounded-lg p-3 ${colorMap[color]}`}>
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="mt-1 text-2xl font-bold">{value.toLocaleString()}</div>
    </div>
  );
}
