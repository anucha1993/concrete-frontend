'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import {
  LayoutDashboard,
  Package,
  FolderTree,
  MapPin,
  Users,
  Shield,
  LogOut,
  Menu,
  X,
  Building2,
  Boxes,
  ClipboardList,
  Warehouse,
  Bell,
  Printer,
  RotateCw,
  ClipboardCheck,
  TrendingDown,
  FileWarning,
  BarChart3,
  Palette,
} from 'lucide-react';
import { useState } from 'react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  permission?: string;
}

const navItems: NavItem[] = [
  { label: 'แดชบอร์ด', href: '/dashboard', icon: <LayoutDashboard size={20} /> },
  { label: 'สินค้า', href: '/products', icon: <Package size={20} />, permission: 'view_products' },
  { label: 'แพสินค้า', href: '/packs', icon: <Boxes size={20} />, permission: 'view_products' },
  { label: 'ใบสั่งผลิต', href: '/production-orders', icon: <ClipboardList size={20} />, permission: 'view_production' },
  { label: 'คลังสินค้า', href: '/inventory', icon: <Warehouse size={20} />, permission: 'view_inventory' },
  { label: 'แจ้งเตือน', href: '/alerts', icon: <Bell size={20} />, permission: 'view_inventory' },
  { label: 'ปริ้น Label', href: '/labels', icon: <Printer size={20} />, permission: 'view_production' },
  { label: 'ออกแบบ Label', href: '/label-templates', icon: <Palette size={20} />, permission: 'manage_production' },
  { label: 'คำขอปริ้นซ้ำ', href: '/reprint-requests', icon: <RotateCw size={20} />, permission: 'view_production' },
  { label: 'ตรวจนับสต๊อก', href: '/stock-counts', icon: <ClipboardCheck size={20} />, permission: 'view_operations' },
  { label: 'ตัดสต๊อก', href: '/stock-deductions', icon: <TrendingDown size={20} />, permission: 'view_operations' },
  { label: 'เคลมสินค้า', href: '/claims', icon: <FileWarning size={20} />, permission: 'view_operations' },
  { label: 'รายงาน', href: '/reports', icon: <BarChart3 size={20} />, permission: 'view_reports' },
  { label: 'หมวดหมู่', href: '/categories', icon: <FolderTree size={20} />, permission: 'view_products' },
  { label: 'ตำแหน่งคลัง', href: '/locations', icon: <MapPin size={20} />, permission: 'view_locations' },
  { label: 'ผู้ใช้งาน', href: '/users', icon: <Users size={20} />, permission: 'view_users' },
  { label: 'บทบาท & สิทธิ์', href: '/roles', icon: <Shield size={20} />, permission: 'manage_roles' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout, hasPermission } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const filteredItems = navItems.filter(
    (item) => !item.permission || hasPermission(item.permission)
  );

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  const sidebarContent = (
    <div className="flex h-full flex-col bg-gray-900 text-white">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-gray-700 px-4 py-5">
        <Building2 size={28} className="text-blue-400" />
        <div>
          <h1 className="text-lg font-bold">Stock Concrete</h1>
          <p className="text-xs text-gray-400">ระบบจัดการคลังคอนกรีต</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {filteredItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-gray-700 p-4">
        <div className="mb-3">
          <p className="text-sm font-medium">{user?.name}</p>
          <p className="text-xs text-gray-400">{user?.role?.display_name || user?.role?.name}</p>
        </div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <LogOut size={18} />
          ออกจากระบบ
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        className="print-hidden fixed left-4 top-4 z-50 rounded-lg bg-gray-900 p-2 text-white shadow-lg lg:hidden"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="print-hidden fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar: mobile drawer + desktop fixed */}
      <aside
        className={`print-hidden fixed inset-y-0 left-0 z-40 w-64 transform transition-transform duration-200 lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
