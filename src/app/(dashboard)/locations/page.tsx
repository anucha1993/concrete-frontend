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
import { locationService } from '@/services/master.service';
import type { Location, LocationPayload } from '@/lib/types';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { AxiosError } from 'axios';

export default function LocationsPage() {
  return (
    <AuthGuard permission="view_locations">
      <LocationsContent />
    </AuthGuard>
  );
}

function LocationsContent() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('manage_locations');

  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Location | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await locationService.list();
      setLocations(res.data);
    } catch {
      toast('โหลดข้อมูลตำแหน่งไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async (payload: LocationPayload) => {
    setSaving(true);
    try {
      if (editing) {
        await locationService.update(editing.id, payload);
        toast('อัปเดตตำแหน่งสำเร็จ', 'success');
      } else {
        await locationService.create(payload);
        toast('สร้างตำแหน่งสำเร็จ', 'success');
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
      await locationService.delete(deleteTarget.id);
      toast('ลบตำแหน่งสำเร็จ', 'success');
      setDeleteTarget(null);
      fetchData();
    } catch (err: unknown) {
      const axiosErr = err as AxiosError<{ message: string }>;
      toast(axiosErr.response?.data?.message || 'ลบตำแหน่งไม่สำเร็จ', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    { key: 'code', label: 'รหัส', render: (l: Location) => <span className="font-mono font-medium text-blue-600">{l.code}</span> },
    { key: 'name', label: 'ชื่อตำแหน่ง' },
    { key: 'description', label: 'คำอธิบาย', render: (l: Location) => l.description || '-' },
    { key: 'is_active', label: 'สถานะ', render: (l: Location) => (
      <Badge variant={l.is_active ? 'success' : 'danger'}>{l.is_active ? 'ใช้งาน' : 'ปิด'}</Badge>
    )},
    ...(canManage ? [{
      key: 'actions', label: '', render: (l: Location) => (
        <div className="flex gap-1">
          <button onClick={(e) => { e.stopPropagation(); setEditing(l); setModalOpen(true); }}
            className="rounded p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600"><Pencil size={16} /></button>
          <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(l); }}
            className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={16} /></button>
        </div>
      )
    }] : []),
  ];

  return (
    <div>
      <PageHeader title="ตำแหน่งคลังสินค้า" description="จัดการตำแหน่งจัดเก็บสินค้า"
        actions={canManage ? (
          <button onClick={() => { setEditing(null); setModalOpen(true); }}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors">
            <Plus size={18} /> เพิ่มตำแหน่ง
          </button>
        ) : undefined}
      />
      <DataTable columns={columns} data={locations} loading={loading} emptyMessage="ไม่พบตำแหน่ง" />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'แก้ไขตำแหน่ง' : 'เพิ่มตำแหน่งใหม่'} size="sm">
        <LocationForm location={editing} onSubmit={handleSave} onCancel={() => setModalOpen(false)} saving={saving} />
      </Modal>

      <ConfirmDialog open={!!deleteTarget} title="ลบตำแหน่ง" message={`ยืนยันการลบตำแหน่ง "${deleteTarget?.name}" (${deleteTarget?.code})?`}
        confirmText="ลบ" onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} loading={deleting} />
    </div>
  );
}

function LocationForm({ location, onSubmit, onCancel, saving }: { location: Location | null; onSubmit: (p: LocationPayload) => void; onCancel: () => void; saving: boolean }) {
  const [form, setForm] = useState({ name: location?.name || '', code: location?.code || '', description: location?.description || '', is_active: location?.is_active ?? true });
  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">ชื่อตำแหน่ง *</label>
        <input type="text" required value={form.name} onChange={(e) => set('name', e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">รหัสตำแหน่ง *</label>
        <input type="text" required value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())}
          placeholder="เช่น WH-A" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono uppercase focus:border-blue-500 focus:outline-none" />
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
          {saving ? 'กำลังบันทึก...' : location ? 'อัปเดต' : 'สร้าง'}
        </button>
      </div>
    </form>
  );
}
