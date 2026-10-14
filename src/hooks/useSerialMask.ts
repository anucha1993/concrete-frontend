import { useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export const SERIAL_PERMISSION = 'view_serial_number';

/**
 * Display-only masking of serial numbers.
 * Users without `view_serial_number` see "xxxxxxxx" (same length) instead of the real S/N.
 * Not used on stock deductions, PDA, and label printing — those always show the real S/N.
 * Use only for rendering; keep the real value for search/compare/API payloads.
 */
export function useSerialMask() {
  const { hasPermission } = useAuth();
  const canView = hasPermission(SERIAL_PERMISSION);

  return useCallback(
    (serial: string | null | undefined): string => {
      if (!serial) return '';
      return canView ? serial : 'x'.repeat(serial.length);
    },
    [canView],
  );
}
