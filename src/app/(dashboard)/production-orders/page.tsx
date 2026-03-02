'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import AuthGuard from '@/components/AuthGuard';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import Pagination from '@/components/ui/Pagination';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { productionOrderService } from '@/services/production-order.service';
import { packService } from '@/services/pack.service';
import { locationService } from '@/services/master.service';
import type { ProductionOrder, ProductionOrderPayload, ReceivePayload, ProductionSerial, Pack, Location } from '@/lib/types';
import { Plus, Search, Eye, Play, CheckCircle, XCircle, PackageCheck, ClipboardList } from 'lucide-react';
import { AxiosError } from 'axios';

const STATUS_MAP: Record<string, { label: string; variant: 'gray' | 'info' | 'warning' | 'success' | 'danger' }> = {
  DRAFT:       { label: 'แบบร่าง', variant: 'gray' },
  CONFIRMED:   { label: 'ยืนยันแล้ว', variant: 'info' },
  IN_PROGRESS: { label: 'กำลังผลิต', variant: 'warning' },
  COMPLETED:   { label: 'เสร็จสิ้น', variant: 'success' },
  CANCELLED:   { label: 'ยกเลิก', variant: 'danger' },
};

export default function ProductionOrdersPage() {
  return (
    <AuthGuard permission="view_production">
      <ProductionOrdersContent />
    </AuthGuard>
  );
}

function ProductionOrdersContent() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('manage_production');

  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, per_page: 15, total: 0 });
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [viewOrder, setViewOrder] = useState<ProductionOrder | null>(null);
  const [receiveOrder, setReceiveOrder] = useState<ProductionOrder | null>(null);
  const [serialsOrder, setSerialsOrder] = useState<ProductionOrder | null>(null);
  const [serials, setSerials] = useState<ProductionSerial[]>([]);
  const [cancelTarget, setCancelTarget] = useState<ProductionOrder | null>(null);

  const [saving, setSaving] = useState(false);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, per_page: 15 };
      if (search) params.search = search;
      if (filterStatus) params.status = filterStatus;
      const res = await productionOrderService.list(params);
      setOrders(res.data);
      setMeta(res.meta);
    } catch {
      toast('โหลดข้อมูลใบสั่งผลิตไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, search, filterStatus]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  useEffect(() => {
    packService.list({ per_page: 9999, is_active: true }).then(r => setPacks(r.data)).catch(() => {});
    locationService.list(true).then(r => setLocations(r.data)).catch(() => {});
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => { e.preventDefault(); setPage(1); fetchOrders(); };

  /* ── Actions ── */
  const handleCreate = async (payload: ProductionOrderPayload) => {
    setSaving(true);
    try {
      await productionOrderService.create(payload);
      toast('สร้างใบสั่งผลิตสำเร็จ', 'success');
      setCreateOpen(false);
      fetchOrders();
    } catch (err: unknown) {
      const ax = err as AxiosError<{ message: string; errors?: Record<string, string[]> }>;
      const errors = ax.response?.data?.errors;
      if (errors) toast(Object.values(errors).flat()[0], 'error');
      else toast(ax.response?.data?.message || 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async (o: ProductionOrder) => {
    try {
      await productionOrderService.confirm(o.id);
      toast('ยืนยันใบสั่งผลิตสำเร็จ', 'success');
      fetchOrders();
      setViewOrder(null);
    } catch { toast('ไม่สามารถยืนยันได้', 'error'); }
  };

  const handleStart = async (o: ProductionOrder) => {
    try {
      await productionOrderService.start(o.id);
      toast('เริ่มผลิตแล้ว', 'success');
      fetchOrders();
      setViewOrder(null);
    } catch { toast('ไม่สามารถเริ่มผลิตได้', 'error'); }
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    try {
      await productionOrderService.cancel(cancelTarget.id);
      toast('ยกเลิกใบสั่งผลิตแล้ว', 'success');
      setCancelTarget(null);
      fetchOrders();
    } catch { toast('ไม่สามารถยกเลิกได้', 'error'); }
  };

  const openSerials = async (o: ProductionOrder) => {
    try {
      const res = await productionOrderService.serials(o.id);
      setSerials(res.data);
      setSerialsOrder(o);
    } catch { toast('โหลด serial ไม่สำเร็จ', 'error'); }
  };

  const openReceive = async (o: ProductionOrder) => {
    try {
      // Re-fetch latest order data to get updated good_qty from verified labels
      const res = await productionOrderService.get(o.id);
      setReceiveOrder(res.data);
    } catch { toast('โหลดข้อมูลไม่สำเร็จ', 'error'); }
  };

  const handleReceive = async (payload: ReceivePayload) => {
    if (!receiveOrder) return;
    setSaving(true);
    try {
      await productionOrderService.receive(receiveOrder.id, payload);
      toast('รับสินค้าเข้าคลังสำเร็จ', 'success');
      setReceiveOrder(null);
      fetchOrders();
    } catch (err: unknown) {
      const ax = err as AxiosError<{ message: string }>;
      toast(ax.response?.data?.message || 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setSaving(false);
    }
  };

  /* ── Columns ── */
  const columns = [
    {
      key: 'order_number', label: 'เลขที่ใบสั่งผลิต',
      render: (o: ProductionOrder) => <span className="font-mono text-sm font-medium">{o.order_number}</span>,
    },
    {
      key: 'pack', label: 'แพสินค้า',
      render: (o: ProductionOrder) => <span>{o.pack?.name || '-'}</span>,
    },
    {
      key: 'quantity', label: 'จำนวนชุด',
      render: (o: ProductionOrder) => <span>{o.quantity} ชุด</span>,
    },
    {
      key: 'serials_count', label: 'Serial ทั้งหมด',
      render: (o: ProductionOrder) => <span>{o.serials_count ?? 0} ชิ้น</span>,
    },
    {
      key: 'status', label: 'สถานะ',
      render: (o: ProductionOrder) => {
        const s = STATUS_MAP[o.status] || { label: o.status, variant: 'gray' as const };
        return <Badge variant={s.variant}>{s.label}</Badge>;
      },
    },
    {
      key: 'created_at', label: 'วันที่สร้าง',
      render: (o: ProductionOrder) => <span className="text-sm text-gray-500">{new Date(o.created_at).toLocaleDateString('th-TH')}</span>,
    },
    {
      key: 'actions', label: '',
      render: (o: ProductionOrder) => (
        <div className="flex gap-1">
          <button onClick={() => setViewOrder(o)} className="rounded p-1.5 text-gray-600 hover:bg-gray-100" title="ดูรายละเอียด"><Eye size={16} /></button>
          <button onClick={() => openSerials(o)} className="rounded p-1.5 text-purple-600 hover:bg-purple-50" title="ดู Serial"><ClipboardList size={16} /></button>
          {canManage && o.status === 'DRAFT' && (
            <button onClick={() => handleConfirm(o)} className="rounded p-1.5 text-blue-600 hover:bg-blue-50" title="ยืนยัน"><CheckCircle size={16} /></button>
          )}
          {canManage && o.status === 'CONFIRMED' && (
            <button onClick={() => handleStart(o)} className="rounded p-1.5 text-green-600 hover:bg-green-50" title="เริ่มผลิต"><Play size={16} /></button>
          )}
          {canManage && o.status === 'IN_PROGRESS' && (
            <button onClick={() => openReceive(o)} className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50" title="รับเข้าคลัง"><PackageCheck size={16} /></button>
          )}
          {canManage && !['COMPLETED', 'CANCELLED'].includes(o.status) && (
            <button onClick={() => setCancelTarget(o)} className="rounded p-1.5 text-red-600 hover:bg-red-50" title="ยกเลิก"><XCircle size={16} /></button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="ใบสั่งผลิตสินค้า" description="สร้างใบสั่งผลิต, generate serial, รับเข้าคลัง" actions={
        canManage ? (
          <button onClick={() => setCreateOpen(true)} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Plus size={18} /> สร้างใบสั่งผลิต
          </button>
        ) : undefined
      } />

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="ค้นหาเลขที่ใบสั่งผลิต..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none" />
          </div>
          <button type="submit" className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">ค้นหา</button>
        </form>
        <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
          <option value="">ทุกสถานะ</option>
          <option value="DRAFT">แบบร่าง</option>
          <option value="CONFIRMED">ยืนยันแล้ว</option>
          <option value="IN_PROGRESS">กำลังผลิต</option>
          <option value="COMPLETED">เสร็จสิ้น</option>
          <option value="CANCELLED">ยกเลิก</option>
        </select>
      </div>

      <DataTable columns={columns} data={orders} loading={loading} emptyMessage="ไม่พบใบสั่งผลิต" />
      <Pagination currentPage={meta.current_page} lastPage={meta.last_page} total={meta.total} onPageChange={setPage} />

      {/* Create Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="สร้างใบสั่งผลิตใหม่" size="md">
        <CreateOrderForm packs={packs} locations={locations} onSubmit={handleCreate} onCancel={() => setCreateOpen(false)} saving={saving} />
      </Modal>

      {/* View Detail Modal */}
      <Modal open={!!viewOrder} onClose={() => setViewOrder(null)} title={`ใบสั่งผลิต ${viewOrder?.order_number || ''}`} size="lg">
        {viewOrder && <OrderDetail order={viewOrder} canManage={canManage} onConfirm={handleConfirm} onStart={handleStart} />}
      </Modal>

      {/* Receive Modal */}
      <Modal open={!!receiveOrder} onClose={() => setReceiveOrder(null)} title={`รับเข้าคลัง - ${receiveOrder?.order_number || ''}`} size="lg">
        {receiveOrder && <ReceiveForm order={receiveOrder} onSubmit={handleReceive} onCancel={() => setReceiveOrder(null)} saving={saving} />}
      </Modal>

      {/* Serials Modal */}
      <Modal open={!!serialsOrder} onClose={() => setSerialsOrder(null)} title={`Serial Numbers - ${serialsOrder?.order_number || ''}`} size="lg">
        <SerialsView serials={serials} />
      </Modal>

      {/* Cancel Confirm */}
      <ConfirmDialog
        open={!!cancelTarget}
        title="ยืนยันยกเลิก"
        message={`ต้องการยกเลิกใบสั่งผลิต "${cancelTarget?.order_number}" หรือไม่? Serial ที่ยังไม่ได้รับเข้าจะถูกลบ`}
        onConfirm={handleCancel}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}

/* ── Create Order Form ── */
function CreateOrderForm({ packs, locations, onSubmit, onCancel, saving }: {
  packs: Pack[]; locations: Location[];
  onSubmit: (p: ProductionOrderPayload) => void; onCancel: () => void; saving: boolean;
}) {
  const [packId, setPackId] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [locationId, setLocationId] = useState(0);
  const [note, setNote] = useState('');

  const selectedPack = packs.find(p => p.id === packId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!packId) { toast('กรุณาเลือกแพสินค้า', 'error'); return; }
    onSubmit({
      pack_id: packId,
      quantity,
      note: note || undefined,
      location_id: locationId || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">แพสินค้า *</label>
        <select value={packId} onChange={e => setPackId(Number(e.target.value))}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
          <option value={0}>-- เลือกแพสินค้า --</option>
          {packs.map(p => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
        </select>
      </div>

      {selectedPack?.items && (
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="mb-2 text-xs font-medium text-gray-500">สินค้าในแพ:</p>
          {selectedPack.items.map((it, i) => (
            <div key={i} className="text-sm text-gray-700">
              {it.product?.product_code} - {it.product?.name} <span className="text-blue-600 font-medium">x{it.quantity}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">จำนวนชุด *</label>
          <input type="number" min={1} value={quantity} onChange={e => setQuantity(Math.max(1, Number(e.target.value)))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">คลังจัดเก็บ</label>
          <select value={locationId} onChange={e => setLocationId(Number(e.target.value))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
            <option value={0}>-- ใช้ค่าเริ่มต้นของสินค้า --</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.code} - {l.name}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">หมายเหตุ</label>
        <textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
      </div>

      {selectedPack?.items && quantity > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          <p className="font-medium">สรุป: จะสร้าง Serial ทั้งหมด {selectedPack.items.reduce((sum, it) => sum + it.quantity * quantity, 0)} ชิ้น</p>
        </div>
      )}

      <div className="flex justify-end gap-3 border-t pt-4">
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">ยกเลิก</button>
        <button type="submit" disabled={saving}
          className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'กำลังสร้าง...' : 'สร้างใบสั่งผลิต'}
        </button>
      </div>
    </form>
  );
}

/* ── Order Detail ── */
function OrderDetail({ order, canManage, onConfirm, onStart }: {
  order: ProductionOrder; canManage: boolean;
  onConfirm: (o: ProductionOrder) => void; onStart: (o: ProductionOrder) => void;
}) {
  const s = STATUS_MAP[order.status];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 text-sm">
        <div><span className="text-gray-500">เลขที่:</span> <span className="font-mono font-medium">{order.order_number}</span></div>
        <div><span className="text-gray-500">สถานะ:</span> <Badge variant={s?.variant || 'gray'}>{s?.label || order.status}</Badge></div>
        <div><span className="text-gray-500">แพสินค้า:</span> {order.pack?.name || '-'}</div>
        <div><span className="text-gray-500">จำนวนชุด:</span> {order.quantity}</div>
        <div><span className="text-gray-500">ผู้สร้าง:</span> {order.creator?.name || '-'}</div>
        <div><span className="text-gray-500">วันที่สร้าง:</span> {new Date(order.created_at).toLocaleString('th-TH')}</div>
        {order.confirmed_at && <div><span className="text-gray-500">ยืนยันเมื่อ:</span> {new Date(order.confirmed_at).toLocaleString('th-TH')}</div>}
        {order.completed_at && <div><span className="text-gray-500">เสร็จเมื่อ:</span> {new Date(order.completed_at).toLocaleString('th-TH')}</div>}
      </div>

      {order.note && <div className="rounded bg-gray-50 p-3 text-sm"><span className="text-gray-500">หมายเหตุ:</span> {order.note}</div>}

      {/* Items */}
      {order.items && order.items.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-gray-700">รายการสินค้า</h4>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">สินค้า</th>
                <th className="px-3 py-2 text-right">แผน</th>
                <th className="px-3 py-2 text-right">ของดี</th>
                <th className="px-3 py-2 text-right">ชำรุด</th>
                <th className="px-3 py-2 text-right">รวมรับ</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map(it => (
                <tr key={it.id} className="border-t">
                  <td className="px-3 py-2">{it.product?.product_code} - {it.product?.name}</td>
                  <td className="px-3 py-2 text-right">{it.planned_qty}</td>
                  <td className="px-3 py-2 text-right text-green-600">{it.good_qty}</td>
                  <td className="px-3 py-2 text-right text-red-600">{it.damaged_qty}</td>
                  <td className="px-3 py-2 text-right font-medium">{it.received_qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Action buttons */}
      {canManage && (
        <div className="flex gap-2 border-t pt-4">
          {order.status === 'DRAFT' && (
            <button onClick={() => onConfirm(order)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              <CheckCircle size={16} className="mr-1 inline" /> ยืนยันใบสั่งผลิต
            </button>
          )}
          {order.status === 'CONFIRMED' && (
            <button onClick={() => onStart(order)} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
              <Play size={16} className="mr-1 inline" /> เริ่มผลิต
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Receive Form ── */
function ReceiveForm({ order, onSubmit, onCancel, saving }: {
  order: ProductionOrder;
  onSubmit: (p: ReceivePayload) => void; onCancel: () => void; saving: boolean;
}) {
  const [note, setNote] = useState('');
  const [items, setItems] = useState(
    (order.items || []).map(it => ({
      production_order_item_id: it.id,
      product_name: `${it.product?.product_code || ''} - ${it.product?.name || ''}`,
      planned_qty: it.planned_qty,
      verified_qty: it.verified_qty ?? 0,  // from verified labels (read-only)
      damaged_qty: it.planned_qty - (it.verified_qty ?? 0), // auto-fill remaining as damaged
    }))
  );

  const updateDamaged = (idx: number, val: number) => {
    const next = [...items];
    const maxDamaged = next[idx].planned_qty - next[idx].verified_qty;
    next[idx] = { ...next[idx], damaged_qty: Math.max(0, Math.min(val, maxDamaged)) };
    setItems(next);
  };

  // Validate: verified + damaged must equal planned for ALL items
  const allMatch = items.every(it => (it.verified_qty + it.damaged_qty) === it.planned_qty);
  const hasItems = items.some(it => it.damaged_qty > 0 || it.verified_qty > 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!allMatch) { toast('ยอดยืนยัน + ชำรุด ต้องเท่ากับยอดแผนทุกรายการ', 'error'); return; }

    onSubmit({
      items: items.map(it => ({
        production_order_item_id: it.production_order_item_id,
        damaged_qty: it.damaged_qty,
      })),
      note: note || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
        <p className="font-medium">** ยืนยันแล้ว = จำนวนที่ยิง Barcode ยืนยันแล้ว (แก้ไขไม่ได้)</p>
        <p>ชำรุด = จำนวนที่เหลือจากยอดแผน − ยืนยัน (ระบุได้)</p>
        <p>ยอดยืนยัน + ชำรุด ต้องเท่ากับยอดแผนถึงจะกดรับเข้าคลังได้</p>
        <p>คลังจัดเก็บใช้ตามที่กำหนดไว้ตอนสร้างใบสั่งผลิต</p>
      </div>

      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left">สินค้า</th>
            <th className="px-3 py-2 text-right">แผน</th>
            <th className="px-3 py-2 text-right">ยืนยันแล้ว</th>
            <th className="px-3 py-2 text-center">ชำรุด</th>
            <th className="px-3 py-2 text-center">สถานะ</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, idx) => {
            const remaining = it.planned_qty - it.verified_qty;
            const isMatch = (it.verified_qty + it.damaged_qty) === it.planned_qty;
            return (
              <tr key={it.production_order_item_id} className="border-t">
                <td className="px-3 py-2">{it.product_name}</td>
                <td className="px-3 py-2 text-right">{it.planned_qty}</td>
                <td className="px-3 py-2 text-right">
                  <span className="inline-flex items-center gap-1 font-semibold text-green-600">
                    {it.verified_qty}
                    <span className="text-xs font-normal text-gray-400">(Barcode)</span>
                  </span>
                </td>
                <td className="px-3 py-2">
                  <input type="number" min={0} max={remaining} value={it.damaged_qty}
                    onChange={e => updateDamaged(idx, Number(e.target.value))}
                    className="w-20 rounded border border-gray-300 px-2 py-1 text-center text-sm focus:border-blue-500 focus:outline-none" />
                </td>
                <td className="px-3 py-2 text-center">
                  {isMatch
                    ? <span className="text-green-600 font-medium text-xs">✓ ตรง</span>
                    : <span className="text-red-500 font-medium text-xs">✗ ไม่ตรง ({it.verified_qty + it.damaged_qty}/{it.planned_qty})</span>
                  }
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {!allMatch && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          ยอดยืนยัน + ชำรุด ไม่ตรงกับยอดแผน ไม่สามารถกดรับเข้าคลังได้ กรุณายิง Barcode ให้ครบหรือระบุจำนวนชำรุด
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">หมายเหตุ</label>
        <textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
      </div>

      <div className="flex justify-end gap-3 border-t pt-4">
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">ยกเลิก</button>
        <button type="submit" disabled={saving || !allMatch || !hasItems}
          className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          {saving ? 'กำลังบันทึก...' : 'รับเข้าคลัง'}
        </button>
      </div>
    </form>
  );
}

/* ── Serials View ── */
function SerialsView({ serials }: { serials: ProductionSerial[] }) {
  if (serials.length === 0) return <p className="py-8 text-center text-sm text-gray-400">ไม่มี Serial</p>;

  return (
    <div className="max-h-96 overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left">#</th>
            <th className="px-3 py-2 text-left">Serial Number</th>
            <th className="px-3 py-2 text-left">สินค้า</th>
            <th className="px-3 py-2 text-left">คลัง</th>
            <th className="px-3 py-2 text-center">สภาพ</th>
            <th className="px-3 py-2 text-center">สถานะ</th>
          </tr>
        </thead>
        <tbody>
          {serials.map((s, i) => (
            <tr key={s.id} className="border-t hover:bg-gray-50">
              <td className="px-3 py-2 text-gray-400">{i + 1}</td>
              <td className="px-3 py-2 font-mono text-xs">{s.serial_number}</td>
              <td className="px-3 py-2">{s.product.name}</td>
              <td className="px-3 py-2">{s.location?.name || '-'}</td>
              <td className="px-3 py-2 text-center">
                <Badge variant={s.condition === 'GOOD' ? 'success' : 'danger'}>{s.condition === 'GOOD' ? 'ดี' : 'ชำรุด'}</Badge>
              </td>
              <td className="px-3 py-2 text-center">
                <Badge variant={s.status === 'IN_STOCK' ? 'success' : s.status === 'PENDING' ? 'gray' : s.status === 'DAMAGED' ? 'danger' : 'gray'}>
                  {s.status === 'IN_STOCK' ? 'ในคลัง' : s.status === 'PENDING' ? 'รอรับเข้าคลัง' : s.status === 'DAMAGED' ? 'ชำรุด' : s.status}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
