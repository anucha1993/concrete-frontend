'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { API_BASE_URL } from '@/lib/constants';
import { CheckCircle, XCircle, Scan, Clock, X } from 'lucide-react';

/* ── Types ── */
interface TokenInfo {
  name: string;
  expires_at: string;
  scan_count: number;
}

interface ScanResult {
  id: number;
  serial_number: string;
  product_name?: string;
  product_code?: string;
  success: boolean;
  message: string;
  verified_at?: string;
  timestamp: Date;
}

/* ── API helper (no auth cookie, uses X-PDA-Token header) ── */
async function pdaApi(
  method: 'GET' | 'POST',
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

export default function PdaScanPageWrapper() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" /></div>}>
      <PdaScanPage />
    </Suspense>
  );
}

function PdaScanPage() {
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get('token') || '';

  const [token, setToken] = useState(tokenFromUrl);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [tokenError, setTokenError] = useState('');
  const [validating, setValidating] = useState(false);

  const [serial, setSerial] = useState('');
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const idRef = useRef(0);

  /* ── Validate token on mount ── */
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

  /* ── Auto-focus input when token is valid ── */
  useEffect(() => {
    if (tokenInfo && inputRef.current) {
      inputRef.current.focus();
    }
  }, [tokenInfo]);

  /* ── Remaining time ── */
  const [remainingTime, setRemainingTime] = useState('');
  useEffect(() => {
    if (!tokenInfo) return;
    const tick = () => {
      const diff = new Date(tokenInfo.expires_at).getTime() - Date.now();
      if (diff <= 0) {
        setRemainingTime('หมดอายุแล้ว');
        setTokenInfo(null);
        setTokenError('Token หมดอายุแล้ว — กรุณาขอ Token ใหม่จากผู้ดูแล');
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemainingTime(`${h} ชม. ${m} น. ${s} วิ.`);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [tokenInfo]);

  /* ── Scan / verify ── */
  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const s = serial.trim();
    if (!s || !token || scanning) return;

    setScanning(true);
    setSerial('');

    try {
      const res = await pdaApi('POST', '/pda/verify', token, { serial_number: s });
      const result: ScanResult = {
        id: ++idRef.current,
        serial_number: s,
        product_name: res.data?.product_name,
        product_code: res.data?.product_code,
        success: !!res.success,
        message: res.message,
        verified_at: res.data?.verified_at,
        timestamp: new Date(),
      };
      setLastResult(result);
      setResults(prev => [result, ...prev].slice(0, 100));

      // Update scan_count locally
      if (res.success && tokenInfo) {
        setTokenInfo({ ...tokenInfo, scan_count: tokenInfo.scan_count + 1 });
      }
    } catch {
      const result: ScanResult = {
        id: ++idRef.current,
        serial_number: s,
        success: false,
        message: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้',
        timestamp: new Date(),
      };
      setLastResult(result);
      setResults(prev => [result, ...prev].slice(0, 100));
    } finally {
      setScanning(false);
      inputRef.current?.focus();
    }
  };

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  /* ══════════════════════════════════════════════════════════════
     Render
     ══════════════════════════════════════════════════════════════ */

  // Token entry screen
  if (!tokenInfo) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gray-100 p-3">
        <div className="w-full max-w-xs rounded-xl bg-white p-4 shadow-lg">
          <div className="mb-4 text-center">
            <Scan size={32} className="mx-auto mb-2 text-blue-600" />
            <h1 className="text-base font-bold text-gray-800">PDA Label Verify</h1>
            <p className="text-xs text-gray-500">ยิง Barcode ยืนยันติด Label</p>
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
        </div>
      </div>
    );
  }

  // Main scan screen
  return (
    <div className="flex min-h-dvh flex-col bg-gray-100">
      {/* Header */}
      <div className="bg-blue-600 px-3 py-2 text-white shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Scan size={15} />
            <div>
              <h1 className="text-xs font-bold leading-tight">PDA Label Verify</h1>
              <p className="text-[10px] opacity-80">{tokenInfo.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[10px]">
            <Clock size={11} />
            <span>{remainingTime}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 px-2.5 py-2">
        {/* Scan input */}
        <form onSubmit={handleScan} className="mb-2">
          <div className="flex gap-1.5">
            <input ref={inputRef} type="text" value={serial}
              onChange={e => setSerial(e.target.value)}
              placeholder="สแกน Barcode / พิมพ์ Serial..."
              autoFocus autoComplete="off"
              className="flex-1 rounded-lg border-2 border-blue-300 px-2.5 py-2 text-sm font-medium focus:border-blue-500 focus:outline-none" />
            <button type="submit" disabled={scanning || !serial.trim()}
              className="shrink-0 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-700 disabled:opacity-50">
              {scanning ? '...' : 'ยืนยัน'}
            </button>
          </div>
        </form>

        {/* Last result flash */}
        {lastResult && (
          <div className={`mb-2 flex items-center gap-1.5 rounded-md border p-1.5 transition-all ${
            lastResult.success
              ? 'border-green-400 bg-green-50'
              : 'border-red-400 bg-red-50'
          }`}>
            {lastResult.success
              ? <CheckCircle size={15} className="shrink-0 text-green-600" />
              : <XCircle size={15} className="shrink-0 text-red-600" />
            }
            <div className="min-w-0 flex-1">
              <p className={`text-[11px] font-bold leading-tight ${lastResult.success ? 'text-green-800' : 'text-red-800'}`}>
                {lastResult.message}
              </p>
              <p className="truncate text-[9px] text-gray-600">
                {lastResult.serial_number}
                {lastResult.product_code && ` — ${lastResult.product_code}`}
                {lastResult.product_name && ` ${lastResult.product_name}`}
              </p>
            </div>
            <button onClick={() => setLastResult(null)} className="shrink-0 p-0.5 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Stats strip */}
        <div className="mb-2 grid grid-cols-3 gap-1">
          <div className="rounded bg-white px-1.5 py-1 text-center shadow-sm">
            <p className="text-sm font-bold leading-tight text-gray-800">{results.length}</p>
            <p className="text-[8px] text-gray-500">สแกนทั้งหมด</p>
          </div>
          <div className="rounded bg-white px-1.5 py-1 text-center shadow-sm">
            <p className="text-sm font-bold leading-tight text-green-600">{successCount}</p>
            <p className="text-[8px] text-gray-500">สำเร็จ</p>
          </div>
          <div className="rounded bg-white px-1.5 py-1 text-center shadow-sm">
            <p className="text-sm font-bold leading-tight text-red-600">{failCount}</p>
            <p className="text-[8px] text-gray-500">ไม่สำเร็จ</p>
          </div>
        </div>

        {/* Scan history */}
        <h2 className="mb-1 text-[10px] font-semibold text-gray-500">ประวัติการสแกน</h2>
        <div className="space-y-1">
          {results.length === 0 && (
            <div className="rounded-md bg-white p-4 text-center text-xs text-gray-400 shadow-sm">
              ยังไม่มีการสแกน — สแกน Barcode เพื่อเริ่มต้น
            </div>
          )}
          {results.map(r => (
            <div key={r.id} className={`flex items-center gap-2 rounded-md bg-white px-2.5 py-1.5 shadow-sm ${
              r.success ? '' : 'border-l-3 border-red-400'
            }`}>
              {r.success
                ? <CheckCircle size={14} className="shrink-0 text-green-500" />
                : <XCircle size={14} className="shrink-0 text-red-400" />
              }
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-gray-800">{r.serial_number}</p>
                <p className="truncate text-[9px] text-gray-400">
                  {r.product_code && `${r.product_code} · `}
                  {r.message}
                </p>
              </div>
              <span className="shrink-0 text-[9px] text-gray-400">
                {r.timestamp.toLocaleTimeString('th-TH')}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
