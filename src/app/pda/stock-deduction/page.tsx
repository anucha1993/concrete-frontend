'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { API_BASE_URL } from '@/lib/constants';
import {
  CheckCircle, XCircle, Clock, X,
  ArrowLeft, Trash2, TrendingDown, Camera, CameraOff,
} from 'lucide-react';

/* ── Types ── */
interface TokenInfo {
  name: string;
  expires_at: string;
  scan_count: number;
}

interface ActiveDeduction {
  id: number;
  code: string;
  type: string;
  type_label: string;
  status: string;
  customer_name: string | null;
  total_planned: number;
  total_scanned: number;
  scans_count: number;
  lines: {
    id: number;
    product_name: string;
    product_code: string;
    quantity: number;
    scanned_qty: number;
  }[];
  created_at: string;
}

interface DeductionProgress {
  id: number;
  code: string;
  type_label: string;
  status: string;
  total_planned: number;
  total_scanned: number;
  lines: {
    id: number;
    product_name: string;
    product_code: string;
    quantity: number;
    scanned_qty: number;
    unit: string;
  }[];
}

interface ScanResult {
  id: number;
  serial_number: string;
  product_name?: string;
  product_code?: string;
  condition?: string;
  line_progress?: string;
  status: 'OK' | 'COMPLETED' | 'ERROR';
  success: boolean;
  message: string;
  timestamp: Date;
  serverId?: number;
}

/* ── API helper ── */
async function pdaApi(
  method: 'GET' | 'POST' | 'DELETE',
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

export default function PdaStockDeductionWrapper() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" /></div>}>
      <PdaStockDeductionPage />
    </Suspense>
  );
}

function PdaStockDeductionPage() {
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get('token') || '';
  const idFromUrl = searchParams.get('id') || '';

  const [token, setToken] = useState(tokenFromUrl);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [tokenError, setTokenError] = useState('');
  const [validating, setValidating] = useState(false);
  const [remainingTime, setRemainingTime] = useState('');

  /* ── Deduction selection ── */
  const [activeDeductions, setActiveDeductions] = useState<ActiveDeduction[]>([]);
  const [deductionsLoading, setDeductionsLoading] = useState(false);
  const [selectedDeduction, setSelectedDeduction] = useState<ActiveDeduction | null>(null);
  const [progress, setProgress] = useState<DeductionProgress | null>(null);

  /* ── Scanning ── */
  const [serial, setSerial] = useState('');
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);

  /* ── Camera scanner ── */
  const [cameraOpen, setCameraOpen] = useState(false);
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<import('html5-qrcode').Html5Qrcode | null>(null);
  const cameraScanLockRef = useRef(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const idRef = useRef(0);
  const scanQueueRef = useRef<string[]>([]);
  const processingQueueRef = useRef(false);

  /**
   * แยก serial ที่ติดกันออกเป็น array
   * รองรับ pattern: {ตัวอักษร/ตัวเลข}-{4หลัก}-{8หลัก}
   * เช่น "B001-2603-00000008B001-2603-00000009" → ["B001-2603-00000008", "B001-2603-00000009"]
   */
  const splitSerials = (input: string): string[] => {
    const pattern = /[A-Za-z0-9]+-\d{4}-\d{8}/g;
    const matches = input.match(pattern);
    return matches && matches.length > 0 ? matches : [input];
  };

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

  /* ═══ Fetch active deductions ═══ */
  const fetchActiveDeductions = useCallback(async () => {
    if (!token) return;
    setDeductionsLoading(true);
    try {
      const res = await pdaApi('GET', '/pda/stock-deductions/active', token);
      if (res.success) {
        setActiveDeductions(res.data ?? []);
        // Auto-select if id from URL
        if (idFromUrl) {
          const found = (res.data ?? []).find((d: ActiveDeduction) => d.id === parseInt(idFromUrl));
          if (found) setSelectedDeduction(found);
        }
      }
    } catch { /* ignore */ }
    finally { setDeductionsLoading(false); }
  }, [token, idFromUrl]);

  useEffect(() => {
    if (tokenInfo && !selectedDeduction) {
      fetchActiveDeductions();
    }
  }, [tokenInfo, selectedDeduction, fetchActiveDeductions]);

  /* ═══ Fetch progress ═══ */
  const fetchProgress = useCallback(async () => {
    if (!token || !selectedDeduction) return;
    try {
      const res = await pdaApi('GET', `/pda/stock-deductions/${selectedDeduction.id}/progress`, token);
      if (res.success) {
        setProgress(res.data);
      }
    } catch { /* ignore */ }
  }, [token, selectedDeduction]);

  /* ═══ Load existing scans ═══ */
  const fetchExistingScans = useCallback(async () => {
    if (!token || !selectedDeduction) return;
    try {
      const res = await pdaApi('GET', `/pda/stock-deductions/${selectedDeduction.id}/scans`, token);
      if (res.success && Array.isArray(res.data)) {
        const loaded: ScanResult[] = res.data.map((s: { id: number; serial_number: string; product_name?: string; product_code?: string; condition?: string; scanned_at: string }) => ({
          id: ++idRef.current,
          serverId: s.id,
          serial_number: s.serial_number,
          product_name: s.product_name,
          product_code: s.product_code,
          condition: s.condition,
          status: 'OK' as const,
          success: true,
          message: 'สแกนสำเร็จ',
          timestamp: new Date(s.scanned_at),
        }));
        setResults(loaded);
      }
    } catch { /* ignore */ }
  }, [token, selectedDeduction]);

  useEffect(() => {
    if (selectedDeduction) {
      fetchProgress();
      fetchExistingScans();
      const timer = setInterval(fetchProgress, 10000);
      return () => clearInterval(timer);
    }
  }, [selectedDeduction, fetchProgress, fetchExistingScans]);

  /* ═══ Auto focus ═══ */
  useEffect(() => {
    if (selectedDeduction && inputRef.current) {
      inputRef.current.focus();
    }
  }, [selectedDeduction]);

  /* ═══ Cleanup camera on unmount ═══ */
  useEffect(() => {
    return () => {
      if (html5QrCodeRef.current) {
        html5QrCodeRef.current.stop().catch(() => {});
      }
    };
  }, []);

  /* ═══ Scan single serial (core) ═══ */
  const scanOne = async (s: string): Promise<void> => {
    if (!s || !token || !selectedDeduction) return;

    setScanning(true);
    const scanId = ++idRef.current;

    try {
      const res = await pdaApi('POST', '/pda/stock-deductions/scan', token, {
        stock_deduction_id: selectedDeduction.id,
        serial_number: s,
      });

      const result: ScanResult = {
        id: scanId,
        serial_number: s,
        product_name: res.data?.product_name,
        product_code: res.data?.product_code,
        condition: res.data?.condition,
        line_progress: res.data?.line_progress,
        status: res.success ? (res.status === 'COMPLETED' ? 'COMPLETED' : 'OK') : 'ERROR',
        success: res.success,
        message: res.message || (res.success ? 'สแกนสำเร็จ' : 'เกิดข้อผิดพลาด'),
        timestamp: new Date(),
      };

      setLastResult(result);
      setResults(prev => [result, ...prev]);

      // Auto-dismiss success flash
      if (res.success) {
        setTimeout(() => setLastResult(prev => prev?.id === scanId ? null : prev), 2000);
      }

      // Vibrate on error
      if (!res.success && navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
      }

      // Refresh progress
      fetchProgress();

      // If all fulfilled — show completion
      if (res.data?.all_fulfilled) {
        // Clear remaining queue — all done
        scanQueueRef.current = [];
        setTimeout(() => {
          setLastResult({
            id: ++idRef.current,
            serial_number: '',
            status: 'COMPLETED',
            success: true,
            message: '🎉 สแกนครบทุกรายการแล้ว!',
            timestamp: new Date(),
          });
        }, 1000);
      }
    } catch {
      const errResult: ScanResult = {
        id: scanId,
        serial_number: s,
        status: 'ERROR',
        success: false,
        message: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์',
        timestamp: new Date(),
      };
      setLastResult(errResult);
      setResults(prev => [errResult, ...prev]);
    } finally {
      setScanning(false);
    }
  };

  /* ═══ Process scan queue ═══ */
  const processQueue = useCallback(async () => {
    if (processingQueueRef.current) return;
    processingQueueRef.current = true;

    while (scanQueueRef.current.length > 0) {
      const next = scanQueueRef.current.shift()!;
      await scanOne(next);
    }

    processingQueueRef.current = false;
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, selectedDeduction]);

  /* ═══ Handle form submit (Enter key) ═══ */
  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = serial.trim();
    if (!raw || !token || !selectedDeduction) return;

    setSerial('');

    // แยก serial ที่อาจติดกัน
    const serials = splitSerials(raw);

    // เพิ่มเข้า queue
    scanQueueRef.current.push(...serials);

    // เริ่ม process
    processQueue();
  };

  /* ═══ Handle input change — auto-detect & split multiple serials ═══ */
  const handleSerialChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;

    // ตรวจจับว่ามี serial หลายตัวติดกัน (ยิง barcode เร็วๆ)
    const serials = splitSerials(val);

    if (serials.length > 1) {
      // พบ serial หลายตัว — ส่งเข้า queue ทันที
      setSerial('');
      scanQueueRef.current.push(...serials);
      processQueue();
    } else {
      setSerial(val);
    }
  };

  /* ═══ Delete scan ═══ */
  const handleDeleteScan = async (result: ScanResult) => {
    if (!result.serverId || !token) return;
    try {
      const res = await pdaApi('DELETE', `/pda/stock-deductions/scans/${result.serverId}`, token);
      if (res.success) {
        setResults(prev => prev.filter(r => r.id !== result.id));
        fetchProgress();
      }
    } catch { /* ignore */ }
  };

  /* ═══ Camera scanner ═══ */
  const startCamera = async () => {
    if (!scannerRef.current) return;
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode('pda-camera-scanner');
      html5QrCodeRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 280, height: 120 }, aspectRatio: 1.5 },
        (decodedText) => {
          // Prevent duplicate rapid scans
          if (cameraScanLockRef.current) return;
          cameraScanLockRef.current = true;

          // Vibrate on successful camera scan
          if (navigator.vibrate) navigator.vibrate(100);

          const serials = splitSerials(decodedText.trim());
          scanQueueRef.current.push(...serials);
          processQueue();

          // Unlock after 1.5s to prevent re-scanning same code
          setTimeout(() => { cameraScanLockRef.current = false; }, 1500);
        },
        () => { /* ignore scan failures */ }
      );
      setCameraOpen(true);
    } catch (err) {
      console.error('Camera error:', err);
      alert('ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตสิทธิ์กล้อง');
    }
  };

  const stopCamera = async () => {
    try {
      if (html5QrCodeRef.current) {
        await html5QrCodeRef.current.stop();
        html5QrCodeRef.current.clear();
        html5QrCodeRef.current = null;
      }
    } catch { /* ignore */ }
    setCameraOpen(false);
  };

  /* ═══════════════════════════════════════════════
     SCREEN 1: Token Entry
     ═══════════════════════════════════════════════ */
  if (!tokenInfo) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-orange-50 to-red-50 p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100">
              <TrendingDown size={32} className="text-orange-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-800">PDA ตัดสต๊อก</h1>
            <p className="mt-1 text-sm text-gray-500">สแกน barcode เพื่อตัดสินค้าออกจากคลัง</p>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); validateToken(token); }}>
            <label className="mb-2 block text-sm font-medium text-gray-700">PDA Token</label>
            <input
              type="text"
              value={token}
              onChange={e => { setToken(e.target.value); setTokenError(''); }}
              placeholder="กรอก Token..."
              className="mb-3 w-full rounded-xl border border-gray-300 px-4 py-3 text-center text-lg font-mono focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
              autoFocus
            />
            {tokenError && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                <XCircle size={16} /> {tokenError}
              </div>
            )}
            <button type="submit" disabled={!token || validating}
              className="w-full rounded-xl bg-orange-600 py-3 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50">
              {validating ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════
     SCREEN 2: Select Deduction
     ═══════════════════════════════════════════════ */
  if (!selectedDeduction) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-50 p-4">
        <div className="mx-auto max-w-lg">
          {/* Token info bar */}
          <div className="mb-4 flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm">
            <div className="text-sm">
              <span className="font-medium">{tokenInfo.name}</span>
              <span className="ml-2 text-xs text-gray-400">สแกน {tokenInfo.scan_count} ครั้ง</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-orange-600">
              <Clock size={14} /> {remainingTime}
            </div>
          </div>

          <h2 className="mb-4 text-lg font-bold text-gray-800">เลือกใบตัดสต๊อก</h2>

          {deductionsLoading && (
            <div className="py-10 text-center text-gray-400">
              <div className="mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
              กำลังโหลด...
            </div>
          )}

          {!deductionsLoading && activeDeductions.length === 0 && (
            <div className="rounded-xl bg-white py-10 text-center text-sm text-gray-400 shadow-sm">
              ไม่มีใบตัดสต๊อกที่รอสแกน
            </div>
          )}

          <div className="space-y-3">
            {activeDeductions.map(d => {
              const pct = d.total_planned > 0 ? Math.round((d.total_scanned / d.total_planned) * 100) : 0;
              return (
                <button key={d.id} onClick={() => setSelectedDeduction(d)}
                  className="w-full rounded-xl bg-white p-4 text-left shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono text-sm font-bold text-orange-600">{d.code}</span>
                      <span className="ml-2 inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                        {d.type_label}
                      </span>
                    </div>
                    <span className="text-xs font-medium text-gray-500">{d.total_scanned}/{d.total_planned}</span>
                  </div>
                  {d.customer_name && <div className="mt-1 text-sm text-gray-500">{d.customer_name}</div>}
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-green-500' : 'bg-orange-400'}`}
                      style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {d.lines.map(l => (
                      <span key={l.id} className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs ${l.scanned_qty >= l.quantity ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                        {l.product_code}: {l.scanned_qty}/{l.quantity}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>

          <button onClick={fetchActiveDeductions} disabled={deductionsLoading}
            className="mt-4 w-full rounded-xl border border-gray-300 py-2.5 text-sm font-medium text-gray-600 hover:bg-white disabled:opacity-50">
            รีเฟรช
          </button>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════
     SCREEN 3: Scanning
     ═══════════════════════════════════════════════ */
  const overallPct = progress
    ? (progress.total_planned > 0 ? Math.round((progress.total_scanned / progress.total_planned) * 100) : 0)
    : 0;
  const isCompleted = progress?.status === 'COMPLETED';

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-50">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-white shadow-sm">
        <div className="flex items-center justify-between px-4 py-2">
          <button onClick={() => { stopCamera(); setSelectedDeduction(null); setResults([]); setLastResult(null); setProgress(null); }}
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800">
            <ArrowLeft size={16} /> กลับ
          </button>
          <div className="text-center">
            <div className="font-mono text-sm font-bold text-orange-600">{selectedDeduction.code}</div>
            <div className="text-xs text-gray-400">{progress?.type_label || selectedDeduction.type_label}</div>
          </div>
          <div className="flex items-center gap-1 text-xs text-orange-600">
            <Clock size={14} /> {remainingTime}
          </div>
        </div>

        {/* Progress */}
        <div className="px-4 pb-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">สแกน</span>
            <span className={`font-bold ${isCompleted ? 'text-green-600' : 'text-orange-600'}`}>
              {progress?.total_scanned ?? 0}/{progress?.total_planned ?? 0} ({overallPct}%)
            </span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div className={`h-full rounded-full transition-all ${isCompleted ? 'bg-green-500' : 'bg-orange-500'}`}
              style={{ width: `${Math.min(overallPct, 100)}%` }} />
          </div>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* Scan input */}
        {!isCompleted && (
          <div className="space-y-2">
            <form onSubmit={handleScan}>
              <div className="relative flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={serial}
                  onChange={handleSerialChange}
                  placeholder="สแกน barcode ตัดสต๊อก..."
                  disabled={scanning}
                  className="flex-1 rounded-xl border-2 border-orange-300 bg-white px-4 py-3 text-center font-mono focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200 disabled:opacity-50"
                  autoFocus
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={cameraOpen ? stopCamera : startCamera}
                  className={`shrink-0 rounded-xl border-2 px-3 py-3 transition-colors ${
                    cameraOpen
                      ? 'border-red-300 bg-red-50 text-red-600 hover:bg-red-100'
                      : 'border-orange-300 bg-white text-orange-600 hover:bg-orange-50'
                  }`}
                  title={cameraOpen ? 'ปิดกล้อง' : 'เปิดกล้องสแกน'}
                >
                  {cameraOpen ? <CameraOff size={20} /> : <Camera size={20} />}
                </button>
                {scanning && (
                  <div className="absolute right-16 top-1/2 -translate-y-1/2">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
                  </div>
                )}
              </div>
            </form>

            {/* Camera view */}
            {cameraOpen && (
              <div className="overflow-hidden rounded-xl border-2 border-orange-300 bg-black">
                <div id="pda-camera-scanner" ref={scannerRef} className="w-full" />
              </div>
            )}
          </div>
        )}

        {/* Last result flash */}
        {lastResult && (
          <div className={`relative rounded-xl px-4 py-3 ${
            lastResult.status === 'COMPLETED' ? 'bg-green-100 border border-green-300' :
            lastResult.success ? 'bg-green-50 border border-green-200' :
            'bg-red-50 border border-red-200'
          }`}>
            <div className="flex items-center gap-2">
              {lastResult.success ? (
                <CheckCircle size={18} className={lastResult.status === 'COMPLETED' ? 'text-green-600' : 'text-green-500'} />
              ) : (
                <XCircle size={18} className="text-red-500" />
              )}
              <div className="flex-1 min-w-0">
                <span className={`text-sm font-bold ${lastResult.success ? 'text-green-700' : 'text-red-700'}`}>
                  {lastResult.message}
                </span>
                {lastResult.serial_number && (
                  <div className="font-mono text-xs text-gray-500 truncate">{lastResult.serial_number}</div>
                )}
              </div>
              <button onClick={() => setLastResult(null)} className="shrink-0 text-gray-400">
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Completion */}
        {isCompleted && (
          <div className="rounded-xl bg-green-100 border border-green-300 p-5 text-center">
            <CheckCircle size={36} className="mx-auto mb-1 text-green-600" />
            <h3 className="font-bold text-green-700">สแกนครบแล้ว!</h3>
            <p className="text-xs text-green-600">รอผู้ดูแลอนุมัติการตัดสต๊อก</p>
          </div>
        )}

        {/* Scan history */}
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="border-b bg-gray-50 px-3 py-2">
            <h3 className="text-xs font-bold text-gray-600">รายการสแกน ({results.length})</h3>
          </div>
          {results.length > 0 ? (
            <div className="max-h-[55vh] overflow-auto divide-y">
              {results.map(r => (
                <div key={r.id} className={`flex items-center gap-2 px-3 py-2 ${!r.success ? 'bg-red-50' : ''}`}>
                  {r.success ? (
                    <CheckCircle size={14} className="shrink-0 text-green-500" />
                  ) : (
                    <XCircle size={14} className="shrink-0 text-red-500" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-bold text-gray-700 truncate">{r.serial_number}</span>
                      {r.condition === 'DAMAGED' && <span className="shrink-0 rounded bg-red-100 px-1 py-0.5 text-[9px] font-bold text-red-600">ชำรุด</span>}
                    </div>
                    {r.product_name && <span className="text-xs text-gray-400 truncate block">{r.product_name}</span>}
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">
                    {r.timestamp.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  {r.success && r.serverId && !isCompleted && (
                    <button onClick={() => handleDeleteScan(r)}
                      className="shrink-0 rounded p-0.5 text-gray-300 hover:text-red-500">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-gray-400">ยังไม่มีการสแกน</div>
          )}
        </div>
      </div>
    </div>
  );
}
