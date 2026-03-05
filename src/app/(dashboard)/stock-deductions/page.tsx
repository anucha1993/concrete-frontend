'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import AuthGuard from '@/components/AuthGuard';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import Pagination from '@/components/ui/Pagination';
import Badge from '@/components/ui/Badge';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { stockDeductionService } from '@/services/stock-deduction.service';
import { productService } from '@/services/product.service';
import type { StockDeduction, StockDeductionPayload, StockDeductionLine, StockDeductionScan, Product } from '@/lib/types';
import { AxiosError } from 'axios';
import {
  Plus,
  Search,
  Eye,
  ArrowLeft,
  Send,
  CheckCircle,
  X,
  XCircle,
  FileText,
  Package,
  Trash2,
  Copy,
  ShieldCheck,
  Ban,
  ScanBarcode,
  Pencil,
  Save,
  Printer,
  AlertTriangle,
  Clock,
} from 'lucide-react';

const TYPE_OPTIONS = [
  { value: 'SOLD', label: 'ขาย', color: 'info' as const },
  { value: 'LOST', label: 'สูญหาย', color: 'warning' as const },
  { value: 'DAMAGED', label: 'ชำรุด/ทำลาย', color: 'danger' as const },
  { value: 'OTHER', label: 'อื่นๆ', color: 'gray' as const },
];

const STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'แบบร่าง', color: 'gray' as const },
  { value: 'PENDING', label: 'รอสแกน', color: 'warning' as const },
  { value: 'IN_PROGRESS', label: 'กำลังสแกน', color: 'info' as const },
  { value: 'COMPLETED', label: 'สแกนครบ', color: 'success' as const },
  { value: 'APPROVED', label: 'อนุมัติแล้ว', color: 'success' as const },
  { value: 'CANCELLED', label: 'ยกเลิก', color: 'danger' as const },
];

function getTypeBadge(type: string) {
  const opt = TYPE_OPTIONS.find(t => t.value === type);
  return <Badge variant={opt?.color || 'gray'}>{opt?.label || type}</Badge>;
}

function getStatusBadge(status: string) {
  const opt = STATUS_OPTIONS.find(s => s.value === status);
  return <Badge variant={opt?.color || 'gray'}>{opt?.label || status}</Badge>;
}

export default function StockDeductionsPage() {
  return (
    <AuthGuard permission="view_operations">
      <StockDeductionsContent />
    </AuthGuard>
  );
}

function StockDeductionsContent() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('manage_operations');

  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const openDetail = (id: number) => { setSelectedId(id); setView('detail'); };
  const openCreate = () => { setView('create'); };
  const backToList = () => { setView('list'); setSelectedId(null); };

  return (
    <div>
      <PageHeader title="ตัดสต๊อก" description="สร้างใบตัดสต๊อก เลือกสินค้า+จำนวน แล้วส่งให้ PDA สแกน barcode ตัดจริง" />
      {view === 'list' && <ListView canManage={canManage} onView={openDetail} onCreate={openCreate} />}
      {view === 'create' && <CreateView canManage={canManage} onBack={backToList} onCreated={(id) => openDetail(id)} />}
      {view === 'detail' && selectedId && <DetailView id={selectedId} canManage={canManage} onBack={backToList} />}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   LIST VIEW
   ════════════════════════════════════════════════════════════ */
function ListView({ canManage, onView, onCreate }: { canManage: boolean; onView: (id: number) => void; onCreate: () => void }) {
  const [data, setData] = useState<StockDeduction[]>([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, per_page: 15, total: 0 });
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await stockDeductionService.list({
        search: search || undefined,
        status: statusFilter || undefined,
        type: typeFilter || undefined,
        page,
      });
      setData(res.data);
      setMeta(res.meta);
      if (res.status_counts) setStatusCounts(res.status_counts);
    } catch {
      toast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, typeFilter, page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const columns = [
    { key: 'code', label: 'เลขที่', render: (r: StockDeduction) => <span className="font-mono text-sm font-bold text-blue-600">{r.code}</span> },
    { key: 'type', label: 'ประเภท', render: (r: StockDeduction) => getTypeBadge(r.type) },
    { key: 'status', label: 'สถานะ', render: (r: StockDeduction) => getStatusBadge(r.status) },
    {
      key: 'customer', label: 'ลูกค้า/อ้างอิง', render: (r: StockDeduction) => (
        <div className="text-sm">
          {r.customer_name && <div>{r.customer_name}</div>}
          {r.reference_doc && <div className="text-xs text-gray-400">{r.reference_doc}</div>}
          {!r.customer_name && !r.reference_doc && <span className="text-gray-300">-</span>}
        </div>
      )
    },
    {
      key: 'progress', label: 'จำนวน', render: (r: StockDeduction) => (
        <div className="text-sm">
          <span className="font-bold text-gray-800">{r.lines_sum_quantity ?? 0}</span>
          <span className="text-gray-400"> ชิ้น</span>
          <span className="ml-2 text-xs text-gray-400">(สแกน {r.scans_count ?? 0}/{r.lines_sum_quantity ?? 0})</span>
        </div>
      )
    },
    { key: 'creator', label: 'ผู้สร้าง', render: (r: StockDeduction) => <span className="text-sm">{r.creator?.name || '-'}</span> },
    { key: 'created_at', label: 'วันที่', render: (r: StockDeduction) => <span className="text-sm text-gray-500">{new Date(r.created_at).toLocaleDateString('th-TH')}</span> },
    {
      key: 'actions', label: '',
      render: (r: StockDeduction) => (
        <div className="flex items-center gap-0.5">
          <button onClick={() => onView(r.id)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-blue-600" title="ดูรายละเอียด">
            <Eye size={16} />
          </button>
          <button onClick={() => window.open(`/print/stock-deductions/${r.id}`, '_blank')} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-blue-600" title="พิมพ์">
            <Printer size={16} />
          </button>
        </div>
      ),
    },
  ];

  const STATUS_CARDS: { key: string; label: string; icon: typeof FileText; bg: string; text: string; border: string }[] = [
    { key: 'DRAFT', label: 'แบบร่าง', icon: FileText, bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200' },
    { key: 'PENDING', label: 'รอสแกน', icon: Clock, bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200' },
    { key: 'IN_PROGRESS', label: 'กำลังสแกน', icon: ScanBarcode, bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200' },
    { key: 'COMPLETED', label: 'สแกนครบ', icon: CheckCircle, bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200' },
    { key: 'APPROVED', label: 'อนุมัติแล้ว', icon: ShieldCheck, bg: 'bg-green-50', text: 'text-green-600', border: 'border-green-200' },
    { key: 'CANCELLED', label: 'ยกเลิก', icon: Ban, bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200' },
  ];

  const totalAll = Object.values(statusCounts).reduce((s, v) => s + v, 0);

  return (
    <div>
      {/* Status summary cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        {/* Total card */}
        <button
          onClick={() => { setStatusFilter(''); setPage(1); }}
          className={`rounded-xl border p-3 text-left transition-shadow hover:shadow-md ${
            statusFilter === '' ? 'ring-2 ring-blue-500 border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'
          }`}
        >
          <div className="flex items-center justify-between">
            <Package size={18} className="text-blue-500" />
            <span className="text-2xl font-bold text-gray-800">{totalAll}</span>
          </div>
          <div className="mt-1 text-xs font-medium text-gray-500">ทั้งหมด</div>
        </button>

        {STATUS_CARDS.map(card => {
          const Icon = card.icon;
          const count = statusCounts[card.key] || 0;
          const isActive = statusFilter === card.key;
          return (
            <button
              key={card.key}
              onClick={() => { setStatusFilter(isActive ? '' : card.key); setPage(1); }}
              className={`rounded-xl border p-3 text-left transition-shadow hover:shadow-md ${
                isActive ? `ring-2 ring-blue-500 border-blue-300 ${card.bg}` : `${card.border} bg-white`
              }`}
            >
              <div className="flex items-center justify-between">
                <Icon size={18} className={card.text} />
                <span className={`text-2xl font-bold ${card.text}`}>{count}</span>
              </div>
              <div className={`mt-1 text-xs font-medium ${card.text}`}>{card.label}</div>
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="ค้นหา..." value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none" />
        </div>
        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
          <option value="">ทุกประเภท</option>
          {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
          <option value="">ทุกสถานะ</option>
          {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {canManage && (
          <button onClick={onCreate}
            className="ml-auto flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Plus size={16} /> สร้างใบตัดสต๊อก
          </button>
        )}
      </div>

      <DataTable columns={columns} data={data} loading={loading} emptyMessage="ไม่มีใบตัดสต๊อก" />
      <Pagination currentPage={meta.current_page} lastPage={meta.last_page} total={meta.total} onPageChange={setPage} />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   CREATE VIEW — quotation-style (select products + quantities)
   ════════════════════════════════════════════════════════════ */
interface LineDraft {
  product_id: number;
  product_code: string;
  product_name: string;
  quantity: number;
  note: string;
}

function CreateView({ canManage, onBack, onCreated }: { canManage: boolean; onBack: () => void; onCreated: (id: number) => void }) {
  const [form, setForm] = useState<Omit<StockDeductionPayload, 'lines'>>({ type: 'SOLD' });
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [saving, setSaving] = useState(false);

  // Product search
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowProductDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const searchProducts = useCallback(async (q: string) => {
    if (!q.trim()) { setProducts([]); return; }
    setLoadingProducts(true);
    try {
      const res = await productService.list({ search: q, per_page: 20, is_active: true, with_stock: true });
      setProducts(res.data);
    } catch { /* ignore */ }
    setLoadingProducts(false);
  }, []);

  const handleProductSearchChange = (val: string) => {
    setProductSearch(val);
    setShowProductDropdown(true);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchProducts(val), 300);
  };

  const addProduct = (p: Product) => {
    if (lines.find(l => l.product_id === p.id)) {
      toast('สินค้านี้มีในรายการแล้ว', 'info');
      return;
    }
    setLines(prev => [...prev, {
      product_id: p.id,
      product_code: p.product_code,
      product_name: p.name,
      quantity: 1,
      note: '',
    }]);
    setProductSearch('');
    setShowProductDropdown(false);
  };

  const updateLineQty = (idx: number, qty: number) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, quantity: Math.max(1, qty) } : l));
  };

  const updateLineNote = (idx: number, note: string) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, note } : l));
  };

  const removeLine = (idx: number) => {
    setLines(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    if (lines.length === 0) { toast('กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ', 'error'); return; }

    setSaving(true);
    try {
      const payload: StockDeductionPayload = {
        ...form,
        lines: lines.map(l => ({ product_id: l.product_id, quantity: l.quantity, note: l.note || undefined })),
      };
      const res = await stockDeductionService.create(payload);
      toast(res.message || 'สร้างใบตัดสต๊อกสำเร็จ', 'success');
      onCreated(res.data.id);
    } catch (err: unknown) {
      const ax = err as AxiosError<{ message: string }>;
      toast(ax.response?.data?.message || 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <button onClick={onBack} className="mb-4 flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
        <ArrowLeft size={16} /> กลับ
      </button>

      <div className="mx-auto max-w-4xl rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-6 text-lg font-bold text-gray-800 flex items-center gap-2">
          <FileText size={20} className="text-blue-600" /> สร้างใบตัดสต๊อก
        </h2>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Header fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">ประเภทการตัดสต๊อก *</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as StockDeductionPayload['type'] })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">เลขที่เอกสารอ้างอิง</label>
              <input type="text" value={form.reference_doc || ''} onChange={e => setForm({ ...form, reference_doc: e.target.value })}
                placeholder="เช่น INV-001" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
          </div>

          {form.type === 'SOLD' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">ชื่อลูกค้า</label>
              <input type="text" value={form.customer_name || ''} onChange={e => setForm({ ...form, customer_name: e.target.value })}
                placeholder="ระบุชื่อลูกค้า" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
          )}

          {form.type === 'SOLD' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">ที่อยู่จัดส่ง</label>
              <textarea value={form.shipping_address || ''} onChange={e => setForm({ ...form, shipping_address: e.target.value })}
                rows={3} placeholder="ระบุที่อยู่จัดส่งสินค้า"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">เหตุผล</label>
            <textarea value={form.reason || ''} onChange={e => setForm({ ...form, reason: e.target.value })}
              rows={2} placeholder="ระบุเหตุผลการตัดสต๊อก"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">หมายเหตุ</label>
            <textarea value={form.note || ''} onChange={e => setForm({ ...form, note: e.target.value })}
              rows={2} placeholder="หมายเหตุเพิ่มเติม" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
          </div>

          {/* ── Product Lines ── */}
          <div className="border-t pt-5">
            <h3 className="mb-3 flex items-center gap-2 font-bold text-gray-800">
              <Package size={18} className="text-blue-600" /> รายการสินค้า
            </h3>

            {/* Product search input */}
            <div ref={searchRef} className="relative mb-4">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="ค้นหาสินค้า (ชื่อ, รหัส)..."
                  value={productSearch}
                  onChange={e => handleProductSearchChange(e.target.value)}
                  onFocus={() => productSearch && setShowProductDropdown(true)}
                  className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>

              {showProductDropdown && (
                <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border bg-white shadow-lg">
                  {loadingProducts && <div className="p-3 text-sm text-gray-400">กำลังค้นหา...</div>}
                  {!loadingProducts && products.length === 0 && productSearch && (
                    <div className="p-3 text-sm text-gray-400">ไม่พบสินค้า</div>
                  )}
                  {products.map(p => {
                    const alreadyAdded = lines.some(l => l.product_id === p.id);
                    const stockCount = p.stock_count ?? 0;
                    const reservedCount = p.reserved_count ?? 0;
                    const available = stockCount - reservedCount;
                    return (
                      <button key={p.id} type="button" disabled={alreadyAdded}
                        onClick={() => addProduct(p)}
                        className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-blue-50 ${alreadyAdded ? 'bg-gray-50 opacity-50' : ''}`}>
                        <span className="font-mono text-xs text-gray-500">{p.product_code}</span>
                        <span className="flex-1">{p.name}</span>
                        <span className="flex flex-col items-end text-xs leading-tight min-w-[80px]">
                          <span className={available > 0 ? 'text-green-600' : 'text-red-500'}>
                            คงเหลือ {available} {p.counting_unit}
                          </span>
                          {reservedCount > 0 && (
                            <span className="text-orange-500">จอง {reservedCount}</span>
                          )}
                        </span>
                        {alreadyAdded && <span className="text-xs text-green-500">เพิ่มแล้ว</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Lines table */}
            {lines.length > 0 ? (
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium text-gray-600">#</th>
                      <th className="px-4 py-2.5 text-left font-medium text-gray-600">รหัสสินค้า</th>
                      <th className="px-4 py-2.5 text-left font-medium text-gray-600">ชื่อสินค้า</th>
                      <th className="px-4 py-2.5 text-center font-medium text-gray-600 w-28">จำนวน</th>
                      <th className="px-4 py-2.5 text-left font-medium text-gray-600">หมายเหตุ</th>
                      <th className="px-4 py-2.5 text-center font-medium text-gray-600 w-16"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {lines.map((line, idx) => (
                      <tr key={line.product_id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-500">{idx + 1}</td>
                        <td className="px-4 py-2 font-mono text-xs text-gray-600">{line.product_code}</td>
                        <td className="px-4 py-2 font-medium">{line.product_name}</td>
                        <td className="px-4 py-2 text-center">
                          <input type="number" min={1} value={line.quantity}
                            onChange={e => updateLineQty(idx, parseInt(e.target.value) || 1)}
                            className="w-20 rounded border border-gray-300 px-2 py-1 text-center text-sm focus:border-blue-500 focus:outline-none" />
                        </td>
                        <td className="px-4 py-2">
                          <input type="text" value={line.note} onChange={e => updateLineNote(idx, e.target.value)}
                            placeholder="-" className="w-full rounded border border-gray-200 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none" />
                        </td>
                        <td className="px-4 py-2 text-center">
                          <button type="button" onClick={() => removeLine(idx)}
                            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500">
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="border-t bg-gray-50 px-4 py-2 text-right text-sm font-medium text-gray-600">
                  รวม {lines.length} รายการ — {lines.reduce((s, l) => s + l.quantity, 0)} ชิ้น
                </div>
              </div>
            ) : (
              <div className="rounded-lg border-2 border-dashed border-gray-200 py-10 text-center text-sm text-gray-400">
                <Package size={32} className="mx-auto mb-2 text-gray-300" />
                ค้นหาและเลือกสินค้าเพื่อเพิ่มรายการ
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={onBack} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              ยกเลิก
            </button>
            <button type="submit" disabled={saving || lines.length === 0}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              <Plus size={16} /> {saving ? 'กำลังสร้าง...' : 'สร้างใบตัดสต๊อก'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   DETAIL VIEW — shows lines progress, PDA link, scans
   ════════════════════════════════════════════════════════════ */
function DetailView({ id, canManage, onBack }: { id: number; canManage: boolean; onBack: () => void }) {
  const [deduction, setDeduction] = useState<StockDeduction | null>(null);
  const [stats, setStats] = useState({ total_planned: 0, total_scanned: 0, lines_count: 0, scans_count: 0 });
  const [loading, setLoading] = useState(true);

  const [confirmAction, setConfirmAction] = useState<'submit' | 'approve' | 'cancel' | 'delete' | null>(null);
  const [acting, setActing] = useState(false);
  const [copied, setCopied] = useState(false);

  // Scan state
  const [serialInput, setSerialInput] = useState('');
  const [scanning, setScanning] = useState(false);
  const [lastScanResult, setLastScanResult] = useState<{ success: boolean; message: string; product_name?: string; isOverQuantity?: boolean } | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const scanQueueRef = useRef<string[]>([]);
  const processingQueueRef = useRef(false);

  /**
   * แยก serial ที่ติดกัน เช่น "B001-2603-00000008B001-2603-00000009"
   * → ["B001-2603-00000008", "B001-2603-00000009"]
   */
  const splitSerials = (input: string): string[] => {
    const pattern = /[A-Za-z0-9]+-\d{4}-\d{8}/g;
    const matches = input.match(pattern);
    return matches && matches.length > 0 ? matches : [input];
  };

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<{ type: StockDeductionPayload['type']; customer_name: string; shipping_address: string; reference_doc: string; reason: string; note: string }>({ type: 'SOLD', customer_name: '', shipping_address: '', reference_doc: '', reason: '', note: '' });
  const [editLines, setEditLines] = useState<{ product_id: number; product_code: string; product_name: string; quantity: number; note: string; scanned_qty: number }[]>([]);
  const [saving, setSaving] = useState(false);
  // Edit — product search
  const [editProductSearch, setEditProductSearch] = useState('');
  const [editProducts, setEditProducts] = useState<Product[]>([]);
  const [editShowDropdown, setEditShowDropdown] = useState(false);
  const [editLoadingProducts, setEditLoadingProducts] = useState(false);
  const editSearchRef = useRef<HTMLDivElement>(null);
  const editSearchTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await stockDeductionService.show(id);
      setDeduction(res.data);
      setStats(res.stats);
    } catch {
      if (!silent) toast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh while scanning (silent — no loading flash)
  useEffect(() => {
    if (!deduction || !['PENDING', 'IN_PROGRESS'].includes(deduction.status)) return;
    const interval = setInterval(() => fetchData(true), 5000);
    return () => clearInterval(interval);
  }, [deduction?.status, fetchData]);

  const handleAction = async () => {
    if (!confirmAction || !deduction) return;
    setActing(true);
    try {
      if (confirmAction === 'submit') {
        const res = await stockDeductionService.submit(deduction.id);
        toast(res.message || 'ส่งสำเร็จ', 'success');
      } else if (confirmAction === 'approve') {
        const res = await stockDeductionService.approve(deduction.id);
        toast(res.message || 'อนุมัติสำเร็จ', 'success');
      } else if (confirmAction === 'cancel') {
        const res = await stockDeductionService.cancel(deduction.id);
        toast(res.message || 'ยกเลิกสำเร็จ', 'success');
      } else if (confirmAction === 'delete') {
        await stockDeductionService.delete(deduction.id);
        toast('ลบใบตัดสต๊อกสำเร็จ', 'success');
        setConfirmAction(null);
        onBack();
        return;
      }
      setConfirmAction(null);
      fetchData(true);
    } catch (err: unknown) {
      const ax = err as AxiosError<{ message: string }>;
      toast(ax.response?.data?.message || 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setActing(false);
    }
  };

  const getPdaLink = () => {
    if (!deduction?.pda_token) return '';
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    return `${base}/pda/stock-deduction?token=${deduction.pda_token}&id=${deduction.id}`;
  };

  const copyPdaLink = () => {
    navigator.clipboard.writeText(getPdaLink());
    setCopied(true);
    toast('คัดลอกลิงก์ PDA สำเร็จ', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  // Admin scan — single serial (core)
  const scanOneAdmin = async (s: string) => {
    if (!s || !deduction) return;
    setScanning(true);
    setLastScanResult(null);
    try {
      const res = await stockDeductionService.scan(deduction.id, s);
      const isOver = !!res.data?.is_over_quantity;
      setLastScanResult({ success: true, message: res.message || 'สแกนสำเร็จ', product_name: res.data?.product_name, isOverQuantity: isOver });
      setTimeout(() => setLastScanResult(prev => prev?.success ? null : prev), isOver ? 5000 : 2000);
      fetchData(true);
    } catch (err: unknown) {
      const ax = err as AxiosError<{ message: string }>;
      setLastScanResult({ success: false, message: ax.response?.data?.message || 'เกิดข้อผิดพลาด' });
    } finally {
      setScanning(false);
    }
  };

  // Process scan queue
  const processAdminQueue = useCallback(async () => {
    if (processingQueueRef.current) return;
    processingQueueRef.current = true;

    while (scanQueueRef.current.length > 0) {
      const next = scanQueueRef.current.shift()!;
      await scanOneAdmin(next);
    }

    processingQueueRef.current = false;
    setTimeout(() => {
      scanInputRef.current?.focus();
    }, 50);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deduction]);

  // Admin scan handler (form submit)
  const handleAdminScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = serialInput.trim();
    if (!raw || !deduction) return;
    setSerialInput('');

    const serials = splitSerials(raw);
    scanQueueRef.current.push(...serials);
    processAdminQueue();
  };

  // Handle input change — auto-detect multiple serials
  const handleSerialInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const serials = splitSerials(val);

    if (serials.length > 1) {
      setSerialInput('');
      scanQueueRef.current.push(...serials);
      processAdminQueue();
    } else {
      setSerialInput(val);
    }
  };

  // Admin delete scan
  const handleDeleteScan = async (scanId: number) => {
    if (!deduction) return;
    try {
      await stockDeductionService.deleteScan(deduction.id, scanId);
      toast('ลบการสแกนสำเร็จ', 'success');
      fetchData(true);
    } catch (err: unknown) {
      const ax = err as AxiosError<{ message: string }>;
      toast(ax.response?.data?.message || 'เกิดข้อผิดพลาด', 'error');
    }
  };

  // ── Edit helpers ──
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (editSearchRef.current && !editSearchRef.current.contains(e.target as Node)) setEditShowDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const startEditing = () => {
    if (!deduction) return;
    setEditForm({
      type: deduction.type as StockDeductionPayload['type'],
      customer_name: deduction.customer_name || '',
      shipping_address: deduction.shipping_address || '',
      reference_doc: deduction.reference_doc || '',
      reason: deduction.reason || '',
      note: deduction.note || '',
    });
    setEditLines((deduction.lines || []).map((l: StockDeductionLine) => ({
      product_id: l.product_id,
      product_code: l.product?.product_code || '',
      product_name: l.product?.name || '',
      quantity: l.quantity,
      note: l.note || '',
      scanned_qty: l.scanned_qty,
    })));
    setEditing(true);
  };

  const cancelEditing = () => { setEditing(false); setEditProductSearch(''); setEditShowDropdown(false); };

  const searchEditProducts = useCallback(async (q: string) => {
    if (!q.trim()) { setEditProducts([]); return; }
    setEditLoadingProducts(true);
    try {
      const res = await productService.list({ search: q, per_page: 20, is_active: true, with_stock: true });
      setEditProducts(res.data);
    } catch { /* ignore */ }
    setEditLoadingProducts(false);
  }, []);

  const handleEditProductSearch = (val: string) => {
    setEditProductSearch(val);
    setEditShowDropdown(true);
    clearTimeout(editSearchTimeout.current);
    editSearchTimeout.current = setTimeout(() => searchEditProducts(val), 300);
  };

  const addEditProduct = (p: Product) => {
    if (editLines.find(l => l.product_id === p.id)) { toast('สินค้านี้มีในรายการแล้ว', 'info'); return; }
    setEditLines(prev => [...prev, { product_id: p.id, product_code: p.product_code, product_name: p.name, quantity: 1, note: '', scanned_qty: 0 }]);
    setEditProductSearch('');
    setEditShowDropdown(false);
  };

  const handleSaveEdit = async () => {
    if (!deduction || editLines.length === 0) { toast('ต้องมีอย่างน้อย 1 รายการ', 'error'); return; }
    setSaving(true);
    try {
      const payload = {
        ...editForm,
        lines: editLines.map(l => ({ product_id: l.product_id, quantity: l.quantity, note: l.note || undefined })),
      };
      const res = await stockDeductionService.update(deduction.id, payload);
      toast(res.message || 'บันทึกสำเร็จ', 'success');
      setEditing(false);
      fetchData(true);
    } catch (err: unknown) {
      const ax = err as AxiosError<{ message: string }>;
      toast(ax.response?.data?.message || 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !deduction) {
    return (
      <div>
        <button onClick={onBack} className="mb-4 flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          <ArrowLeft size={16} /> กลับ
        </button>
        <div className="py-20 text-center text-gray-400">กำลังโหลด...</div>
      </div>
    );
  }

  const progressPercent = stats.total_planned > 0 ? Math.round((stats.total_scanned / stats.total_planned) * 100) : 0;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
        <ArrowLeft size={15} /> กลับ
      </button>

      {/* Header */}
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-gray-800">{deduction.code}</h2>
            {getStatusBadge(deduction.status)}
            {getTypeBadge(deduction.type)}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {canManage && !['APPROVED', 'CANCELLED'].includes(deduction.status) && !editing && (
              <button onClick={startEditing}
                className="flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
                <Pencil size={13} /> แก้ไข
              </button>
            )}
            <button onClick={() => window.open(`/print/stock-deductions/${deduction.id}`, '_blank')}
              className="flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
              <Printer size={13} /> พิมพ์
            </button>
            {deduction.pda_token && ['PENDING', 'IN_PROGRESS', 'COMPLETED'].includes(deduction.status) && (
              <button onClick={copyPdaLink}
                className="flex items-center gap-1 rounded-lg border border-blue-200 px-2.5 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50">
                {copied ? <CheckCircle size={13} /> : <Copy size={13} />}
                {copied ? 'คัดลอกแล้ว' : 'PDA Link'}
              </button>
            )}
            {canManage && deduction.status === 'DRAFT' && (
              <button onClick={() => setConfirmAction('submit')}
                className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
                <Send size={13} /> ส่งสแกน
              </button>
            )}
            {canManage && deduction.status === 'DRAFT' && (
              <button onClick={() => setConfirmAction('delete')}
                className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50">
                <Trash2 size={13} /> ลบ
              </button>
            )}
            {canManage && deduction.status === 'COMPLETED' && (
              <button onClick={() => setConfirmAction('approve')}
                className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700">
                <ShieldCheck size={13} /> อนุมัติ
              </button>
            )}
            {canManage && !['APPROVED', 'CANCELLED'].includes(deduction.status) && (
              <button onClick={() => setConfirmAction('cancel')}
                className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50">
                <Ban size={13} /> ยกเลิก
              </button>
            )}
          </div>
        </div>

        {/* Info row */}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
          {deduction.customer_name && <span>ลูกค้า: <b className="text-gray-700">{deduction.customer_name}</b></span>}
          {deduction.reference_doc && <span>อ้างอิง: {deduction.reference_doc}</span>}
          <span>ผู้สร้าง: {deduction.creator?.name}</span>
          <span>วันที่: {new Date(deduction.created_at).toLocaleDateString('th-TH')}</span>
        </div>
        {deduction.shipping_address && (
          <p className="mt-1 text-xs text-gray-500">📍 ที่อยู่จัดส่ง: {deduction.shipping_address}</p>
        )}
        {deduction.reason && <p className="mt-1 text-xs text-gray-500">เหตุผล: {deduction.reason}</p>}
        {deduction.note && <p className="text-xs text-gray-400">หมายเหตุ: {deduction.note}</p>}
        {deduction.approver && (
          <p className="mt-1 text-xs text-green-600">อนุมัติโดย: {deduction.approver.name} — {deduction.approved_at ? new Date(deduction.approved_at).toLocaleString('th-TH') : ''}</p>
        )}

        {/* Progress */}
        {deduction.status !== 'DRAFT' && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-gray-500">สแกน</span>
              <span className="font-bold text-blue-600">{stats.total_scanned}/{stats.total_planned} ({progressPercent}%)</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
              <div className={`h-full rounded-full transition-all ${progressPercent >= 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                style={{ width: `${Math.min(progressPercent, 100)}%` }} />
            </div>
          </div>
        )}
      </div>

{/* Admin Scan — only in non-edit mode */}
      {!editing && canManage && ['PENDING', 'IN_PROGRESS'].includes(deduction.status) && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 shadow-sm">
          <form onSubmit={handleAdminScan} className="flex items-center gap-2">
            <ScanBarcode size={18} className="shrink-0 text-green-600" />
            <input
              ref={scanInputRef}
              type="text"
              value={serialInput}
              onChange={handleSerialInputChange}
              placeholder="สแกนหรือพิมพ์ Serial Number..."
              disabled={scanning}
              autoFocus
              className="flex-1 rounded-lg border border-green-300 bg-white px-3 py-2 font-mono text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-200 disabled:opacity-50"
              autoComplete="off"
            />
            <button type="submit" disabled={scanning || !serialInput.trim()}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
              {scanning ? '...' : 'สแกน'}
            </button>
          </form>
          {lastScanResult && (
            <div className={`mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
              lastScanResult.isOverQuantity ? 'bg-amber-100 text-amber-700 border border-amber-300' :
              lastScanResult.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              {lastScanResult.isOverQuantity ? <AlertTriangle size={14} /> : lastScanResult.success ? <CheckCircle size={14} /> : <XCircle size={14} />}
              <span className="font-medium">{lastScanResult.message}</span>
              {lastScanResult.product_name && <span className="opacity-75">({lastScanResult.product_name})</span>}
              <button onClick={() => setLastScanResult(null)} className="ml-auto"><X size={12} /></button>
            </div>
          )}
        </div>
      )}

      {/* ═══ Edit Mode ═══ */}
      {editing ? (
        <div className="rounded-xl border border-blue-200 bg-white p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2"><Pencil size={15} className="text-blue-600" /> แก้ไขใบตัดสต๊อก</h3>

          {/* Header fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">ประเภท</label>
              <select value={editForm.type} onChange={e => setEditForm(f => ({ ...f, type: e.target.value as StockDeductionPayload['type'] }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">เลขที่อ้างอิง</label>
              <input type="text" value={editForm.reference_doc} onChange={e => setEditForm(f => ({ ...f, reference_doc: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
          </div>
          {editForm.type === 'SOLD' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">ชื่อลูกค้า</label>
              <input type="text" value={editForm.customer_name} onChange={e => setEditForm(f => ({ ...f, customer_name: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
          )}
          {editForm.type === 'SOLD' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">ที่อยู่จัดส่ง</label>
              <textarea value={editForm.shipping_address} onChange={e => setEditForm(f => ({ ...f, shipping_address: e.target.value }))} rows={2}
                placeholder="ระบุที่อยู่จัดส่งสินค้า"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">เหตุผล</label>
              <textarea value={editForm.reason} onChange={e => setEditForm(f => ({ ...f, reason: e.target.value }))} rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">หมายเหตุ</label>
              <textarea value={editForm.note} onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))} rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
          </div>

          {/* Product search */}
          <div className="border-t pt-4">
            <h4 className="mb-2 text-xs font-bold text-gray-600">รายการสินค้า</h4>
            <div ref={editSearchRef} className="relative mb-3">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" placeholder="ค้นหาสินค้าเพิ่ม..." value={editProductSearch}
                  onChange={e => handleEditProductSearch(e.target.value)}
                  onFocus={() => editProductSearch && setEditShowDropdown(true)}
                  className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              {editShowDropdown && (
                <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border bg-white shadow-lg">
                  {editLoadingProducts && <div className="p-3 text-xs text-gray-400">กำลังค้นหา...</div>}
                  {!editLoadingProducts && editProducts.length === 0 && editProductSearch && <div className="p-3 text-xs text-gray-400">ไม่พบสินค้า</div>}
                  {editProducts.map(p => {
                    const exists = editLines.some(l => l.product_id === p.id);
                    const stockCount = p.stock_count ?? 0;
                    const reservedCount = p.reserved_count ?? 0;
                    const available = stockCount - reservedCount;
                    return (
                      <button key={p.id} type="button" disabled={exists} onClick={() => addEditProduct(p)}
                        className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-blue-50 ${exists ? 'opacity-50' : ''}`}>
                        <span className="font-mono text-xs text-gray-500">{p.product_code}</span>
                        <span className="flex-1">{p.name}</span>
                        <span className="flex flex-col items-end text-xs leading-tight min-w-[80px]">
                          <span className={available > 0 ? 'text-green-600' : 'text-red-500'}>
                            คงเหลือ {available} {p.counting_unit}
                          </span>
                          {reservedCount > 0 && (
                            <span className="text-orange-500">จอง {reservedCount}</span>
                          )}
                        </span>
                        {exists && <span className="text-xs text-green-500">เพิ่มแล้ว</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Edit lines */}
            <div className="space-y-2">
              {editLines.map((line, idx) => (
                <div key={line.product_id} className="flex items-center gap-3 rounded-lg border bg-gray-50 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{line.product_name}</div>
                    <div className="text-xs text-gray-400 font-mono">{line.product_code}
                      {line.scanned_qty > 0 && <span className="ml-1 text-blue-500">(สแกนแล้ว {line.scanned_qty})</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="text-xs text-gray-500">จำนวน:</label>
                    <input type="number" min={Math.max(1, line.scanned_qty)} value={line.quantity}
                      onChange={e => setEditLines(prev => prev.map((l, i) => i === idx ? { ...l, quantity: Math.max(Math.max(1, l.scanned_qty), parseInt(e.target.value) || 1) } : l))}
                      className="w-16 rounded border border-gray-300 px-2 py-1 text-center text-sm focus:border-blue-500 focus:outline-none" />
                  </div>
                  <input type="text" value={line.note} placeholder="หมายเหตุ"
                    onChange={e => setEditLines(prev => prev.map((l, i) => i === idx ? { ...l, note: e.target.value } : l))}
                    className="w-28 rounded border border-gray-200 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none" />
                  {line.scanned_qty === 0 ? (
                    <button type="button" onClick={() => setEditLines(prev => prev.filter((_, i) => i !== idx))}
                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500">
                      <Trash2 size={14} />
                    </button>
                  ) : (
                    <div className="w-7" /> /* spacer — can't delete lines with scans */
                  )}
                </div>
              ))}
              {editLines.length === 0 && (
                <div className="rounded-lg border-2 border-dashed border-gray-200 py-6 text-center text-sm text-gray-400">ค้นหาสินค้าด้านบนเพื่อเพิ่ม</div>
              )}
            </div>
          </div>

          {/* Save / Cancel */}
          <div className="flex justify-end gap-2 border-t pt-3">
            <button type="button" onClick={cancelEditing} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
              ยกเลิก
            </button>
            <button type="button" onClick={handleSaveEdit} disabled={saving || editLines.length === 0}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              <Save size={14} /> {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </div>
      ) : (
        /* ═══ View Mode — Product lines with scans grouped underneath ═══ */
        <div className="space-y-3">
          {(deduction.lines || []).map((line: StockDeductionLine) => {
            const fulfilled = line.scanned_qty >= line.quantity;
            const lineScans = (deduction.scans || []).filter((s: StockDeductionScan) => s.stock_deduction_line_id === line.id);
            return (
              <div key={line.id} className={`rounded-xl border bg-white shadow-sm overflow-hidden ${fulfilled ? 'border-green-200' : ''}`}>
                {/* Product header */}
                <div className={`flex items-center justify-between px-4 py-2.5 ${fulfilled ? 'bg-green-50' : 'bg-gray-50'}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${fulfilled ? 'text-green-700' : 'text-gray-800'}`}>{line.product?.name || '-'}</span>
                      {fulfilled && <CheckCircle size={18} className="shrink-0 text-green-500" />}
                    </div>
                    <div className="text-xs text-gray-400 font-mono">{line.product?.product_code}{line.note && ` · ${line.note}`}</div>
                  </div>
                  {(() => {
                    const dims = [line.product?.length, line.product?.thickness, line.product?.width].filter(v => v != null);
                    return dims.length > 0 ? (
                      <span className="mx-3 rounded-lg bg-blue-50 px-3 py-1 text-sm font-bold tabular-nums text-blue-700 whitespace-nowrap">
                        {dims.join(' × ')}
                      </span>
                    ) : null;
                  })()}
                  <span className={`text-sm font-bold tabular-nums ${fulfilled ? 'text-green-600' : 'text-gray-600'}`}>
                    {line.scanned_qty}/{line.quantity}
                  </span>
                </div>
                {/* Scans for this line */}
                {lineScans.length > 0 && (
                  <div className="divide-y border-t">
                    {lineScans.map((scan: StockDeductionScan) => (
                      <div key={scan.id} className="flex items-center gap-2 px-4 py-1.5 hover:bg-gray-50">
                        <span className="font-mono text-xs font-bold text-blue-600">{scan.serial_number}</span>
                        {scan.inventory?.condition === 'DAMAGED' && (
                          <span className="shrink-0 rounded bg-red-100 px-1 py-0.5 text-[9px] font-bold text-red-600">ชำรุด</span>
                        )}
                        <span className="ml-auto text-[10px] text-gray-400">{new Date(scan.scanned_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>
                        {canManage && !['APPROVED', 'CANCELLED'].includes(deduction.status) && (
                          <button onClick={() => handleDeleteScan(scan.id)}
                            className="shrink-0 rounded p-0.5 text-gray-300 hover:bg-red-50 hover:text-red-500">
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {(!deduction.lines || deduction.lines.length === 0) && (
            <div className="rounded-xl border bg-white py-8 text-center text-sm text-gray-400">ไม่มีรายการ</div>
          )}
        </div>
      )}

      {/* Confirm dialogs */}
      <ConfirmDialog
        open={confirmAction === 'submit'}
        title="ส่งให้สแกน"
        message={`ยืนยันส่งใบตัดสต๊อก ${deduction.code} ให้ PDA สแกน? ระบบจะสร้างลิงก์สำหรับเครื่อง PDA`}
        confirmText="ส่งให้สแกน"
        loading={acting}
        onConfirm={handleAction}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === 'approve'}
        title="อนุมัติตัดสต๊อก"
        message={`ยืนยันอนุมัติตัดสต๊อก ${deduction.code}? สินค้าที่สแกนจะถูกตัดออกจากคลังทันที (${stats.total_scanned} รายการ)`}
        confirmText="อนุมัติตัดสต๊อก"
        loading={acting}
        onConfirm={handleAction}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === 'cancel'}
        title="ยกเลิกใบตัดสต๊อก"
        message={`ยืนยันยกเลิกใบตัดสต๊อก ${deduction.code}?`}
        confirmText="ยกเลิก"
        loading={acting}
        onConfirm={handleAction}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === 'delete'}
        title="ลบใบตัดสต๊อก"
        message={`ยืนยันลบใบตัดสต๊อก ${deduction.code}? ข้อมูลจะถูกลบถาวร`}
        confirmText="ลบ"
        loading={acting}
        onConfirm={handleAction}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}
