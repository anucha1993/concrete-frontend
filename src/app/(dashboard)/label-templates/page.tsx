'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import AuthGuard from '@/components/AuthGuard';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import Badge from '@/components/ui/Badge';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { labelTemplateService, type LabelTemplate } from '@/services/label-template.service';
import { Plus, Pencil, Trash2, Search, X, Star, Copy, Power } from 'lucide-react';
import { AxiosError } from 'axios';

export default function LabelTemplatesPage() {
  return (
    <AuthGuard permission="view_production">
      <LabelTemplatesContent />
    </AuthGuard>
  );
}

function LabelTemplatesContent() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('manage_production');

  const [templates, setTemplates] = useState<LabelTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<LabelTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await labelTemplateService.list();
      setTemplates(res.data);
    } catch {
      toast('โหลดข้อมูล Template ไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await labelTemplateService.delete(deleteTarget.id);
      toast('ลบ Template สำเร็จ', 'success');
      setDeleteTarget(null);
      fetchData();
    } catch (err: unknown) {
      const axiosErr = err as AxiosError<{ message: string }>;
      toast(axiosErr.response?.data?.message || 'ลบ Template ไม่สำเร็จ', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleSetDefault = async (tmpl: LabelTemplate) => {
    try {
      await labelTemplateService.update(tmpl.id, { is_default: true });
      toast(`ตั้ง "${tmpl.name}" เป็น Template เริ่มต้น`, 'success');
      fetchData();
    } catch {
      toast('ตั้งค่า Template เริ่มต้นไม่สำเร็จ', 'error');
    }
  };

  const handleToggleActive = async (tmpl: LabelTemplate) => {
    try {
      await labelTemplateService.update(tmpl.id, { is_active: !tmpl.is_active });
      toast(`${tmpl.is_active ? 'ปิด' : 'เปิด'}ใช้งาน "${tmpl.name}" สำเร็จ`, 'success');
      fetchData();
    } catch {
      toast('เปลี่ยนสถานะไม่สำเร็จ', 'error');
    }
  };

  const handleDuplicate = async (tmpl: LabelTemplate) => {
    try {
      await labelTemplateService.create({
        name: `${tmpl.name} (สำเนา)`,
        paper_width: tmpl.paper_width,
        paper_height: tmpl.paper_height,
        template_json: tmpl.template_json,
        is_default: false,
      });
      toast('คัดลอก Template สำเร็จ', 'success');
      fetchData();
    } catch {
      toast('คัดลอก Template ไม่สำเร็จ', 'error');
    }
  };

  const columns = [
    {
      key: 'name', label: 'ชื่อ Template', render: (t: LabelTemplate) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{t.name}</span>
          {t.is_default && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              <Star size={12} /> เริ่มต้น
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'paper_size', label: 'ขนาดกระดาษ', render: (t: LabelTemplate) => (
        <span className="font-mono text-sm">{t.paper_width} × {t.paper_height} mm</span>
      ),
    },
    {
      key: 'is_active', label: 'สถานะ', render: (t: LabelTemplate) => (
        <Badge variant={t.is_active ? 'success' : 'danger'}>
          {t.is_active ? 'ใช้งาน' : 'ปิด'}
        </Badge>
      ),
    },
    {
      key: 'creator', label: 'สร้างโดย', render: (t: LabelTemplate) => (
        <span className="text-sm text-gray-500">{t.creator?.name || '-'}</span>
      ),
    },
    {
      key: 'updated_at', label: 'แก้ไขล่าสุด', render: (t: LabelTemplate) => (
        <span className="text-sm text-gray-500">
          {new Date(t.updated_at).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
      ),
    },
    ...(canManage ? [{
      key: 'actions', label: '', render: (t: LabelTemplate) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          {!t.is_default && (
            <button onClick={() => handleSetDefault(t)} title="ตั้งเป็น Template เริ่มต้น"
              className="rounded p-1.5 text-gray-400 hover:bg-amber-50 hover:text-amber-600">
              <Star size={16} />
            </button>
          )}
          <button onClick={() => handleToggleActive(t)} title={t.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
            className={`rounded p-1.5 ${t.is_active ? 'text-green-500 hover:bg-red-50 hover:text-red-500' : 'text-gray-400 hover:bg-green-50 hover:text-green-600'}`}>
            <Power size={16} />
          </button>
          <button onClick={() => handleDuplicate(t)} title="คัดลอก Template"
            className="rounded p-1.5 text-gray-400 hover:bg-green-50 hover:text-green-600">
            <Copy size={16} />
          </button>
          <button onClick={() => router.push(`/label-templates/${t.id}`)} title="แก้ไข Template"
            className="rounded p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600">
            <Pencil size={16} />
          </button>
          <button onClick={() => setDeleteTarget(t)} title="ลบ Template"
            className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
            <Trash2 size={16} />
          </button>
        </div>
      ),
    }] : []),
  ];

  const filtered = templates.filter((t) => {
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || (statusFilter === 'active' ? t.is_active : !t.is_active);
    return matchSearch && matchStatus;
  });

  const hasActiveFilter = search || statusFilter !== 'all';

  return (
    <div>
      <PageHeader
        title="ออกแบบ Label Template"
        description="สร้างและจัดการ template สำหรับปริ้น barcode label แบบ drag & drop"
        actions={canManage ? (
          <button onClick={() => router.push('/label-templates/create')}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors">
            <Plus size={18} /> สร้าง Template ใหม่
          </button>
        ) : undefined}
      />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="ค้นหาชื่อ template..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
          <option value="all">สถานะทั้งหมด</option>
          <option value="active">ใช้งาน</option>
          <option value="inactive">ปิด</option>
        </select>
        {hasActiveFilter && (
          <button onClick={() => { setSearch(''); setStatusFilter('all'); }}
            className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            <X size={14} /> ล้างตัวกรอง
          </button>
        )}
        <span className="ml-auto text-sm text-gray-500">
          {filtered.length} / {templates.length} รายการ
        </span>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        emptyMessage="ยังไม่มี Label Template"
        onRowClick={canManage ? (t) => router.push(`/label-templates/${t.id}`) : undefined}
        rowClassName={() => canManage ? 'cursor-pointer hover:bg-blue-50/50' : ''}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="ลบ Template"
        message={`ยืนยันการลบ template "${deleteTarget?.name}"?`}
        confirmText="ลบ"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </div>
  );
}
