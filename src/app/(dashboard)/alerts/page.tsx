'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import AuthGuard from '@/components/AuthGuard';
import PageHeader from '@/components/ui/PageHeader';
import Badge from '@/components/ui/Badge';
import { toast } from '@/components/ui/Toast';
import { inventoryService } from '@/services/inventory.service';
import type { InventoryAlert, Inventory } from '@/lib/types';
import { AlertTriangle, Clock, PackageX, RefreshCw } from 'lucide-react';

export default function AlertsPage() {
  return (
    <AuthGuard permission="view_inventory">
      <AlertsContent />
    </AuthGuard>
  );
}

function AlertsContent() {
  const [alerts, setAlerts] = useState<InventoryAlert | null>(null);
  const [loading, setLoading] = useState(true);
  const [noMovementDays, setNoMovementDays] = useState(30);
  const [longStorageDays, setLongStorageDays] = useState(90);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inventoryService.alerts(noMovementDays, longStorageDays);
      setAlerts(res.data);
    } catch {
      toast('โหลดข้อมูลแจ้งเตือนไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  }, [noMovementDays, longStorageDays]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  const totalAlerts = alerts
    ? alerts.low_stock.length + alerts.no_movement.length + alerts.long_storage.length
    : 0;

  return (
    <div>
      <PageHeader title="แจ้งเตือนคลังสินค้า" description="ตรวจสอบสต็อกต่ำ, สินค้าไม่เคลื่อนไหว, จัดเก็บนาน" actions={
        <button onClick={fetchAlerts} disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> รีเฟรช
        </button>
      } />

      {/* Settings */}
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">ไม่เคลื่อนไหว (วัน)</label>
          <input type="number" min={1} value={noMovementDays} onChange={e => setNoMovementDays(Number(e.target.value))}
            className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">จัดเก็บนาน (วัน)</label>
          <input type="number" min={1} value={longStorageDays} onChange={e => setLongStorageDays(Number(e.target.value))}
            className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-gray-400">กำลังโหลด...</div>
      ) : !alerts ? (
        <div className="py-16 text-center text-gray-400">ไม่สามารถโหลดข้อมูลได้</div>
      ) : totalAlerts === 0 ? (
        <div className="rounded-xl border bg-green-50 p-12 text-center">
          <p className="text-lg font-semibold text-green-700">ไม่มีรายการแจ้งเตือน</p>
          <p className="mt-1 text-sm text-green-600">คลังสินค้าอยู่ในสถานะปกติ</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <AlertCard icon={<PackageX size={24} />} label="สต็อกต่ำกว่าขั้นต่ำ" count={alerts.low_stock.length} color="red" />
            <AlertCard icon={<Clock size={24} />} label={`ไม่เคลื่อนไหว >${noMovementDays} วัน`} count={alerts.no_movement.length} color="yellow" />
            <AlertCard icon={<AlertTriangle size={24} />} label={`จัดเก็บนาน >${longStorageDays} วัน`} count={alerts.long_storage.length} color="orange" />
          </div>

          {/* Low Stock */}
          {alerts.low_stock.length > 0 && (
            <AlertSection title="สต็อกต่ำกว่าขั้นต่ำ" variant="danger" icon={<PackageX size={18} />}>
              <table className="w-full text-sm">
                <thead className="bg-red-50">
                  <tr>
                    <th className="px-4 py-2 text-left">รหัสสินค้า</th>
                    <th className="px-4 py-2 text-left">ชื่อสินค้า</th>
                    <th className="px-4 py-2 text-right">จำนวนในคลัง</th>
                    <th className="px-4 py-2 text-right">ขั้นต่ำ</th>
                    <th className="px-4 py-2 text-right">ขาดอีก</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.low_stock.map(item => (
                    <tr key={item.product_id} className="border-t border-red-100">
                      <td className="px-4 py-2 font-mono text-xs">{item.product_code}</td>
                      <td className="px-4 py-2">{item.product_name}</td>
                      <td className="px-4 py-2 text-right font-bold text-red-600">{item.current_stock}</td>
                      <td className="px-4 py-2 text-right">{item.stock_min}</td>
                      <td className="px-4 py-2 text-right"><Badge variant="danger">{item.stock_min - item.current_stock}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AlertSection>
          )}

          {/* No Movement */}
          {alerts.no_movement.length > 0 && (
            <AlertSection title={`ไม่เคลื่อนไหวเกิน ${noMovementDays} วัน`} variant="warning" icon={<Clock size={18} />}>
              <InventoryAlertTable items={alerts.no_movement} dateField="last_movement_at" dateLabel="เคลื่อนไหวล่าสุด" />
            </AlertSection>
          )}

          {/* Long Storage */}
          {alerts.long_storage.length > 0 && (
            <AlertSection title={`จัดเก็บนานเกิน ${longStorageDays} วัน`} variant="warning" icon={<AlertTriangle size={18} />}>
              <InventoryAlertTable items={alerts.long_storage} dateField="received_at" dateLabel="รับเข้าเมื่อ" />
            </AlertSection>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Alert Card ── */
function AlertCard({ icon, label, count, color }: { icon: React.ReactNode; label: string; count: number; color: 'red' | 'yellow' | 'orange' }) {
  const colorMap = {
    red: 'bg-red-50 border-red-200 text-red-700',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
  };

  return (
    <div className={`flex items-center gap-4 rounded-xl border p-4 ${colorMap[color]}`}>
      <div className="opacity-70">{icon}</div>
      <div>
        <p className="text-3xl font-bold">{count}</p>
        <p className="text-xs">{label}</p>
      </div>
    </div>
  );
}

/* ── Alert Section Wrapper ── */
function AlertSection({ title, variant, icon, children }: {
  title: string; variant: 'danger' | 'warning'; icon: React.ReactNode; children: React.ReactNode;
}) {
  const borderColor = variant === 'danger' ? 'border-red-200' : 'border-yellow-200';
  const headerBg = variant === 'danger' ? 'bg-red-50 text-red-800' : 'bg-yellow-50 text-yellow-800';

  return (
    <div className={`overflow-hidden rounded-xl border ${borderColor}`}>
      <div className={`flex items-center gap-2 px-4 py-3 ${headerBg}`}>
        {icon}
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

/* ── Inventory Alert Table ── */
function InventoryAlertTable({ items, dateField, dateLabel }: {
  items: Inventory[]; dateField: 'last_movement_at' | 'received_at'; dateLabel: string;
}) {
  const now = useMemo(() => new Date(), []);
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50">
        <tr>
          <th className="px-4 py-2 text-left">Serial Number</th>
          <th className="px-4 py-2 text-left">สินค้า</th>
          <th className="px-4 py-2 text-left">คลัง</th>
          <th className="px-4 py-2 text-center">สถานะ</th>
          <th className="px-4 py-2 text-left">{dateLabel}</th>
          <th className="px-4 py-2 text-right">จำนวนวัน</th>
        </tr>
      </thead>
      <tbody>
        {items.map(item => {
          const dateVal = item[dateField];
          const daysDiff = dateVal ? Math.floor((now.getTime() - new Date(dateVal).getTime()) / 86400000) : null;
          return (
            <tr key={item.id} className="border-t">
              <td className="px-4 py-2 font-mono text-xs">{item.serial_number}</td>
              <td className="px-4 py-2">{item.product?.product_code} - {item.product?.name}</td>
              <td className="px-4 py-2">{item.location?.name || '-'}</td>
              <td className="px-4 py-2 text-center"><Badge variant="warning">{item.status}</Badge></td>
              <td className="px-4 py-2 text-gray-500">{dateVal ? new Date(dateVal).toLocaleDateString('th-TH') : '-'}</td>
              <td className="px-4 py-2 text-right font-medium text-orange-600">{daysDiff ?? '-'} วัน</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
