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
  X,
  Smartphone,
  Copy,
  Check,
  Ban,
  Plus,
  ExternalLink,
} from 'lucide-react';

const PAPER_SIZES = [
  { value: '50x30', label: '50 x 30 mm' },
  { value: '70x40', label: '70 x 40 mm' },
  { value: '100x50', label: '100 x 50 mm' },
  { value: '80x60', label: '80 x 60 mm' },
  { value: '100x70', label: '100 x 70 mm' },
  { value: 'custom', label: 'กำหนดเอง' },
];

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
      <div className="mb-6 flex border-b">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {tab.icon} {tab.label}
          </button>
        ))}
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
    <div className="flex items-center gap-3 rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-50">{icon}</div>
      <div>
        <p className="text-xl font-bold">{value.toLocaleString()}</p>
        <p className="text-xs text-gray-500">{label}</p>
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
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="ค้นหาเลขที่ใบสั่งผลิต..." value={search} onChange={e => setSearch(e.target.value)}
              className="rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none" />
          </div>
          <button type="submit" className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">ค้นหา</button>
        </form>
      </div>

      <DataTable columns={columns} data={orders} loading={loading} emptyMessage="ไม่มีรายการใบสั่งผลิต" />
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
      <div className="mb-4 flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
          <ArrowLeft size={16} /> กลับ
        </button>
        {poInfo && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Package size={18} className="text-blue-600" />
              <span className="text-lg font-bold text-gray-800">{poInfo.order_number}</span>
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
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="ค้นหา serial..." value={search} onChange={e => setSearch(e.target.value)}
              className="rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none" />
          </div>
          <button type="submit" className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">ค้นหา</button>
        </form>

        <select value={labelStatus} onChange={e => { setLabelStatus(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
          <option value="">ทุกสถานะ</option>
          <option value="not_printed">ยังไม่ปริ้น</option>
          <option value="printed">ปริ้นแล้ว</option>
          <option value="verified">ยืนยันแล้ว</option>
        </select>

        <div className="ml-auto flex items-end gap-3">
          <div>
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
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
              <option value="" disabled>เลือก Template</option>
              {customTemplates.map(t => (
                <option key={t.id} value={`custom:${t.id}`}>
                  {t.name} ({t.paper_width}×{t.paper_height}mm){t.is_default ? ' ⭐' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">ขนาดกระดาษ</label>
            <div className="flex items-center gap-2">
              <select value={paperSize} onChange={e => setPaperSize(e.target.value)}
                disabled={!!selectedCustomTemplate}
                className={`rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none ${selectedCustomTemplate ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}>
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
          {canManage && canPrint && unprintedCount > 0 && (
            <button onClick={openPreviewAll}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
              <Eye size={16} /> ปริ้นทั้งใบ ({unprintedCount})
            </button>
          )}
          {canManage && canPrint && (
            <button onClick={openPreviewSelected} disabled={selected.size === 0}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              <Eye size={16} /> ปริ้นที่เลือก ({selected.size})
            </button>
          )}
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

      <DataTable columns={columns} data={items} loading={loading} emptyMessage="ไม่มี serial ในใบสั่งผลิตนี้" />
      <Pagination currentPage={meta.current_page} lastPage={meta.last_page} total={meta.total} onPageChange={setPage} />

      {/* Print Preview Modal */}
      {showPreview && (
        <PrintPreviewModal
          items={previewItems}
          paperSize={effectivePaperSize}
          customTemplateData={selectedCustomTemplate}
          printing={previewMode === 'all' ? printingAll : printing}
          onConfirm={handleConfirmPrint}
          onClose={() => setShowPreview(false)}
          poOrderNumber={poInfo?.order_number || ''}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}

/* ── Print Preview Modal ── */
function PrintPreviewModal({ items, paperSize, customTemplateData, printing, onConfirm, onClose, poOrderNumber, isAdmin }: {
  items: Inventory[];
  paperSize: string;
  customTemplateData?: CustomTemplate;
  printing: boolean;
  onConfirm: (reprintReason?: string) => void;
  onClose: () => void;
  poOrderNumber: string;
  isAdmin: boolean;
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
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) { resolve(); return; }
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
  }, [items, customTemplateData]);

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
    const now = new Date();
    const dateStr = now.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const input: Record<string, string> = {
      serial_number: inv.serial_number,
      po_number: poOrderNumber,
      product_name: inv.product?.name || '-',
      product_code: inv.product?.product_code || '-',
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
      const value = input[fname] || (field.content as string) || '';
      const fontSize = Number(field.fontSize) || 9;
      const alignment = (field.alignment as string) || 'left';
      const fontColor = (field.fontColor as string) || '#000000';
      const fontName = (field.fontName as string) || 'Sarabun';
      const lineHeight = Number(field.lineHeight) || 1.2;
      const bgColor = (field.backgroundColor as string) || '';
      const isBold = fontName.includes('Bold');

      if (ftype === 'code128' || ftype === 'code39') {
        const barcodeFormat = ftype === 'code39' ? 'CODE39' : 'CODE128';
        return `<div style="position:absolute; left:${x}mm; top:${y}mm; width:${fw}mm; height:${fh}mm; overflow:hidden; display:flex; align-items:center; justify-content:center;">
          <svg class="barcode" data-value="${escapeHtml(value)}" data-format="${barcodeFormat}"></svg>
        </div>`;
      }
      if (ftype === 'qrcode') {
        return `<div style="position:absolute; left:${x}mm; top:${y}mm; width:${fw}mm; height:${fh}mm; overflow:hidden;">
          <div class="qr" data-value="${escapeHtml(value)}" style="width:100%; height:100%;"></div>
        </div>`;
      }
      if (ftype === 'line') {
        const color = (field.color as string) || '#000';
        return `<div style="position:absolute; left:${x}mm; top:${y}mm; width:${fw}mm; height:0; border-top:0.3mm solid ${color};"></div>`;
      }
      if (ftype === 'rectangle') {
        const borderColor = (field.borderColor as string) || '#000';
        const borderWidth = Number(field.borderWidth) || 0.3;
        return `<div style="position:absolute; left:${x}mm; top:${y}mm; width:${fw}mm; height:${fh}mm; border:${borderWidth}mm solid ${borderColor}; ${bgColor ? `background:${bgColor};` : ''}"></div>`;
      }
      if (ftype === 'ellipse') {
        const borderColor = (field.borderColor as string) || '#000';
        return `<div style="position:absolute; left:${x}mm; top:${y}mm; width:${fw}mm; height:${fh}mm; border-radius:50%; border:0.3mm solid ${borderColor}; ${bgColor ? `background:${bgColor};` : ''}"></div>`;
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

    // Render each label to HTML
    const labelsHtml = items.map(inv =>
      `<div class="label">${buildLabelHtml(inv, firstPage)}</div>`
    ).join('');

    const printWindow = window.open('', '_blank');
    if (!printWindow) { toast('ไม่สามารถเปิดหน้าต่างปริ้นได้ กรุณาอนุญาต popup', 'error'); return; }

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Labels - ${escapeHtml(poOrderNumber)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap');
    @page { size: ${w}mm ${h}mm; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Sarabun', sans-serif; }
    .label {
      position: relative;
      width: ${w}mm; height: ${h}mm;
      page-break-after: always;
      overflow: hidden;
    }
    .label:last-child { page-break-after: auto; }
    @media screen {
      body { background: #f3f4f6; padding: 20px; display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
      .label { background: white; border: 1px solid #d1d5db; border-radius: 4px; }
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"><\/script>
</head>
<body>
  ${labelsHtml}
  <script>
    // Render barcodes — stretch to fill container exactly like pdfme
    document.querySelectorAll('svg.barcode').forEach(svg => {
      const value = svg.dataset.value || '';
      const fmt = svg.dataset.format || 'CODE128';
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
        // Capture rendered pixel size, then stretch via viewBox to fill container
        const rw = svg.getAttribute('width');
        const rh = svg.getAttribute('height');
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
    document.querySelectorAll('.qr').forEach(el => {
      const value = el.dataset.value || '';
      try {
        const qr = qrcode(0, 'M');
        qr.addData(value);
        qr.make();
        el.innerHTML = qr.createSvgTag({ scalable: true });
        const svg = el.querySelector('svg');
        if (svg) { svg.style.width = '100%'; svg.style.height = '100%'; }
      } catch(e) { console.error('QR error:', e); }
    });
    // Auto print after scripts load
    setTimeout(() => window.print(), 500);
  <\/script>
</body>
</html>`);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="mx-4 flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-800">ตัวอย่าง Label ก่อนปริ้น</h2>
            <p className="text-sm text-gray-500">
              {items.length} รายการ | {templateLabel} | ขนาดกระดาษ: {paperLabel} | ใบสั่งผลิต: {poOrderNumber}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Preview grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Admin reprint warning */}
          {hasReprints && isAdmin && (
            <div className="mb-4 rounded-lg border border-orange-200 bg-orange-50 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-orange-500" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-orange-800">
                    มี {reprintItems.length} รายการที่เคยปริ้นแล้ว (ปริ้นซ้ำ)
                  </p>
                  <p className="mt-1 text-xs text-orange-600">
                    คุณสามารถปริ้นซ้ำได้โดยตรงเนื่องจากเป็น Admin กรุณาระบุเหตุผล
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
            return (
              <div className="flex flex-wrap gap-4 justify-center" ref={previewContainerRef}>
                {items.map(inv => (
                  <div key={inv.id} className="relative" style={{ width: displayW, height: displayH }}>
                    {inv.label_print_count > 0 && (
                      <span className="absolute -top-2 -right-2 z-10 rounded bg-orange-200 px-1.5 py-0.5 text-[8px] font-semibold text-orange-700">ปริ้นซ้ำ</span>
                    )}
                    <div
                      className="origin-top-left border border-gray-300 bg-white shadow-sm rounded"
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
        <div className="flex items-center justify-between border-t px-6 py-4">
          <button onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            ยกเลิก
          </button>
          <button onClick={handleConfirmAndPrint}
            disabled={printing}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
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

/* ══════════════════════════════════════════════════════════════════
   Tab: Verify (PDA Scan)
   ══════════════════════════════════════════════════════════════════ */
function VerifyTab({ canManage, onVerified }: { canManage: boolean; onVerified: () => void }) {
  const [serial, setSerial] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [recentVerified, setRecentVerified] = useState<Array<{ serial: string; product: string; time: string; ok: boolean; msg: string }>>([]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serial.trim()) return;
    setVerifying(true);
    try {
      const res = await labelService.verify(serial.trim());
      const inv = res.data;
      setRecentVerified(prev => [{
        serial: serial.trim(),
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
        serial: serial.trim(),
        product: '-',
        time: new Date().toLocaleTimeString('th-TH'),
        ok: false,
        msg,
      }, ...prev].slice(0, 50));
      toast(msg, 'error');
    } finally {
      setSerial('');
      setVerifying(false);
      document.getElementById('verify-input')?.focus();
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
            id="verify-input"
            type="text"
            placeholder="สแกน Serial Number..."
            value={serial}
            onChange={e => setSerial(e.target.value)}
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