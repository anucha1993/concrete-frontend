'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import PageHeader from '@/components/ui/PageHeader';
import Badge from '@/components/ui/Badge';
import { toast } from '@/components/ui/Toast';
import { inventoryService } from '@/services/inventory.service';
import { reportService } from '@/services/report.service';
import type { InventorySummary, InventoryAlert } from '@/lib/types';
import {
  Warehouse, Package, TrendingDown, AlertTriangle, Clock, FileWarning,
  ClipboardList, ArrowRightLeft, PackageX, CheckCircle2, XCircle, Archive,
  BarChart3, ArrowRight, ShieldAlert, Timer,
} from 'lucide-react';
import Link from 'next/link';

/* ─── Types ─── */
interface StockOverview {
  total: number;
  in_stock: number;
  sold: number;
  damaged: number;
  scrapped: number;
  pending: number;
}

interface ProductionSummary {
  total: number;
  completed: number;
  in_progress: number;
  confirmed: number;
  draft: number;
  total_qty: number;
}

interface DeductionSummary {
  total: number;
  completed: number;
  approved: number;
  pending: number;
  draft: number;
  total_items: number;
}

interface ClaimSummary {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  draft: number;
  total_items: number;
}

interface MovementSummary {
  total: number;
  production_in: number;
  transfer: number;
  sold: number;
  damaged: number;
  adjustment: number;
  claim_return: number;
  scrap: number;
}

/* ─── Main ─── */
export default function DashboardPage() {
  const { user, hasPermission } = useAuth();
  const canViewInventory = hasPermission('view_inventory');
  const canViewReports = hasPermission('view_reports');

  const [loading, setLoading] = useState(true);
  const [stock, setStock] = useState<StockOverview>({ total: 0, in_stock: 0, sold: 0, damaged: 0, scrapped: 0, pending: 0 });
  const [productSummary, setProductSummary] = useState<InventorySummary[]>([]);
  const [alerts, setAlerts] = useState<InventoryAlert>({ low_stock: [], no_movement: [], long_storage: [] });
  const [production, setProduction] = useState<ProductionSummary>({ total: 0, completed: 0, in_progress: 0, confirmed: 0, draft: 0, total_qty: 0 });
  const [deductions, setDeductions] = useState<DeductionSummary>({ total: 0, completed: 0, approved: 0, pending: 0, draft: 0, total_items: 0 });
  const [claims, setClaims] = useState<ClaimSummary>({ total: 0, approved: 0, pending: 0, rejected: 0, draft: 0, total_items: 0 });
  const [movements, setMovements] = useState<MovementSummary>({ total: 0, production_in: 0, transfer: 0, sold: 0, damaged: 0, adjustment: 0, claim_return: 0, scrap: 0 });

  useEffect(() => {
    if (!canViewInventory) { setLoading(false); return; }

    const load = async () => {
      setLoading(true);
      try {
        // Always fetch inventory data (view_inventory)
        const [summRes, alertRes] = await Promise.all([
          inventoryService.summary(),
          inventoryService.alerts(),
        ]);

        setProductSummary(summRes.data);
        setAlerts(alertRes.data);

        // Compute stock overview from inventory summary
        const totals = (summRes.data as InventorySummary[]).reduce(
          (acc, p) => ({
            total: acc.total + p.total_count,
            in_stock: acc.in_stock + p.in_stock_count,
            sold: acc.sold + p.sold_count,
            damaged: acc.damaged + p.damaged_count,
            scrapped: 0,
            pending: 0,
          }),
          { total: 0, in_stock: 0, sold: 0, damaged: 0, scrapped: 0, pending: 0 }
        );
        setStock(totals);

        // Fetch report data only if has view_reports permission
        if (canViewReports) {
          const [invRes, prodRes, dedRes, clmRes, movRes] = await Promise.all([
            reportService.inventory({ per_page: 1 }),
            reportService.production({ per_page: 1 }),
            reportService.stockDeductions({ per_page: 1 }),
            reportService.claims({ per_page: 1 }),
            reportService.movements({ per_page: 1 }),
          ]);

          // Override stock with more accurate report data (includes scrapped, pending)
          setStock(invRes.summary as unknown as StockOverview);
          setProduction(prodRes.summary as unknown as ProductionSummary);
          setDeductions(dedRes.summary as unknown as DeductionSummary);
          setClaims(clmRes.summary as unknown as ClaimSummary);
          setMovements(movRes.summary as unknown as MovementSummary);
        }
      } catch {
        toast('โหลดข้อมูลแดชบอร์ดไม่สำเร็จ', 'error');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [canViewInventory, canViewReports]);

  if (loading) {
    return (
      <div>
        <PageHeader title={`สวัสดี, ${user?.name || ''}`} description="ภาพรวมคลังสินค้าคอนกรีตสำเร็จรูป" />
        <div className="flex items-center justify-center py-20 text-gray-400">
          <div className="text-center">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
            กำลังโหลดข้อมูล...
          </div>
        </div>
      </div>
    );
  }

  if (!canViewInventory) {
    return (
      <div>
        <PageHeader title={`สวัสดี, ${user?.name || ''}`} description="ยินดีต้อนรับเข้าสู่ระบบจัดการคลังคอนกรีตสำเร็จรูป" />
        <div className="rounded-xl border bg-white p-8 text-center text-gray-500">
          ไม่มีข้อมูลแดชบอร์ดสำหรับสิทธิ์ปัจจุบัน
        </div>
      </div>
    );
  }

  const lowStockProducts = alerts.low_stock || [];
  const topProducts = [...productSummary].sort((a, b) => b.in_stock_count - a.in_stock_count).slice(0, 10);

  return (
    <div>
      <PageHeader
        title={`สวัสดี, ${user?.name || ''}`}
        description="ภาพรวมคลังสินค้าคอนกรีตสำเร็จรูป"
        actions={canViewReports ?
          <Link href="/reports" className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <BarChart3 size={16} /> ดูรายงาน
          </Link> : undefined
        }
      />

      {/* ═══ Row 1: Stock Overview Cards ═══ */}
      <div className={`mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 ${canViewReports ? 'lg:grid-cols-6' : 'lg:grid-cols-4'}`}>
        <StatCard icon={<Package size={20} />} label="สินค้าทั้งหมด" value={stock.total} color="bg-gray-100 text-gray-700" />
        <StatCard icon={<Warehouse size={20} />} label="ในคลัง" value={stock.in_stock} color="bg-green-50 text-green-700" />
        <StatCard icon={<CheckCircle2 size={20} />} label="ขายแล้ว" value={stock.sold} color="bg-blue-50 text-blue-700" />
        <StatCard icon={<AlertTriangle size={20} />} label="ชำรุด" value={stock.damaged} color="bg-orange-50 text-orange-700" />
        {canViewReports && <StatCard icon={<XCircle size={20} />} label="ทำลาย" value={stock.scrapped} color="bg-red-50 text-red-700" />}
        {canViewReports && <StatCard icon={<Clock size={20} />} label="รอรับเข้า" value={stock.pending} color="bg-yellow-50 text-yellow-700" />}
      </div>

      {/* ═══ Row 2: Alerts + Operations ═══ */}
      <div className={`mb-6 grid gap-4 ${canViewReports ? 'lg:grid-cols-3' : ''}`}>

        {/* Low Stock Alert */}
        <div className="rounded-xl border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-red-700">
              <ShieldAlert size={16} /> สินค้าใกล้หมด
            </h3>
            <Link href="/alerts" className="text-xs text-blue-600 hover:underline">ดูทั้งหมด →</Link>
          </div>
          <div className="max-h-[280px] overflow-y-auto">
            {lowStockProducts.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">ไม่มีสินค้าใกล้หมด</div>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {lowStockProducts.map(p => (
                    <tr key={p.product_id} className="border-t hover:bg-red-50/50">
                      <td className="px-4 py-2">
                        <div className="font-medium text-sm">{p.product_name}</div>
                        <div className="text-xs text-gray-400">{p.product_code}</div>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <span className="text-lg font-bold text-red-600">{p.current_stock}</span>
                        <span className="text-xs text-gray-400"> / {p.stock_min}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Production Stats */}
        {canViewReports && (
        <div className="rounded-xl border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <ClipboardList size={16} /> การผลิต
            </h3>
            <Link href="/production-orders" className="text-xs text-blue-600 hover:underline">ดูทั้งหมด →</Link>
          </div>
          <div className="p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">ใบสั่งผลิตทั้งหมด</span>
              <span className="font-bold text-gray-800">{production.total.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">กำลังผลิต</span>
              <Badge variant="warning">{production.in_progress}</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">เสร็จสิ้นแล้ว</span>
              <Badge variant="success">{production.completed}</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">ยืนยัน / รอผลิต</span>
              <Badge variant="info">{production.confirmed}</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">แบบร่าง</span>
              <Badge variant="gray">{production.draft}</Badge>
            </div>
            <div className="mt-2 border-t pt-2 flex items-center justify-between text-sm">
              <span className="text-gray-500">จำนวนผลิตรวม (ชุด)</span>
              <span className="font-bold text-blue-700">{production.total_qty.toLocaleString()}</span>
            </div>
          </div>
        </div>
        )}

        {/* Deductions + Claims summary */}
        {canViewReports && (
        <div className="space-y-4">
          <div className="rounded-xl border bg-white shadow-sm">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <TrendingDown size={16} /> ตัดสต๊อก
              </h3>
              <Link href="/stock-deductions" className="text-xs text-blue-600 hover:underline">ดูทั้งหมด →</Link>
            </div>
            <div className="grid grid-cols-3 divide-x p-3 text-center">
              <MiniStat label="ทั้งหมด" value={deductions.total} />
              <MiniStat label="เสร็จสิ้น" value={deductions.completed} color="text-green-600" />
              <MiniStat label="รอดำเนินการ" value={deductions.pending} color="text-yellow-600" />
            </div>
          </div>
          <div className="rounded-xl border bg-white shadow-sm">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <FileWarning size={16} /> เคลมสินค้า
              </h3>
              <Link href="/claims" className="text-xs text-blue-600 hover:underline">ดูทั้งหมด →</Link>
            </div>
            <div className="grid grid-cols-3 divide-x p-3 text-center">
              <MiniStat label="ทั้งหมด" value={claims.total} />
              <MiniStat label="อนุมัติ" value={claims.approved} color="text-green-600" />
              <MiniStat label="รอดำเนินการ" value={claims.pending} color="text-yellow-600" />
            </div>
          </div>
        </div>
        )}
      </div>

      {/* ═══ Row 3: Movement Breakdown + Top Products ═══ */}
      <div className={`mb-6 grid gap-4 ${canViewReports ? 'lg:grid-cols-2' : ''}`}>

        {/* Movement Breakdown */}
        {canViewReports && (
        <div className="rounded-xl border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <ArrowRightLeft size={16} /> ความเคลื่อนไหวสต๊อก
            </h3>
            <Link href="/reports" className="text-xs text-blue-600 hover:underline">ดูรายงาน →</Link>
          </div>
          <div className="p-4">
            <div className="space-y-2.5">
              <MovementBar label="ผลิตเข้าคลัง" value={movements.production_in} total={movements.total} color="bg-green-500" />
              <MovementBar label="ขาย" value={movements.sold} total={movements.total} color="bg-blue-500" />
              <MovementBar label="ย้ายคลัง" value={movements.transfer} total={movements.total} color="bg-cyan-500" />
              <MovementBar label="ชำรุด" value={movements.damaged} total={movements.total} color="bg-orange-500" />
              <MovementBar label="ปรับสต็อก" value={movements.adjustment} total={movements.total} color="bg-yellow-500" />
              <MovementBar label="คืนจากเคลม" value={movements.claim_return} total={movements.total} color="bg-purple-500" />
              <MovementBar label="ทำลาย" value={movements.scrap} total={movements.total} color="bg-red-500" />
            </div>
            <div className="mt-3 border-t pt-2 text-right text-xs text-gray-500">
              ทั้งหมด <span className="font-bold text-gray-700">{movements.total.toLocaleString()}</span> รายการ
            </div>
          </div>
        </div>
        )}

        {/* Top Products by Stock */}
        <div className="rounded-xl border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <Archive size={16} /> สินค้าในคลังสูงสุด (Top 10)
            </h3>
            <Link href="/inventory" className="text-xs text-blue-600 hover:underline">ดูคลัง →</Link>
          </div>
          <div className="max-h-[340px] overflow-y-auto">
            {topProducts.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">ไม่มีข้อมูล</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">สินค้า</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">ในคลัง</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">ชำรุด</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">ขาย</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Min</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map(p => {
                    const isLow = p.stock_min > 0 && p.in_stock_count < p.stock_min;
                    return (
                      <tr key={p.product_id} className={`border-t ${isLow ? 'bg-red-50/50' : 'hover:bg-gray-50'}`}>
                        <td className="px-4 py-2">
                          <div className="font-medium">{p.product_name}</div>
                          <div className="text-xs text-gray-400">{p.product_code}</div>
                        </td>
                        <td className={`px-3 py-2 text-right font-bold ${isLow ? 'text-red-600' : 'text-green-600'}`}>
                          {p.in_stock_count}
                        </td>
                        <td className="px-3 py-2 text-right text-orange-600">{p.damaged_count}</td>
                        <td className="px-3 py-2 text-right text-blue-600">{p.sold_count}</td>
                        <td className="px-3 py-2 text-right text-gray-400">{p.stock_min || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ═══ Row 4: Dormant Inventory Alerts ═══ */}
      {((alerts.no_movement?.length || 0) > 0 || (alerts.long_storage?.length || 0) > 0) && (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          {(alerts.no_movement?.length || 0) > 0 && (
            <div className="rounded-xl border border-yellow-200 bg-yellow-50/30 shadow-sm">
              <div className="flex items-center justify-between border-b border-yellow-200 px-4 py-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-yellow-800">
                  <Timer size={16} /> ไม่มีเคลื่อนไหว (30 วัน)
                </h3>
                <Badge variant="warning">{alerts.no_movement.length} รายการ</Badge>
              </div>
              <div className="max-h-[200px] overflow-y-auto p-2">
                <div className="flex flex-wrap gap-1.5">
                  {alerts.no_movement.slice(0, 20).map(inv => (
                    <span key={inv.id} className="inline-block rounded bg-yellow-100 px-2 py-1 text-xs font-mono text-yellow-800">
                      {inv.serial_number}
                    </span>
                  ))}
                  {alerts.no_movement.length > 20 && (
                    <Link href="/alerts" className="inline-flex items-center gap-1 rounded bg-yellow-200 px-2 py-1 text-xs text-yellow-800 hover:bg-yellow-300">
                      +{alerts.no_movement.length - 20} อื่นๆ <ArrowRight size={12} />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )}

          {(alerts.long_storage?.length || 0) > 0 && (
            <div className="rounded-xl border border-orange-200 bg-orange-50/30 shadow-sm">
              <div className="flex items-center justify-between border-b border-orange-200 px-4 py-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-orange-800">
                  <PackageX size={16} /> เก็บนาน (90 วัน)
                </h3>
                <Badge variant="danger">{alerts.long_storage.length} รายการ</Badge>
              </div>
              <div className="max-h-[200px] overflow-y-auto p-2">
                <div className="flex flex-wrap gap-1.5">
                  {alerts.long_storage.slice(0, 20).map(inv => (
                    <span key={inv.id} className="inline-block rounded bg-orange-100 px-2 py-1 text-xs font-mono text-orange-800">
                      {inv.serial_number}
                    </span>
                  ))}
                  {alerts.long_storage.length > 20 && (
                    <Link href="/alerts" className="inline-flex items-center gap-1 rounded bg-orange-200 px-2 py-1 text-xs text-orange-800 hover:bg-orange-300">
                      +{alerts.long_storage.length - 20} อื่นๆ <ArrowRight size={12} />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ Row 5: Quick Links ═══ */}
      <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${canViewReports ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
        <QuickLink href="/inventory" icon={<Warehouse size={18} />} label="คลังสินค้า" color="bg-green-50 text-green-700 hover:bg-green-100" />
        <QuickLink href="/production-orders" icon={<ClipboardList size={18} />} label="ใบสั่งผลิต" color="bg-blue-50 text-blue-700 hover:bg-blue-100" />
        <QuickLink href="/stock-deductions" icon={<TrendingDown size={18} />} label="ตัดสต๊อก" color="bg-cyan-50 text-cyan-700 hover:bg-cyan-100" />
        <QuickLink href="/claims" icon={<FileWarning size={18} />} label="เคลมสินค้า" color="bg-orange-50 text-orange-700 hover:bg-orange-100" />
        {canViewReports && <QuickLink href="/reports" icon={<BarChart3 size={18} />} label="รายงาน" color="bg-purple-50 text-purple-700 hover:bg-purple-100" />}
      </div>
    </div>
  );
}

/* ═══ Sub-components ═══ */

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className={`rounded-xl p-4 ${color}`}>
      <div className="flex items-center gap-2 mb-1 opacity-70">{icon}<span className="text-xs font-medium">{label}</span></div>
      <p className="text-2xl font-bold">{value.toLocaleString()}</p>
    </div>
  );
}

function MiniStat({ label, value, color = 'text-gray-700' }: { label: string; value: number; color?: string }) {
  return (
    <div className="py-1">
      <p className={`text-xl font-bold ${color}`}>{value.toLocaleString()}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

function MovementBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 text-xs text-gray-600 shrink-0">{label}</span>
      <div className="flex-1 h-5 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.max(pct, 0.5)}%` }} />
      </div>
      <span className="w-16 text-right text-xs font-medium text-gray-700">{value.toLocaleString()}</span>
    </div>
  );
}

function QuickLink({ href, icon, label, color }: { href: string; icon: React.ReactNode; label: string; color: string }) {
  return (
    <Link href={href} className={`flex items-center gap-2 rounded-xl p-3 text-sm font-medium transition-colors ${color}`}>
      {icon} {label}
    </Link>
  );
}
