'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { API_BASE_URL } from '@/lib/constants';
import {
  CheckCircle, XCircle, Clock, X,
  ClipboardCheck, AlertTriangle, ArrowLeft, Trash2, Shield,
} from 'lucide-react';

/* ── Types ── */
interface TokenInfo {
  name: string;
  expires_at: string;
  scan_count: number;
}

interface ActiveCount {
  id: number;
  code: string;
  name: string;
  type: string;
  started_at: string;
  scans_count: number;
}

interface CountProgress {
  id: number;
  code: string;
  name: string;
  total_expected: number;
  total_scanned: number;
  unexpected: number;
}

interface ScanResult {
  id: number;
  serverId?: number;
  serial_number: string;
  product_name?: string;
  product_code?: string;
  inventory_status?: string | null;
  scanCount: number;
  status: 'OK' | 'DUPLICATE' | 'UNEXPECTED' | 'DELETED';
  success: boolean;
  message: string;
  timestamp: Date;
}

const INV_STATUS_LABELS: Record<string, string> = {
  IN_STOCK: 'สภาพดี',
  DAMAGED: 'ชำรุด',
  PENDING: 'รอดำเนินการ',
  SOLD: 'ขายแล้ว',
  SCRAPPED: 'ตัดออก',
};

const INV_STATUS_COLORS: Record<string, string> = {
  IN_STOCK: 'bg-green-100 text-green-700',
  DAMAGED: 'bg-red-100 text-red-700',
  PENDING: 'bg-yellow-100 text-yellow-700',
  SOLD: 'bg-blue-100 text-blue-700',
  SCRAPPED: 'bg-gray-100 text-gray-500',
};

/* ── API helper ── */
async function pdaApi(
  method: 'GET' | 'POST' | 'DELETE' | 'PATCH',
  path: string,
  token: string,
  body?: Record<string, unknown>
) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-PDA-Token': token,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

/* ══════════════════════════════════════════════════════════════ */

export default function PdaStockCountPageWrapper() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" /></div>}>
      <PdaStockCountPage />
    </Suspense>
  );
}

function PdaStockCountPage() {
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get('token') || '';
  const scFromUrl = searchParams.get('sc') ? Number(searchParams.get('sc')) : null;

  const [token, setToken] = useState(tokenFromUrl);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [tokenError, setTokenError] = useState('');
  const [validating, setValidating] = useState(false);
  const [remainingTime, setRemainingTime] = useState('');

  /* ── Count selection ── */
  const [activeCounts, setActiveCounts] = useState<ActiveCount[]>([]);
  const [countsLoading, setCountsLoading] = useState(false);
  const [selectedCount, setSelectedCount] = useState<ActiveCount | null>(null);
  const [progress, setProgress] = useState<CountProgress | null>(null);

  /* ── Scanning ── */
  const [serial, setSerial] = useState('');
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [statusTarget, setStatusTarget] = useState<ScanResult | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const idRef = useRef(0);

  /* ═══ Token validation ═══ */
  const validateToken = useCallback(async (t: string) => {
    if (!t) return;
    setValidating(true);
    setTokenError('');
    try {
      const res = await pdaApi('GET', `/pda/validate?token=${encodeURIComponent(t)}`, t);
      if (res.success) {
        setTokenInfo(res.data);
      } else {
        setTokenError(res.message || 'Token ไม่ถูกต้อง');
        setTokenInfo(null);
      }
    } catch {
      setTokenError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    } finally {
      setValidating(false);
    }
  }, []);

  useEffect(() => {
    if (tokenFromUrl) {
      setToken(tokenFromUrl);
      validateToken(tokenFromUrl);
    }
  }, [tokenFromUrl, validateToken]);

  /* ── Remaining time timer ── */
  useEffect(() => {
    if (!tokenInfo) return;
    const tick = () => {
      const diff = new Date(tokenInfo.expires_at).getTime() - Date.now();
      if (diff <= 0) {
        setRemainingTime('หมดอายุ');
        setTokenInfo(null);
        setTokenError('Token หมดอายุแล้ว');
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemainingTime(`${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [tokenInfo]);

  /* ═══ Fetch active counts ═══ */
  const fetchActiveCounts = useCallback(async () => {
    if (!token) return;
    setCountsLoading(true);
    try {
      const res = await pdaApi('GET', '/pda/stock-counts/active', token);
      if (res.success) {
        const list: ActiveCount[] = res.data ?? [];
        setActiveCounts(list);
        // Auto-select if sc param matches or only one count
        const target = scFromUrl ? list.find(c => c.id === scFromUrl) : list.length === 1 ? list[0] : null;
        if (target) {
          setSelectedCount(target);
          setResults([]);
          setLastResult(null);
        }
      }
    } catch { /* ignore */ }
    finally { setCountsLoading(false); }
  }, [token]);

  useEffect(() => {
    if (tokenInfo && !selectedCount) {
      fetchActiveCounts();
    }
  }, [tokenInfo, selectedCount, fetchActiveCounts]);

  /* ═══ Fetch progress ═══ */
  const fetchProgress = useCallback(async () => {
    if (!token || !selectedCount) return;
    try {
      const res = await pdaApi('GET', `/pda/stock-counts/${selectedCount.id}/progress`, token);
      if (res.success) {
        setProgress(res.data);
      }
    } catch { /* ignore */ }
  }, [token, selectedCount]);

  /* ═══ Load existing scans from server ═══ */
  const fetchExistingScans = useCallback(async () => {
    if (!token || !selectedCount) return;
    try {
      const res = await pdaApi('GET', `/pda/stock-counts/${selectedCount.id}/scans`, token);
      if (res.success && Array.isArray(res.data)) {
        const loaded: ScanResult[] = res.data.map((s: { scan_id: number; serial_number: string; product_name?: string; product_code?: string; inventory_status?: string; is_expected: boolean; scanned_at: string }) => ({
          id: ++idRef.current,
          serverId: s.scan_id,
          serial_number: s.serial_number,
          product_name: s.product_name,
          product_code: s.product_code,
          inventory_status: s.inventory_status ?? null,
          scanCount: 1,
          status: s.is_expected ? 'OK' as const : 'UNEXPECTED' as const,
          success: s.is_expected,
          message: s.is_expected ? 'นับสำเร็จ' : 'ไม่คาดคิด',
          timestamp: new Date(s.scanned_at),
        }));
        setResults(loaded);
      }
    } catch { /* ignore */ }
  }, [token, selectedCount]);

  useEffect(() => {
    if (selectedCount) {
      fetchProgress();
      fetchExistingScans();
      const timer = setInterval(fetchProgress, 10000); // refresh every 10s
      return () => clearInterval(timer);
    }
  }, [selectedCount, fetchProgress, fetchExistingScans]);

  /* ═══ Auto focus ═══ */
  useEffect(() => {
    if (selectedCount && inputRef.current) {
      inputRef.current.focus();
    }
  }, [selectedCount]);

  /* ═══ Scan ═══ */
  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const s = serial.trim();
    if (!s || !token || !selectedCount || scanning) return;

    setScanning(true);
    setSerial('');

    try {
      const res = await pdaApi('POST', '/pda/stock-counts/scan', token, {
        stock_count_id: selectedCount.id,
        serial_number: s,
      });

      const scanStatus = res.data?.status || (res.success ? 'OK' : 'UNEXPECTED');

      // Duplicate: update existing row's count instead of adding new row
      if (scanStatus === 'DUPLICATE') {
        const dupResult: ScanResult = {
          id: ++idRef.current,
          serverId: res.data?.scan_id ?? undefined,
          serial_number: s,
          product_name: res.data?.product_name,
          product_code: res.data?.product_code,
          inventory_status: res.data?.inventory_status ?? null,
          scanCount: 1,
          status: 'DUPLICATE',
          success: false,
          message: res.message,
          timestamp: new Date(),
        };
        setLastResult(dupResult);
        setResults(prev => {
          const existing = prev.find(r => r.serial_number === s && r.status !== 'DELETED');
          if (existing) {
            return prev.map(r =>
              r.id === existing.id ? { ...r, scanCount: r.scanCount + 1 } : r
            );
          }
          return prev;
        });
      } else {
        const result: ScanResult = {
          id: ++idRef.current,
          serverId: res.data?.scan_id ?? undefined,
          serial_number: s,
          product_name: res.data?.product_name,
          product_code: res.data?.product_code,
          inventory_status: res.data?.inventory_status ?? null,
          scanCount: 1,
          status: scanStatus,
          success: res.success,
          message: res.message,
          timestamp: new Date(),
        };
        setLastResult(result);
        setResults(prev => [result, ...prev].slice(0, 200));
      }

      // Refresh progress
      fetchProgress();
    } catch {
      const result: ScanResult = {
        id: ++idRef.current,
        serial_number: s,
        scanCount: 1,
        status: 'UNEXPECTED',
        success: false,
        message: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้',
        timestamp: new Date(),
      };
      setLastResult(result);
      setResults(prev => [result, ...prev].slice(0, 200));
    } finally {
      setScanning(false);
      inputRef.current?.focus();
    }
  };

  /* ═══ Delete scan ═══ */
  const handleDeleteScan = async (result: ScanResult) => {
    if (!token || !result.serverId) return;
    if (!confirm(`ลบการสแกน ${result.serial_number} ?`)) return;

    try {
      const res = await pdaApi('DELETE', `/pda/stock-counts/scans/${result.serverId}`, token);
      if (res.success) {
        setResults(prev => prev.map(r =>
          r.id === result.id ? { ...r, status: 'DELETED' as const, success: false, message: 'ลบแล้ว' } : r
        ));
        fetchProgress();
      } else {
        alert(res.message || 'ไม่สามารถลบได้');
      }
    } catch {
      alert('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    }
  };

  /* ═══ Update inventory status ═══ */
  const handleUpdateStatus = async (result: ScanResult, newStatus: string) => {
    if (!token || !result.serverId) return;

    try {
      const res = await pdaApi('POST', '/pda/stock-counts/scans/update-status', token, {
        scan_id: result.serverId,
        status: newStatus,
      });
      if (res.success) {
        setResults(prev => prev.map(r =>
          r.id === result.id ? { ...r, inventory_status: res.data?.inventory_status ?? newStatus } : r
        ));
        setStatusTarget(null);
      } else {
        alert(res.message || 'ไม่สามารถเปลี่ยนสถานะได้');
      }
    } catch {
      alert('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    }
  };

  const okCount = results.filter(r => r.status === 'OK').length;
  const dupCount = results.reduce((sum, r) => sum + (r.scanCount > 1 ? r.scanCount - 1 : 0), 0);
  const unexpectedCount = results.filter(r => r.status === 'UNEXPECTED').length;

  /* ══════════════════════════════════════════════════════════════
     Render
     ══════════════════════════════════════════════════════════════ */

  // Token entry screen
  if (!tokenInfo) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gray-100 p-3">
        <div className="w-full max-w-xs rounded-xl bg-white p-4 shadow-lg">
          <div className="mb-4 text-center">
            <ClipboardCheck size={32} className="mx-auto mb-2 text-blue-600" />
            <h1 className="text-base font-bold text-gray-800">PDA ตรวจนับ</h1>
            <p className="text-xs text-gray-500">สแกนตรวจนับสต๊อกสินค้า</p>
          </div>

          {tokenError && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <XCircle size={13} className="mr-1 inline -mt-0.5" /> {tokenError}
            </div>
          )}

          <form onSubmit={(e) => { e.preventDefault(); validateToken(token); }}>
            <label className="mb-0.5 block text-xs font-medium text-gray-700">Token</label>
            <input type="text" value={token} onChange={e => setToken(e.target.value)}
              placeholder="วาง Token ที่ได้รับ..."
              className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none" />
            <button type="submit" disabled={validating || !token.trim()}
              className="w-full rounded-lg bg-blue-600 py-2.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50">
              {validating ? 'กำลังตรวจสอบ...' : 'เข้าใช้งาน'}
            </button>
          </form>

          {/* Link to label verify mode */}
          <div className="mt-3 text-center">
            <a href={`/pda${token ? `?token=${token}` : ''}`} className="text-[10px] text-blue-500 hover:underline">
              → ไปหน้ายืนยัน Label แทน
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Count selection screen
  if (!selectedCount) {
    return (
      <div className="flex min-h-dvh flex-col bg-gray-100">
        {/* Header */}
        <div className="bg-indigo-600 px-3 py-2 text-white shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <ClipboardCheck size={15} />
              <div>
                <h1 className="text-xs font-bold leading-tight">PDA ตรวจนับสต๊อก</h1>
                <p className="text-[10px] opacity-80">{tokenInfo.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-[10px]">
              <Clock size={11} />
              <span>{remainingTime}</span>
            </div>
          </div>
        </div>

        <div className="flex-1 px-2.5 py-3">
          <h2 className="mb-2 text-xs font-semibold text-gray-600">เลือกรอบตรวจนับ</h2>

          {countsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
            </div>
          ) : activeCounts.length === 0 ? (
            <div className="rounded-lg bg-white p-6 text-center shadow-sm">
              <ClipboardCheck size={28} className="mx-auto mb-2 text-gray-300" />
              <p className="text-xs text-gray-500">ไม่มีรอบตรวจนับที่กำลังดำเนินการ</p>
              <button onClick={fetchActiveCounts} className="mt-2 text-[10px] text-blue-500 hover:underline">
                ลองใหม่อีกครั้ง
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {activeCounts.map(c => (
                <button
                  key={c.id}
                  onClick={() => { setSelectedCount(c); setResults([]); setLastResult(null); }}
                  className="w-full rounded-lg bg-white p-3 shadow-sm text-left transition hover:bg-indigo-50 hover:ring-1 hover:ring-indigo-300"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono text-xs font-bold text-indigo-600">{c.code}</span>
                      <p className="text-[11px] text-gray-700 mt-0.5">{c.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-gray-400">{c.type}</p>
                      <p className="text-[10px] text-gray-400">{c.scans_count} สแกน</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Link to label verify mode */}
          <div className="mt-4 text-center">
            <a href={`/pda?token=${token}`} className="text-[10px] text-blue-500 hover:underline">
              → ไปหน้ายืนยัน Label แทน
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Main counting screen
  const pctScanned = progress && progress.total_expected > 0
    ? Math.round((progress.total_scanned / progress.total_expected) * 100)
    : 0;

  return (
    <div className="flex min-h-dvh flex-col bg-gray-100">
      {/* Header */}
      <div className="bg-indigo-600 px-3 py-2 text-white shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <button onClick={() => { setSelectedCount(null); setProgress(null); }} className="mr-1 p-0.5">
              <ArrowLeft size={14} />
            </button>
            <div>
              <h1 className="text-xs font-bold leading-tight">{selectedCount.code}</h1>
              <p className="text-[10px] opacity-80">{selectedCount.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[10px]">
            <Clock size={11} />
            <span>{remainingTime}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 px-2.5 py-2">
        {/* Progress bar */}
        {progress && (
          <div className="mb-2 rounded-lg bg-white p-2 shadow-sm">
            <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
              <span>ความคืบหน้า</span>
              <span className="font-mono font-bold text-indigo-600">
                {progress.total_scanned}/{progress.total_expected} ({pctScanned}%)
              </span>
            </div>
            <div className="h-2 rounded-full bg-gray-200">
              <div
                className={`h-full rounded-full transition-all ${pctScanned >= 100 ? 'bg-green-500' : 'bg-indigo-500'}`}
                style={{ width: `${Math.min(100, pctScanned)}%` }}
              />
            </div>
            {progress.unexpected > 0 && (
              <div className="mt-1 flex items-center gap-1 text-[9px] text-yellow-600">
                <AlertTriangle size={10} /> ไม่คาดคิด {progress.unexpected} รายการ
              </div>
            )}
          </div>
        )}

        {/* Scan input */}
        <form onSubmit={handleScan} className="mb-2">
          <div className="flex gap-1.5">
            <input ref={inputRef} type="text" value={serial}
              onChange={e => setSerial(e.target.value)}
              placeholder="สแกน Barcode..."
              autoFocus autoComplete="off"
              className="flex-1 rounded-lg border-2 border-indigo-300 px-2.5 py-2 text-sm font-medium focus:border-indigo-500 focus:outline-none" />
            <button type="submit" disabled={scanning || !serial.trim()}
              className="shrink-0 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-700 disabled:opacity-50">
              {scanning ? '...' : 'นับ'}
            </button>
          </div>
        </form>

        {/* Last result flash */}
        {lastResult && (
          <div className={`mb-2 flex items-center gap-1.5 rounded-md border p-1.5 transition-all ${
            lastResult.status === 'OK'
              ? 'border-green-400 bg-green-50'
              : lastResult.status === 'DUPLICATE'
              ? 'border-yellow-400 bg-yellow-50'
              : 'border-red-400 bg-red-50'
          }`}>
            {lastResult.status === 'OK'
              ? <CheckCircle size={15} className="shrink-0 text-green-600" />
              : lastResult.status === 'DUPLICATE'
              ? <AlertTriangle size={15} className="shrink-0 text-yellow-600" />
              : <XCircle size={15} className="shrink-0 text-red-600" />
            }
            <div className="min-w-0 flex-1">
              <p className={`text-[11px] font-bold leading-tight ${
                lastResult.status === 'OK' ? 'text-green-800' :
                lastResult.status === 'DUPLICATE' ? 'text-yellow-800' :
                'text-red-800'
              }`}>
                {lastResult.message}
              </p>
              <p className="truncate text-[9px] text-gray-600">
                {lastResult.serial_number}
                {lastResult.product_code && ` — ${lastResult.product_code}`}
              </p>
            </div>
            <button onClick={() => setLastResult(null)} className="shrink-0 p-0.5 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Stats strip */}
        <div className="mb-2 grid grid-cols-4 gap-1">
          <div className="rounded bg-white px-1 py-1 text-center shadow-sm">
            <p className="text-sm font-bold leading-tight text-gray-800">{results.length}</p>
            <p className="text-[7px] text-gray-500">ทั้งหมด</p>
          </div>
          <div className="rounded bg-white px-1 py-1 text-center shadow-sm">
            <p className="text-sm font-bold leading-tight text-green-600">{okCount}</p>
            <p className="text-[7px] text-gray-500">OK</p>
          </div>
          <div className="rounded bg-white px-1 py-1 text-center shadow-sm">
            <p className="text-sm font-bold leading-tight text-yellow-600">{dupCount}</p>
            <p className="text-[7px] text-gray-500">ซ้ำ</p>
          </div>
          <div className="rounded bg-white px-1 py-1 text-center shadow-sm">
            <p className="text-sm font-bold leading-tight text-red-600">{unexpectedCount}</p>
            <p className="text-[7px] text-gray-500">ไม่คาดคิด</p>
          </div>
        </div>

        {/* Scan history */}
        <h2 className="mb-1 text-[10px] font-semibold text-gray-500">ประวัติสแกน</h2>
        <div className="space-y-1">
          {results.length === 0 && (
            <div className="rounded-md bg-white p-4 text-center text-xs text-gray-400 shadow-sm">
              สแกน Barcode เพื่อเริ่มนับ
            </div>
          )}
          {results.map(r => (
            <div key={r.id} className={`flex items-center gap-2 rounded-md bg-white px-2 py-1.5 shadow-sm ${
              r.status === 'DELETED' ? 'border-l-3 border-gray-300 opacity-50' :
              r.status === 'UNEXPECTED' ? 'border-l-3 border-red-400' : ''
            }`}>
              {r.status === 'DELETED'
                ? <Trash2 size={13} className="shrink-0 text-gray-400" />
                : r.status === 'OK'
                ? <CheckCircle size={13} className="shrink-0 text-green-500" />
                : <XCircle size={13} className="shrink-0 text-red-400" />
              }
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className={`truncate text-xs font-medium ${r.status === 'DELETED' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{r.serial_number}</p>
                  {r.scanCount > 1 && r.status !== 'DELETED' && (
                    <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-yellow-100 px-1.5 py-0.5 text-[8px] font-bold leading-none text-yellow-700">
                      ×{r.scanCount}
                    </span>
                  )}
                  {r.inventory_status && r.status !== 'DELETED' && (
                    <span className={`inline-flex shrink-0 rounded px-1 py-0.5 text-[8px] font-medium leading-none ${INV_STATUS_COLORS[r.inventory_status] || 'bg-gray-100 text-gray-500'}`}>
                      {INV_STATUS_LABELS[r.inventory_status] || r.inventory_status}
                    </span>
                  )}
                </div>
                <p className="truncate text-[9px] text-gray-400">
                  {r.product_code && `${r.product_code} · `}
                  {r.status === 'OK' ? 'นับสำเร็จ' : r.status === 'DELETED' ? 'ลบแล้ว' : 'ไม่คาดคิด'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {r.status !== 'DELETED' && r.serverId && r.inventory_status && (
                  <button
                    onClick={() => setStatusTarget(r)}
                    className="rounded p-0.5 text-gray-400 hover:bg-blue-50 hover:text-blue-500"
                    title="เปลี่ยนสถานะ"
                  >
                    <Shield size={12} />
                  </button>
                )}
                {r.status !== 'DELETED' && r.serverId && (
                  <button
                    onClick={() => handleDeleteScan(r)}
                    className="rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                    title="ลบรายการนี้"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
                <span className="text-[9px] text-gray-400">
                  {r.timestamp.toLocaleTimeString('th-TH')}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Status change modal */}
        {statusTarget && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3" onClick={() => setStatusTarget(null)}>
            <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl" onClick={e => e.stopPropagation()}>
              <h3 className="mb-1 text-sm font-bold text-gray-800">เปลี่ยนสถานะสินค้า</h3>
              <p className="mb-3 truncate text-xs text-gray-500">{statusTarget.serial_number} — {statusTarget.product_code}</p>

              <div className="mb-2 flex items-center gap-2 text-xs text-gray-500">
                <span>สถานะปัจจุบัน:</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${INV_STATUS_COLORS[statusTarget.inventory_status || ''] || 'bg-gray-100 text-gray-500'}`}>
                  {INV_STATUS_LABELS[statusTarget.inventory_status || ''] || statusTarget.inventory_status || '-'}
                </span>
              </div>

              <div className="space-y-2">
                {statusTarget.inventory_status !== 'IN_STOCK' && (
                  <button
                    onClick={() => handleUpdateStatus(statusTarget, 'IN_STOCK')}
                    className="flex w-full items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-left text-sm font-medium text-green-700 hover:bg-green-100"
                  >
                    <CheckCircle size={16} />
                    <div>
                      <p>สภาพดี</p>
                      <p className="text-[10px] font-normal text-green-600">สินค้าอยู่ในสภาพปกติ</p>
                    </div>
                  </button>
                )}
                {statusTarget.inventory_status !== 'DAMAGED' && (
                  <button
                    onClick={() => handleUpdateStatus(statusTarget, 'DAMAGED')}
                    className="flex w-full items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-left text-sm font-medium text-red-700 hover:bg-red-100"
                  >
                    <XCircle size={16} />
                    <div>
                      <p>ชำรุด</p>
                      <p className="text-[10px] font-normal text-red-600">สินค้าเสียหาย / ชำรุด</p>
                    </div>
                  </button>
                )}
              </div>

              <button
                onClick={() => setStatusTarget(null)}
                className="mt-3 w-full rounded-lg bg-gray-100 py-2 text-xs font-medium text-gray-600 hover:bg-gray-200"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
