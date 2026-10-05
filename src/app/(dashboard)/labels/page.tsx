'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import AuthGuard from '@/components/AuthGuard';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import Pagination from '@/components/ui/Pagination';
import Badge from '@/components/ui/Badge';
import { toast } from '@/components/ui/Toast';
import { labelService } from '@/services/label.service';
import { labelTemplateService, type LabelTemplate as CustomTemplate } from '@/services/label-template.service';
import LabelPrintPreviewModal, { PAPER_SIZES } from '@/components/labels/LabelPrintPreviewModal';
import type {
  Inventory,
  LabelPrintLog,
  LabelStats,
  ProductionOrderLabelInfo,
} from '@/lib/types';
import { AxiosError } from 'axios';
import {
  Printer,
  Search,
  ScanBarcode,
  History,
  BarChart3,
  CheckCircle,
  AlertTriangle,
  FileText,
  ArrowLeft,
  Package,
  ChevronRight,
  Eye,
  Smartphone,
  Copy,
  Check,
  Ban,
  Plus,
  ExternalLink,
} from 'lucide-react';

type LabelTemplateChoice = `custom:${number}` | '';

type TabKey = 'print' | 'verify' | 'history' | 'pda-token';

export default function LabelsPage() {
  return (
    <AuthGuard permission="view_production">
      <LabelsContent />
    </AuthGuard>
  );
}

function LabelsContent() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('manage_production');
  const [activeTab, setActiveTab] = useState<TabKey>('print');
  const [stats, setStats] = useState<LabelStats | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await labelService.stats();
      setStats(res.data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    let cancelled = false;
    labelService.stats().then(res => { if (!cancelled) setStats(res.data); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'print', label: 'ปริ้น Label', icon: <Printer size={16} /> },
    { key: 'verify', label: 'ยืนยันติด Label (PDA)', icon: <ScanBarcode size={16} /> },
    { key: 'history', label: 'ประวัติการปริ้น', icon: <History size={16} /> },
    ...(canManage ? [{ key: 'pda-token' as TabKey, label: 'PDA Token', icon: <Smartphone size={16} /> }] : []),
  ];

  return (
    <div>
      <PageHeader title="ปริ้น Barcode Label" description="ปริ้น label จาก serial, ยืนยันติด label ด้วย PDA, และประวัติการปริ้น" />

      {/* Stats */}
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
          <StatCard label="Serial ทั้งหมด" value={stats.total_serials} icon={<BarChart3 size={18} className="text-blue-500" />} />
          <StatCard label="ยังไม่ปริ้น" value={stats.never_printed} icon={<Printer size={18} className="text-gray-500" />} />
          <StatCard label="ปริ้นแล้ว ยังไม่ยืนยัน" value={stats.printed_not_verified} icon={<AlertTriangle size={18} className="text-yellow-500" />} />
          <StatCard label="ยืนยันแล้ว" value={stats.verified} icon={<CheckCircle size={18} className="text-green-500" />} />
          <StatCard label="คำขอปริ้นซ้ำรอดำเนินการ" value={stats.pending_reprints} icon={<FileText size={18} className="text-red-500" />} />
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 -mx-4 sm:mx-0 overflow-x-auto">
        <div className="flex border-b min-w-max px-4 sm:px-0">
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'print' && <PrintTab canManage={canManage} onPrinted={fetchStats} />}
      {activeTab === 'verify' && <VerifyTab canManage={canManage} onVerified={fetchStats} />}
      {activeTab === 'history' && <HistoryTab />}
      {activeTab === 'pda-token' && <PdaTokenTab />}
    </div>
  );
}

/* ── Stat Card ── */
function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 sm:gap-3 rounded-xl border bg-white p-3 sm:p-4 shadow-sm">
      <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg bg-gray-50">{icon}</div>
      <div className="min-w-0">
        <p className="text-lg sm:text-xl font-bold">{value.toLocaleString()}</p>
        <p className="text-[10px] sm:text-xs text-gray-500 leading-tight">{label}</p>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Tab: Print Labels — PO List → Drill-down to Serials
   ══════════════════════════════════════════════════════════════════ */
function PrintTab({ canManage, onPrinted }: { canManage: boolean; onPrinted: () => void }) {
  const [selectedPo, setSelectedPo] = useState<number | null>(null);

  if (selectedPo) {
    return <POSerialView poId={selectedPo} canManage={canManage} onBack={() => setSelectedPo(null)} onPrinted={onPrinted} />;
  }

  return <POListView onSelect={setSelectedPo} />;
}

/* ── Production Order List ── */
function POListView({ onSelect }: { onSelect: (id: number) => void }) {
  const [orders, setOrders] = useState<ProductionOrderLabelInfo[]>([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, per_page: 15, total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, per_page: 15 };
      if (search) params.search = search;
      const res = await labelService.productionOrders(params);
      setOrders(res.data);
      setMeta(res.meta);
    } catch {
      toast('โหลดรายการใบสั่งผลิตไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const handleSearchSubmit = (e: React.FormEvent) => { e.preventDefault(); setPage(1); };

  const columns = [
    {
      key: 'order_number', label: 'เลขที่ใบสั่งผลิต',
      render: (r: ProductionOrderLabelInfo) => (
        <button onClick={() => onSelect(r.id)} className="text-blue-600 hover:text-blue-800 font-medium text-sm flex items-center gap-1">
          <FileText size={14} />
          {r.order_number}
        </button>
      ),
    },
    {
      key: 'pack', label: 'แพสินค้า',
      render: (r: ProductionOrderLabelInfo) => (
        <div>
          <div className="text-sm font-medium">{r.pack?.name || '-'}</div>
          <div className="text-xs text-gray-400">{r.pack?.code}</div>
        </div>
      ),
    },
    {
      key: 'status', label: 'สถานะใบสั่งผลิต',
      render: (r: ProductionOrderLabelInfo) => {
        const map: Record<string, { label: string; variant: 'gray' | 'info' | 'warning' | 'success' | 'danger' }> = {
          DRAFT:       { label: 'แบบร่าง', variant: 'gray' },
          CONFIRMED:   { label: 'ยืนยันแล้ว', variant: 'info' },
          IN_PROGRESS: { label: 'กำลังผลิต', variant: 'warning' },
          COMPLETED:   { label: 'เสร็จสิ้น', variant: 'success' },
        };
        const s = map[r.status] || { label: r.status, variant: 'gray' as const };
        return <Badge variant={s.variant}>{s.label}</Badge>;
      },
    },
    {
      key: 'total_serials', label: 'Serial ทั้งหมด',
      render: (r: ProductionOrderLabelInfo) => (
        <span className="font-semibold text-sm">{r.total_serials.toLocaleString()}</span>
      ),
    },
    {
      key: 'print_progress', label: 'ปริ้น Label',
      render: (r: ProductionOrderLabelInfo) => {
        const pct = r.total_serials > 0 ? Math.round((r.printed_serials / r.total_serials) * 100) : 0;
        return (
          <div className="w-32">
            <div className="flex justify-between text-xs mb-1">
              <span>{r.printed_serials}/{r.total_serials}</span>
              <span className="text-gray-500">{pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
              <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : pct > 0 ? 'bg-blue-500' : 'bg-gray-300'}`}
                style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      },
    },
    {
      key: 'verify_progress', label: 'ยืนยันติด Label',
      render: (r: ProductionOrderLabelInfo) => {
        const pct = r.total_serials > 0 ? Math.round((r.verified_serials / r.total_serials) * 100) : 0;
        return (
          <div className="w-32">
            <div className="flex justify-between text-xs mb-1">
              <span>{r.verified_serials}/{r.total_serials}</span>
              <span className="text-gray-500">{pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
              <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : pct > 0 ? 'bg-emerald-400' : 'bg-gray-300'}`}
                style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      },
    },
    {
      key: 'action', label: '',
      render: (r: ProductionOrderLabelInfo) => (
        <button onClick={() => onSelect(r.id)}
          className="flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 transition-colors">
          ดูรายการ <ChevronRight size={14} />
        </button>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <form onSubmit={handleSearchSubmit} className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="ค้นหาเลขที่ใบสั่งผลิต..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none" />
          </div>
          <button type="submit" className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 shrink-0">ค้นหา</button>
        </form>
      </div>

      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <div className="min-w-[700px] px-4 sm:px-0">
          <DataTable columns={columns} data={orders} loading={loading} emptyMessage="ไม่มีรายการใบสั่งผลิต" />
        </div>
      </div>
      <Pagination currentPage={meta.current_page} lastPage={meta.last_page} total={meta.total} onPageChange={setPage} />
    </div>
  );
}

/* ── PO Serial Detail View ── */
function POSerialView({ poId, canManage, onBack, onPrinted }: {
  poId: number; canManage: boolean; onBack: () => void; onPrinted: () => void;
}) {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<Inventory[]>([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, per_page: 30, total: 0 });
  const [poInfo, setPoInfo] = useState<{ id: number; order_number: string; status: string; total_serials: number; printed: number; verified: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [labelStatus, setLabelStatus] = useState('');
  const [page, setPage] = useState(1);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [paperSize, setPaperSize] = useState('50x30');
  const [customWidth, setCustomWidth] = useState(50);
  const [customHeight, setCustomHeight] = useState(30);
  const effectivePaperSize = paperSize === 'custom' ? `${customWidth}x${customHeight}` : paperSize;
  const [labelTemplate, setLabelTemplate] = useState<LabelTemplateChoice>('');
  const [pairMode, setPairMode] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printingAll, setPrintingAll] = useState(false);
  const [previewItems, setPreviewItems] = useState<Inventory[]>([]);
  const [previewMode, setPreviewMode] = useState<'selected' | 'all'>('selected');
  const [showPreview, setShowPreview] = useState(false);

  /* ── Custom templates from DB ── */
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>([]);

  // Derived state (must be after customTemplates declaration)
  const selectedCustomTemplate = labelTemplate
    ? customTemplates.find(t => t.id === Number(labelTemplate.split(':')[1]))
    : undefined;
  useEffect(() => {
    labelTemplateService.list(true).then(res => {
      setCustomTemplates(res.data);
      // Auto-select default template if available
      const def = res.data.find(t => t.is_default);
      if (def) {
        setLabelTemplate(`custom:${def.id}`);
        // Auto-fill paper size from default template
        const w = Number(def.paper_width);
        const h = Number(def.paper_height);
        setPaperSize('custom');
        setCustomWidth(w);
        setCustomHeight(h);
      }
    }).catch(() => { /* ignore */ });
  }, []);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, per_page: 30 };
      if (search) params.search = search;
      if (labelStatus) params.label_status = labelStatus;
      const res = await labelService.productionOrderSerials(poId, params);
      setItems(res.data);
      setMeta(res.meta);
      setPoInfo(res.po);
    } catch {
      toast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  }, [poId, page, search, labelStatus]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const unprintedItems = useMemo(() => items.filter(i => i.label_print_count === 0), [items]);

  const toggleSelect = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const selectableItems = useMemo(() => isAdmin ? items : unprintedItems, [isAdmin, items, unprintedItems]);

  const selectAllSelectable = () => {
    if (selected.size === selectableItems.length && selectableItems.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableItems.map(i => i.id)));
    }
  };

  const openPreviewSelected = () => {
    if (selected.size === 0) { toast('กรุณาเลือก serial ที่ต้องการปริ้น', 'error'); return; }
    if (!labelTemplate) { toast('กรุณาเลือก Template ก่อนปริ้น', 'error'); return; }
    const selectedItems = items.filter(i => selected.has(i.id));
    setPreviewItems(selectedItems);
    setPreviewMode('selected');
    setShowPreview(true);
  };

  const openPreviewAll = () => {
    if (!poInfo) return;
    if (!labelTemplate) { toast('กรุณาเลือก Template ก่อนปริ้น', 'error'); return; }
    const allUnprinted = items.filter(i => i.label_print_count === 0);
    setPreviewItems(allUnprinted);
    setPreviewMode('all');
    setShowPreview(true);
  };

  const handleConfirmPrint = async (reprintReason?: string) => {
    if (previewMode === 'all' && poInfo) {
      setPrintingAll(true);
      try {
        const res = await labelService.printByPo({ production_order_id: poInfo.id, paper_size: effectivePaperSize });
        toast(res.message || 'ปริ้นทั้งใบสั่งผลิตสำเร็จ', 'success');
        setSelected(new Set());
        setShowPreview(false);
        fetchItems();
        onPrinted();
      } catch (err: unknown) {
        const ax = err as AxiosError<{ message: string }>;
        toast(ax.response?.data?.message || 'เกิดข้อผิดพลาด', 'error');
      } finally {
        setPrintingAll(false);
      }
    } else {
      setPrinting(true);
      try {
        const payload: { inventory_ids: number[]; paper_size: string; reprint_reason?: string } = {
          inventory_ids: Array.from(selected),
          paper_size: effectivePaperSize,
        };
        if (reprintReason) payload.reprint_reason = reprintReason;
        const res = await labelService.print(payload);
        toast(res.message || 'ปริ้นสำเร็จ', 'success');
        setSelected(new Set());
        setShowPreview(false);
        fetchItems();
        onPrinted();
      } catch (err: unknown) {
        const ax = err as AxiosError<{ message: string }>;
        toast(ax.response?.data?.message || 'เกิดข้อผิดพลาด', 'error');
      } finally {
        setPrinting(false);
      }
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => { e.preventDefault(); setPage(1); };

  const getLabelBadge = (inv: Inventory) => {
    if (inv.label_verified_at) return <Badge variant="success">ยืนยันแล้ว</Badge>;
    if (inv.label_print_count > 0) return <Badge variant="info">ปริ้นแล้ว ({inv.label_print_count} ครั้ง)</Badge>;
    return <Badge variant="warning">ยังไม่ปริ้น</Badge>;
  };

  const columns = [
    {
      key: 'checkbox', label: '',
      render: (r: Inventory) => (
        (r.label_print_count === 0 || isAdmin) ? (
          <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600" />
        ) : <div className="h-4 w-4" />
      ),
    },
    {
      key: 'serial_number', label: 'Serial Number',
      render: (r: Inventory) => <span className="font-mono text-xs font-medium">{r.serial_number}</span>,
    },
    {
      key: 'product', label: 'สินค้า',
      render: (r: Inventory) => (
        <div>
          <div className="text-sm font-medium">{r.product?.name || '-'}</div>
          <div className="text-xs text-gray-400">{r.product?.product_code}</div>
        </div>
      ),
    },
    {
      key: 'location', label: 'คลัง',
      render: (r: Inventory) => <span>{r.location?.name || '-'}</span>,
    },
    {
      key: 'status', label: 'สถานะ Label',
      render: (r: Inventory) => getLabelBadge(r),
    },
  ];

  const unprintedCount = poInfo ? poInfo.total_serials - poInfo.printed : 0;
  const canPrint = poInfo?.status === 'IN_PROGRESS' || isAdmin;

  return (
    <div>
      {/* Header with back button */}
      <div className="mb-4 flex flex-wrap items-center gap-2 sm:gap-3">
        <button onClick={onBack} className="flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 sm:px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
          <ArrowLeft size={16} /> กลับ
        </button>
        {poInfo && (
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <Package size={18} className="text-blue-600" />
              <span className="text-base sm:text-lg font-bold text-gray-800">{poInfo.order_number}</span>
            </div>
            <Badge variant={poInfo.status === 'COMPLETED' ? 'success' : poInfo.status === 'IN_PROGRESS' ? 'warning' : 'gray'}>
              {poInfo.status === 'COMPLETED' ? 'เสร็จสิ้น' : poInfo.status === 'IN_PROGRESS' ? 'กำลังผลิต' : poInfo.status === 'CONFIRMED' ? 'ยืนยันแล้ว' : 'แบบร่าง'}
            </Badge>
          </div>
        )}
      </div>

      {/* Not IN_PROGRESS warning */}
      {poInfo && poInfo.status !== 'IN_PROGRESS' && !isAdmin && (
        <div className="mb-4 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
          <AlertTriangle size={16} className="mr-1 inline" />
          ใบสั่งผลิตต้องอยู่ในสถานะ &quot;กำลังผลิต&quot; ถึงจะปริ้น Label ได้ (สถานะปัจจุบัน: {poInfo.status})
        </div>
      )}
      {poInfo && poInfo.status !== 'IN_PROGRESS' && isAdmin && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          <AlertTriangle size={16} className="mr-1 inline" />
          ใบสั่งผลิตไม่ได้อยู่ในสถานะ &quot;กำลังผลิต&quot; แต่คุณเป็น Admin สามารถปริ้น Label ได้
        </div>
      )}

      {/* PO Label Stats — inline */}
      {poInfo && (
        <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-gray-600">
          <span>Serial ทั้งหมด: <strong className="text-gray-800">{poInfo.total_serials}</strong></span>
          <span>ปริ้นแล้ว: <strong className="text-blue-600">{poInfo.printed}</strong></span>
          <span>ยืนยันแล้ว: <strong className="text-green-600">{poInfo.verified}</strong></span>
        </div>
      )}

      {/* Filters + Actions */}
      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <form onSubmit={handleSearchSubmit} className="flex gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-none">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="ค้นหา serial..." value={search} onChange={e => setSearch(e.target.value)}
                className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
            <button type="submit" className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 shrink-0">ค้นหา</button>
          </form>

          <select value={labelStatus} onChange={e => { setLabelStatus(e.target.value); setPage(1); }}
            className="w-full sm:w-auto rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
            <option value="">ทุกสถานะ</option>
            <option value="not_printed">ยังไม่ปริ้น</option>
            <option value="printed">ปริ้นแล้ว</option>
            <option value="verified">ยืนยันแล้ว</option>
          </select>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-auto">
            <label className="mb-1 block text-xs text-gray-500">รูปแบบ Label</label>
            <select value={labelTemplate} onChange={e => {
              const val = e.target.value as LabelTemplateChoice;
              setLabelTemplate(val);
              // Auto-fill paper size from custom template
              if (val.startsWith('custom:')) {
                const tmpl = customTemplates.find(t => t.id === Number(val.split(':')[1]));
                if (tmpl) {
                  const w = Number(tmpl.paper_width);
                  const h = Number(tmpl.paper_height);
                  setPaperSize('custom');
                  setCustomWidth(w);
                  setCustomHeight(h);
                }
              }
            }}
              className="w-full sm:w-auto rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
              <option value="" disabled>เลือก Template</option>
              {customTemplates.map(t => (
                <option key={t.id} value={`custom:${t.id}`}>
                  {t.name} ({t.paper_width}×{t.paper_height}mm){t.is_default ? ' ⭐' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="w-full sm:w-auto">
            <label className="mb-1 block text-xs text-gray-500">ขนาดกระดาษ</label>
            <div className="flex flex-wrap items-center gap-2">
              <select value={paperSize} onChange={e => setPaperSize(e.target.value)}
                disabled={!!selectedCustomTemplate}
                className={`w-full sm:w-auto rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none ${selectedCustomTemplate ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}>
                {PAPER_SIZES.map(ps => <option key={ps.value} value={ps.value}>{ps.label}</option>)}
              </select>
              {paperSize === 'custom' && (
                <div className="flex items-center gap-1">
                  <input type="number" min={10} max={300} value={customWidth} onChange={e => setCustomWidth(Number(e.target.value))}
                    disabled={!!selectedCustomTemplate}
                    className={`w-16 rounded-lg border border-gray-300 px-2 py-2 text-sm text-center focus:border-blue-500 focus:outline-none ${selectedCustomTemplate ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`} />
                  <span className="text-xs text-gray-400">x</span>
                  <input type="number" min={10} max={300} value={customHeight} onChange={e => setCustomHeight(Number(e.target.value))}
                    disabled={!!selectedCustomTemplate}
                    className={`w-16 rounded-lg border border-gray-300 px-2 py-2 text-sm text-center focus:border-blue-500 focus:outline-none ${selectedCustomTemplate ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`} />
                  <span className="text-xs text-gray-400">mm</span>
                </div>
              )}
              {selectedCustomTemplate && (
                <span className="text-[10px] text-amber-600">
                  ขนาดจาก Template
                </span>
              )}
            </div>
          </div>
          <div className="w-full sm:w-auto">
            <label className="mb-1 block text-xs text-gray-500">&nbsp;</label>
            <label className="flex h-[38px] items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={pairMode} onChange={e => setPairMode(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600" />
              ปริ้นดวงคู่ (2 serial ต่อแผ่น)
            </label>
          </div>
          <div className="flex w-full sm:w-auto sm:ml-auto gap-2">
            {canManage && canPrint && unprintedCount > 0 && (
              <button onClick={openPreviewAll}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
                <Eye size={16} /> <span className="hidden sm:inline">ปริ้นทั้งใบ</span><span className="sm:hidden">ทั้งใบ</span> ({unprintedCount})
              </button>
            )}
            {canManage && canPrint && (
              <button onClick={openPreviewSelected} disabled={selected.size === 0}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                <Eye size={16} /> <span className="hidden sm:inline">ปริ้นที่เลือก</span><span className="sm:hidden">ที่เลือก</span> ({selected.size})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Select all */}
      {selectableItems.length > 0 && (
        <div className="mb-2 flex items-center gap-2">
          <input type="checkbox" checked={selected.size === selectableItems.length && selectableItems.length > 0}
            onChange={selectAllSelectable} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
          <span className="text-sm text-gray-500">
            {isAdmin ? `เลือกทั้งหมดในหน้านี้ (${selectableItems.length})` : `เลือกที่ยังไม่ปริ้นทั้งหมดในหน้านี้ (${selectableItems.length})`}
          </span>
        </div>
      )}

      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <div className="min-w-[600px] px-4 sm:px-0">
          <DataTable columns={columns} data={items} loading={loading} emptyMessage="ไม่มี serial ในใบสั่งผลิตนี้" />
        </div>
      </div>
      <Pagination currentPage={meta.current_page} lastPage={meta.last_page} total={meta.total} onPageChange={setPage} />

      {/* Print Preview Modal */}
      {showPreview && (
        <LabelPrintPreviewModal
          items={previewItems}
          paperSize={effectivePaperSize}
          customTemplateData={selectedCustomTemplate}
          pairMode={pairMode}
          printing={previewMode === 'all' ? printingAll : printing}
          onConfirm={handleConfirmPrint}
          onClose={() => setShowPreview(false)}
          poOrderNumber={poInfo?.order_number || ''}
          canReprint={isAdmin}
        />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Tab: Verify (PDA Scan)
   ══════════════════════════════════════════════════════════════════ */
function VerifyTab({ canManage, onVerified }: { canManage: boolean; onVerified: () => void }) {
  const [serial, setSerial] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [recentVerified, setRecentVerified] = useState<Array<{ serial: string; product: string; time: string; ok: boolean; msg: string }>>([]);

  const inputRef = useRef<HTMLInputElement>(null);

  /* ── Queue-based fast scan ── */
  const scanQueueRef = useRef<string[]>([]);
  const processingQueueRef = useRef(false);

  const splitSerials = (input: string): string[] => {
    const pattern = /[A-Za-z0-9]+-\d{4}-\d{8}/g;
    const matches = input.match(pattern);
    return matches && matches.length > 0 ? matches : [input];
  };

  const verifyOne = async (s: string) => {
    setVerifying(true);
    try {
      const res = await labelService.verify(s);
      const inv = res.data;
      setRecentVerified(prev => [{
        serial: s,
        product: `${inv.product?.product_code} - ${inv.product?.name}`,
        time: new Date().toLocaleTimeString('th-TH'),
        ok: true,
        msg: 'ยืนยันสำเร็จ',
      }, ...prev].slice(0, 50));
      toast('ยืนยันติด Label สำเร็จ', 'success');
      onVerified();
    } catch (err: unknown) {
      const ax = err as AxiosError<{ message: string }>;
      const msg = ax.response?.data?.message || 'เกิดข้อผิดพลาด';
      setRecentVerified(prev => [{
        serial: s,
        product: '-',
        time: new Date().toLocaleTimeString('th-TH'),
        ok: false,
        msg,
      }, ...prev].slice(0, 50));
      toast(msg, 'error');
    } finally {
      setVerifying(false);
      setTimeout(() => { inputRef.current?.focus(); }, 50);
    }
  };

  const processQueue = async () => {
    if (processingQueueRef.current) return;
    processingQueueRef.current = true;
    while (scanQueueRef.current.length > 0) {
      const next = scanQueueRef.current.shift()!;
      await verifyOne(next);
    }
    processingQueueRef.current = false;
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const s = serial.trim();
    if (!s) return;
    setSerial('');

    const parts = splitSerials(s);
    scanQueueRef.current.push(...parts);
    processQueue();
  };

  const handleSerialChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const parts = splitSerials(val);
    if (parts.length > 1) {
      setSerial('');
      scanQueueRef.current.push(...parts);
      processQueue();
    } else {
      setSerial(val);
    }
  };

  return (
    <div className="space-y-6">
      <div className="mx-auto max-w-lg rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-4 text-center">
          <ScanBarcode size={48} className="mx-auto mb-2 text-blue-500" />
          <h3 className="text-lg font-semibold">ยิง PDA เพื่อยืนยันติด Label</h3>
          <p className="text-sm text-gray-500">สแกน barcode บนสินค้าเพื่อยืนยันว่าติด label แล้ว</p>
        </div>

        <form onSubmit={handleVerify} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            placeholder="สแกน Serial Number..."
            value={serial}
            onChange={handleSerialChange}
            autoFocus
            disabled={!canManage}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-center font-mono text-lg focus:border-blue-500 focus:outline-none"
          />
          <button type="submit" disabled={verifying || !canManage || !serial.trim()}
            className="rounded-lg bg-green-600 px-6 py-3 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
            {verifying ? 'กำลังยืนยัน...' : 'ยืนยัน'}
          </button>
        </form>
      </div>

      {/* Recent scan log */}
      {recentVerified.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-gray-700">รายการสแกนล่าสุด</h4>
          <div className="max-h-80 overflow-y-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">เวลา</th>
                  <th className="px-3 py-2 text-left">Serial Number</th>
                  <th className="px-3 py-2 text-left">สินค้า</th>
                  <th className="px-3 py-2 text-center">ผลลัพธ์</th>
                  <th className="px-3 py-2 text-left">หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {recentVerified.map((r, i) => (
                  <tr key={i} className={`border-t ${r.ok ? '' : 'bg-red-50'}`}>
                    <td className="px-3 py-2 text-gray-500">{r.time}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.serial}</td>
                    <td className="px-3 py-2">{r.product}</td>
                    <td className="px-3 py-2 text-center">
                      <Badge variant={r.ok ? 'success' : 'danger'}>{r.ok ? 'สำเร็จ' : 'ล้มเหลว'}</Badge>
                    </td>
                    <td className="px-3 py-2 text-xs">{r.msg}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Tab: Print History
   ══════════════════════════════════════════════════════════════════ */
function HistoryTab() {
  const [logs, setLogs] = useState<LabelPrintLog[]>([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, per_page: 15, total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [printType, setPrintType] = useState('');
  const [page, setPage] = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, per_page: 15 };
      if (search) params.search = search;
      if (printType) params.print_type = printType;
      const res = await labelService.history(params);
      setLogs(res.data);
      setMeta(res.meta);
    } catch {
      toast('โหลดประวัติไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, search, printType]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const columns = [
    {
      key: 'serial_number', label: 'Serial Number',
      render: (r: LabelPrintLog) => <span className="font-mono text-xs">{r.serial_number}</span>,
    },
    {
      key: 'product', label: 'สินค้า',
      render: (r: LabelPrintLog) => (
        <span>{r.inventory?.product?.product_code} - {r.inventory?.product?.name}</span>
      ),
    },
    {
      key: 'print_type', label: 'ประเภท',
      render: (r: LabelPrintLog) => (
        <Badge variant={r.print_type === 'FIRST' ? 'info' : 'warning'}>
          {r.print_type === 'FIRST' ? 'ปริ้นครั้งแรก' : 'ปริ้นซ้ำ'}
        </Badge>
      ),
    },
    {
      key: 'paper_size', label: 'ขนาดกระดาษ',
      render: (r: LabelPrintLog) => <span className="text-sm">{r.paper_size}</span>,
    },
    {
      key: 'reprint_reason', label: 'เหตุผลปริ้นซ้ำ',
      render: (r: LabelPrintLog) => <span className="text-sm text-gray-500">{r.reprint_reason || '-'}</span>,
    },
    {
      key: 'printed_by', label: 'ผู้ปริ้น',
      render: (r: LabelPrintLog) => <span>{r.printer?.name || '-'}</span>,
    },
    {
      key: 'printed_at', label: 'เวลา',
      render: (r: LabelPrintLog) => <span className="text-sm text-gray-500">{new Date(r.printed_at).toLocaleString('th-TH')}</span>,
    },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="ค้นหา serial..." value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none" />
        </div>
        <select value={printType} onChange={e => { setPrintType(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
          <option value="">ทุกประเภท</option>
          <option value="FIRST">ปริ้นครั้งแรก</option>
          <option value="REPRINT">ปริ้นซ้ำ</option>
        </select>
      </div>

      <DataTable columns={columns} data={logs} loading={loading} emptyMessage="ไม่มีประวัติการปริ้น" />
      <Pagination currentPage={meta.current_page} lastPage={meta.last_page} total={meta.total} onPageChange={setPage} />
    </div>
  );
}
/* ══════════════════════════════════════════════════════════════════
   Tab: PDA Token Management
   ══════════════════════════════════════════════════════════════════ */
interface PdaTokenItem {
  id: number; name: string; token: string; expires_at: string;
  is_expired: boolean; is_revoked: boolean; is_valid: boolean;
  scan_count: number; last_used_at: string | null;
  created_by: string; created_at: string;
}

function PdaTokenTab() {
  const [tokens, setTokens] = useState<PdaTokenItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const fetchTokens = useCallback(async () => {
    setLoading(true);
    try {
      const res = await labelService.listPdaTokens();
      setTokens(res.data);
    } catch {
      toast('โหลดข้อมูล Token ไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTokens(); }, [fetchTokens]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await labelService.createPdaToken(name || undefined);
      toast('สร้าง Token สำเร็จ', 'success');
      setName('');
      fetchTokens();
    } catch {
      toast('สร้าง Token ไม่สำเร็จ', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: number) => {
    if (!confirm('ต้องการเพิกถอน Token นี้หรือไม่?')) return;
    try {
      await labelService.revokePdaToken(id);
      toast('เพิกถอน Token แล้ว', 'success');
      fetchTokens();
    } catch {
      toast('เพิกถอนไม่สำเร็จ', 'error');
    }
  };

  const getPdaUrl = (token: string) => {
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    return `${base}/pda?token=${token}`;
  };

  const copyUrl = async (token: PdaTokenItem) => {
    const url = getPdaUrl(token.token);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(token.id);
      toast('คัดลอก URL แล้ว', 'success');
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedId(token.id);
      toast('คัดลอก URL แล้ว', 'success');
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
  };

  const formatRemaining = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return 'หมดอายุแล้ว';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h} ชม. ${m} น.`;
  };

  return (
    <div className="space-y-6">
      {/* Info box */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <Smartphone size={16} className="mr-1.5 inline -mt-0.5" />
        สร้าง Token แล้ว Copy URL ส่งให้พนักงานหน้าคลัง เปิดลิงก์ในมือถือ/PDA เพื่อสแกน Barcode ยืนยันติด Label
        <strong className="ml-1">Token หมดอายุภายใน 8 ชั่วโมง</strong> โดยไม่ต้อง Login เข้าระบบ
      </div>

      {/* Create token */}
      <div className="flex items-end gap-3 rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex-1">
          <label className="mb-1 block text-sm font-medium text-gray-700">ชื่อ / หมายเหตุ (ไม่จำเป็น)</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder='เช่น "พนักงานคลัง A", "ทีมงาน Line 2"'
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
        </div>
        <button onClick={handleCreate} disabled={creating}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50">
          <Plus size={16} />
          {creating ? 'กำลังสร้าง...' : 'สร้าง Token'}
        </button>
      </div>

      {/* Token list */}
      {loading && <div className="py-8 text-center text-sm text-gray-400">กำลังโหลด...</div>}

      {!loading && tokens.length === 0 && (
        <div className="py-8 text-center text-sm text-gray-400">ยังไม่มี Token — กดปุ่ม &quot;สร้าง Token&quot; เพื่อเริ่มต้น</div>
      )}

      {!loading && tokens.length > 0 && (
        <div className="space-y-3">
          {tokens.map(t => (
            <div key={t.id}
              className={`rounded-xl border bg-white p-4 shadow-sm transition ${
                !t.is_valid ? 'opacity-60' : ''
              } ${t.is_revoked ? 'border-red-200 bg-red-50/30' : t.is_expired ? 'border-gray-200 bg-gray-50/50' : 'border-green-200'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                {/* Left */}
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="font-semibold text-gray-800">{t.name}</span>
                    {t.is_valid && (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">ใช้งานได้</span>
                    )}
                    {t.is_revoked && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">เพิกถอนแล้ว</span>
                    )}
                    {t.is_expired && !t.is_revoked && (
                      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-semibold text-gray-600">หมดอายุ</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                    <span>สร้างโดย: {t.created_by}</span>
                    <span>สร้างเมื่อ: {formatDate(t.created_at)}</span>
                    <span>หมดอายุ: {formatDate(t.expires_at)}</span>
                    {t.is_valid && <span className="font-medium text-green-600">เหลือ: {formatRemaining(t.expires_at)}</span>}
                    <span>สแกนแล้ว: <strong>{t.scan_count}</strong> ครั้ง</span>
                    {t.last_used_at && <span>ใช้ล่าสุด: {formatDate(t.last_used_at)}</span>}
                  </div>
                </div>

                {/* Right actions */}
                <div className="flex shrink-0 items-center gap-2">
                  {t.is_valid && (
                    <>
                      <button onClick={() => copyUrl(t)}
                        className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50">
                        {copiedId === t.id ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                        {copiedId === t.id ? 'คัดลอกแล้ว!' : 'Copy URL'}
                      </button>
                      <a href={getPdaUrl(t.token)} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50">
                        <ExternalLink size={14} /> เปิด
                      </a>
                      <button onClick={() => handleRevoke(t.id)}
                        className="flex items-center gap-1 rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50">
                        <Ban size={14} /> เพิกถอน
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}