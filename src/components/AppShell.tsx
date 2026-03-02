'use client';

import { AuthProvider } from '@/contexts/AuthContext';
import AuthGuard from '@/components/AuthGuard';
import Sidebar from '@/components/Sidebar';

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthGuard>
        <div className="min-h-screen bg-gray-50">
          <Sidebar />
          <main className="lg:ml-64">
            <div className="p-4 pt-16 lg:p-8 lg:pt-8">{children}</div>
          </main>
        </div>
      </AuthGuard>
    </AuthProvider>
  );
}
