'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import AuthGuard from '@/components/AuthGuard';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { categoryService } from '@/services/master.service';
import type { Category, CategoryPayload } from '@/lib/types';
import { Plus, Pencil, Trash2, Search, X } from 'lucide-react';
import { AxiosError } from 'axios';

export default function CategoriesPage() {
  return (
    <AuthGuard permission="view_products">
      <CategoriesContent />
    </AuthGuard>
  );
}

function CategoriesContent() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('manage_products');

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await categoryService.list();
      setCategories(res.data);
    } catch {
      toast('โหลดข้อมูลหมวดหมู่ไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async (payload: CategoryPayload) => {
    setSaving(true);
    try {
      if (editing) {
        await categoryService.update(editing.id, payload);
        toast('อัปเดตหมวดหมู่สำเร็จ', 'success');
      } else {
        await categoryService.create(payload);
        toast('สร้างหมวดหมู่สำเร็จ', 'success');
      }
      setModalOpen(false);
      fetchData();
    } catch (err: unknown) {
      const axiosErr = err as AxiosError<{ message: string }>;
      toast(axiosErr.response?.data?.message || 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await categoryService.delete(deleteTarget.id);
      toast('ลบหมวดหมู่สำเร็จ', 'success');
      setDeleteTarget(null);
      fetchData();
    } catch (err: unknown) {
      const axiosErr = err as AxiosError<{ message: string }>;
      toast(axiosErr.response?.data?.message || 'ลบหมวดหมู่ไม่สำเร็จ', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    { key: 'code', label: 'รหัส', render: (c: Category) => c.code ? <span className="font-mono font-medium text-blue-600">{c.code}</span> : <span className="text-gray-400">-</span> },
    { key: 'name', label: 'ชื่อหมวดหมู่', render: (c: Category) => <span className="font-medium">{c.name}</span> },
    { key: 'slug', label: 'Slug', render: (c: Category) => <span className="font-mono text-xs text-gray-500">{c.slug}</span> },
    { key: 'description', label: 'คำอธิบาย', render: (c: Category) => c.description || '-' },
    { key: 'is_active', label: 'สถานะ', render: (c: Category) => (
      <Badge variant={c.is_active ? 'success' : 'danger'}>{c.is_active ? 'ใช้งาน' : 'ปิด'}</Badge>
    )},
    ...(canManage ? [{
      key: 'actions', label: '', render: (c: Category) => (
        <div className="flex gap-1">
          <button onClick={(e) => { e.stopPropagation(); setEditing(c); setModalOpen(true); }}
            className="rounded p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600"><Pencil size={16} /></button>
          <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(c); }}
            className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={16} /></button>
        </div>
      )
    }] : []),
  ];

  const filteredCategories = categories.filter((c) => {
    const matchSearch = !search || (c.code || '').toLowerCase().includes(search.toLowerCase()) || c.name.toLowerCase().includes(search.toLowerCase()) || c.slug.toLowerCase().includes(search.toLowerCase()) || (c.description || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || (statusFilter === 'active' ? c.is_active : !c.is_active);
    return matchSearch && matchStatus;
  });

  const hasActiveFilter = search || statusFilter !== 'all';

  const clearFilters = () => { setSearch(''); setStatusFilter('all'); };

  return (
    <div>
      <PageHeader title="หมวดหมู่สินค้า" description="จัดการหมวดหมู่สินค้าคอนกรีต"
        actions={canManage ? (
          <button onClick={() => { setEditing(null); setModalOpen(true); }}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors">
            <Plus size={18} /> เพิ่มหมวดหมู่
          </button>
        ) : undefined}
      />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="ค้นหารหัส, ชื่อ, slug, คำอธิบาย..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
          <option value="all">สถานะทั้งหมด</option>
          <option value="active">ใช้งาน</option>
          <option value="inactive">ปิด</option>
        </select>
        {hasActiveFilter && (
          <button onClick={clearFilters} className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            <X size={14} /> ล้างตัวกรอง
          </button>
        )}
        <span className="ml-auto text-sm text-gray-500">
          {filteredCategories.length} / {categories.length} รายการ
        </span>
      </div>

      <DataTable columns={columns} data={filteredCategories} loading={loading} emptyMessage="ไม่พบหมวดหมู่" />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'แก้ไขหมวดหมู่' : 'เพิ่มหมวดหมู่ใหม่'} size="sm">
        <CategoryForm category={editing} onSubmit={handleSave} onCancel={() => setModalOpen(false)} saving={saving} />
      </Modal>

      <ConfirmDialog open={!!deleteTarget} title="ลบหมวดหมู่" message={`ยืนยันการลบหมวดหมู่ "${deleteTarget?.name}"?`}
        confirmText="ลบ" onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} loading={deleting} />
    </div>
  );
}

function CategoryForm({ category, onSubmit, onCancel, saving }: { category: Category | null; onSubmit: (p: CategoryPayload) => void; onCancel: () => void; saving: boolean }) {
  const [form, setForm] = useState({ code: category?.code || '', name: category?.name || '', description: category?.description || '', is_active: category?.is_active ?? true });
  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">รหัสหมวดหมู่</label>
        <input type="text" value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="เช่น CAT-001"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono uppercase focus:border-blue-500 focus:outline-none" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">ชื่อหมวดหมู่ *</label>
        <input type="text" required value={form.name} onChange={(e) => set('name', e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">คำอธิบาย</label>
        <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={2}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600" />
        <span className="text-sm text-gray-700">เปิดใช้งาน</span>
      </label>
      <div className="flex justify-end gap-3 border-t pt-4">
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">ยกเลิก</button>
        <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'กำลังบันทึก...' : category ? 'อัปเดต' : 'สร้าง'}
        </button>
      </div>
    </form>
  );
}
