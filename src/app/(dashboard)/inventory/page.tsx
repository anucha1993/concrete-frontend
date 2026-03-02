'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import AuthGuard from '@/components/AuthGuard';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import Pagination from '@/components/ui/Pagination';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { inventoryService } from '@/services/inventory.service';
import { locationService } from '@/services/master.service';
import type { Inventory, InventorySummary, Location } from '@/lib/types';
import { Search, Eye, BarChart3, List, Package, ChevronLeft, ChevronRight, LayoutGrid, AlertTriangle, GripVertical, RotateCcw, Pencil, Save, X } from 'lucide-react';

const STATUS_MAP: Record<string, { label: string; variant: 'gray' | 'info' | 'warning' | 'success' | 'danger' }> = {
  PENDING:   { label: 'รอรับเข้าคลัง', variant: 'gray' },
  IN_STOCK:  { label: 'ในคลัง', variant: 'success' },
  SOLD:      { label: 'ขายแล้ว', variant: 'info' },
  DAMAGED:   { label: 'ชำรุด', variant: 'danger' },
  SCRAPPED:  { label: 'ทำลาย', variant: 'gray' },
};

const CONDITION_MAP: Record<string, { label: string; variant: 'success' | 'danger' }> = {
  GOOD:    { label: 'สภาพดี', variant: 'success' },
  DAMAGED: { label: 'ชำรุด', variant: 'danger' },
};

export default function InventoryPage() {
  return (
    <AuthGuard permission="view_inventory">
      <InventoryContent />
    </AuthGuard>
  );
}

type ViewMode = 'cards' | 'summary' | 'list';

function InventoryContent() {
  const [viewMode, setViewMode] = useState<ViewMode>('cards');

  return (
    <div>
      <PageHeader title="คลังสินค้า" description="ติดตาม Serial Number, สต็อกสินค้า, และความเคลื่อนไหว" actions={
        <div className="flex rounded-lg border border-gray-300 overflow-hidden">
          <button onClick={() => setViewMode('cards')}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${viewMode === 'cards' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
            <LayoutGrid size={16} /> ภาพรวม
          </button>
          <button onClick={() => setViewMode('summary')}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${viewMode === 'summary' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
            <BarChart3 size={16} /> ตาราง
          </button>
          <button onClick={() => setViewMode('list')}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
            <List size={16} /> Serial
          </button>
        </div>
      } />

      {viewMode === 'cards' ? <StockCardsView /> : viewMode === 'summary' ? <SummaryView /> : <InventoryListView />}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Stock Cards View — visual product cards with progress bars
   ══════════════════════════════════════════════════════════════════ */
const STORAGE_KEY = 'stockCardsOrder';

function StockCardsView() {
  const [data, setData] = useState<InventorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [customOrder, setCustomOrder] = useState<number[]>([]);

  // Drag state
  const dragIdx = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Drill-down
  const [selectedProduct, setSelectedProduct] = useState<InventorySummary | null>(null);
  const [serials, setSerials] = useState<Inventory[]>([]);
  const [serialMeta, setSerialMeta] = useState({ current_page: 1, last_page: 1, per_page: 20, total: 0 });
  const [serialPage, setSerialPage] = useState(1);
  const [serialLoading, setSerialLoading] = useState(false);
  const [serialFilter, setSerialFilter] = useState('');

  // Load saved order from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setCustomOrder(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inventoryService.summary();
      setData(res.data.map(d => ({ ...d, id: d.product_id })));
    } catch {
      toast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchSerials = useCallback(async (productId: number, page: number, status?: string) => {
    setSerialLoading(true);
    try {
      const params: Record<string, unknown> = { product_id: productId, page, per_page: 20 };
      if (status) params.status = status;
      const res = await inventoryService.list(params);
      setSerials(res.data);
      setSerialMeta(res.meta);
    } catch {
      toast('โหลดรายการ Serial ไม่สำเร็จ', 'error');
    } finally {
      setSerialLoading(false);
    }
  }, []);

  const openProductSerials = (product: InventorySummary) => {
    setSelectedProduct(product);
    setSerialPage(1);
    setSerialFilter('');
    fetchSerials(product.product_id, 1);
  };

  const closeProductSerials = () => {
    setSelectedProduct(null);
    setSerials([]);
    setSerialFilter('');
  };

  useEffect(() => {
    if (selectedProduct) {
      fetchSerials(selectedProduct.product_id, serialPage, serialFilter || undefined);
    }
  }, [selectedProduct, serialPage, serialFilter, fetchSerials]);

  /** Apply custom order then filter */
  const ordered = (() => {
    if (customOrder.length === 0) return data;
    const orderMap = new Map(customOrder.map((id, i) => [id, i]));
    return [...data].sort((a, b) => {
      const ia = orderMap.get(a.product_id) ?? 99999;
      const ib = orderMap.get(b.product_id) ?? 99999;
      return ia - ib;
    });
  })();

  const filtered = search
    ? ordered.filter(d =>
        d.product_code.toLowerCase().includes(search.toLowerCase()) ||
        d.product_name.toLowerCase().includes(search.toLowerCase()) ||
        d.category_name.toLowerCase().includes(search.toLowerCase())
      )
    : ordered;

  const canDrag = !search; // disable drag when searching

  /** Save order to state + localStorage */
  const saveOrder = (ids: number[]) => {
    setCustomOrder(ids);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ids)); } catch { /* ignore */ }
  };

  const handleDragStart = (idx: number) => {
    dragIdx.current = idx;
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx.current === null || dragIdx.current === idx) return;
    setDragOverIdx(idx);
  };

  const handleDrop = (idx: number) => {
    if (dragIdx.current === null || dragIdx.current === idx) {
      dragIdx.current = null;
      setDragOverIdx(null);
      return;
    }
    const items = [...filtered];
    const [moved] = items.splice(dragIdx.current, 1);
    items.splice(idx, 0, moved);
    saveOrder(items.map(i => i.product_id));
    dragIdx.current = null;
    setDragOverIdx(null);
  };

  const handleDragEnd = () => {
    dragIdx.current = null;
    setDragOverIdx(null);
  };

  const resetOrder = () => {
    saveOrder([]);
    toast('รีเซ็ตลำดับการแสดงแล้ว', 'success');
  };

  // Overall stats
  const totalInStock = data.reduce((s, d) => s + d.in_stock_count, 0);
  const totalDamaged = data.reduce((s, d) => s + d.damaged_count, 0);
  const totalInWarehouse = totalInStock + totalDamaged;
  const totalSold = data.reduce((s, d) => s + d.sold_count, 0);
  const lowStockCount = data.filter(d => d.stock_min > 0 && (d.in_stock_count + d.damaged_count) <= d.stock_min).length;

  /** Color based on stock level relative to min/max */
  const getStockColor = (item: InventorySummary) => {
    if (item.stock_min > 0 && (item.in_stock_count + item.damaged_count) <= item.stock_min) return 'red';
    if (item.stock_max > 0 && (item.in_stock_count + item.damaged_count) >= item.stock_max) return 'yellow';
    return 'green';
  };

  const getStockPercent = (item: InventorySummary) => {
    if (item.stock_max > 0) return Math.min(100, ((item.in_stock_count + item.damaged_count) / item.stock_max) * 100);
    if (item.total_count > 0) return ((item.in_stock_count + item.damaged_count) / item.total_count) * 100;
    return 0;
  };

  return (
    <div>
      {/* Search + reset order */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="ค้นหาสินค้า..." value={search} onChange={e => setSearch(e.target.value)}
            className="rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none" />
        </div>
        {customOrder.length > 0 && (
          <button onClick={resetOrder} className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 transition">
            <RotateCcw size={14} /> รีเซ็ตลำดับ
          </button>
        )}
        {canDrag && <span className="text-[11px] text-gray-400">ลากเพื่อจัดเรียงตำแหน่ง</span>}
      </div>

      {/* Top stats strip */}
      {!loading && data.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-6">
          <StatCard label="สินค้าทั้งหมด" value={data.length} icon={<Package size={20} className="text-blue-500" />} />
          <StatCard label="ในคลังรวม" value={totalInWarehouse} icon={<BarChart3 size={20} className="text-green-500" />} />
          <StatCard label="สินค้าดี" value={totalInStock} icon={<BarChart3 size={20} className="text-emerald-500" />} />
          <StatCard label="ขายแล้วรวม" value={totalSold} icon={<BarChart3 size={20} className="text-blue-500" />} />
          <StatCard label="ชำรุดรวม" value={totalDamaged} icon={<BarChart3 size={20} className="text-red-500" />} />
          <StatCard label="ต่ำกว่าขั้นต่ำ" value={lowStockCount} icon={<AlertTriangle size={20} className="text-yellow-500" />} />
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="py-12 text-center text-sm text-gray-400">กำลังโหลดข้อมูล...</div>
      )}

      {/* Low stock warning */}
      {!loading && lowStockCount > 0 && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={16} className="mr-1.5 inline -mt-0.5" />
          <strong>{lowStockCount} สินค้า</strong> มีสต๊อกต่ำกว่าขั้นต่ำที่กำหนด
        </div>
      )}

      {/* Product Cards Grid */}
      {!loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((item, idx) => {
            const color = getStockColor(item);
            const pct = getStockPercent(item);
            const isLow = color === 'red';
            const isOver = color === 'yellow';

            const barColor = isLow ? 'bg-red-500' : isOver ? 'bg-yellow-500' : 'bg-green-500';
            const borderColor = isLow ? 'border-red-300 ring-1 ring-red-100' : isOver ? 'border-yellow-200' : 'border-gray-200';
            const isDragOver = dragOverIdx === idx;

            return (
              <div key={item.product_id}
                draggable={canDrag}
                onDragStart={() => handleDragStart(idx)}
                onDragOver={e => handleDragOver(e, idx)}
                onDrop={() => handleDrop(idx)}
                onDragEnd={handleDragEnd}
                onClick={() => openProductSerials(item)}
                className={`relative rounded-xl border bg-white p-4 shadow-sm transition hover:shadow-md
                  ${borderColor}
                  ${canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}
                  ${isDragOver ? 'ring-2 ring-blue-400 scale-[1.02]' : ''}`}
                style={{ opacity: dragIdx.current === idx ? 0.4 : 1 }}>
                {/* Drag handle */}
                {canDrag && (
                  <div className="absolute -left-0.5 top-1/2 -translate-y-1/2 p-1 text-gray-300 hover:text-gray-500 transition"
                    onMouseDown={e => e.stopPropagation()}>
                    <GripVertical size={16} />
                  </div>
                )}
                {/* Header */}
                <div className="mb-3 flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-gray-800">{item.product_name}</p>
                    <p className="text-xs text-gray-400">{item.product_code} · {item.category_name}</p>
                  </div>
                  {isLow && (
                    <span className="ml-2 shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">ต่ำ!</span>
                  )}
                  {isOver && (
                    <span className="ml-2 shrink-0 rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-semibold text-yellow-700">เกิน</span>
                  )}
                </div>

                {/* Big number */}
                <div className="mb-2 flex items-baseline gap-1.5">
                  <span className={`text-3xl font-extrabold ${isLow ? 'text-red-600' : 'text-gray-800'}`}>{item.in_stock_count + item.damaged_count}</span>
                  <span className="text-sm text-gray-400">ชิ้น</span>
                  {item.stock_max > 0 && (
                    <span className="text-xs text-gray-400">/ {item.stock_max}</span>
                  )}
                </div>

                {/* Progress bar */}
                <div className="mb-3 h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                    style={{ width: `${Math.max(pct, 2)}%` }} />
                </div>

                {/* Status breakdown */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-green-500" /> ในคลัง {item.in_stock_count}
                  </span>
                  {item.reserved_count > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-2 w-2 rounded-full bg-orange-400" /> จอง {item.reserved_count}
                    </span>
                  )}
                  {item.damaged_count > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-2 w-2 rounded-full bg-red-500" /> ชำรุด {item.damaged_count}
                    </span>
                  )}
                  {item.sold_count > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-2 w-2 rounded-full bg-blue-500" /> ขายแล้ว {item.sold_count}
                    </span>
                  )}
                </div>

                {/* Min/max */}
                {(item.stock_min > 0 || item.stock_max > 0) && (
                  <div className="mt-2 border-t pt-2 text-[11px] text-gray-400">
                    ขั้นต่ำ: {item.stock_min} · สูงสุด: {item.stock_max}
                  </div>
                )}
              </div>
            );
          })}

          {filtered.length === 0 && !loading && (
            <div className="col-span-full py-12 text-center text-sm text-gray-400">
              {search ? 'ไม่พบสินค้าที่ตรงกับคำค้นหา' : 'ไม่มีข้อมูลสต็อกสินค้า'}
            </div>
          )}
        </div>
      )}

      {/* Product Serials Modal */}
      <Modal open={!!selectedProduct} onClose={closeProductSerials}
        title={`รายการ Serial — ${selectedProduct?.product_code} ${selectedProduct?.product_name || ''}`} size="xl">
        {selectedProduct && (
          <ProductSerialList
            product={selectedProduct}
            serials={serials}
            meta={serialMeta}
            page={serialPage}
            loading={serialLoading}
            filter={serialFilter}
            onPageChange={setSerialPage}
            onFilterChange={(f) => { setSerialFilter(f); setSerialPage(1); }}
          />
        )}
      </Modal>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Summary View — stock per product (table)
   ══════════════════════════════════════════════════════════════════ */
function SummaryView() {
  const [data, setData] = useState<InventorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Drill-down: selected product → show serials
  const [selectedProduct, setSelectedProduct] = useState<InventorySummary | null>(null);
  const [serials, setSerials] = useState<Inventory[]>([]);
  const [serialMeta, setSerialMeta] = useState({ current_page: 1, last_page: 1, per_page: 20, total: 0 });
  const [serialPage, setSerialPage] = useState(1);
  const [serialLoading, setSerialLoading] = useState(false);
  const [serialFilter, setSerialFilter] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inventoryService.summary();
      setData(res.data.map(d => ({ ...d, id: d.product_id })));
    } catch {
      toast('โหลดข้อมูลภาพรวมไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Fetch serials for selected product
  const fetchSerials = useCallback(async (productId: number, page: number, status?: string) => {
    setSerialLoading(true);
    try {
      const params: Record<string, unknown> = { product_id: productId, page, per_page: 20 };
      if (status) params.status = status;
      const res = await inventoryService.list(params);
      setSerials(res.data);
      setSerialMeta(res.meta);
    } catch {
      toast('โหลดรายการ Serial ไม่สำเร็จ', 'error');
    } finally {
      setSerialLoading(false);
    }
  }, []);

  const openProductSerials = (product: InventorySummary) => {
    setSelectedProduct(product);
    setSerialPage(1);
    setSerialFilter('');
    fetchSerials(product.product_id, 1);
  };

  const closeProductSerials = () => {
    setSelectedProduct(null);
    setSerials([]);
    setSerialFilter('');
  };

  useEffect(() => {
    if (selectedProduct) {
      fetchSerials(selectedProduct.product_id, serialPage, serialFilter || undefined);
    }
  }, [selectedProduct, serialPage, serialFilter, fetchSerials]);

  const filtered = search
    ? data.filter(d =>
        d.product_code.toLowerCase().includes(search.toLowerCase()) ||
        d.product_name.toLowerCase().includes(search.toLowerCase()) ||
        d.category_name.toLowerCase().includes(search.toLowerCase())
      )
    : data;

  const columns = [
    {
      key: 'product_code', label: 'รหัสสินค้า',
      render: (r: InventorySummary) => <span className="font-mono text-sm font-medium">{r.product_code}</span>,
    },
    {
      key: 'product_name', label: 'ชื่อสินค้า',
      render: (r: InventorySummary) => (
        <div>
          <div className="font-medium">{r.product_name}</div>
          <div className="text-xs text-gray-400">{r.category_name}</div>
        </div>
      ),
    },
    {
      key: 'in_stock', label: 'ในคลัง',
      render: (r: InventorySummary) => {
        const total = r.in_stock_count + r.damaged_count;
        const isLow = total <= r.stock_min && r.stock_min > 0;
        return <span className={`font-semibold ${isLow ? 'text-red-600' : 'text-green-600'}`}>{total}</span>;
      },
    },
    {
      key: 'reserved', label: 'จองตัด',
      render: (r: InventorySummary) => r.reserved_count > 0
        ? <span className="font-semibold text-orange-500">{r.reserved_count}</span>
        : <span className="text-gray-300">0</span>,
    },
    {
      key: 'damaged', label: 'ชำรุด',
      render: (r: InventorySummary) => <span className="text-red-600">{r.damaged_count}</span>,
    },
    {
      key: 'sold', label: 'ขายแล้ว',
      render: (r: InventorySummary) => <span className="text-blue-600">{r.sold_count}</span>,
    },
    {
      key: 'total', label: 'ทั้งหมด',
      render: (r: InventorySummary) => <span className="font-bold">{r.total_count}</span>,
    },
    {
      key: 'stock_setting', label: 'ขั้นต่ำ / สูงสุด',
      render: (r: InventorySummary) => <span className="text-sm text-gray-500">{r.stock_min} / {r.stock_max}</span>,
    },
    {
      key: 'status_bar', label: 'สถานะ',
      render: (r: InventorySummary) => {
        if (r.stock_min > 0 && r.in_stock_count <= r.stock_min) {
          return <Badge variant="danger">ต่ำกว่าขั้นต่ำ</Badge>;
        }
        if (r.stock_max > 0 && r.in_stock_count >= r.stock_max) {
          return <Badge variant="warning">เกินสูงสุด</Badge>;
        }
        return <Badge variant="success">ปกติ</Badge>;
      },
    },
  ];

  return (
    <div>
      <div className="mb-4 flex items-end gap-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="ค้นหาสินค้า..." value={search} onChange={e => setSearch(e.target.value)}
            className="rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none" />
        </div>
      </div>

      {/* Stats cards */}
      {!loading && data.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="สินค้าทั้งหมด" value={data.length} icon={<Package size={20} className="text-blue-500" />} />
          <StatCard label="ในคลังรวม" value={data.reduce((s, d) => s + d.in_stock_count + d.damaged_count, 0)} icon={<BarChart3 size={20} className="text-green-500" />} />
          <StatCard label="ชำรุดรวม" value={data.reduce((s, d) => s + d.damaged_count, 0)} icon={<BarChart3 size={20} className="text-red-500" />} />
          <StatCard label="ต่ำกว่าขั้นต่ำ" value={data.filter(d => d.stock_min > 0 && (d.in_stock_count + d.damaged_count) <= d.stock_min).length} icon={<BarChart3 size={20} className="text-yellow-500" />} />
        </div>
      )}

      <DataTable columns={columns} data={filtered} loading={loading} emptyMessage="ไม่มีข้อมูลสต็อกสินค้า"
        onRowClick={openProductSerials} />

      {/* Product Serials Modal */}
      <Modal open={!!selectedProduct} onClose={closeProductSerials}
        title={`รายการ Serial — ${selectedProduct?.product_code} ${selectedProduct?.product_name || ''}`} size="xl">
        {selectedProduct && (
          <ProductSerialList
            product={selectedProduct}
            serials={serials}
            meta={serialMeta}
            page={serialPage}
            loading={serialLoading}
            filter={serialFilter}
            onPageChange={setSerialPage}
            onFilterChange={(f) => { setSerialFilter(f); setSerialPage(1); }}
          />
        )}
      </Modal>
    </div>
  );
}

/* ── Product Serial List (inside modal) ── */
function ProductSerialList({ product, serials, meta, page, loading, filter, onPageChange, onFilterChange }: {
  product: InventorySummary;
  serials: Inventory[];
  meta: { current_page: number; last_page: number; per_page: number; total: number };
  page: number;
  loading: boolean;
  filter: string;
  onPageChange: (p: number) => void;
  onFilterChange: (f: string) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="flex flex-wrap gap-3 text-sm">
        <span className="rounded-full bg-green-100 px-3 py-1 text-green-700 font-medium">ในคลัง: {product.in_stock_count}</span>
        {product.reserved_count > 0 && (
          <span className="rounded-full bg-orange-100 px-3 py-1 text-orange-700 font-medium">จองตัด: {product.reserved_count}</span>
        )}
        <span className="rounded-full bg-red-100 px-3 py-1 text-red-700 font-medium">ชำรุด: {product.damaged_count}</span>
        <span className="rounded-full bg-blue-100 px-3 py-1 text-blue-700 font-medium">ขายแล้ว: {product.sold_count}</span>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-700 font-medium">รวม: {product.total_count}</span>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">กรอง:</span>
        <select value={filter} onChange={e => onFilterChange(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none">
          <option value="">ทุกสถานะ</option>
          <option value="IN_STOCK">ในคลัง</option>
          <option value="PENDING">รอรับเข้าคลัง</option>
          <option value="DAMAGED">ชำรุด</option>
          <option value="SOLD">ขายแล้ว</option>
          <option value="SCRAPPED">ทำลาย</option>
        </select>
        <span className="ml-auto text-xs text-gray-400">{meta.total} รายการ</span>
      </div>

      {/* Serial list */}
      <div className="max-h-[28rem] overflow-y-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Serial Number</th>
              <th className="px-3 py-2 text-left">คลัง</th>
              <th className="px-3 py-2 text-center">สถานะ</th>
              <th className="px-3 py-2 text-center">สภาพ</th>
              <th className="px-3 py-2 text-left">หมายเหตุ</th>
              <th className="px-3 py-2 text-left">วันที่รับเข้า</th>
              <th className="px-3 py-2 text-left">เคลื่อนไหวล่าสุด</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400">กำลังโหลด...</td></tr>
            ) : serials.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400">ไม่มีรายการ Serial</td></tr>
            ) : (
              serials.map((s, i) => {
                const st = STATUS_MAP[s.status] || { label: s.status, variant: 'gray' as const };
                const cn = CONDITION_MAP[s.condition] || { label: s.condition, variant: 'success' as const };
                return (
                  <tr key={s.id} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-400">{(page - 1) * meta.per_page + i + 1}</td>
                    <td className="px-3 py-2 font-mono text-xs font-medium">{s.serial_number}</td>
                    <td className="px-3 py-2 text-sm">{s.location?.name || '-'}</td>
                    <td className="px-3 py-2 text-center"><Badge variant={st.variant}>{st.label}</Badge></td>
                    <td className="px-3 py-2 text-center">
                      <Badge variant={cn.variant}>{cn.label}</Badge>
                      {s.claim_return && (
                        <div className="mt-1">
                          <Badge variant="info">คืนจากเคลม {s.claim_return.claim_code}</Badge>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs max-w-[160px]">
                      {s.note && <div className="text-gray-500 truncate" title={s.note}>{s.note}</div>}
                      {s.last_adjustment && <div className="text-orange-600 truncate" title={s.last_adjustment.note}>✏️ {s.last_adjustment.note}</div>}
                      {!s.note && !s.last_adjustment && <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">{s.received_at ? new Date(s.received_at).toLocaleDateString('th-TH') : '-'}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{s.last_movement_at ? new Date(s.last_movement_at).toLocaleDateString('th-TH') : '-'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {meta.last_page > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-gray-500">หน้า {meta.current_page} / {meta.last_page}</span>
          <div className="flex gap-1">
            <button onClick={() => onPageChange(page - 1)} disabled={page <= 1}
              className="rounded border px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-40">
              <ChevronLeft size={16} />
            </button>
            <button onClick={() => onPageChange(page + 1)} disabled={page >= meta.last_page}
              className="rounded border px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-40">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-50">{icon}</div>
      <div>
        <p className="text-2xl font-bold">{value.toLocaleString()}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   List View — individual serials
   ══════════════════════════════════════════════════════════════════ */
function InventoryListView() {
  const [items, setItems] = useState<Inventory[]>([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, per_page: 15, total: 0 });
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCondition, setFilterCondition] = useState('');
  const [page, setPage] = useState(1);

  const [selectedItem, setSelectedItem] = useState<Inventory | null>(null);
  const [detailData, setDetailData] = useState<Inventory | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, per_page: 15 };
      if (search) params.search = search;
      if (filterStatus) params.status = filterStatus;
      if (filterCondition) params.condition = filterCondition;
      const res = await inventoryService.list(params);
      setItems(res.data);
      setMeta(res.meta);
    } catch {
      toast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, search, filterStatus, filterCondition]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSearchSubmit = (e: React.FormEvent) => { e.preventDefault(); setPage(1); fetchData(); };

  const openDetail = async (inv: Inventory) => {
    setSelectedItem(inv);
    try {
      const res = await inventoryService.get(inv.id);
      setDetailData(res.data);
    } catch {
      toast('โหลดรายละเอียดไม่สำเร็จ', 'error');
    }
  };

  const columns = [
    {
      key: 'serial_number', label: 'Serial Number',
      render: (r: Inventory) => <span className="font-mono text-xs font-medium">{r.serial_number}</span>,
    },
    {
      key: 'product', label: 'สินค้า',
      render: (r: Inventory) => (
        <div>
          <div className="font-medium text-sm">{r.product?.name || '-'}</div>
          <div className="text-xs text-gray-400">{r.product?.product_code}</div>
        </div>
      ),
    },
    {
      key: 'location', label: 'คลัง',
      render: (r: Inventory) => <span>{r.location?.name || '-'}</span>,
    },
    {
      key: 'status', label: 'สถานะ',
      render: (r: Inventory) => {
        const s = STATUS_MAP[r.status] || { label: r.status, variant: 'gray' as const };
        return <Badge variant={s.variant}>{s.label}</Badge>;
      },
    },
    {
      key: 'condition', label: 'สภาพ',
      render: (r: Inventory) => {
        const c = CONDITION_MAP[r.condition] || { label: r.condition, variant: 'success' as const };
        return (
          <div>
            <Badge variant={c.variant}>{c.label}</Badge>
            {r.claim_return && (
              <div className="mt-1"><Badge variant="info">คืนจากเคลม {r.claim_return.claim_code}</Badge></div>
            )}
          </div>
        );
      },
    },
    {
      key: 'note', label: 'หมายเหตุ',
      render: (r: Inventory) => (
        <div className="max-w-[220px]">
          {r.note && <div className="text-xs text-gray-500 truncate" title={r.note}>{r.note}</div>}
          {r.last_adjustment && (
            <div className="text-xs text-orange-600 truncate" title={r.last_adjustment.note}>
              ✏️ {r.last_adjustment.note}
            </div>
          )}
          {!r.note && !r.last_adjustment && <span className="text-gray-300">-</span>}
        </div>
      ),
    },
    {
      key: 'received_at', label: 'วันที่รับเข้า',
      render: (r: Inventory) => <span className="text-sm text-gray-500">{r.received_at ? new Date(r.received_at).toLocaleDateString('th-TH') : '-'}</span>,
    },
    {
      key: 'actions', label: '',
      render: (r: Inventory) => (
        <button onClick={() => openDetail(r)} className="rounded p-1.5 text-gray-600 hover:bg-gray-100" title="ดูรายละเอียด">
          <Eye size={16} />
        </button>
      ),
    },
  ];

  return (
    <div>
      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="ค้นหา serial, ชื่อสินค้า..." value={search} onChange={e => setSearch(e.target.value)}
              className="rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none" />
          </div>
          <button type="submit" className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">ค้นหา</button>
        </form>
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
          <option value="">ทุกสถานะ</option>
          <option value="PENDING">รอรับเข้าคลัง</option>
          <option value="IN_STOCK">ในคลัง</option>
          <option value="SOLD">ขายแล้ว</option>
          <option value="DAMAGED">ชำรุด</option>
          <option value="SCRAPPED">ทำลาย</option>
        </select>
        <select value={filterCondition} onChange={e => { setFilterCondition(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
          <option value="">ทุกสภาพ</option>
          <option value="GOOD">สภาพดี</option>
          <option value="DAMAGED">ชำรุด</option>
        </select>
      </div>

      <DataTable columns={columns} data={items} loading={loading} emptyMessage="ไม่มีข้อมูลในคลัง" />
      <Pagination currentPage={meta.current_page} lastPage={meta.last_page} total={meta.total} onPageChange={setPage} />

      {/* Detail Modal */}
      <Modal open={!!selectedItem} onClose={() => { setSelectedItem(null); setDetailData(null); }}
        title={`รายละเอียด Serial: ${selectedItem?.serial_number || ''}`} size="lg">
        {detailData ? <InventoryDetail item={detailData} onUpdate={(updated) => {
          setDetailData(updated);
          // refresh list
          setItems(prev => prev.map(i => i.id === updated.id ? { ...i, status: updated.status, condition: updated.condition, location: updated.location, location_id: updated.location_id, note: updated.note } : i));
        }} /> : <p className="py-8 text-center text-sm text-gray-400">กำลังโหลด...</p>}
      </Modal>
    </div>
  );
}

/* ── Inventory Detail (with movements + edit) ── */
function InventoryDetail({ item, onUpdate }: {
  item: Inventory & { movements?: Array<{ id: number; type: string; from_location?: { name: string }; to_location?: { name: string }; creator?: { name: string }; created_at: string; note?: string }> };
  onUpdate?: (updated: Inventory) => void;
}) {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('manage_inventory');

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [form, setForm] = useState({
    status: item.status,
    condition: item.condition,
    location_id: item.location_id,
    note: item.note || '',
    reason: '',
  });

  // Load locations on edit start
  useEffect(() => {
    if (editing && locations.length === 0) {
      locationService.list().then(res => setLocations(res.data)).catch(() => {});
    }
  }, [editing, locations.length]);

  const hasChanges = form.status !== item.status || form.condition !== item.condition || form.location_id !== item.location_id || form.note !== (item.note || '');

  const handleSave = async () => {
    if (!hasChanges) { toast('ไม่มีการเปลี่ยนแปลง', 'info'); return; }
    if (!form.reason.trim()) { toast('กรุณาระบุเหตุผลการแก้ไข', 'error'); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { reason: form.reason };
      if (form.status !== item.status) payload.status = form.status;
      if (form.condition !== item.condition) payload.condition = form.condition;
      if (form.location_id !== item.location_id) payload.location_id = form.location_id;
      if (form.note !== (item.note || '')) payload.note = form.note || null;
      const res = await inventoryService.update(item.id, payload as { reason: string });
      toast(res.message || 'ปรับปรุงสำเร็จ', 'success');
      setEditing(false);
      if (onUpdate && res.data) onUpdate(res.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast(e.response?.data?.message || 'บันทึกไม่สำเร็จ', 'error');
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditing(false);
    setForm({ status: item.status, condition: item.condition, location_id: item.location_id, note: item.note || '', reason: '' });
  };

  const s = STATUS_MAP[item.status] || { label: item.status, variant: 'gray' as const };
  const c = CONDITION_MAP[item.condition] || { label: item.condition, variant: 'success' as const };

  const MOVE_TYPE: Record<string, string> = {
    PRODUCTION_IN: 'ผลิตเข้าคลัง',
    TRANSFER: 'ย้ายคลัง',
    SOLD: 'ขาย',
    DAMAGED: 'ชำรุด',
    ADJUSTMENT: 'ปรับสต็อก',
    SCRAP: 'ทำลาย',
    CLAIM_RETURN: 'คืนสต็อกจากเคลม',
  };

  return (
    <div className="space-y-4">
      {/* Action buttons */}
      {canEdit && !editing && (
        <div className="flex justify-end">
          <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Pencil size={14} /> แก้ไข
          </button>
        </div>
      )}

      {!editing ? (
        /* ── View mode ── */
        <div className="grid gap-3 sm:grid-cols-2 text-sm">
          <div><span className="text-gray-500">Serial:</span> <span className="font-mono font-medium">{item.serial_number}</span></div>
          <div><span className="text-gray-500">สถานะ:</span> <Badge variant={s.variant}>{s.label}</Badge></div>
          <div><span className="text-gray-500">สินค้า:</span> {item.product?.product_code} - {item.product?.name}</div>
          <div><span className="text-gray-500">สภาพ:</span> <Badge variant={c.variant}>{c.label}</Badge></div>
          <div><span className="text-gray-500">คลัง:</span> {item.location?.name || '-'}</div>
          <div><span className="text-gray-500">รับเข้าเมื่อ:</span> {item.received_at ? new Date(item.received_at).toLocaleString('th-TH') : '-'}</div>
          <div><span className="text-gray-500">เคลื่อนไหวล่าสุด:</span> {item.last_movement_at ? new Date(item.last_movement_at).toLocaleString('th-TH') : '-'}</div>
        </div>
      ) : (
        /* ── Edit mode ── */
        <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/50 p-4">
          <h4 className="text-sm font-semibold text-blue-800 flex items-center gap-1.5"><Pencil size={14} /> แก้ไขข้อมูล (Admin)</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Serial</label>
              <input type="text" value={item.serial_number} disabled className="w-full rounded-lg border bg-gray-100 px-3 py-2 text-sm font-mono" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">สินค้า</label>
              <input type="text" value={`${item.product?.product_code} — ${item.product?.name}`} disabled className="w-full rounded-lg border bg-gray-100 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">สถานะ *</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as typeof f.status }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                <option value="PENDING">รอรับเข้าคลัง</option>
                <option value="IN_STOCK">ในคลัง</option>
                <option value="SOLD">ขายแล้ว</option>
                <option value="DAMAGED">ชำรุด</option>
                <option value="SCRAPPED">ทำลาย</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">สภาพ *</label>
              <select value={form.condition} onChange={e => setForm(f => ({ ...f, condition: e.target.value as typeof f.condition }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                <option value="GOOD">สภาพดี</option>
                <option value="DAMAGED">ชำรุด</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">คลัง</label>
              <select value={form.location_id ?? ''} onChange={e => setForm(f => ({ ...f, location_id: e.target.value ? Number(e.target.value) : null }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                <option value="">— ไม่ระบุ —</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">หมายเหตุ</label>
              <input type="text" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                placeholder="หมายเหตุ (ถ้ามี)" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-red-600">เหตุผลการแก้ไข *</label>
            <input type="text" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              placeholder="เช่น แก้สถานะที่ถูก mark ผิด, ย้ายคลัง ฯลฯ" className="w-full rounded-lg border border-red-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={cancelEdit} disabled={saving} className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
              <X size={14} /> ยกเลิก
            </button>
            <button onClick={handleSave} disabled={saving || !hasChanges || !form.reason.trim()}
              className="flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              <Save size={14} /> {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </div>
      )}

      {item.note && !editing && <div className="rounded bg-gray-50 p-3 text-sm"><span className="text-gray-500">หมายเหตุ:</span> {item.note}</div>}

      {item.claim_return && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-blue-800">
            <Badge variant="info">คืนสต็อกจากเคลม</Badge>
            <span className="font-mono">{item.claim_return.claim_code}</span>
          </div>
          {item.claim_return.date && (
            <p className="mt-1 text-xs text-blue-600">คืนเมื่อ: {new Date(item.claim_return.date).toLocaleString('th-TH')}</p>
          )}
        </div>
      )}

      {item.movements && item.movements.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold text-gray-700">ประวัติเคลื่อนไหว</h4>
          <div className="max-h-64 overflow-y-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">วันที่</th>
                  <th className="px-3 py-2 text-left">ประเภท</th>
                  <th className="px-3 py-2 text-left">จาก</th>
                  <th className="px-3 py-2 text-left">ไป</th>
                  <th className="px-3 py-2 text-left">โดย</th>
                </tr>
              </thead>
              <tbody>
                {item.movements.map(m => (
                  <tr key={m.id} className="border-t">
                    <td className="px-3 py-2 text-xs text-gray-500">{new Date(m.created_at).toLocaleString('th-TH')}</td>
                    <td className="px-3 py-2">{MOVE_TYPE[m.type] || m.type}</td>
                    <td className="px-3 py-2">{m.from_location?.name || '-'}</td>
                    <td className="px-3 py-2">{m.to_location?.name || '-'}</td>
                    <td className="px-3 py-2">{m.creator?.name || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
