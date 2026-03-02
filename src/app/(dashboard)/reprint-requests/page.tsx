'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import AuthGuard from '@/components/AuthGuard';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import Pagination from '@/components/ui/Pagination';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { labelService } from '@/services/label.service';
import { inventoryService } from '@/services/inventory.service';
import { productionOrderService } from '@/services/production-order.service';
import type { LabelReprintRequest, Inventory, ProductionOrder } from '@/lib/types';
import { AxiosError } from 'axios';
import {
  Plus,
  Search,
  Eye,
  CheckCircle,
  XCircle,
  Printer,
  RefreshCw,
} from 'lucide-react';

const STATUS_MAP: Record<string, { label: string; variant: 'warning' | 'success' | 'danger' | 'info' }> = {
  PENDING:  { label: 'รอดำเนินการ', variant: 'warning' },
  APPROVED: { label: 'อนุมัติแล้ว', variant: 'success' },
  REJECTED: { label: 'ปฏิเสธ', variant: 'danger' },
  PRINTED:  { label: 'ปริ้นแล้ว', variant: 'info' },
};

const PAPER_SIZES = [
  { value: '50x30', label: '50 x 30 mm' },
  { value: '70x40', label: '70 x 40 mm' },
  { value: '100x50', label: '100 x 50 mm' },
  { value: '80x60', label: '80 x 60 mm' },
  { value: '100x70', label: '100 x 70 mm' },
];

const LABEL_TEMPLATES = [
  { value: 'combined', label: 'รวม (1 แผ่น)' },
  { value: 'split', label: 'แยก Barcode/รายละเอียด (2 แผ่น)' },
] as const;

type LabelTemplate = typeof LABEL_TEMPLATES[number]['value'];

export default function ReprintRequestsPage() {
  return (
    <AuthGuard permission="view_production">
      <ReprintRequestsContent />
    </AuthGuard>
  );
}

function ReprintRequestsContent() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('manage_production');

  const [requests, setRequests] = useState<LabelReprintRequest[]>([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, per_page: 15, total: 0 });
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [viewReq, setViewReq] = useState<LabelReprintRequest | null>(null);
  const [detailData, setDetailData] = useState<LabelReprintRequest | null>(null);
  const [rejectTarget, setRejectTarget] = useState<LabelReprintRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [reprintTarget, setReprintTarget] = useState<LabelReprintRequest | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, per_page: 15 };
      if (filterStatus) params.status = filterStatus;
      const res = await labelService.reprintRequests(params);
      setRequests(res.data);
      setMeta(res.meta);
    } catch {
      toast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, filterStatus]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openDetail = async (req: LabelReprintRequest) => {
    setViewReq(req);
    try {
      const res = await labelService.showReprintRequest(req.id);
      setDetailData(res.data);
    } catch {
      toast('โหลดรายละเอียดไม่สำเร็จ', 'error');
    }
  };

  const handleApprove = async (rr: LabelReprintRequest) => {
    try {
      await labelService.approveReprint(rr.id);
      toast('อนุมัติคำขอปริ้นซ้ำสำเร็จ', 'success');
      setViewReq(null);
      setDetailData(null);
      fetchData();
    } catch {
      toast('ไม่สามารถอนุมัติได้', 'error');
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    if (rejectReason.trim().length < 5) {
      toast('กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร', 'error');
      return;
    }
    try {
      await labelService.rejectReprint(rejectTarget.id, rejectReason.trim());
      toast('ปฏิเสธคำขอปริ้นซ้ำแล้ว', 'success');
      setRejectTarget(null);
      setRejectReason('');
      setViewReq(null);
      setDetailData(null);
      fetchData();
    } catch {
      toast('เกิดข้อผิดพลาด', 'error');
    }
  };

  const columns = [
    {
      key: 'id', label: '#',
      render: (r: LabelReprintRequest) => <span className="font-mono text-sm">#{r.id}</span>,
    },
    {
      key: 'status', label: 'สถานะ',
      render: (r: LabelReprintRequest) => {
        const s = STATUS_MAP[r.status];
        return <Badge variant={s?.variant || 'warning'}>{s?.label || r.status}</Badge>;
      },
    },
    {
      key: 'reason', label: 'เหตุผล',
      render: (r: LabelReprintRequest) => (
        <span className="text-sm line-clamp-2">{r.reason}</span>
      ),
    },
    {
      key: 'count', label: 'จำนวน Serial',
      render: (r: LabelReprintRequest) => <span>{r.inventories_count ?? r.inventories?.length ?? 0} รายการ</span>,
    },
    {
      key: 'requester', label: 'ผู้ร้องขอ',
      render: (r: LabelReprintRequest) => <span>{r.requester?.name || '-'}</span>,
    },
    {
      key: 'created_at', label: 'วันที่ร้องขอ',
      render: (r: LabelReprintRequest) => (
        <span className="text-sm text-gray-500">{new Date(r.created_at).toLocaleString('th-TH')}</span>
      ),
    },
    {
      key: 'actions', label: '',
      render: (r: LabelReprintRequest) => (
        <div className="flex gap-1">
          <button onClick={() => openDetail(r)} className="rounded p-1.5 text-gray-600 hover:bg-gray-100" title="ดูรายละเอียด">
            <Eye size={16} />
          </button>
          {canManage && r.status === 'PENDING' && (
            <>
              <button onClick={() => handleApprove(r)} className="rounded p-1.5 text-green-600 hover:bg-green-50" title="อนุมัติ">
                <CheckCircle size={16} />
              </button>
              <button onClick={() => { setRejectTarget(r); setRejectReason(''); }} className="rounded p-1.5 text-red-600 hover:bg-red-50" title="ปฏิเสธ">
                <XCircle size={16} />
              </button>
            </>
          )}
          {canManage && r.status === 'APPROVED' && (
            <button onClick={() => setReprintTarget(r)} className="rounded p-1.5 text-blue-600 hover:bg-blue-50" title="ปริ้นซ้ำ">
              <Printer size={16} />
            </button>
          )}
          {r.status === 'PRINTED' && (
            <span className="rounded p-1.5 text-gray-400" title="ปริ้นแล้ว">
              <Printer size={16} />
            </span>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="คำขอปริ้นซ้ำ" description="จัดการคำขอปริ้น Barcode Label ซ้ำ — อนุมัติ/ปฏิเสธ" actions={
        canManage ? (
          <button onClick={() => setCreateOpen(true)} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Plus size={18} /> ส่งคำขอปริ้นซ้ำ
          </button>
        ) : undefined
      } />

      {/* Filter */}
      <div className="mb-6 flex items-end gap-3">
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
          <option value="">ทุกสถานะ</option>
          <option value="PENDING">รอดำเนินการ</option>
          <option value="APPROVED">อนุมัติแล้ว</option>
          <option value="REJECTED">ปฏิเสธ</option>
          <option value="PRINTED">ปริ้นแล้ว</option>
        </select>
        <button onClick={fetchData} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
          <RefreshCw size={16} />
        </button>
      </div>

      <DataTable columns={columns} data={requests} loading={loading} emptyMessage="ไม่มีคำขอปริ้นซ้ำ" />
      <Pagination currentPage={meta.current_page} lastPage={meta.last_page} total={meta.total} onPageChange={setPage} />

      {/* Create Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="ส่งคำขอปริ้นซ้ำ" size="lg">
        <CreateReprintRequestForm onSuccess={() => { setCreateOpen(false); fetchData(); }} onCancel={() => setCreateOpen(false)} />
      </Modal>

      {/* Detail Modal */}
      <Modal open={!!viewReq} onClose={() => { setViewReq(null); setDetailData(null); }}
        title={`คำขอปริ้นซ้ำ #${viewReq?.id || ''}`} size="lg">
        {detailData ? (
          <ReprintRequestDetail data={detailData} canManage={canManage}
            onApprove={() => handleApprove(detailData)}
            onReject={() => { setRejectTarget(detailData); setRejectReason(''); }}
          />
        ) : (
          <p className="py-8 text-center text-sm text-gray-400">กำลังโหลด...</p>
        )}
      </Modal>

      {/* Reject Modal */}
      <Modal open={!!rejectTarget} onClose={() => setRejectTarget(null)} title="ปฏิเสธคำขอปริ้นซ้ำ" size="sm">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">เหตุผลที่ปฏิเสธ *</label>
            <textarea rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="ระบุเหตุผล (อย่างน้อย 5 ตัวอักษร)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setRejectTarget(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">ยกเลิก</button>
            <button onClick={handleReject} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">ปฏิเสธคำขอ</button>
          </div>
        </div>
      </Modal>

      {/* Reprint Modal */}
      <Modal open={!!reprintTarget} onClose={() => setReprintTarget(null)}
        title={`ปริ้นซ้ำจากคำขอ #${reprintTarget?.id || ''}`} size="lg">
        {reprintTarget && (
          <ReprintExecuteForm reprintRequest={reprintTarget} onSuccess={() => { setReprintTarget(null); fetchData(); }} onCancel={() => setReprintTarget(null)} />
        )}
      </Modal>
    </div>
  );
}

/* ── Detail View ── */
function ReprintRequestDetail({ data, canManage, onApprove, onReject }: {
  data: LabelReprintRequest; canManage: boolean;
  onApprove: () => void; onReject: () => void;
}) {
  const s = STATUS_MAP[data.status];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 text-sm">
        <div><span className="text-gray-500">สถานะ:</span> <Badge variant={s?.variant || 'warning'}>{s?.label || data.status}</Badge></div>
        <div><span className="text-gray-500">ผู้ร้องขอ:</span> {data.requester?.name || '-'}</div>
        <div><span className="text-gray-500">วันที่ร้องขอ:</span> {new Date(data.created_at).toLocaleString('th-TH')}</div>
        {data.production_order && (
          <div><span className="text-gray-500">ใบสั่งผลิต:</span> {data.production_order.order_number}</div>
        )}
        {data.approver && (
          <div><span className="text-gray-500">ผู้อนุมัติ/ปฏิเสธ:</span> {data.approver.name}</div>
        )}
        {data.approved_at && (
          <div><span className="text-gray-500">วันที่ดำเนินการ:</span> {new Date(data.approved_at).toLocaleString('th-TH')}</div>
        )}
      </div>

      <div className="rounded bg-gray-50 p-3 text-sm">
        <span className="font-medium text-gray-700">เหตุผลขอปริ้นซ้ำ:</span>
        <p className="mt-1">{data.reason}</p>
      </div>

      {data.reject_reason && (
        <div className="rounded bg-red-50 p-3 text-sm">
          <span className="font-medium text-red-700">เหตุผลที่ปฏิเสธ:</span>
          <p className="mt-1 text-red-600">{data.reject_reason}</p>
        </div>
      )}

      {/* Serial list */}
      {data.inventories && data.inventories.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-gray-700">Serial ที่ขอปริ้นซ้ำ ({data.inventories.length} รายการ)</h4>
          <div className="max-h-48 overflow-y-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Serial Number</th>
                  <th className="px-3 py-2 text-left">สินค้า</th>
                </tr>
              </thead>
              <tbody>
                {data.inventories.map((inv, i) => (
                  <tr key={inv.id} className="border-t">
                    <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2 font-mono text-xs">{inv.serial_number}</td>
                    <td className="px-3 py-2">{inv.product?.product_code} - {inv.product?.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {canManage && data.status === 'PENDING' && (
        <div className="flex gap-2 border-t pt-4">
          <button onClick={onApprove} className="flex items-center gap-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
            <CheckCircle size={16} /> อนุมัติ
          </button>
          <button onClick={onReject} className="flex items-center gap-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
            <XCircle size={16} /> ปฏิเสธ
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Create Reprint Request Form ── */
type SearchMode = 'po' | 'search';

function CreateReprintRequestForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const [mode, setMode] = useState<SearchMode>('po');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  // PO mode
  const [poId, setPoId] = useState<number | null>(null);
  const [productionOrders, setProductionOrders] = useState<ProductionOrder[]>([]);
  const [poSerials, setPoSerials] = useState<Inventory[]>([]);
  const [poSerialsLoading, setPoSerialsLoading] = useState(false);

  // Search mode
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Inventory[]>([]);
  const [searching, setSearching] = useState(false);

  // Shared selection
  const [selectedItems, setSelectedItems] = useState<Map<number, Inventory>>(new Map());

  // Load POs (exclude CANCELLED)
  useEffect(() => {
    productionOrderService.list({ per_page: 200 })
      .then(r => setProductionOrders(r.data.filter(po => po.status !== 'CANCELLED')))
      .catch(() => {});
  }, []);

  // When PO changes, fetch its serials (only printed ones)
  useEffect(() => {
    if (mode !== 'po' || !poId) { setPoSerials([]); return; }
    setPoSerialsLoading(true);
    labelService.productionOrderSerials(poId, { per_page: 500 })
      .then(r => {
        const printed = r.data.filter(inv => inv.label_print_count > 0);
        setPoSerials(printed);
      })
      .catch(() => toast('โหลด Serial ไม่สำเร็จ', 'error'))
      .finally(() => setPoSerialsLoading(false));
  }, [poId, mode]);

  // Switch mode → clear
  const switchMode = (m: SearchMode) => {
    setMode(m);
    setSelectedItems(new Map());
    setPoId(null);
    setPoSerials([]);
    setSearchTerm('');
    setSearchResults([]);
  };

  // Serial search
  const searchSerials = async () => {
    const q = searchTerm.trim();
    if (!q) return;
    setSearching(true);
    try {
      const res = await inventoryService.list({ search: q, per_page: 30 });
      const printed = res.data.filter(inv => inv.label_print_count > 0);
      setSearchResults(printed);
      if (printed.length === 0) toast('ไม่พบ Serial ที่เคยปริ้นแล้ว', 'error');
    } catch {
      toast('ค้นหาไม่สำเร็จ', 'error');
    } finally {
      setSearching(false);
    }
  };

  // Toggle helpers
  const toggleItem = (inv: Inventory) => {
    const next = new Map(selectedItems);
    if (next.has(inv.id)) next.delete(inv.id); else next.set(inv.id, inv);
    setSelectedItems(next);
  };

  const isSelected = (id: number) => selectedItems.has(id);

  const toggleAllPo = () => {
    if (selectedItems.size === poSerials.length && poSerials.length > 0) {
      setSelectedItems(new Map());
    } else {
      setSelectedItems(new Map(poSerials.map(s => [s.id, s])));
    }
  };

  const addFromSearch = (inv: Inventory) => {
    if (!selectedItems.has(inv.id)) {
      setSelectedItems(new Map(selectedItems).set(inv.id, inv));
    }
  };

  const removeItem = (id: number) => {
    const next = new Map(selectedItems);
    next.delete(id);
    setSelectedItems(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 5) { toast('กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร', 'error'); return; }
    if (selectedItems.size === 0) { toast('กรุณาเลือก Serial ที่ต้องการปริ้นซ้ำ', 'error'); return; }

    setSaving(true);
    try {
      await labelService.createReprintRequest({
        reason: reason.trim(),
        inventory_ids: Array.from(selectedItems.keys()),
        production_order_id: mode === 'po' && poId ? poId : undefined,
      });
      toast('ส่งคำขอปริ้นซ้ำสำเร็จ', 'success');
      onSuccess();
    } catch (err: unknown) {
      const ax = err as AxiosError<{ message: string }>;
      toast(ax.response?.data?.message || 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Shared serial table renderer
  const serialTable = (list: Inventory[], showToggleAll: boolean) => (
    <div className="max-h-64 overflow-y-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-gray-50">
          <tr>
            {showToggleAll && (
              <th className="w-10 px-3 py-2 text-left">
                <input type="checkbox" checked={selectedItems.size === list.length && list.length > 0}
                  onChange={toggleAllPo} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
              </th>
            )}
            {!showToggleAll && <th className="w-10 px-3 py-2"></th>}
            <th className="px-3 py-2 text-left">Serial Number</th>
            <th className="px-3 py-2 text-left">สินค้า</th>
            <th className="px-3 py-2 text-center">ปริ้นแล้ว</th>
            <th className="px-3 py-2 text-center">ยืนยัน</th>
          </tr>
        </thead>
        <tbody>
          {list.map(inv => {
            const checked = isSelected(inv.id);
            return (
              <tr key={inv.id} className={`border-t cursor-pointer ${checked ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                onClick={() => showToggleAll ? toggleItem(inv) : addFromSearch(inv)}>
                <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                  {showToggleAll ? (
                    <input type="checkbox" checked={checked}
                      onChange={() => toggleItem(inv)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                  ) : (
                    checked
                      ? <span className="text-xs text-gray-400">เลือกแล้ว</span>
                      : <button type="button" onClick={() => addFromSearch(inv)}
                          className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600 hover:bg-blue-100">+ เพิ่ม</button>
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{inv.serial_number}</td>
                <td className="px-3 py-2 text-xs">{inv.product?.product_code} - {inv.product?.name}</td>
                <td className="px-3 py-2 text-center text-xs">{inv.label_print_count} ครั้ง</td>
                <td className="px-3 py-2 text-center">
                  {inv.label_verified_at
                    ? <span className="text-green-600 text-xs">✓</span>
                    : <span className="text-gray-300 text-xs">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Mode tabs */}
      <div className="flex rounded-lg border border-gray-200 overflow-hidden">
        <button type="button" onClick={() => switchMode('po')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${mode === 'po' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
          เลือกจากใบสั่งผลิต (PO)
        </button>
        <button type="button" onClick={() => switchMode('search')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${mode === 'search' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
          ค้นหา Serial
        </button>
      </div>

      {/* ─ PO Mode ─ */}
      {mode === 'po' && (
        <>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">เลือกใบสั่งผลิต *</label>
            <select value={poId || ''} onChange={e => setPoId(e.target.value ? Number(e.target.value) : null)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
              <option value="">-- เลือกใบสั่งผลิต --</option>
              {productionOrders.map(po => (
                <option key={po.id} value={po.id}>
                  {po.order_number} — {po.pack?.name || '-'} ({po.quantity} ชุด) [{po.status === 'DRAFT' ? 'แบบร่าง' : po.status === 'CONFIRMED' ? 'ยืนยันแล้ว' : po.status === 'IN_PROGRESS' ? 'กำลังผลิต' : 'เสร็จสิ้น'}]
                </option>
              ))}
            </select>
          </div>

          {poId && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">
                  เลือก Serial * {poSerials.length > 0 && <span className="font-normal text-gray-400">({selectedItems.size}/{poSerials.length} เลือก)</span>}
                </label>
                {poSerials.length > 0 && (
                  <button type="button" onClick={toggleAllPo} className="text-xs text-blue-600 hover:text-blue-800">
                    {selectedItems.size === poSerials.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                  </button>
                )}
              </div>
              {poSerialsLoading ? (
                <p className="py-6 text-center text-sm text-gray-400">กำลังโหลด Serial...</p>
              ) : poSerials.length === 0 ? (
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-700">
                  ไม่พบ Serial ที่เคยปริ้นแล้วในใบสั่งผลิตนี้
                </div>
              ) : serialTable(poSerials, true)}
            </div>
          )}
        </>
      )}

      {/* ─ Search Mode ─ */}
      {mode === 'search' && (
        <>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">ค้นหา Serial Number หรือรหัสสินค้า</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" placeholder="พิมพ์ serial number, รหัสสินค้า หรือชื่อสินค้า..."
                  value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), searchSerials())}
                  className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <button type="button" onClick={searchSerials} disabled={searching}
                className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50">
                {searching ? '...' : 'ค้นหา'}
              </button>
            </div>
          </div>

          {searchResults.length > 0 && (
            <div>
              <p className="mb-1 text-xs text-gray-500">ผลการค้นหา ({searchResults.length} รายการ) — คลิกเพื่อเพิ่ม</p>
              {serialTable(searchResults, false)}
            </div>
          )}
        </>
      )}

      {/* Selected items */}
      {selectedItems.size > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
          <p className="mb-2 text-xs font-medium text-blue-700">Serial ที่เลือก ({selectedItems.size} รายการ):</p>
          <div className="flex flex-wrap gap-2">
            {Array.from(selectedItems.values()).map(inv => (
              <span key={inv.id} className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-mono border border-blue-200">
                {inv.serial_number}
                <button type="button" onClick={() => removeItem(inv.id)} className="ml-1 text-red-400 hover:text-red-600">&times;</button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Reason */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">เหตุผลขอปริ้นซ้ำ *</label>
        <textarea rows={2} value={reason} onChange={e => setReason(e.target.value)}
          placeholder="ระบุเหตุผล เช่น label ชำรุด, ติดผิดชิ้น, อ่านไม่ได้ ฯลฯ (อย่างน้อย 5 ตัวอักษร)"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
      </div>

      <div className="flex justify-end gap-3 border-t pt-4">
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">ยกเลิก</button>
        <button type="submit" disabled={saving || selectedItems.size === 0}
          className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'กำลังส่ง...' : `ส่งคำขอปริ้นซ้ำ (${selectedItems.size})`}
        </button>
      </div>
    </form>
  );
}

/* ── Execute Reprint Form (with Print Preview) ── */
function ReprintExecuteForm({ reprintRequest, onSuccess, onCancel }: {
  reprintRequest: LabelReprintRequest; onSuccess: () => void; onCancel: () => void;
}) {
  const [detail, setDetail] = useState<LabelReprintRequest | null>(null);
  const [paperSize, setPaperSize] = useState('50x30');
  const [labelTemplate, setLabelTemplate] = useState<LabelTemplate>('combined');
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    labelService.showReprintRequest(reprintRequest.id)
      .then(r => setDetail(r.data))
      .catch(() => toast('โหลดข้อมูลไม่สำเร็จ', 'error'));
  }, [reprintRequest.id]);

  const handleConfirmPrint = async () => {
    if (!detail?.inventories?.length) return;
    setPrinting(true);
    try {
      // Open print window first
      openPrintWindow(detail.inventories, paperSize, labelTemplate, detail.production_order?.order_number || '');

      // Then record the reprint on the server
      const res = await labelService.reprint({
        reprint_request_id: reprintRequest.id,
        inventory_ids: detail.inventories.map(i => i.id),
        paper_size: paperSize,
      });
      toast(res.message || 'ปริ้นซ้ำสำเร็จ', 'success');
      onSuccess();
    } catch (err: unknown) {
      const ax = err as AxiosError<{ message: string }>;
      toast(ax.response?.data?.message || 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setPrinting(false);
    }
  };

  if (!detail) return <p className="py-8 text-center text-sm text-gray-400">กำลังโหลด...</p>;

  const items = detail.inventories || [];
  const paperLabel = PAPER_SIZES.find(p => p.value === paperSize)?.label || paperSize;
  const templateLabel = LABEL_TEMPLATES.find(t => t.value === labelTemplate)?.label || labelTemplate;
  const isSplit = labelTemplate === 'split';

  return (
    <div className="space-y-4">
      {/* Info header */}
      <div className="rounded bg-gray-50 p-3 text-sm">
        <div className="grid gap-2 sm:grid-cols-2">
          <div><span className="text-gray-500">เหตุผล:</span> {detail.reason}</div>
          {detail.production_order && (
            <div><span className="text-gray-500">ใบสั่งผลิต:</span> {detail.production_order.order_number}</div>
          )}
          <div><span className="text-gray-500">จำนวน:</span> {items.length} รายการ</div>
        </div>
      </div>

      {/* Paper size & Template */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-gray-500">ขนาดกระดาษ</label>
          <select value={paperSize} onChange={e => setPaperSize(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
            {PAPER_SIZES.map(ps => <option key={ps.value} value={ps.value}>{ps.label}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">รูปแบบ Label</label>
          <select value={labelTemplate} onChange={e => setLabelTemplate(e.target.value as LabelTemplate)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
            {LABEL_TEMPLATES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>

      {/* Preview grid */}
      <div>
        <p className="mb-2 text-sm font-medium text-gray-700">ตัวอย่าง Label ({items.length} รายการ{isSplit ? ` (${items.length * 2} แผ่น)` : ''}) | {templateLabel} | ขนาด: {paperLabel}</p>
        <div className="max-h-80 overflow-y-auto rounded-lg border bg-gray-50 p-4">
          <div className={`grid gap-3 ${isSplit ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'}`}>
            {isSplit
              ? items.flatMap(inv => [
                  /* Barcode card */
                  <div key={`bc-${inv.id}`} className="relative flex flex-col items-center justify-center rounded-lg border border-dashed border-orange-300 bg-orange-50 p-4 text-center shadow-sm">
                    <span className="absolute top-1 right-1 rounded bg-orange-200 px-1.5 py-0.5 text-[8px] font-semibold text-orange-700">ปริ้นซ้ำ</span>
                    <svg className="mb-2" width="140" height="50" viewBox="0 0 140 50">
                      {Array.from({ length: 50 }, (_, i) => {
                        const charCode = inv.serial_number.charCodeAt(i % inv.serial_number.length) || 0;
                        const w = (charCode % 2) + 1;
                        return i % 2 === 0 ? <rect key={i} x={i * 2.8} y={0} width={w} height={50} fill="#000" /> : null;
                      })}
                    </svg>
                    <div className="border border-gray-800 px-2 py-0.5">
                      <p className="font-mono text-[9px] font-bold text-gray-900">{inv.serial_number}</p>
                    </div>
                    <p className="mt-1 text-[7px] text-gray-400">แผ่นที่ 1 - Barcode</p>
                  </div>,
                  /* Detail card */
                  <div key={`dt-${inv.id}`} className="relative flex flex-col items-center justify-center rounded-lg border border-dashed border-orange-300 bg-orange-50 p-4 text-center shadow-sm">
                    <span className="absolute top-1 right-1 rounded bg-orange-200 px-1.5 py-0.5 text-[8px] font-semibold text-orange-700">ปริ้นซ้ำ</span>
                    {detail.production_order && (
                      <p className="mb-2 text-xs font-bold text-gray-800">{detail.production_order.order_number}</p>
                    )}
                    <div className="mb-2 border border-gray-800 px-2 py-0.5">
                      <p className="font-mono text-[9px] font-bold text-gray-900">{inv.serial_number}</p>
                    </div>
                    <p className="text-[10px] text-gray-700 leading-tight">{inv.product?.name || '-'}</p>
                    <p className="mt-1 text-[7px] text-gray-400">แผ่นที่ 2 - รายละเอียด</p>
                  </div>,
                ])
              : items.map(inv => (
                  <div key={inv.id} className="relative flex flex-col items-center rounded-lg border border-dashed border-orange-300 bg-orange-50 p-4 text-center shadow-sm">
                    <span className="absolute top-1 right-1 rounded bg-orange-200 px-1.5 py-0.5 text-[8px] font-semibold text-orange-700">ปริ้นซ้ำ</span>
                    {detail.production_order && (
                      <p className="mb-2 text-xs font-bold text-gray-800">{detail.production_order.order_number}</p>
                    )}
                    <svg className="mb-1.5" width="140" height="40" viewBox="0 0 140 40">
                      {Array.from({ length: 50 }, (_, i) => {
                        const charCode = inv.serial_number.charCodeAt(i % inv.serial_number.length) || 0;
                        const w = (charCode % 2) + 1;
                        return i % 2 === 0 ? <rect key={i} x={i * 2.8} y={0} width={w} height={40} fill="#000" /> : null;
                      })}
                    </svg>
                    <div className="mb-2 border border-gray-800 px-2 py-0.5">
                      <p className="font-mono text-[9px] font-bold text-gray-900">{inv.serial_number}</p>
                    </div>
                    <p className="text-[10px] text-gray-700 leading-tight">{inv.product?.name || '-'}</p>
                  </div>
                ))
            }
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between border-t pt-4">
        <button onClick={onCancel}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          ยกเลิก
        </button>
        <button onClick={handleConfirmPrint} disabled={printing || items.length === 0}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          <Printer size={16} /> {printing ? 'กำลังบันทึก...' : `ยืนยันและปริ้น (${items.length}${isSplit ? ` × 2 แผ่น` : ''})`}
        </button>
      </div>
    </div>
  );
}

/* ── Open browser print window for reprint ── */
function openPrintWindow(items: Inventory[], paperSize: string, template: LabelTemplate, poOrderNumber: string) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) { toast('ไม่สามารถเปิดหน้าต่างปริ้นได้ กรุณาอนุญาต popup', 'error'); return; }

  const isSplit = template === 'split';

  const labelsHtml = isSplit
    ? items.map(inv => `
      <div class="label">
        <div class="barcode barcode-large">
          ${generateReprintBarcodeSvg(inv.serial_number)}
        </div>
        <div class="serial-box">
          <span>${inv.serial_number}</span>
        </div>
      </div>
      <div class="label">
        ${poOrderNumber ? `<div class="po-number">${poOrderNumber}</div>` : ''}
        <div class="serial-box">
          <span>${inv.serial_number}</span>
        </div>
        <div class="product-name">${inv.product?.name || '-'}</div>
      </div>
    `).join('')
    : items.map(inv => `
      <div class="label">
        ${poOrderNumber ? `<div class="po-number">${poOrderNumber}</div>` : ''}
        <div class="barcode">
          ${generateReprintBarcodeSvg(inv.serial_number)}
        </div>
        <div class="serial-box">
          <span>${inv.serial_number}</span>
        </div>
        <div class="product-name">${inv.product?.name || '-'}</div>
      </div>
    `).join('');

  const [w, h] = paperSize.split('x').map(Number);

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Reprint Labels${poOrderNumber ? ` - ${poOrderNumber}` : ''}</title>
      <style>
        @page { size: ${w}mm ${h}mm; margin: 0; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', Tahoma, sans-serif; }
        .label {
          width: ${w}mm;
          height: ${h}mm;
          padding: 2mm 3mm;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          page-break-after: always;
          text-align: center;
        }
        .label:last-child { page-break-after: auto; }
        .po-number {
          font-size: 9pt;
          font-weight: bold;
          color: #000;
          margin-bottom: 2mm;
          letter-spacing: 0.5px;
        }
        .barcode { margin: 1mm 0; }
        .barcode svg { width: ${Math.min(w - 8, 48)}mm; height: ${Math.min(h * 0.35, 14)}mm; }
        .barcode-large svg { width: ${Math.min(w - 6, 55)}mm; height: ${Math.min(h * 0.5, 20)}mm; }
        .serial-box {
          margin-top: 1.5mm;
          border: 1px solid #000;
          padding: 1mm 3mm;
          display: inline-block;
        }
        .serial-box span {
          font-size: 7pt;
          font-weight: bold;
          font-family: monospace;
          letter-spacing: 0.3px;
        }
        .product-name {
          margin-top: 2mm;
          font-size: 7pt;
          color: #000;
        }
        @media screen {
          body { background: #f3f4f6; padding: 20px; display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
          .label { background: white; border: 1px solid #d1d5db; border-radius: 4px; page-break-after: unset; }
        }
      </style>
    </head>
    <body>${labelsHtml}</body>
    </html>
  `);
  printWindow.document.close();
  setTimeout(() => { printWindow.print(); }, 300);
}

/* ── Generate barcode SVG string for reprint labels ── */
function generateReprintBarcodeSvg(text: string): string {
  const bars: string[] = [];
  let x = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const widths = [
      ((code >> 0) & 1) + 1,
      ((code >> 1) & 1) + 1,
      ((code >> 2) & 1) + 1,
      ((code >> 3) & 1) + 1,
    ];
    for (let j = 0; j < widths.length; j++) {
      if (j % 2 === 0) {
        bars.push(`<rect x="${x}" y="0" width="${widths[j]}" height="40" fill="#000"/>`);
      }
      x += widths[j];
    }
  }
  return `<svg viewBox="0 0 ${x} 40" xmlns="http://www.w3.org/2000/svg">${bars.join('')}</svg>`;
}
