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
import { userService, UserFilters } from '@/services/user.service';
import { roleService } from '@/services/role.service';
import type { User, UserPayload, Role } from '@/lib/types';
import { Plus, Search, Pencil, Trash2 } from 'lucide-react';
import { AxiosError } from 'axios';

export default function UsersPage() {
  return (
    <AuthGuard permission="view_users">
      <UsersContent />
    </AuthGuard>
  );
}

function UsersContent() {
  const { hasPermission, user: currentUser } = useAuth();
  const canManage = hasPermission('manage_users');

  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, per_page: 15, total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const filters: UserFilters = { page, per_page: 15 };
      if (search) filters.search = search;
      if (filterRole) filters.role_id = Number(filterRole);
      if (filterStatus) filters.status = filterStatus;
      const res = await userService.list(filters);
      setUsers(res.data);
      setMeta(res.meta);
    } catch {
      toast('โหลดข้อมูลผู้ใช้ไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, search, filterRole, filterStatus]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => { roleService.list().then((r) => setRoles(r.data)).catch(() => {}); }, []);

  const handleSave = async (payload: UserPayload) => {
    setSaving(true);
    try {
      if (editingUser) {
        await userService.update(editingUser.id, payload);
        toast('อัปเดตผู้ใช้สำเร็จ', 'success');
      } else {
        await userService.create(payload);
        toast('สร้างผู้ใช้สำเร็จ', 'success');
      }
      setModalOpen(false);
      fetchUsers();
    } catch (err: unknown) {
      const axiosErr = err as AxiosError<{ message: string; errors?: Record<string, string[]> }>;
      const errors = axiosErr.response?.data?.errors;
      toast(errors ? Object.values(errors).flat()[0] : (axiosErr.response?.data?.message || 'เกิดข้อผิดพลาด'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await userService.delete(deleteTarget.id);
      toast('ลบผู้ใช้สำเร็จ', 'success');
      setDeleteTarget(null);
      fetchUsers();
    } catch (err: unknown) {
      const axiosErr = err as AxiosError<{ message: string }>;
      toast(axiosErr.response?.data?.message || 'ลบผู้ใช้ไม่สำเร็จ', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    { key: 'name', label: 'ชื่อ' },
    { key: 'email', label: 'อีเมล' },
    { key: 'role', label: 'บทบาท', render: (u: User) => (
      <Badge variant="info">{u.role?.display_name || u.role?.name || '-'}</Badge>
    )},
    { key: 'status', label: 'สถานะ', render: (u: User) => (
      <Badge variant={u.status === 'ACTIVE' ? 'success' : 'danger'}>{u.status === 'ACTIVE' ? 'ใช้งาน' : 'ระงับ'}</Badge>
    )},
    { key: 'last_login_at', label: 'เข้าสู่ระบบล่าสุด', render: (u: User) => u.last_login_at ? new Date(u.last_login_at).toLocaleString('th-TH') : '-' },
    ...(canManage ? [{
      key: 'actions', label: '', render: (u: User) => (
        <div className="flex gap-1">
          <button onClick={(e) => { e.stopPropagation(); setEditingUser(u); setModalOpen(true); }} className="rounded p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600">
            <Pencil size={16} />
          </button>
          {u.id !== currentUser?.id && (
            <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(u); }} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
              <Trash2 size={16} />
            </button>
          )}
        </div>
      )
    }] : []),
  ];

  return (
    <div>
      <PageHeader
        title="จัดการผู้ใช้งาน"
        description="รายการผู้ใช้งานทั้งหมดในระบบ"
        actions={canManage ? (
          <button onClick={() => { setEditingUser(null); setModalOpen(true); }} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors">
            <Plus size={18} /> เพิ่มผู้ใช้
          </button>
        ) : undefined}
      />

      <div className="mb-4 flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm sm:flex-row sm:items-end">
        <form onSubmit={(e) => { e.preventDefault(); setPage(1); fetchUsers(); }} className="flex flex-1 gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="ค้นหาชื่อ, อีเมล..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
          </div>
          <button type="submit" className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium hover:bg-gray-200 transition-colors">ค้นหา</button>
        </form>
        <select value={filterRole} onChange={(e) => { setFilterRole(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
          <option value="">ทุกบทบาท</option>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.display_name}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
          <option value="">ทุกสถานะ</option>
          <option value="ACTIVE">ใช้งาน</option>
          <option value="INACTIVE">ระงับ</option>
        </select>
      </div>

      <DataTable columns={columns} data={users} loading={loading} emptyMessage="ไม่พบผู้ใช้" />
      <Pagination currentPage={meta.current_page} lastPage={meta.last_page} total={meta.total} onPageChange={setPage} />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingUser ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้ใหม่'} size="md">
        <UserForm user={editingUser} roles={roles} onSubmit={handleSave} onCancel={() => setModalOpen(false)} saving={saving} />
      </Modal>

      <ConfirmDialog open={!!deleteTarget} title="ลบผู้ใช้" message={`ยืนยันการลบผู้ใช้ "${deleteTarget?.name}" (${deleteTarget?.email})?`}
        confirmText="ลบ" onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} loading={deleting} />
    </div>
  );
}

interface UserFormProps {
  user: User | null;
  roles: Role[];
  onSubmit: (payload: UserPayload) => void;
  onCancel: () => void;
  saving: boolean;
}

function UserForm({ user, roles, onSubmit, onCancel, saving }: UserFormProps) {
  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    password: '',
    password_confirmation: '',
    role_id: user?.role_id || (roles[0]?.id || 0),
    status: user?.status || 'ACTIVE' as const,
  });

  const set = (key: string, value: unknown) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: UserPayload = {
      name: form.name,
      email: form.email,
      role_id: form.role_id,
      status: form.status as 'ACTIVE' | 'INACTIVE',
    };
    if (form.password) {
      payload.password = form.password;
      payload.password_confirmation = form.password_confirmation;
    }
    onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">ชื่อ *</label>
        <input type="text" required value={form.name} onChange={(e) => set('name', e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">อีเมล *</label>
        <input type="email" required value={form.email} onChange={(e) => set('email', e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">รหัสผ่าน {user ? '' : '*'}</label>
          <input type="password" value={form.password} onChange={(e) => set('password', e.target.value)}
            required={!user} minLength={8} placeholder={user ? 'เว้นว่างหากไม่ต้องการเปลี่ยน' : ''}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">ยืนยันรหัสผ่าน</label>
          <input type="password" value={form.password_confirmation} onChange={(e) => set('password_confirmation', e.target.value)}
            required={!!form.password}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">บทบาท *</label>
          <select value={form.role_id} onChange={(e) => set('role_id', Number(e.target.value))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
            {roles.map((r) => <option key={r.id} value={r.id}>{r.display_name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">สถานะ</label>
          <select value={form.status} onChange={(e) => set('status', e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
            <option value="ACTIVE">ใช้งาน</option>
            <option value="INACTIVE">ระงับ</option>
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-3 border-t pt-4">
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">ยกเลิก</button>
        <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'กำลังบันทึก...' : user ? 'อัปเดต' : 'สร้างผู้ใช้'}
        </button>
      </div>
    </form>
  );
}
