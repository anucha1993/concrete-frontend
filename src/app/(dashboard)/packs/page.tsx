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
import { packService, PackFilters } from '@/services/pack.service';
import { productService } from '@/services/product.service';
import type { Pack, PackPayload, PackItemPayload, Product } from '@/lib/types';
import { Plus, Search, Pencil, Trash2, PlusCircle, X } from 'lucide-react';
import { AxiosError } from 'axios';

export default function PacksPage() {
  return (
    <AuthGuard permission="view_products">
      <PacksContent />
    </AuthGuard>
  );
}

/* ─────────────────────────── Main Content ─────────────────────────── */
function PacksContent() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('manage_products');

  // Data
  const [packs, setPacks] = useState<Pack[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, per_page: 15, total: 0 });
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPack, setEditingPack] = useState<Pack | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Pack | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /* ── fetch ── */
  const fetchPacks = useCallback(async () => {
    setLoading(true);
    try {
      const filters: PackFilters = { page, per_page: 15 };
      if (search) filters.search = search;
      if (filterStatus !== '') filters.is_active = filterStatus === '1';

      const res = await packService.list(filters);
      setPacks(res.data);
      setMeta(res.meta);
    } catch {
      toast('โหลดข้อมูลแพสินค้าไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, search, filterStatus]);

  useEffect(() => { fetchPacks(); }, [fetchPacks]);

  useEffect(() => {
    productService.list({ per_page: 9999, is_active: true }).then((r) => setAllProducts(r.data)).catch(() => {});
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => { e.preventDefault(); setPage(1); fetchPacks(); };

  const openCreate = () => { setEditingPack(null); setModalOpen(true); };
  const openEdit = (pack: Pack) => { setEditingPack(pack); setModalOpen(true); };

  const handleSave = async (payload: PackPayload) => {
    setSaving(true);
    try {
      if (editingPack) {
        await packService.update(editingPack.id, payload);
        toast('อัปเดตแพสินค้าสำเร็จ', 'success');
      } else {
        await packService.create(payload);
        toast('สร้างแพสินค้าสำเร็จ', 'success');
      }
      setModalOpen(false);
      fetchPacks();
    } catch (err: unknown) {
      const axiosErr = err as AxiosError<{ message: string; errors?: Record<string, string[]> }>;
      const errors = axiosErr.response?.data?.errors;
      if (errors) {
        toast(Object.values(errors).flat()[0], 'error');
      } else {
        toast(axiosErr.response?.data?.message || 'เกิดข้อผิดพลาด', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await packService.delete(deleteTarget.id);
      toast('ลบแพสินค้าสำเร็จ', 'success');
      setDeleteTarget(null);
      fetchPacks();
    } catch {
      toast('ลบไม่สำเร็จ', 'error');
    } finally {
      setDeleting(false);
    }
  };

  /* ── table columns ── */
  const columns = [
    { key: 'code', label: 'รหัสแพ', render: (p: Pack) => <span className="font-mono text-sm">{p.code}</span> },
    { key: 'name', label: 'ชื่อแพ' },
    {
      key: 'items_count', label: 'จำนวนรายการ',
      render: (p: Pack) => <span>{p.items_count ?? p.items?.length ?? 0} รายการ</span>,
    },
    {
      key: 'items_detail', label: 'รายการสินค้า',
      render: (p: Pack) => {
        const unitTh: Record<string, string> = { meter: 'ม.', centimeter: 'ซม.', millimeter: 'มม.', inch: 'นิ้ว' };
        return (
          <div className="space-y-0.5 text-sm">
            {p.items && p.items.length > 0 ? p.items.map((item, i) => {
              const pr = item.product;
              const dims: string[] = [];
              if (pr?.width) dims.push(`หน้าตัด ${pr.width}`);
              if (pr?.length) dims.push(`ยาว ${pr.length} ${unitTh[pr.length_unit] || pr.length_unit || ''}`);
              if (pr?.thickness) dims.push(`หนา ${pr.thickness} ${unitTh[pr.thickness_unit] || pr.thickness_unit || ''}`);
              const sizeStr = dims.length ? ` (${dims.join(', ')})` : '';
              return (
                <div key={i} className="text-gray-700">
                  <span>{pr?.name || `#${item.product_id}`}{sizeStr}</span>
                  <span className="ml-1 text-blue-600 font-medium">x{item.quantity}</span>
                </div>
              );
            }) : <span className="text-gray-400">-</span>}
          </div>
        );
      },
    },
    {
      key: 'is_active', label: 'สถานะ',
      render: (p: Pack) => <Badge variant={p.is_active ? 'success' : 'danger'}>{p.is_active ? 'ใช้งาน' : 'ปิดใช้งาน'}</Badge>,
    },
    ...(canManage ? [{
      key: 'actions', label: '',
      render: (p: Pack) => (
        <div className="flex gap-1">
          <button onClick={() => openEdit(p)} className="rounded p-1.5 text-blue-600 hover:bg-blue-50" title="แก้ไข"><Pencil size={16} /></button>
          <button onClick={() => setDeleteTarget(p)} className="rounded p-1.5 text-red-600 hover:bg-red-50" title="ลบ"><Trash2 size={16} /></button>
        </div>
      ),
    }] : []),
  ];

  return (
    <div>
      <PageHeader title="จัดการแพสินค้า" description="สร้างและจัดการแพ (ชุดสินค้า)" actions={
        canManage ? (
          <button onClick={openCreate} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Plus size={18} /> เพิ่มแพสินค้า
          </button>
        ) : undefined
      } />

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="ค้นหาชื่อหรือรหัสแพ..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none" />
          </div>
          <button type="submit" className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">ค้นหา</button>
        </form>
        <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
          <option value="">ทุกสถานะ</option>
          <option value="1">ใช้งาน</option>
          <option value="0">ปิดใช้งาน</option>
        </select>
      </div>

      <DataTable columns={columns} data={packs} loading={loading} emptyMessage="ไม่พบแพสินค้า" />
      <Pagination currentPage={meta.current_page} lastPage={meta.last_page} total={meta.total} onPageChange={setPage} />

      {/* Create/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingPack ? 'แก้ไขแพสินค้า' : 'สร้างแพสินค้าใหม่'} size="lg">
        <PackForm pack={editingPack} products={allProducts} onSubmit={handleSave} onCancel={() => setModalOpen(false)} saving={saving} />
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="ยืนยันการลบ"
        message={`ต้องการลบแพ "${deleteTarget?.name}" หรือไม่?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </div>
  );
}

/* ─────────────────────────── Pack Form ─────────────────────────── */
interface PackFormProps {
  pack: Pack | null;
  products: Product[];
  onSubmit: (payload: PackPayload) => void;
  onCancel: () => void;
  saving: boolean;
}

function PackForm({ pack, products, onSubmit, onCancel, saving }: PackFormProps) {
  const [code, setCode] = useState(pack?.code || '');
  const [name, setName] = useState(pack?.name || '');
  const [description, setDescription] = useState(pack?.description || '');
  const [isActive, setIsActive] = useState(pack?.is_active ?? true);
  const [items, setItems] = useState<PackItemPayload[]>(
    pack?.items?.map((i) => ({ product_id: i.product_id, quantity: i.quantity })) || [{ product_id: 0, quantity: 1 }]
  );

  /* ── item helpers ── */
  const addRow = () => setItems([...items, { product_id: 0, quantity: 1 }]);

  const removeRow = (idx: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, field: keyof PackItemPayload, value: number) => {
    const next = [...items];
    next[idx] = { ...next[idx], [field]: value };
    setItems(next);
  };

  /* ── submit ── */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate at least 1 item with a product selected
    const validItems = items.filter((i) => i.product_id > 0);
    if (validItems.length === 0) {
      toast('กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ', 'error');
      return;
    }

    // Check duplicate products
    const productIds = validItems.map((i) => i.product_id);
    if (new Set(productIds).size !== productIds.length) {
      toast('พบสินค้าซ้ำในรายการ กรุณาตรวจสอบ', 'error');
      return;
    }

    onSubmit({
      code,
      name,
      description: description || undefined,
      is_active: isActive,
      items: validItems,
    });
  };

  /* ── product search helper ── */
  const unitThai: Record<string, string> = {
    meter: 'เมตร', centimeter: 'เซนติเมตร', millimeter: 'มิลลิเมตร', inch: 'นิ้ว',
  };
  const getProductLabel = (p: Product) => {
    const parts = [p.product_code, p.name];
    const dims: string[] = [];
    if (p.width) dims.push(`หน้าตัด ${p.width}`);
    if (p.length) dims.push(`ยาว ${p.length} ${unitThai[p.length_unit] || p.length_unit || ''}`);
    if (p.thickness) dims.push(`หนา ${p.thickness} ${unitThai[p.thickness_unit] || p.thickness_unit || ''}`);
    if (dims.length) parts.push(`(${dims.join(', ')})`);
    return parts.join(' - ');
  };

  /* ── selected ids (to disable already-chosen products) ── */
  const selectedIds = new Set(items.map((i) => i.product_id).filter(Boolean));

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Basic info */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">รหัสแพ *</label>
          <input type="text" required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="เช่น PK001" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">ชื่อแพ *</label>
          <input type="text" required value={name} onChange={(e) => setName(e.target.value)}
            placeholder="ชื่อแพสินค้า" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">คำอธิบาย</label>
        <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
      </div>

      <div className="flex items-center gap-2">
        <input type="checkbox" id="pack-active" checked={isActive} onChange={(e) => setIsActive(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
        <label htmlFor="pack-active" className="text-sm text-gray-700">เปิดใช้งาน</label>
      </div>

      {/* Dynamic Items */}
      <fieldset className="rounded-lg border border-gray-200 p-4">
        <legend className="px-2 text-sm font-semibold text-gray-700">รายการสินค้าในแพ *</legend>

        <div className="space-y-3">
          {/* Header */}
          <div className="hidden sm:grid sm:grid-cols-12 sm:gap-2 text-xs font-medium text-gray-500 px-1">
            <div className="col-span-1">#</div>
            <div className="col-span-7">สินค้า</div>
            <div className="col-span-3">จำนวน</div>
            <div className="col-span-1"></div>
          </div>

          {items.map((item, idx) => (
            <div key={idx} className="grid grid-cols-12 items-center gap-2">
              {/* Row number */}
              <div className="col-span-1 text-center text-sm text-gray-400">{idx + 1}</div>

              {/* Product Select */}
              <div className="col-span-7">
                <select
                  value={item.product_id}
                  onChange={(e) => updateItem(idx, 'product_id', Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value={0}>-- เลือกสินค้า --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id} disabled={selectedIds.has(p.id) && item.product_id !== p.id}>
                      {getProductLabel(p)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Quantity */}
              <div className="col-span-3">
                <input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(idx, 'quantity', Math.max(1, Number(e.target.value)))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>

              {/* Remove */}
              <div className="col-span-1 text-center">
                <button type="button" onClick={() => removeRow(idx)} disabled={items.length <= 1}
                  className="rounded p-1 text-red-500 hover:bg-red-50 disabled:text-gray-300 disabled:hover:bg-transparent" title="ลบรายการ">
                  <X size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Add row button */}
        <button type="button" onClick={addRow}
          className="mt-3 flex items-center gap-1.5 rounded-lg border border-dashed border-blue-400 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50">
          <PlusCircle size={16} /> เพิ่มสินค้า
        </button>
      </fieldset>

      {/* Actions */}
      <div className="flex justify-end gap-3 border-t pt-4">
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">ยกเลิก</button>
        <button type="submit" disabled={saving}
          className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
      </div>
    </form>
  );
}
