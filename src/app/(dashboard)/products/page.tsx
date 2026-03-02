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
import { productService, ProductFilters } from '@/services/product.service';
import { categoryService } from '@/services/master.service';
import type { Product, ProductPayload, Category } from '@/lib/types';
import { Plus, Search, Pencil, Trash2 } from 'lucide-react';
import { AxiosError } from 'axios';

export default function ProductsPage() {
  return (
    <AuthGuard permission="view_products">
      <ProductsContent />
    </AuthGuard>
  );
}

function ProductsContent() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('manage_products');

  // Data
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, per_page: 15, total: 0 });
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterSizeType, setFilterSizeType] = useState('');
  const [page, setPage] = useState(1);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const filters: ProductFilters = { page, per_page: 15 };
      if (search) filters.search = search;
      if (filterCategory) filters.category_id = Number(filterCategory);
      if (filterSizeType) filters.size_type = filterSizeType;

      const res = await productService.list(filters);
      setProducts(res.data);
      setMeta(res.meta);
    } catch {
      toast('โหลดข้อมูลสินค้าไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, search, filterCategory, filterSizeType]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    categoryService.list(true).then((r) => setCategories(r.data)).catch(() => {});
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchProducts();
  };

  const openCreate = () => {
    setEditingProduct(null);
    setModalOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setModalOpen(true);
  };

  const handleSave = async (payload: ProductPayload) => {
    setSaving(true);
    try {
      if (editingProduct) {
        await productService.update(editingProduct.id, payload);
        toast('อัปเดตสินค้าสำเร็จ', 'success');
      } else {
        await productService.create(payload);
        toast('สร้างสินค้าสำเร็จ', 'success');
      }
      setModalOpen(false);
      fetchProducts();
    } catch (err: unknown) {
      const axiosErr = err as AxiosError<{ message: string; errors?: Record<string, string[]> }>;
      const errors = axiosErr.response?.data?.errors;
      if (errors) {
        const firstMsg = Object.values(errors).flat()[0];
        toast(firstMsg, 'error');
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
      await productService.delete(deleteTarget.id);
      toast('ลบสินค้าสำเร็จ', 'success');
      setDeleteTarget(null);
      fetchProducts();
    } catch {
      toast('ลบสินค้าไม่สำเร็จ', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    { key: 'product_code', label: 'รหัสสินค้า', render: (p: Product) => (
      <span className="font-mono font-medium text-blue-600">{p.product_code}</span>
    )},
    { key: 'name', label: 'ชื่อสินค้า' },
    { key: 'category', label: 'หมวดหมู่', render: (p: Product) => p.category?.name || '-' },
    { key: 'size_type', label: 'ประเภทไซส์', render: (p: Product) => (
      <Badge variant={p.size_type === 'STANDARD' ? 'info' : 'warning'}>{p.size_type}</Badge>
    )},
    { key: 'stock', label: 'Min / Max', render: (p: Product) => `${p.stock_min} / ${p.stock_max}` },
    { key: 'is_active', label: 'สถานะ', render: (p: Product) => (
      <Badge variant={p.is_active ? 'success' : 'danger'}>{p.is_active ? 'ใช้งาน' : 'ปิดใช้งาน'}</Badge>
    )},
    ...(canManage ? [{
      key: 'actions', label: '', render: (p: Product) => (
        <div className="flex gap-1">
          <button onClick={(e) => { e.stopPropagation(); openEdit(p); }} className="rounded p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600">
            <Pencil size={16} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(p); }} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
            <Trash2 size={16} />
          </button>
        </div>
      )
    }] : []),
  ];

  return (
    <div>
      <PageHeader
        title="จัดการสินค้า"
        description="รายการสินค้าคอนกรีตทั้งหมด"
        actions={canManage ? (
          <button onClick={openCreate} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors">
            <Plus size={18} /> เพิ่มสินค้า
          </button>
        ) : undefined}
      />

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm sm:flex-row sm:items-end">
        <form onSubmit={handleSearchSubmit} className="flex flex-1 gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="ค้นหาชื่อ, รหัสสินค้า, บาร์โค้ด..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <button type="submit" className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium hover:bg-gray-200 transition-colors">
            ค้นหา
          </button>
        </form>

        <select
          value={filterCategory}
          onChange={(e) => { setFilterCategory(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">ทุกหมวดหมู่</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <select
          value={filterSizeType}
          onChange={(e) => { setFilterSizeType(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">ทุกไซส์</option>
          <option value="STANDARD">STANDARD</option>
          <option value="CUSTOM">CUSTOM</option>
        </select>
      </div>

      <DataTable columns={columns} data={products} loading={loading} emptyMessage="ไม่พบสินค้า" />
      <Pagination currentPage={meta.current_page} lastPage={meta.last_page} total={meta.total} onPageChange={setPage} />

      {/* Create / Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingProduct ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'} size="xl">
        <ProductForm
          product={editingProduct}
          categories={categories}
          onSubmit={handleSave}
          onCancel={() => setModalOpen(false)}
          saving={saving}
        />
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="ลบสินค้า"
        message={`ยืนยันการลบสินค้า "${deleteTarget?.name}" (${deleteTarget?.product_code})?`}
        confirmText="ลบ"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </div>
  );
}

// ─── Product Form Component ──────────────────────────────────────
interface ProductFormProps {
  product: Product | null;
  categories: Category[];
  onSubmit: (payload: ProductPayload) => void;
  onCancel: () => void;
  saving: boolean;
}

const UNIT_OPTIONS = [
  { value: 'meter', label: 'เมตร' },
  { value: 'centimeter', label: 'เซนติเมตร' },
  { value: 'millimeter', label: 'มิลลิเมตร' },
  { value: 'inch', label: 'นิ้ว' },
];

const STEEL_TYPE_PRESETS = ['ลวด 4 เส้น', 'ลวด 5 เส้น', 'ลวด 6 เส้น', 'ลวด 7 เส้น'];

function ProductForm({ product, categories, onSubmit, onCancel, saving }: ProductFormProps) {
  const [form, setForm] = useState<ProductPayload>({
    product_code: product?.product_code || '',
    name: product?.name || '',
    category_id: product?.category_id || (categories[0]?.id || 0),
    counting_unit: product?.counting_unit || 'ชิ้น',
    length: product?.length ?? null,
    length_unit: product?.length_unit || 'meter',
    thickness: product?.thickness ?? null,
    thickness_unit: product?.thickness_unit || 'millimeter',
    width: product?.width ?? '',
    steel_type: product?.steel_type || '',
    side_steel_type: product?.side_steel_type || 'NONE',
    size_type: product?.size_type || 'STANDARD',
    custom_note: product?.custom_note || '',
    stock_min: product?.stock_min ?? 0,
    stock_max: product?.stock_max ?? 0,
    is_active: product?.is_active ?? true,
  });

  const set = (key: string, value: unknown) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Row 1 */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">รหัสสินค้า *</label>
          <input type="text" required value={form.product_code} onChange={(e) => set('product_code', e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">ชื่อสินค้า *</label>
          <input type="text" required value={form.name} onChange={(e) => set('name', e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
        </div>
      </div>

      {/* Row 2 - Category & Counting Unit */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">หมวดหมู่ *</label>
          <select value={form.category_id} onChange={(e) => set('category_id', Number(e.target.value))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">หน่วยนับ *</label>
          <CountingUnitInput value={form.counting_unit || ''} onChange={(v) => set('counting_unit', v)} />
        </div>
      </div>

      {/* Row 3 - Dimensions with units: ขนาดหน้าตัด → ยาว → หนา */}
      <fieldset className="rounded-lg border border-gray-200 p-4">
        <legend className="px-2 text-sm font-medium text-gray-700">ขนาด</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">ขนาดหน้าตัด</label>
            <input type="text" value={form.width || ''} onChange={(e) => set('width', e.target.value || null)}
              placeholder="เช่น 3*3" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">ความยาว</label>
            <div className="flex gap-2">
              <input type="number" step="0.01" value={form.length ?? ''} onChange={(e) => set('length', e.target.value ? Number(e.target.value) : null)}
                placeholder="0.00" className="flex-1 min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              <select value={form.length_unit} onChange={(e) => set('length_unit', e.target.value)}
                className="w-28 rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-blue-500 focus:outline-none">
                {UNIT_OPTIONS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">ความหนา</label>
            <div className="flex gap-2">
              <input type="number" step="0.01" value={form.thickness ?? ''} onChange={(e) => set('thickness', e.target.value ? Number(e.target.value) : null)}
                placeholder="0.00" className="flex-1 min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              <select value={form.thickness_unit} onChange={(e) => set('thickness_unit', e.target.value)}
                className="w-28 rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-blue-500 focus:outline-none">
                {UNIT_OPTIONS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </div>
          </div>
        </div>
      </fieldset>

      {/* Row 4 - Steel */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">ประเภทเหล็ก</label>
          <ComboSelect value={form.steel_type || ''} onChange={(v) => set('steel_type', v)}
            presets={STEEL_TYPE_PRESETS} placeholder="เลือกหรือพิมพ์ประเภทเหล็ก" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">เหล็กข้าง *</label>
          <select value={form.side_steel_type} onChange={(e) => set('side_steel_type', e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
            <option value="NONE">ไม่ระบุ</option>
            <option value="HIDE">HIDE (ไม่แสดง)</option>
            <option value="SHOW">SHOW (แสดง)</option>
          </select>
        </div>
      </div>

      {/* Row 4 - Size & Custom note */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">ประเภทไซส์ *</label>
          <select value={form.size_type} onChange={(e) => set('size_type', e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
            <option value="STANDARD">STANDARD</option>
            <option value="CUSTOM">CUSTOM</option>
          </select>
        </div>
        {form.size_type === 'CUSTOM' && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Custom Note *</label>
            <input type="text" required value={form.custom_note || ''} onChange={(e) => set('custom_note', e.target.value)}
              placeholder="ระบุรายละเอียดไซส์พิเศษ"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
          </div>
        )}
      </div>

      {/* Row 6 - Stock & Active */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Stock Min *</label>
          <input type="number" required value={form.stock_min} onChange={(e) => set('stock_min', Number(e.target.value))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Stock Max *</label>
          <input type="number" required value={form.stock_max} onChange={(e) => set('stock_max', Number(e.target.value))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span className="text-sm font-medium text-gray-700">เปิดใช้งานสินค้า</span>
          </label>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 border-t pt-4">
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
          ยกเลิก
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {saving ? 'กำลังบันทึก...' : product ? 'อัปเดต' : 'สร้างสินค้า'}
        </button>
      </div>
    </form>
  );
}

// ─── Counting Unit Combo Input ───────────────────────────────────
const COUNTING_UNIT_PRESETS = ['ชิ้น', 'แผ่น', 'ต้น', 'ท่อน', 'แท่ง', 'ก้อน', 'ถุง', 'ม้วน'];

function CountingUnitInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [isCustom, setIsCustom] = useState(!COUNTING_UNIT_PRESETS.includes(value) && value !== '');

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    if (v === '__custom__') {
      setIsCustom(true);
      onChange('');
    } else {
      setIsCustom(false);
      onChange(v);
    }
  };

  if (isCustom) {
    return (
      <div className="flex gap-2">
        <input type="text" required value={value} onChange={(e) => onChange(e.target.value)}
          placeholder="ระบุหน่วยนับ" autoFocus
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
        <button type="button" onClick={() => { setIsCustom(false); onChange('ชิ้น'); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50"
          title="เลือกจากรายการ">
          ↩
        </button>
      </div>
    );
  }

  return (
    <select value={value} onChange={handleSelectChange}
      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
      {COUNTING_UNIT_PRESETS.map((u) => <option key={u} value={u}>{u}</option>)}
      <option value="__custom__">+ เพิ่มเอง...</option>
    </select>
  );
}

// ─── Combo Select (preset + custom) ─────────────────────────────
function ComboSelect({ value, onChange, presets, placeholder }: { value: string; onChange: (v: string) => void; presets: string[]; placeholder?: string }) {
  const [isCustom, setIsCustom] = useState(value !== '' && !presets.includes(value));

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    if (v === '__custom__') {
      setIsCustom(true);
      onChange('');
    } else {
      setIsCustom(false);
      onChange(v);
    }
  };

  if (isCustom) {
    return (
      <div className="flex gap-2">
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || 'ระบุเอง'} autoFocus
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
        <button type="button" onClick={() => { setIsCustom(false); onChange(presets[0] || ''); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50" title="เลือกจากรายการ">
          ↩
        </button>
      </div>
    );
  }

  return (
    <select value={value} onChange={handleSelectChange}
      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
      <option value="">-- ไม่ระบุ --</option>
      {presets.map((p) => <option key={p} value={p}>{p}</option>)}
      <option value="__custom__">+ กำหนดเอง...</option>
    </select>
  );
}
