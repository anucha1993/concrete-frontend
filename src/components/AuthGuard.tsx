'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

interface AuthGuardProps {
  children: React.ReactNode;
  permission?: string;
}

export default function AuthGuard({ children, permission }: AuthGuardProps) {
  const { user, loading, hasPermission } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  if (permission && !hasPermission(permission)) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <div className="text-6xl">🚫</div>
        <h2 className="text-xl font-semibold text-gray-700">ไม่มีสิทธิ์เข้าถึง</h2>
        <p className="text-gray-500">คุณไม่มีสิทธิ์เข้าถึงหน้านี้ กรุณาติดต่อผู้ดูแลระบบ</p>
      </div>
    );
  }

  return <>{children}</>;
}
