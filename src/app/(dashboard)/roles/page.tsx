'use client';

import { useState, useEffect, useCallback } from 'react';
import AuthGuard from '@/components/AuthGuard';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { roleService } from '@/services/role.service';
import type { Role, RolePayload, Permission } from '@/lib/types';
import { Plus, Pencil, Trash2, ShieldCheck } from 'lucide-react';
import { AxiosError } from 'axios';

export default function RolesPage() {
  return (
    <AuthGuard permission="manage_roles">
      <RolesContent />
    </AuthGuard>
  );
}

function RolesContent() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [permModalOpen, setPermModalOpen] = useState(false);
  const [permRole, setPermRole] = useState<Role | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchRoles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await roleService.list();
      setRoles(res.data);
    } catch {
      toast('โหลดข้อมูลบทบาทไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRoles(); }, [fetchRoles]);
  useEffect(() => { roleService.listPermissions().then((r) => setPermissions(r.data)).catch(() => {}); }, []);

  const handleSaveRole = async (payload: RolePayload) => {
    setSaving(true);
    try {
      if (editingRole) {
        await roleService.update(editingRole.id, payload);
        toast('อัปเดตบทบาทสำเร็จ', 'success');
      } else {
        await roleService.create(payload);
        toast('สร้างบทบาทสำเร็จ', 'success');
      }
      setModalOpen(false);
      fetchRoles();
    } catch (err: unknown) {
      const axiosErr = err as AxiosError<{ message: string }>;
      toast(axiosErr.response?.data?.message || 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAssignPerms = async (permIds: number[]) => {
    if (!permRole) return;
    setSaving(true);
    try {
      await roleService.assignPermissions(permRole.id, permIds);
      toast('กำหนดสิทธิ์สำเร็จ', 'success');
      setPermModalOpen(false);
      fetchRoles();
    } catch {
      toast('กำหนดสิทธิ์ไม่สำเร็จ', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await roleService.delete(deleteTarget.id);
      toast('ลบบทบาทสำเร็จ', 'success');
      setDeleteTarget(null);
      fetchRoles();
    } catch (err: unknown) {
      const axiosErr = err as AxiosError<{ message: string }>;
      toast(axiosErr.response?.data?.message || 'ลบบทบาทไม่สำเร็จ', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    { key: 'name', label: 'ชื่อ Role', render: (r: Role) => <span className="font-mono font-medium">{r.name}</span> },
    { key: 'display_name', label: 'ชื่อแสดง' },
    { key: 'description', label: 'คำอธิบาย', render: (r: Role) => r.description || '-' },
    { key: 'permissions', label: 'สิทธิ์', render: (r: Role) => (
      <div className="flex flex-wrap gap-1">
        {(r.permissions || []).slice(0, 3).map((p) => (
          <Badge key={p.id} variant="info">{p.display_name}</Badge>
        ))}
        {(r.permissions || []).length > 3 && <Badge variant="gray">+{r.permissions!.length - 3}</Badge>}
      </div>
    )},
    { key: 'actions', label: '', render: (r: Role) => (
      <div className="flex gap-1">
        <button onClick={(e) => { e.stopPropagation(); setPermRole(r); setPermModalOpen(true); }} title="กำหนดสิทธิ์"
          className="rounded p-1.5 text-gray-400 hover:bg-emerald-50 hover:text-emerald-600">
          <ShieldCheck size={16} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); setEditingRole(r); setModalOpen(true); }}
          className="rounded p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600">
          <Pencil size={16} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(r); }}
          className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
          <Trash2 size={16} />
        </button>
      </div>
    )},
  ];

  return (
    <div>
      <PageHeader
        title="จัดการบทบาท & สิทธิ์"
        description="กำหนดบทบาทและสิทธิ์การเข้าถึงระบบ"
        actions={
          <button onClick={() => { setEditingRole(null); setModalOpen(true); }}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors">
            <Plus size={18} /> เพิ่มบทบาท
          </button>
        }
      />

      <DataTable columns={columns} data={roles} loading={loading} emptyMessage="ไม่พบบทบาท" />

      {/* Role Create/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingRole ? 'แก้ไขบทบาท' : 'เพิ่มบทบาทใหม่'} size="sm">
        <RoleForm role={editingRole} onSubmit={handleSaveRole} onCancel={() => setModalOpen(false)} saving={saving} />
      </Modal>

      {/* Permission Assignment Modal */}
      <Modal open={permModalOpen} onClose={() => setPermModalOpen(false)} title={`กำหนดสิทธิ์: ${permRole?.display_name || ''}`} size="lg">
        <PermissionAssigner
          permissions={permissions}
          currentPermIds={(permRole?.permissions || []).map((p) => p.id)}
          onSubmit={handleAssignPerms}
          onCancel={() => setPermModalOpen(false)}
          saving={saving}
        />
      </Modal>

      <ConfirmDialog open={!!deleteTarget} title="ลบบทบาท" message={`ยืนยันการลบบทบาท "${deleteTarget?.display_name}"?`}
        confirmText="ลบ" onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} loading={deleting} />
    </div>
  );
}

// ─── Role Form ───────────────────────────────────────────────────
function RoleForm({ role, onSubmit, onCancel, saving }: { role: Role | null; onSubmit: (p: RolePayload) => void; onCancel: () => void; saving: boolean }) {
  const [form, setForm] = useState({ name: role?.name || '', display_name: role?.display_name || '', description: role?.description || '' });
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">ชื่อ Role (ภาษาอังกฤษ) *</label>
        <input type="text" required value={form.name} onChange={(e) => set('name', e.target.value.toUpperCase())}
          placeholder="เช่น WAREHOUSE" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono uppercase focus:border-blue-500 focus:outline-none" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">ชื่อแสดง *</label>
        <input type="text" required value={form.display_name} onChange={(e) => set('display_name', e.target.value)}
          placeholder="เช่น คลังสินค้า" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">คำอธิบาย</label>
        <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={2}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
      </div>
      <div className="flex justify-end gap-3 border-t pt-4">
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">ยกเลิก</button>
        <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'กำลังบันทึก...' : role ? 'อัปเดต' : 'สร้างบทบาท'}
        </button>
      </div>
    </form>
  );
}

// ─── Permission Assigner ─────────────────────────────────────────
function PermissionAssigner({ permissions, currentPermIds, onSubmit, onCancel, saving }: {
  permissions: Permission[]; currentPermIds: number[]; onSubmit: (ids: number[]) => void; onCancel: () => void; saving: boolean;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set(currentPermIds));

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === permissions.length) setSelected(new Set());
    else setSelected(new Set(permissions.map((p) => p.id)));
  };

  // Group by group field
  const grouped = permissions.reduce<Record<string, Permission[]>>((acc, p) => {
    const g = p.group || 'อื่น ๆ';
    if (!acc[g]) acc[g] = [];
    acc[g].push(p);
    return acc;
  }, {});

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-500">เลือกสิทธิ์ที่ต้องการกำหนดให้บทบาทนี้</p>
        <button type="button" onClick={toggleAll} className="text-sm text-blue-600 hover:text-blue-700 font-medium">
          {selected.size === permissions.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
        </button>
      </div>

      <div className="max-h-[400px] overflow-y-auto space-y-4">
        {Object.entries(grouped).map(([group, perms]) => (
          <div key={group}>
            <h4 className="mb-2 text-sm font-semibold text-gray-800 uppercase tracking-wide">{group}</h4>
            <div className="grid gap-2 sm:grid-cols-2">
              {perms.map((p) => (
                <label key={p.id} className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  selected.has(p.id) ? 'bg-blue-50 border-blue-300' : 'hover:bg-gray-50'
                }`}>
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{p.display_name}</p>
                    <p className="text-xs text-gray-500">{p.name}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-3 border-t pt-4 mt-4">
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">ยกเลิก</button>
        <button onClick={() => onSubmit(Array.from(selected))} disabled={saving}
          className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'กำลังบันทึก...' : 'บันทึกสิทธิ์'}
        </button>
      </div>
    </div>
  );
}
