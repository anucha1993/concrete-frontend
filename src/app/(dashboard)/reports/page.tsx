'use client';

import { useState, useEffect, useCallback } from 'react';
import AuthGuard from '@/components/AuthGuard';
import PageHeader from '@/components/ui/PageHeader';
import Badge from '@/components/ui/Badge';
import Pagination from '@/components/ui/Pagination';
import { toast } from '@/components/ui/Toast';
import { reportService, type ReportFilters } from '@/services/report.service';
import { categoryService, locationService } from '@/services/master.service';
import type { Category, Location } from '@/lib/types';
import {
  Search, Download, Warehouse, TrendingDown, FileWarning,
  ClipboardList, ArrowRightLeft, ChevronDown, X, Filter, BarChart3,
} from 'lucide-react';

/* ─── Constants ─── */
const TABS = [
  { key: 'inventory', label: 'รายงานสต๊อก', icon: <Warehouse size={16} /> },
  { key: 'stock-deductions', label: 'การตัดสต๊อก', icon: <TrendingDown size={16} /> },
  { key: 'claims', label: 'เคลมสินค้า', icon: <FileWarning size={16} /> },
  { key: 'production', label: 'การผลิต', icon: <ClipboardList size={16} /> },
  { key: 'movements', label: 'ความเคลื่อนไหว', icon: <ArrowRightLeft size={16} /> },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const STATUS_OPTIONS: Record<string, { value: string; label: string }[]> = {
  inventory: [
    { value: 'PENDING', label: 'รอรับเข้าคลัง' },
    { value: 'IN_STOCK', label: 'ในคลัง' },
    { value: 'SOLD', label: 'ขายแล้ว' },
    { value: 'DAMAGED', label: 'ชำรุด' },
    { value: 'SCRAPPED', label: 'ทำลาย' },
  ],
  'stock-deductions': [
    { value: 'DRAFT', label: 'แบบร่าง' },
    { value: 'PENDING', label: 'รอดำเนินการ' },
    { value: 'IN_PROGRESS', label: 'กำลังดำเนินการ' },
    { value: 'COMPLETED', label: 'เสร็จสิ้น' },
    { value: 'APPROVED', label: 'อนุมัติ' },
    { value: 'CANCELLED', label: 'ยกเลิก' },
  ],
  claims: [
    { value: 'DRAFT', label: 'แบบร่าง' },
    { value: 'PENDING', label: 'รอดำเนินการ' },
    { value: 'APPROVED', label: 'อนุมัติ' },
    { value: 'REJECTED', label: 'ปฏิเสธ' },
    { value: 'CANCELLED', label: 'ยกเลิก' },
  ],
  production: [
    { value: 'DRAFT', label: 'แบบร่าง' },
    { value: 'CONFIRMED', label: 'ยืนยัน' },
    { value: 'IN_PROGRESS', label: 'กำลังผลิต' },
    { value: 'COMPLETED', label: 'เสร็จสิ้น' },
    { value: 'CANCELLED', label: 'ยกเลิก' },
  ],
  movements: [],
};

const TYPE_OPTIONS: Record<string, { value: string; label: string }[]> = {
  'stock-deductions': [
    { value: 'SOLD', label: 'ขาย' },
    { value: 'LOST', label: 'สูญหาย' },
    { value: 'DAMAGED', label: 'ชำรุด' },
    { value: 'OTHER', label: 'อื่นๆ' },
  ],
  claims: [
    { value: 'RETURN', label: 'คืนสินค้า' },
    { value: 'TRANSPORT_DAMAGE', label: 'เสียหายจากขนส่ง' },
    { value: 'DEFECT', label: 'สินค้าชำรุด' },
    { value: 'WRONG_SPEC', label: 'สเปคไม่ตรง' },
    { value: 'OTHER', label: 'อื่นๆ' },
  ],
  movements: [
    { value: 'PRODUCTION_IN', label: 'ผลิตเข้าคลัง' },
    { value: 'TRANSFER', label: 'ย้ายคลัง' },
    { value: 'SOLD', label: 'ขาย' },
    { value: 'DAMAGED', label: 'ชำรุด' },
    { value: 'ADJUSTMENT', label: 'ปรับสต็อก' },
    { value: 'SCRAP', label: 'ทำลาย' },
    { value: 'CLAIM_RETURN', label: 'คืนสต็อกจากเคลม' },
  ],
};

/* ─── Main Page ─── */
export default function ReportsPage() {
  return (
    <AuthGuard permission="view_reports">
      <ReportsContent />
    </AuthGuard>
  );
}

function ReportsContent() {
  const [activeTab, setActiveTab] = useState<TabKey>('inventory');
  const [filters, setFilters] = useState<ReportFilters>({});
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, per_page: 50, total: 0 });
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showFilters, setShowFilters] = useState(true);

  // Lookup data
  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);

  useEffect(() => {
    categoryService.list().then(r => setCategories(r.data)).catch(() => {});
    locationService.list().then(r => setLocations(r.data)).catch(() => {});
  }, []);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params: ReportFilters = { ...filters, page, per_page: 50 };
      const fetcher = {
        inventory: reportService.inventory,
        'stock-deductions': reportService.stockDeductions,
        claims: reportService.claims,
        production: reportService.production,
        movements: reportService.movements,
      }[activeTab];

      const res = await fetcher(params);
      setData(res.data);
      setSummary(res.summary);
      setMeta(res.meta);
    } catch {
      toast('โหลดรายงานไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeTab, filters, page]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    setFilters({});
    setPage(1);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await reportService.exportExcel(activeTab, filters);
      toast('ดาวน์โหลดสำเร็จ', 'success');
    } catch {
      toast('ดาวน์โหลดไม่สำเร็จ', 'error');
    } finally {
      setExporting(false);
    }
  };

  const clearFilters = () => { setFilters({}); setPage(1); };

  const hasActiveFilters = Object.values(filters).some(v => v !== undefined && v !== '' && v !== null);

  return (
    <div>
      <PageHeader
        title="รายงาน"
        description="รายงานข้อมูลสต๊อก, การตัดสต๊อก, เคลม, การผลิต, ความเคลื่อนไหว"
        actions={
          <button
            onClick={handleExport}
            disabled={exporting || data.length === 0}
            className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            <Download size={16} />
            {exporting ? 'กำลังดาวน์โหลด...' : 'Export Excel'}
          </button>
        }
      />

      {/* ── Tab Navigation ── */}
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl border bg-gray-50 p-1">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="mb-4 rounded-xl border bg-white p-4 shadow-sm">
        <button onClick={() => setShowFilters(!showFilters)} className="flex w-full items-center justify-between text-sm font-medium text-gray-700">
          <span className="flex items-center gap-2"><Filter size={16} /> ตัวกรอง {hasActiveFilters && <Badge variant="info">{Object.values(filters).filter(v => v).length}</Badge>}</span>
          <ChevronDown size={16} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </button>

        {showFilters && (
          <div className="mt-3 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {/* Search */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">ค้นหา</label>
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={filters.search || ''}
                    onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && fetchReport()}
                    placeholder={activeTab === 'inventory' ? 'Serial Number...' : 'รหัส, ชื่อลูกค้า...'}
                    className="w-full rounded-lg border border-gray-300 py-2 pl-8 pr-3 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Status */}
              {STATUS_OPTIONS[activeTab]?.length > 0 && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">สถานะ</label>
                  <select
                    value={filters.status || ''}
                    onChange={e => { setFilters(f => ({ ...f, status: e.target.value || undefined })); setPage(1); }}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">ทั้งหมด</option>
                    {STATUS_OPTIONS[activeTab].map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              )}

              {/* Type */}
              {TYPE_OPTIONS[activeTab]?.length > 0 && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">ประเภท</label>
                  <select
                    value={filters.type || ''}
                    onChange={e => { setFilters(f => ({ ...f, type: e.target.value || undefined })); setPage(1); }}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">ทั้งหมด</option>
                    {TYPE_OPTIONS[activeTab].map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              )}

              {/* Condition — only for inventory */}
              {activeTab === 'inventory' && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">สภาพ</label>
                  <select
                    value={filters.condition || ''}
                    onChange={e => { setFilters(f => ({ ...f, condition: e.target.value || undefined })); setPage(1); }}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">ทั้งหมด</option>
                    <option value="GOOD">สภาพดี</option>
                    <option value="DAMAGED">ชำรุด</option>
                  </select>
                </div>
              )}

              {/* Category — inventory */}
              {activeTab === 'inventory' && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">หมวดหมู่</label>
                  <select
                    value={filters.category_id || ''}
                    onChange={e => { setFilters(f => ({ ...f, category_id: e.target.value ? Number(e.target.value) : undefined })); setPage(1); }}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">ทั้งหมด</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}

              {/* Location — inventory & movements */}
              {(activeTab === 'inventory' || activeTab === 'movements') && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">คลัง</label>
                  <select
                    value={filters.location_id || ''}
                    onChange={e => { setFilters(f => ({ ...f, location_id: e.target.value ? Number(e.target.value) : undefined })); setPage(1); }}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">ทั้งหมด</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              )}

              {/* Date range */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">ตั้งแต่วันที่</label>
                <input
                  type="date"
                  value={filters.date_from || ''}
                  onChange={e => { setFilters(f => ({ ...f, date_from: e.target.value || undefined })); setPage(1); }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">ถึงวันที่</label>
                <input
                  type="date"
                  value={filters.date_to || ''}
                  onChange={e => { setFilters(f => ({ ...f, date_to: e.target.value || undefined })); setPage(1); }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button onClick={() => { setPage(1); fetchReport(); }} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                <span className="flex items-center gap-1.5"><Search size={14} /> ค้นหา</span>
              </button>
              {hasActiveFilters && (
                <button onClick={clearFilters} className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
                  <X size={14} /> ล้างตัวกรอง
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Summary Cards ── */}
      <SummaryCards tab={activeTab} summary={summary} />

      {/* ── Data Table ── */}
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-medium text-gray-700">
            {TABS.find(t => t.key === activeTab)?.label} — {meta.total.toLocaleString()} รายการ
          </span>
        </div>
        <div className="overflow-x-auto">
          <ReportTable tab={activeTab} data={data} loading={loading} />
        </div>
        <div className="border-t px-4 py-3">
          <Pagination currentPage={meta.current_page} lastPage={meta.last_page} total={meta.total} onPageChange={setPage} />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
 *  Summary Cards
 * ═════════════════════════════════════════════════════════════════ */
function SummaryCards({ tab, summary }: { tab: TabKey; summary: Record<string, number> }) {
  const cards: { label: string; key: string; color: string }[] = (() => {
    switch (tab) {
      case 'inventory':
        return [
          { label: 'ทั้งหมด', key: 'total', color: 'bg-gray-100 text-gray-700' },
          { label: 'ในคลัง', key: 'in_stock', color: 'bg-green-50 text-green-700' },
          { label: 'ขายแล้ว', key: 'sold', color: 'bg-blue-50 text-blue-700' },
          { label: 'ชำรุด', key: 'damaged', color: 'bg-orange-50 text-orange-700' },
          { label: 'ทำลาย', key: 'scrapped', color: 'bg-red-50 text-red-700' },
          { label: 'รอรับเข้า', key: 'pending', color: 'bg-yellow-50 text-yellow-700' },
        ];
      case 'stock-deductions':
        return [
          { label: 'ทั้งหมด', key: 'total', color: 'bg-gray-100 text-gray-700' },
          { label: 'เสร็จสิ้น', key: 'completed', color: 'bg-green-50 text-green-700' },
          { label: 'อนุมัติ', key: 'approved', color: 'bg-blue-50 text-blue-700' },
          { label: 'รอดำเนินการ', key: 'pending', color: 'bg-yellow-50 text-yellow-700' },
          { label: 'แบบร่าง', key: 'draft', color: 'bg-gray-50 text-gray-600' },
          { label: 'รายการสินค้ารวม', key: 'total_items', color: 'bg-purple-50 text-purple-700' },
        ];
      case 'claims':
        return [
          { label: 'ทั้งหมด', key: 'total', color: 'bg-gray-100 text-gray-700' },
          { label: 'อนุมัติ', key: 'approved', color: 'bg-green-50 text-green-700' },
          { label: 'รอดำเนินการ', key: 'pending', color: 'bg-yellow-50 text-yellow-700' },
          { label: 'ปฏิเสธ', key: 'rejected', color: 'bg-red-50 text-red-700' },
          { label: 'แบบร่าง', key: 'draft', color: 'bg-gray-50 text-gray-600' },
          { label: 'รายการสินค้ารวม', key: 'total_items', color: 'bg-purple-50 text-purple-700' },
        ];
      case 'production':
        return [
          { label: 'ทั้งหมด', key: 'total', color: 'bg-gray-100 text-gray-700' },
          { label: 'เสร็จสิ้น', key: 'completed', color: 'bg-green-50 text-green-700' },
          { label: 'กำลังผลิต', key: 'in_progress', color: 'bg-blue-50 text-blue-700' },
          { label: 'ยืนยัน', key: 'confirmed', color: 'bg-cyan-50 text-cyan-700' },
          { label: 'แบบร่าง', key: 'draft', color: 'bg-gray-50 text-gray-600' },
          { label: 'จำนวนรวม (ชุด)', key: 'total_qty', color: 'bg-purple-50 text-purple-700' },
        ];
      case 'movements':
        return [
          { label: 'ทั้งหมด', key: 'total', color: 'bg-gray-100 text-gray-700' },
          { label: 'ผลิตเข้าคลัง', key: 'production_in', color: 'bg-green-50 text-green-700' },
          { label: 'ย้ายคลัง', key: 'transfer', color: 'bg-blue-50 text-blue-700' },
          { label: 'ขาย', key: 'sold', color: 'bg-cyan-50 text-cyan-700' },
          { label: 'ชำรุด', key: 'damaged', color: 'bg-orange-50 text-orange-700' },
          { label: 'ปรับสต็อก', key: 'adjustment', color: 'bg-yellow-50 text-yellow-700' },
        ];
    }
  })();

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {cards.map(c => (
        <div key={c.key} className={`rounded-xl p-3 ${c.color}`}>
          <p className="text-2xl font-bold">{(summary[c.key] ?? 0).toLocaleString()}</p>
          <p className="text-xs opacity-80">{c.label}</p>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
 *  Report Tables
 * ═════════════════════════════════════════════════════════════════ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ReportTable({ tab, data, loading }: { tab: TabKey; data: any[]; loading: boolean }) {
  if (loading) {
    return <div className="px-4 py-12 text-center text-gray-400">กำลังโหลด...</div>;
  }
  if (data.length === 0) {
    return (
      <div className="px-4 py-12 text-center text-gray-400">
        <BarChart3 size={40} className="mx-auto mb-2 opacity-30" />
        ไม่พบข้อมูล
      </div>
    );
  }

  switch (tab) {
    case 'inventory':           return <InventoryTable data={data} />;
    case 'stock-deductions':    return <StockDeductionsTable data={data} />;
    case 'claims':              return <ClaimsTable data={data} />;
    case 'production':          return <ProductionTable data={data} />;
    case 'movements':           return <MovementsTable data={data} />;
  }
}

/* ── Inventory Table ── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function InventoryTable({ data }: { data: any[] }) {
  const STATUS: Record<string, { label: string; variant: 'success' | 'danger' | 'warning' | 'info' | 'gray' }> = {
    PENDING: { label: 'รอรับเข้า', variant: 'warning' },
    IN_STOCK: { label: 'ในคลัง', variant: 'success' },
    SOLD: { label: 'ขายแล้ว', variant: 'info' },
    DAMAGED: { label: 'ชำรุด', variant: 'danger' },
    SCRAPPED: { label: 'ทำลาย', variant: 'gray' },
  };
  const COND: Record<string, { label: string; variant: 'success' | 'danger' }> = {
    GOOD: { label: 'สภาพดี', variant: 'success' },
    DAMAGED: { label: 'ชำรุด', variant: 'danger' },
  };

  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50">
        <tr>
          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">Serial Number</th>
          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">สินค้า</th>
          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">หมวดหมู่</th>
          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">คลัง</th>
          <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500">สถานะ</th>
          <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500">สภาพ</th>
          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">หมายเหตุ</th>
          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">วันที่รับเข้า</th>
        </tr>
      </thead>
      <tbody>
        {data.map((r, i) => {
          const s = STATUS[r.status] || { label: r.status, variant: 'gray' as const };
          const c = COND[r.condition] || { label: r.condition, variant: 'success' as const };
          return (
            <tr key={r.id || i} className="border-t hover:bg-gray-50">
              <td className="px-3 py-2 font-mono text-xs font-medium">{r.serial_number}</td>
              <td className="px-3 py-2">
                <div className="font-medium">{r.product?.name || '-'}</div>
                <div className="text-xs text-gray-400">{r.product?.product_code}</div>
              </td>
              <td className="px-3 py-2 text-gray-500">{r.product?.category?.name || '-'}</td>
              <td className="px-3 py-2">{r.location?.name || '-'}</td>
              <td className="px-3 py-2 text-center"><Badge variant={s.variant}>{s.label}</Badge></td>
              <td className="px-3 py-2 text-center"><Badge variant={c.variant}>{c.label}</Badge></td>
              <td className="px-3 py-2 text-xs text-gray-500 max-w-[180px] truncate" title={r.note || ''}>{r.note || '-'}</td>
              <td className="px-3 py-2 text-xs text-gray-500">{r.received_at ? new Date(r.received_at).toLocaleDateString('th-TH') : '-'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ── Stock Deductions Table ── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function StockDeductionsTable({ data }: { data: any[] }) {
  const TYPE: Record<string, string> = { SOLD: 'ขาย', LOST: 'สูญหาย', DAMAGED: 'ชำรุด', OTHER: 'อื่นๆ' };
  const STATUS: Record<string, { label: string; variant: 'success' | 'danger' | 'warning' | 'info' | 'gray' }> = {
    DRAFT: { label: 'แบบร่าง', variant: 'gray' },
    PENDING: { label: 'รอดำเนินการ', variant: 'warning' },
    IN_PROGRESS: { label: 'กำลังดำเนินการ', variant: 'info' },
    COMPLETED: { label: 'เสร็จสิ้น', variant: 'success' },
    APPROVED: { label: 'อนุมัติ', variant: 'success' },
    CANCELLED: { label: 'ยกเลิก', variant: 'danger' },
  };

  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50">
        <tr>
          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">รหัส</th>
          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">ประเภท</th>
          <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500">สถานะ</th>
          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">ลูกค้า</th>
          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">เอกสารอ้างอิง</th>
          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">รายการสินค้า</th>
          <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">จำนวน</th>
          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">เหตุผล</th>
          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">ผู้สร้าง</th>
          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">วันที่</th>
        </tr>
      </thead>
      <tbody>
        {data.map((r, i) => {
          const s = STATUS[r.status] || { label: r.status, variant: 'gray' as const };
          const products = (r.lines || []).map((l: { product?: { product_code?: string }; quantity?: number }) => `${l.product?.product_code || '?'} x${l.quantity}`).join(', ');
          const totalQty = (r.lines || []).reduce((sum: number, l: { quantity?: number }) => sum + (l.quantity || 0), 0);
          return (
            <tr key={r.id || i} className="border-t hover:bg-gray-50">
              <td className="px-3 py-2 font-mono text-xs font-medium">{r.code}</td>
              <td className="px-3 py-2">{TYPE[r.type] || r.type}</td>
              <td className="px-3 py-2 text-center"><Badge variant={s.variant}>{s.label}</Badge></td>
              <td className="px-3 py-2">{r.customer_name || '-'}</td>
              <td className="px-3 py-2 text-xs">{r.reference_doc || '-'}</td>
              <td className="px-3 py-2 text-xs text-gray-500 max-w-[200px] truncate" title={products}>{products || '-'}</td>
              <td className="px-3 py-2 text-right font-medium">{totalQty}</td>
              <td className="px-3 py-2 text-xs text-gray-500 max-w-[150px] truncate" title={r.reason || ''}>{r.reason || '-'}</td>
              <td className="px-3 py-2 text-xs">{r.creator?.name || '-'}</td>
              <td className="px-3 py-2 text-xs text-gray-500">{r.created_at ? new Date(r.created_at).toLocaleDateString('th-TH') : '-'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ── Claims Table ── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ClaimsTable({ data }: { data: any[] }) {
  const TYPE: Record<string, string> = { RETURN: 'คืนสินค้า', TRANSPORT_DAMAGE: 'เสียหายจากขนส่ง', DEFECT: 'สินค้าชำรุด', WRONG_SPEC: 'สเปคไม่ตรง', OTHER: 'อื่นๆ' };
  const STATUS: Record<string, { label: string; variant: 'success' | 'danger' | 'warning' | 'info' | 'gray' }> = {
    DRAFT: { label: 'แบบร่าง', variant: 'gray' },
    PENDING: { label: 'รอดำเนินการ', variant: 'warning' },
    APPROVED: { label: 'อนุมัติ', variant: 'success' },
    REJECTED: { label: 'ปฏิเสธ', variant: 'danger' },
    CANCELLED: { label: 'ยกเลิก', variant: 'gray' },
  };
  const RES: Record<string, string> = { RETURN_STOCK: 'คืนสต็อก', RETURN_DAMAGED: 'คืนเป็นชำรุด', REPLACE: 'เปลี่ยนสินค้า', REFUND: 'คืนเงิน', CREDIT_NOTE: 'ลดหนี้' };

  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50">
        <tr>
          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">รหัส</th>
          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">ประเภท</th>
          <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500">สถานะ</th>
          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">การจัดการ</th>
          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">ลูกค้า</th>
          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">รายการสินค้า</th>
          <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">จำนวน</th>
          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">เหตุผล</th>
          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">ผู้สร้าง</th>
          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">วันที่</th>
        </tr>
      </thead>
      <tbody>
        {data.map((r, i) => {
          const s = STATUS[r.status] || { label: r.status, variant: 'gray' as const };
          const products = (r.lines || []).map((l: { product?: { product_code?: string }; quantity?: number }) => `${l.product?.product_code || '?'} x${l.quantity}`).join(', ');
          const totalQty = (r.lines || []).reduce((sum: number, l: { quantity?: number }) => sum + (l.quantity || 0), 0);
          return (
            <tr key={r.id || i} className="border-t hover:bg-gray-50">
              <td className="px-3 py-2 font-mono text-xs font-medium">{r.code}</td>
              <td className="px-3 py-2">{TYPE[r.type] || r.type}</td>
              <td className="px-3 py-2 text-center"><Badge variant={s.variant}>{s.label}</Badge></td>
              <td className="px-3 py-2 text-xs">{RES[r.resolution] || r.resolution || '-'}</td>
              <td className="px-3 py-2">{r.customer_name || '-'}</td>
              <td className="px-3 py-2 text-xs text-gray-500 max-w-[200px] truncate" title={products}>{products || '-'}</td>
              <td className="px-3 py-2 text-right font-medium">{totalQty}</td>
              <td className="px-3 py-2 text-xs text-gray-500 max-w-[150px] truncate" title={r.reason || ''}>{r.reason || '-'}</td>
              <td className="px-3 py-2 text-xs">{r.creator?.name || '-'}</td>
              <td className="px-3 py-2 text-xs text-gray-500">{r.created_at ? new Date(r.created_at).toLocaleDateString('th-TH') : '-'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ── Production Table ── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ProductionTable({ data }: { data: any[] }) {
  const STATUS: Record<string, { label: string; variant: 'success' | 'danger' | 'warning' | 'info' | 'gray' }> = {
    DRAFT: { label: 'แบบร่าง', variant: 'gray' },
    CONFIRMED: { label: 'ยืนยัน', variant: 'info' },
    IN_PROGRESS: { label: 'กำลังผลิต', variant: 'warning' },
    COMPLETED: { label: 'เสร็จสิ้น', variant: 'success' },
    CANCELLED: { label: 'ยกเลิก', variant: 'danger' },
  };

  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50">
        <tr>
          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">เลขที่ใบสั่ง</th>
          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">แพสินค้า</th>
          <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">จำนวนชุด</th>
          <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500">สถานะ</th>
          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">รายการสินค้า</th>
          <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">ของดี</th>
          <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500">ชำรุด</th>
          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">ผู้สร้าง</th>
          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">วันที่สร้าง</th>
          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">วันที่เสร็จ</th>
        </tr>
      </thead>
      <tbody>
        {data.map((r, i) => {
          const s = STATUS[r.status] || { label: r.status, variant: 'gray' as const };
          const products = (r.items || []).map((it: { product?: { product_code?: string }; planned_qty?: number }) => `${it.product?.product_code || '?'} x${it.planned_qty}`).join(', ');
          const goodQty = (r.items || []).reduce((sum: number, it: { good_qty?: number }) => sum + (it.good_qty || 0), 0);
          const dmgQty = (r.items || []).reduce((sum: number, it: { damaged_qty?: number }) => sum + (it.damaged_qty || 0), 0);
          return (
            <tr key={r.id || i} className="border-t hover:bg-gray-50">
              <td className="px-3 py-2 font-mono text-xs font-medium">{r.order_number}</td>
              <td className="px-3 py-2">{r.pack?.name || '-'}</td>
              <td className="px-3 py-2 text-right font-medium">{r.quantity}</td>
              <td className="px-3 py-2 text-center"><Badge variant={s.variant}>{s.label}</Badge></td>
              <td className="px-3 py-2 text-xs text-gray-500 max-w-[200px] truncate" title={products}>{products || '-'}</td>
              <td className="px-3 py-2 text-right text-green-600 font-medium">{goodQty}</td>
              <td className="px-3 py-2 text-right text-red-600 font-medium">{dmgQty}</td>
              <td className="px-3 py-2 text-xs">{r.creator?.name || '-'}</td>
              <td className="px-3 py-2 text-xs text-gray-500">{r.created_at ? new Date(r.created_at).toLocaleDateString('th-TH') : '-'}</td>
              <td className="px-3 py-2 text-xs text-gray-500">{r.completed_at ? new Date(r.completed_at).toLocaleDateString('th-TH') : '-'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ── Movements Table ── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function MovementsTable({ data }: { data: any[] }) {
  const TYPE: Record<string, { label: string; color: string }> = {
    PRODUCTION_IN: { label: 'ผลิตเข้าคลัง', color: 'text-green-700 bg-green-50' },
    TRANSFER:      { label: 'ย้ายคลัง', color: 'text-blue-700 bg-blue-50' },
    SOLD:          { label: 'ขาย', color: 'text-cyan-700 bg-cyan-50' },
    DAMAGED:       { label: 'ชำรุด', color: 'text-orange-700 bg-orange-50' },
    ADJUSTMENT:    { label: 'ปรับสต็อก', color: 'text-yellow-700 bg-yellow-50' },
    SCRAP:         { label: 'ทำลาย', color: 'text-red-700 bg-red-50' },
    CLAIM_RETURN:  { label: 'คืนสต็อกจากเคลม', color: 'text-purple-700 bg-purple-50' },
  };

  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50">
        <tr>
          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">วันที่</th>
          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">Serial Number</th>
          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">สินค้า</th>
          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">ประเภท</th>
          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">จากคลัง</th>
          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">ไปคลัง</th>
          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">หมายเหตุ</th>
          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">ผู้ดำเนินการ</th>
        </tr>
      </thead>
      <tbody>
        {data.map((r, i) => {
          const t = TYPE[r.type] || { label: r.type, color: 'text-gray-700 bg-gray-50' };
          return (
            <tr key={r.id || i} className="border-t hover:bg-gray-50">
              <td className="px-3 py-2 text-xs text-gray-500">{r.created_at ? new Date(r.created_at).toLocaleString('th-TH') : '-'}</td>
              <td className="px-3 py-2 font-mono text-xs font-medium">{r.inventory?.serial_number || '-'}</td>
              <td className="px-3 py-2">
                <div className="text-xs">{r.inventory?.product?.name || '-'}</div>
                <div className="text-xs text-gray-400">{r.inventory?.product?.product_code}</div>
              </td>
              <td className="px-3 py-2">
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${t.color}`}>{t.label}</span>
              </td>
              <td className="px-3 py-2 text-xs">{r.from_location?.name || '-'}</td>
              <td className="px-3 py-2 text-xs">{r.to_location?.name || '-'}</td>
              <td className="px-3 py-2 text-xs text-gray-500 max-w-[200px] truncate" title={r.note || ''}>{r.note || '-'}</td>
              <td className="px-3 py-2 text-xs">{r.creator?.name || '-'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
