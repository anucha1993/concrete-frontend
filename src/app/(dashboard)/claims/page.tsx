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
import { claimService } from '@/services/claim.service';
import type { Claim, ClaimPayload, ClaimLine, ClaimSearchItem, ClaimType, ClaimResolution } from '@/lib/types';
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
  Package,
  Trash2,
  Ban,
  Pencil,
  Save,
  FileWarning,
  Link2,
  Copy,
  ScanBarcode,
  ExternalLink,
} from 'lucide-react';

const TYPE_OPTIONS: { value: ClaimType; label: string; color: 'info' | 'warning' | 'danger' | 'gray' | 'success' }[] = [
  { value: 'RETURN', label: 'คืนสินค้า', color: 'info' },
  { value: 'TRANSPORT_DAMAGE', label: 'เสียหายจากขนส่ง', color: 'warning' },
  { value: 'DEFECT', label: 'ชำรุด/ตำหนิ', color: 'danger' },
  { value: 'WRONG_SPEC', label: 'ไม่ตรงสเปค', color: 'warning' },
  { value: 'OTHER', label: 'อื่นๆ', color: 'gray' },
];

const STATUS_OPTIONS: { value: string; label: string; color: 'info' | 'warning' | 'danger' | 'gray' | 'success' }[] = [
  { value: 'DRAFT', label: 'แบบร่าง', color: 'gray' },
  { value: 'PENDING', label: 'รอตรวจสอบ', color: 'warning' },
  { value: 'APPROVED', label: 'อนุมัติแล้ว', color: 'success' },
  { value: 'REJECTED', label: 'ปฏิเสธ', color: 'danger' },
  { value: 'CANCELLED', label: 'ยกเลิก', color: 'danger' },
];

const RESOLUTION_OPTIONS: { value: ClaimResolution; label: string }[] = [
  { value: 'RETURN_STOCK', label: 'คืนเข้าสต๊อก (สภาพดี)' },
  { value: 'RETURN_DAMAGED', label: 'คืนเป็นสินค้าชำรุด' },
  { value: 'REPLACE', label: 'เปลี่ยนสินค้า' },
  { value: 'REFUND', label: 'คืนเงิน' },
  { value: 'CREDIT_NOTE', label: 'ออกใบลดหนี้' },
];

function getTypeBadge(type: string) {
  const opt = TYPE_OPTIONS.find(t => t.value === type);
  return <Badge variant={opt?.color || 'gray'}>{opt?.label || type}</Badge>;
}

function getStatusBadge(status: string) {
  const opt = STATUS_OPTIONS.find(s => s.value === status);
  return <Badge variant={opt?.color || 'gray'}>{opt?.label || status}</Badge>;
}

function getResolutionLabel(resolution: string | null) {
  if (!resolution) return '-';
  return RESOLUTION_OPTIONS.find(r => r.value === resolution)?.label || resolution;
}

export default function ClaimsPage() {
  return (
    <AuthGuard permission="view_operations">
      <ClaimsContent />
    </AuthGuard>
  );
}

function ClaimsContent() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('manage_operations');

  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const openDetail = (id: number) => { setSelectedId(id); setView('detail'); };
  const openCreate = () => { setView('create'); };
  const backToList = () => { setView('list'); setSelectedId(null); };

  return (
    <div>
      <PageHeader title="เคลมสินค้า" description="จัดการใบเคลมสินค้า — คืนสินค้า, เสียหายจากขนส่ง, ชำรุด, ไม่ตรงสเปค" />
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
  const [data, setData] = useState<Claim[]>([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, per_page: 15, total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await claimService.list({
        search: search || undefined,
        status: statusFilter || undefined,
        type: typeFilter || undefined,
        page,
      });
      setData(res.data);
      setMeta(res.meta);
    } catch {
      toast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, typeFilter, page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const columns = [
    { key: 'code', label: 'เลขที่', render: (r: Claim) => <span className="font-mono text-sm font-bold text-blue-600">{r.code}</span> },
    { key: 'type', label: 'ประเภท', render: (r: Claim) => getTypeBadge(r.type) },
    { key: 'status', label: 'สถานะ', render: (r: Claim) => getStatusBadge(r.status) },
    {
      key: 'customer', label: 'ลูกค้า/อ้างอิง', render: (r: Claim) => (
        <div className="text-sm">
          {r.customer_name && <div>{r.customer_name}</div>}
          {r.reference_doc && <div className="text-xs text-gray-400">{r.reference_doc}</div>}
          {!r.customer_name && !r.reference_doc && <span className="text-gray-300">-</span>}
        </div>
      )
    },
    {
      key: 'qty', label: 'จำนวน', render: (r: Claim) => (
        <div className="text-sm">
          <span className="font-bold text-gray-800">{r.lines_sum_quantity ?? 0}</span>
          <span className="text-gray-400"> ชิ้น</span>
        </div>
      )
    },
    {
      key: 'pda', label: 'CRL', render: (r: Claim) => (
        r.pda_token
          ? <Badge variant="success"><ScanBarcode size={12} className="inline mr-1" />เปิดแล้ว</Badge>
          : <span className="text-gray-300">-</span>
      )
    },
    { key: 'creator', label: 'ผู้สร้าง', render: (r: Claim) => <span className="text-sm">{r.creator?.name || '-'}</span> },
    { key: 'created_at', label: 'วันที่', render: (r: Claim) => <span className="text-sm text-gray-500">{new Date(r.created_at).toLocaleDateString('th-TH')}</span> },
    {
      key: 'actions', label: '',
      render: (r: Claim) => (
        <button onClick={() => onView(r.id)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-blue-600" title="ดูรายละเอียด">
          <Eye size={16} />
        </button>
      ),
    },
  ];

  return (
    <div>
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
            <Plus size={16} /> สร้างใบเคลม
          </button>
        )}
      </div>

      <DataTable columns={columns} data={data} loading={loading} emptyMessage="ไม่มีใบเคลม" />
      <Pagination currentPage={meta.current_page} lastPage={meta.last_page} total={meta.total} onPageChange={setPage} />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   CREATE VIEW
   ════════════════════════════════════════════════════════════ */
interface ClaimLineDraft {
  product_id: number;
  product_code: string;
  product_name: string;
  serial_number: string;
  resolution: ClaimResolution | null;
  note: string;
  status?: string;
  condition?: string;
}

function CreateView({ canManage, onBack, onCreated }: { canManage: boolean; onBack: () => void; onCreated: (id: number) => void }) {
  const [form, setForm] = useState<Omit<ClaimPayload, 'lines'>>({ type: 'RETURN' });
  const [lines, setLines] = useState<ClaimLineDraft[]>([]);
  const [saving, setSaving] = useState(false);

  // Serial search
  const [searchResults, setSearchResults] = useState<ClaimSearchItem[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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
    if (!q.trim()) { setSearchResults([]); return; }
    setLoadingProducts(true);
    try {
      const res = await claimService.searchItems(q);
      setSearchResults(res.data);
    } catch { /* ignore */ }
    setLoadingProducts(false);
  }, []);

  const handleProductSearchChange = (val: string) => {
    setProductSearch(val);
    setShowProductDropdown(true);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchProducts(val), 300);
  };

  const addItem = (item: ClaimSearchItem) => {
    // ป้องกัน duplicate serial
    if (lines.some(l => l.serial_number === item.serial_number)) {
      toast('Serial นี้อยู่ในรายการแล้ว', 'error');
      return;
    }
    setLines(prev => [...prev, {
      product_id: item.product_id,
      product_code: item.product_code,
      product_name: item.product_name,
      serial_number: item.serial_number,
      resolution: null,
      note: '',
      status: item.status,
      condition: item.condition,
    }]);
    setProductSearch('');
    setShowProductDropdown(false);
  };

  const updateLine = (idx: number, field: keyof ClaimLineDraft, value: string | number) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  };

  const removeLine = (idx: number) => {
    setLines(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;

    setSaving(true);
    try {
      const payload: ClaimPayload = {
        ...form,
        lines: lines.map(l => ({
          serial_number: l.serial_number,
          resolution: l.resolution || undefined,
          note: l.note || undefined,
        })),
      };
      const res = await claimService.create(payload);
      toast(res.message || 'สร้างใบเคลมสำเร็จ', 'success');
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
          <FileWarning size={20} className="text-orange-500" /> สร้างใบเคลมสินค้า
        </h2>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Header fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">ประเภทเคลม *</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as ClaimType })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">ชื่อลูกค้า</label>
              <input type="text" value={form.customer_name || ''} onChange={e => setForm({ ...form, customer_name: e.target.value })}
                placeholder="ระบุชื่อลูกค้า" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">เลขที่เอกสารอ้างอิง</label>
              <input type="text" value={form.reference_doc || ''} onChange={e => setForm({ ...form, reference_doc: e.target.value })}
                placeholder="เช่น INV-001" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">เหตุผลการเคลม</label>
            <textarea value={form.reason || ''} onChange={e => setForm({ ...form, reason: e.target.value })}
              rows={2} placeholder="ระบุเหตุผลการเคลม"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">หมายเหตุ</label>
            <textarea value={form.note || ''} onChange={e => setForm({ ...form, note: e.target.value })}
              rows={2} placeholder="หมายเหตุเพิ่มเติม" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
          </div>

          {/* ── Serial scan search ── */}
          <div className="border-t pt-5">
            <h3 className="mb-3 flex items-center gap-2 font-bold text-gray-800">
              <ScanBarcode size={18} className="text-blue-600" /> สแกน Barcode / ค้นหา Serial
            </h3>

            <div ref={searchRef} className="relative mb-4">
              <div className="relative">
                <ScanBarcode size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="ยิง Barcode หรือพิมพ์ Serial Number..."
                  value={productSearch}
                  onChange={e => handleProductSearchChange(e.target.value)}
                  onFocus={() => productSearch && setShowProductDropdown(true)}
                  className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none"
                  autoFocus
                />
              </div>

              {showProductDropdown && (
                <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border bg-white shadow-lg">
                  {loadingProducts && <div className="p-3 text-sm text-gray-400">กำลังค้นหา...</div>}
                  {!loadingProducts && searchResults.length === 0 && productSearch && (
                    <div className="p-3 text-sm text-gray-400">ไม่พบ Serial Number</div>
                  )}
                  {searchResults.map((item, i) => (
                    <button key={`${item.inventory_id}-${i}`} type="button"
                      onClick={() => addItem(item)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-blue-50">
                      <span className="font-mono text-xs text-blue-600 font-bold">S/N: {item.serial_number}</span>
                      <span className="font-mono text-xs text-gray-500">{item.product_code}</span>
                      <span className="flex-1">{item.product_name}</span>
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">{item.status} / {item.condition}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Lines table */}
            {lines.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-medium text-gray-600">#</th>
                      <th className="px-3 py-2.5 text-left font-medium text-gray-600">สินค้า</th>
                      <th className="px-3 py-2.5 text-center font-medium text-gray-600">สถานะ</th>
                      <th className="px-3 py-2.5 text-center font-medium text-gray-600 w-40">วิธีดำเนินการ</th>
                      <th className="px-3 py-2.5 text-left font-medium text-gray-600">หมายเหตุ</th>
                      <th className="px-3 py-2.5 text-center font-medium text-gray-600 w-14"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {lines.map((line, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-800">{line.product_name}</div>
                          <div className="font-mono text-xs text-blue-600 font-bold">S/N: {line.serial_number}</div>
                          <div className="font-mono text-xs text-gray-400">{line.product_code}</div>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">{line.status || '-'}</span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <select value={line.resolution || ''} onChange={e => updateLine(idx, 'resolution', e.target.value || '')}
                            className="rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none">
                            <option value="">— ยังไม่ระบุ —</option>
                            {RESOLUTION_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input type="text" value={line.note} onChange={e => updateLine(idx, 'note', e.target.value)}
                            placeholder="-" className="w-full rounded border border-gray-200 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none" />
                        </td>
                        <td className="px-3 py-2 text-center">
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
                  รวม {lines.length} รายการ
                </div>
              </div>
            ) : (
              <div className="rounded-lg border-2 border-dashed border-gray-200 py-10 text-center text-sm text-gray-400">
                <ScanBarcode size={32} className="mx-auto mb-2 text-gray-300" />
                <p>ยิง Barcode หรือพิมพ์ Serial Number เพื่อเพิ่มรายการ</p>
                <p className="mt-1 text-xs">หรือสร้างใบเคลมก่อน แล้วใช้ CRL ให้เครื่อง PDA สแกนเพิ่มทีหลังได้</p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={onBack} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              ยกเลิก
            </button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              <Plus size={16} /> {saving ? 'กำลังสร้าง...' : 'สร้างใบเคลม'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   DETAIL VIEW
   ════════════════════════════════════════════════════════════ */
function DetailView({ id, canManage, onBack }: { id: number; canManage: boolean; onBack: () => void }) {
  const [claim, setClaim] = useState<Claim | null>(null);
  const [stats, setStats] = useState({ total_qty: 0, lines_count: 0 });
  const [loading, setLoading] = useState(true);

  const [confirmAction, setConfirmAction] = useState<'submit' | 'approve' | 'reject' | 'cancel' | 'delete' | null>(null);
  const [acting, setActing] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<{ type: ClaimType; customer_name: string; reference_doc: string; reason: string; note: string }>({ type: 'RETURN', customer_name: '', reference_doc: '', reason: '', note: '' });
  const [editLines, setEditLines] = useState<ClaimLineDraft[]>([]);
  const [saving, setSaving] = useState(false);

  // CRL state
  const [generatingPda, setGeneratingPda] = useState(false);

  // Edit serial search
  const [editProductSearch, setEditProductSearch] = useState('');
  const [editSearchResults, setEditSearchResults] = useState<ClaimSearchItem[]>([]);
  const [editShowDropdown, setEditShowDropdown] = useState(false);
  const [editLoadingProducts, setEditLoadingProducts] = useState(false);
  const editSearchRef = useRef<HTMLDivElement>(null);
  const editSearchTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await claimService.show(id);
      setClaim(res.data);
      setStats(res.stats);
    } catch {
      toast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (editSearchRef.current && !editSearchRef.current.contains(e.target as Node)) setEditShowDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const startEdit = () => {
    if (!claim) return;
    setEditForm({
      type: claim.type,
      customer_name: claim.customer_name || '',
      reference_doc: claim.reference_doc || '',
      reason: claim.reason || '',
      note: claim.note || '',
    });
    setEditLines((claim.lines || []).map(l => ({
      product_id: l.product_id,
      product_code: l.product?.product_code || '',
      product_name: l.product?.name || '',
      serial_number: l.serial_number || '',
      resolution: l.resolution || null,
      note: l.note || '',
      status: l.inventory?.status,
      condition: l.inventory?.condition,
    })));
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); };

  const editSearchProducts = useCallback(async (q: string) => {
    if (!q.trim()) { setEditSearchResults([]); return; }
    setEditLoadingProducts(true);
    try {
      const res = await claimService.searchItems(q);
      setEditSearchResults(res.data);
    } catch { /* ignore */ }
    setEditLoadingProducts(false);
  }, []);

  const handleEditProductSearch = (val: string) => {
    setEditProductSearch(val);
    setEditShowDropdown(true);
    clearTimeout(editSearchTimeout.current);
    editSearchTimeout.current = setTimeout(() => editSearchProducts(val), 300);
  };

  const addEditItem = (item: ClaimSearchItem) => {
    if (editLines.some(l => l.serial_number === item.serial_number)) {
      toast('Serial นี้อยู่ในรายการแล้ว', 'error');
      return;
    }
    setEditLines(prev => [...prev, {
      product_id: item.product_id,
      product_code: item.product_code,
      product_name: item.product_name,
      serial_number: item.serial_number,
      resolution: null,
      note: '',
      status: item.status,
      condition: item.condition,
    }]);
    setEditProductSearch('');
    setEditShowDropdown(false);
  };

  const updateEditLine = (idx: number, field: keyof ClaimLineDraft, value: string | number) => {
    setEditLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  };

  const removeEditLine = (idx: number) => {
    setEditLines(prev => prev.filter((_, i) => i !== idx));
  };

  const saveEdit = async () => {
    if (editLines.length === 0) {
      // ลบรายการทั้งหมด — ส่ง lines เป็น array ว่าง
    }
    setSaving(true);
    try {
      const payload: Partial<ClaimPayload> = {
        ...editForm,
        lines: editLines.map(l => ({
          serial_number: l.serial_number,
          resolution: l.resolution || undefined,
          note: l.note || undefined,
        })),
      };
      const res = await claimService.update(id, payload);
      toast(res.message || 'แก้ไขสำเร็จ', 'success');
      setEditing(false);
      fetchData();
    } catch (err: unknown) {
      const ax = err as AxiosError<{ message: string }>;
      toast(ax.response?.data?.message || 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleGeneratePda = async () => {
    if (!claim) return;
    setGeneratingPda(true);
    try {
      const res = await claimService.generatePda(claim.id);
      toast(res.message || 'สร้าง CRL สำเร็จ', 'success');
      fetchData();
    } catch (err: unknown) {
      const ax = err as AxiosError<{ message: string }>;
      toast(ax.response?.data?.message || 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setGeneratingPda(false);
    }
  };

  const copyPdaLink = () => {
    if (!claim?.pda_token) return;
    const url = `${window.location.origin}/pda/claim?token=${claim.pda_token}`;
    navigator.clipboard.writeText(url);
    toast('คัดลอกลิงก์ CRL แล้ว', 'success');
  };

  const handleAction = async () => {
    if (!confirmAction || !claim) return;
    setActing(true);
    try {
      if (confirmAction === 'submit') {
        const res = await claimService.submit(claim.id);
        toast(res.message || 'ส่งตรวจสอบสำเร็จ', 'success');
      } else if (confirmAction === 'approve') {
        const res = await claimService.approve(claim.id);
        toast(res.message || 'อนุมัติสำเร็จ', 'success');
      } else if (confirmAction === 'reject') {
        if (!rejectReason.trim()) { toast('กรุณาระบุเหตุผลที่ปฏิเสธ', 'error'); setActing(false); return; }
        const res = await claimService.reject(claim.id, rejectReason);
        toast(res.message || 'ปฏิเสธแล้ว', 'success');
        setRejectReason('');
      } else if (confirmAction === 'cancel') {
        const res = await claimService.cancel(claim.id);
        toast(res.message || 'ยกเลิกสำเร็จ', 'success');
      } else if (confirmAction === 'delete') {
        await claimService.delete(claim.id);
        toast('ลบใบเคลมสำเร็จ', 'success');
        setConfirmAction(null);
        onBack();
        return;
      }
      setConfirmAction(null);
      fetchData();
    } catch (err: unknown) {
      const ax = err as AxiosError<{ message: string }>;
      toast(ax.response?.data?.message || 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setActing(false);
    }
  };

  if (loading) return <div className="py-20 text-center text-gray-400">กำลังโหลด...</div>;
  if (!claim) return <div className="py-20 text-center text-red-400">ไม่พบข้อมูลใบเคลม</div>;

  const isEditable = ['DRAFT', 'PENDING'].includes(claim.status);

  return (
    <div>
      <button onClick={onBack} className="mb-4 flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
        <ArrowLeft size={16} /> กลับ
      </button>

      {/* ── Header Card ── */}
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="border-b px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold text-gray-800">
                <FileWarning size={20} className="text-orange-500" />
                ใบเคลม {claim.code}
              </h2>
              <div className="mt-1 flex items-center gap-2">
                {getTypeBadge(claim.type)}
                {getStatusBadge(claim.status)}
                {claim.pda_token && <Badge variant="success"><ScanBarcode size={12} className="inline mr-1" />CRL</Badge>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canManage && isEditable && claim.pda_token && !editing && (
                <a href={`/pda/claim?token=${claim.pda_token}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700">
                  <ScanBarcode size={15} /> สแกน <ExternalLink size={13} />
                </a>
              )}
              {canManage && isEditable && !editing && (
                <button onClick={startEdit} className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  <Pencil size={15} /> แก้ไข
                </button>
              )}
              {canManage && claim.status === 'DRAFT' && !editing && (
                <>
                  <button onClick={() => setConfirmAction('submit')} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
                    <Send size={15} /> ส่งตรวจสอบ
                  </button>
                  <button onClick={() => setConfirmAction('delete')} className="flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
                    <Trash2 size={15} /> ลบ
                  </button>
                </>
              )}
              {canManage && claim.status === 'PENDING' && !editing && (
                <>
                  <button onClick={() => setConfirmAction('approve')} className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700">
                    <CheckCircle size={15} /> อนุมัติ
                  </button>
                  <button onClick={() => setConfirmAction('reject')} className="flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
                    <XCircle size={15} /> ปฏิเสธ
                  </button>
                </>
              )}
              {canManage && ['DRAFT', 'PENDING'].includes(claim.status) && !editing && (
                <button onClick={() => setConfirmAction('cancel')} className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
                  <Ban size={15} /> ยกเลิก
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Info Section (viewing) ── */}
        {!editing && (
          <div className="px-6 py-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <InfoField label="ประเภทเคลม" value={TYPE_OPTIONS.find(t => t.value === claim.type)?.label || claim.type} />
              <InfoField label="ลูกค้า" value={claim.customer_name || '-'} />
              <InfoField label="เอกสารอ้างอิง" value={claim.reference_doc || '-'} />
              <InfoField label="อ้างอิงใบตัดสต๊อก" value={claim.stock_deduction?.code || '-'} />
              <InfoField label="ผู้สร้าง" value={`${claim.creator?.name || '-'} — ${new Date(claim.created_at).toLocaleString('th-TH')}`} />
              {claim.approved_at && (
                <InfoField label={claim.status === 'REJECTED' ? 'ผู้ปฏิเสธ' : 'ผู้อนุมัติ'} value={`${claim.approver?.name || '-'} — ${new Date(claim.approved_at).toLocaleString('th-TH')}`} />
              )}
            </div>
            {claim.reason && (
              <div>
                <span className="text-xs font-medium text-gray-500">เหตุผลการเคลม</span>
                <p className="mt-0.5 text-sm text-gray-700">{claim.reason}</p>
              </div>
            )}
            {claim.note && (
              <div>
                <span className="text-xs font-medium text-gray-500">หมายเหตุ</span>
                <p className="mt-0.5 text-sm text-gray-700">{claim.note}</p>
              </div>
            )}
            {claim.reject_reason && (
              <div className="rounded-lg bg-red-50 p-3">
                <span className="text-xs font-medium text-red-600">เหตุผลที่ปฏิเสธ</span>
                <p className="mt-0.5 text-sm text-red-700">{claim.reject_reason}</p>
              </div>
            )}

            {/* ── CRL (PDA Token) Section ── */}
            {canManage && isEditable && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <h4 className="flex items-center gap-2 text-sm font-bold text-blue-800 mb-2">
                  <Link2 size={16} /> CRL — Claim Reference Link (สำหรับ PDA)
                </h4>
                {claim.pda_token ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <code className="flex-1 rounded bg-white px-3 py-1.5 text-xs font-mono text-gray-700 border">
                        {`${typeof window !== 'undefined' ? window.location.origin : ''}/pda/claim?token=${claim.pda_token}`}
                      </code>
                      <button onClick={copyPdaLink} className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
                        <Copy size={14} /> คัดลอก
                      </button>
                    </div>
                    <p className="text-xs text-blue-600">ส่งลิงก์นี้ไปยังเครื่อง PDA เพื่อสแกน Barcode เพิ่มรายการเคลม</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <p className="text-sm text-blue-700">สร้าง CRL เพื่อให้เครื่อง PDA สแกน Barcode ได้</p>
                    <button onClick={handleGeneratePda} disabled={generatingPda}
                      className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                      <ScanBarcode size={15} /> {generatingPda ? 'กำลังสร้าง...' : 'สร้าง CRL'}
                    </button>
                  </div>
                )}
              </div>
            )}
            {!isEditable && claim.pda_token && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <span className="text-xs font-medium text-gray-500 flex items-center gap-1"><Link2 size={14} /> CRL Token</span>
                <p className="mt-0.5 text-xs font-mono text-gray-600">{claim.pda_token}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Edit Form ── */}
        {editing && (
          <div className="px-6 py-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">ประเภทเคลม</label>
                <select value={editForm.type} onChange={e => setEditForm({ ...editForm, type: e.target.value as ClaimType })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                  {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">ชื่อลูกค้า</label>
                <input type="text" value={editForm.customer_name} onChange={e => setEditForm({ ...editForm, customer_name: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">เลขที่เอกสารอ้างอิง</label>
                <input type="text" value={editForm.reference_doc} onChange={e => setEditForm({ ...editForm, reference_doc: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">เหตุผลการเคลม</label>
              <textarea value={editForm.reason} onChange={e => setEditForm({ ...editForm, reason: e.target.value })}
                rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">หมายเหตุ</label>
              <textarea value={editForm.note} onChange={e => setEditForm({ ...editForm, note: e.target.value })}
                rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>

            {/* Edit serial lines */}
            <div className="border-t pt-4">
              <h3 className="mb-3 flex items-center gap-2 font-bold text-gray-800">
                <ScanBarcode size={18} className="text-blue-600" /> รายการสินค้า
              </h3>
              <div ref={editSearchRef} className="relative mb-4">
                <div className="relative">
                  <ScanBarcode size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="text" placeholder="ยิง Barcode หรือพิมพ์ Serial Number..."
                    value={editProductSearch} onChange={e => handleEditProductSearch(e.target.value)}
                    onFocus={() => editProductSearch && setEditShowDropdown(true)}
                    className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                {editShowDropdown && (
                  <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border bg-white shadow-lg">
                    {editLoadingProducts && <div className="p-3 text-sm text-gray-400">กำลังค้นหา...</div>}
                    {!editLoadingProducts && editSearchResults.length === 0 && editProductSearch && (
                      <div className="p-3 text-sm text-gray-400">ไม่พบ Serial Number</div>
                    )}
                    {editSearchResults.map((item, i) => (
                      <button key={`${item.inventory_id}-${i}`} type="button" onClick={() => addEditItem(item)}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-blue-50">
                        <span className="font-mono text-xs text-blue-600 font-bold">S/N: {item.serial_number}</span>
                        <span className="font-mono text-xs text-gray-500">{item.product_code}</span>
                        <span className="flex-1">{item.product_name}</span>
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">{item.status} / {item.condition}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {editLines.length > 0 && (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">#</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">สินค้า</th>
                        <th className="px-3 py-2 text-center font-medium text-gray-600 w-40">วิธีดำเนินการ</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">หมายเหตุ</th>
                        <th className="px-3 py-2 w-14"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {editLines.map((line, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                          <td className="px-3 py-2">
                            <div className="font-medium text-gray-800">{line.product_name}</div>
                            <div className="font-mono text-xs text-blue-600 font-bold">S/N: {line.serial_number}</div>
                            <div className="font-mono text-xs text-gray-400">{line.product_code}</div>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <select value={line.resolution || ''}
                              onChange={e => updateEditLine(idx, 'resolution', e.target.value || '')}
                              className="rounded border border-gray-300 px-2 py-1 text-sm">
                              <option value="">— ยังไม่ระบุ —</option>
                              {RESOLUTION_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <input type="text" value={line.note} onChange={e => updateEditLine(idx, 'note', e.target.value)}
                              className="w-full rounded border border-gray-200 px-2 py-1 text-sm" />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button type="button" onClick={() => removeEditLine(idx)}
                              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500">
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t">
              <button onClick={cancelEdit} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                <X size={15} className="inline mr-1" /> ยกเลิก
              </button>
              <button onClick={saveEdit} disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                <Save size={15} /> {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        )}

        {/* ── Lines Table (viewing) ── */}
        {!editing && (
          <div className="px-6 py-4 border-t">
            <h3 className="mb-3 flex items-center gap-2 font-bold text-gray-800">
              <Package size={18} className="text-blue-600" />
              รายการสินค้าเคลม ({stats.lines_count} รายการ — {stats.total_qty} ชิ้น)
            </h3>
            {claim.lines && claim.lines.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium text-gray-600">#</th>
                      <th className="px-4 py-2.5 text-left font-medium text-gray-600">สินค้า</th>
                      <th className="px-4 py-2.5 text-center font-medium text-gray-600">สถานะ Inventory</th>
                      <th className="px-4 py-2.5 text-center font-medium text-gray-600">วิธีดำเนินการ</th>
                      <th className="px-4 py-2.5 text-left font-medium text-gray-600">ตำแหน่ง</th>
                      <th className="px-4 py-2.5 text-left font-medium text-gray-600">หมายเหตุ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {claim.lines.map((line: ClaimLine, idx: number) => (
                      <tr key={line.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-500">{idx + 1}</td>
                        <td className="px-4 py-2">
                          <div className="font-medium text-gray-800">{line.product?.name || '-'}</div>
                          <div className="font-mono text-xs text-blue-600 font-bold">S/N: {line.serial_number || '-'}</div>
                          <div className="font-mono text-xs text-gray-400">{line.product?.product_code || '-'}</div>
                        </td>
                        <td className="px-4 py-2 text-center">
                          {line.inventory ? (
                            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                              {line.inventory.status} / {line.inventory.condition}
                            </span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-center text-sm">
                          {line.resolution ? (
                            <Badge variant="info">{getResolutionLabel(line.resolution)}</Badge>
                          ) : (
                            <span className="text-gray-300">ยังไม่ระบุ</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-500">
                          {line.inventory?.location?.name || '-'}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-500">{line.note || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-lg border-2 border-dashed py-8 text-center text-sm text-gray-400">
                ไม่มีรายการสินค้า
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Confirm Dialogs ── */}
      <ConfirmDialog
        open={confirmAction === 'submit'}
        title="ส่งตรวจสอบ"
        message={`ยืนยันส่งใบเคลม ${claim.code} ให้ตรวจสอบ?`}
        confirmText="ส่งตรวจสอบ"
        cancelText="ยกเลิก"
        onConfirm={handleAction}
        onCancel={() => setConfirmAction(null)}
        loading={acting}
      />

      <ConfirmDialog
        open={confirmAction === 'approve'}
        title="อนุมัติใบเคลม"
        message={`ยืนยันอนุมัติใบเคลม ${claim.code}?\n\nรายการที่มี "คืนเข้าสต๊อก" หรือ "คืนเป็นสินค้าชำรุด" จะถูกคืนสต๊อกอัตโนมัติ`}
        confirmText="อนุมัติ"
        cancelText="ยกเลิก"
        onConfirm={handleAction}
        onCancel={() => setConfirmAction(null)}
        loading={acting}
      />

      {confirmAction === 'reject' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-800">ปฏิเสธใบเคลม</h3>
            <p className="mt-2 text-sm text-gray-600">ปฏิเสธใบเคลม {claim.code}?</p>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="ระบุเหตุผลที่ปฏิเสธ *"
              rows={3}
              className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-3">
              <button onClick={() => { setConfirmAction(null); setRejectReason(''); }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                disabled={acting}>ยกเลิก</button>
              <button onClick={handleAction}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                disabled={acting || !rejectReason.trim()}>
                {acting ? 'กำลังดำเนินการ...' : 'ปฏิเสธ'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmAction === 'cancel'}
        title="ยกเลิกใบเคลม"
        message={`ยืนยันยกเลิกใบเคลม ${claim.code}?`}
        confirmText="ยกเลิกใบเคลม"
        cancelText="ไม่"
        onConfirm={handleAction}
        onCancel={() => setConfirmAction(null)}
        loading={acting}
      />

      <ConfirmDialog
        open={confirmAction === 'delete'}
        title="ลบใบเคลม"
        message={`ยืนยันลบใบเคลม ${claim.code}? ข้อมูลจะไม่สามารถกู้คืนได้`}
        confirmText="ลบ"
        cancelText="ยกเลิก"
        onConfirm={handleAction}
        onCancel={() => setConfirmAction(null)}
        loading={acting}
      />
    </div>
  );
}

/* ── Helper Component ── */
function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <p className="mt-0.5 text-sm text-gray-800">{value}</p>
    </div>
  );
}
