'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

let toastId = 0;
let addToastFn: ((message: string, type: ToastType) => void) | null = null;

/** Global toast function – can be called from anywhere */
export function toast(message: string, type: ToastType = 'info') {
  addToastFn?.(message, type);
}

const iconMap = {
  success: <CheckCircle size={18} className="text-green-500" />,
  error: <XCircle size={18} className="text-red-500" />,
  info: <Info size={18} className="text-blue-500" />,
};

export default function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  useEffect(() => {
    addToastFn = addToast;
    return () => { addToastFn = null; };
  }, [addToast]);

  const removeToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-center gap-3 rounded-lg border bg-white px-4 py-3 shadow-lg animate-in slide-in-from-right fade-in min-w-[280px]"
        >
          {iconMap[t.type]}
          <span className="flex-1 text-sm text-gray-700">{t.message}</span>
          <button onClick={() => removeToast(t.id)} className="text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
