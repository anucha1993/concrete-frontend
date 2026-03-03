'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { API_BASE_URL } from '@/lib/constants';

/* ── Types ── */
interface TokenInfo {
  id: number;
  name: string;
  scan_count: number;
}

interface ActiveClaim {
  id: number;
  code: string;
  type: string;
  type_label: string;
  status: string;
  customer_name: string | null;
  lines_count: number;
  total_qty: number;
  lines: { id: number; serial_number: string; product_name: string; product_code: string }[];
  created_at: string;
}

interface ClaimProgress {
  id: number;
  code: string;
  type_label: string;
  status: string;
  customer_name: string | null;
  total_qty: number;
  lines: { id: number; serial_number: string; product_name: string; product_code: string }[];
}

interface ScanResult {
  id: number;
  serial_number: string;
  product_name: string;
  product_code: string;
  resolution: string | null;
  scanned_at: string;
}

interface ScanResponse {
  success: boolean;
  message: string;
  status?: string;
  data?: {
    line_id?: number;
    serial_number?: string;
    product_name?: string;
    product_code?: string;
    condition?: string;
    status?: string;
    total_lines?: number;
  };
}

/* ── Resolution options ── */
const RESOLUTION_OPTIONS = [
  { value: 'RETURN_STOCK', label: 'คืนเข้าสต๊อก (สภาพดี)' },
  { value: 'RETURN_DAMAGED', label: 'คืนเป็นชำรุด' },
  { value: 'REPLACE', label: 'เปลี่ยนสินค้า' },
  { value: 'REFUND', label: 'คืนเงิน' },
  { value: 'CREDIT_NOTE', label: 'ออกใบลดหนี้' },
];

/* ── PDA API helper ── */
async function pdaApi<T>(method: string, path: string, token: string, body?: Record<string, unknown>): Promise<T> {
  const opts: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-PDA-Token': token,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE_URL}${path}`, opts);
  const json = await res.json();
  if (!res.ok && !json.success) throw json;
  return json;
}

/* ── Suspense wrapper ── */
export default function PdaClaimPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-red-50 text-gray-500">กำลังโหลด...</div>}>
      <PdaClaimContent />
    </Suspense>
  );
}

/* ════════════════════════════════════════════════════════════
   MAIN CONTENT
   ════════════════════════════════════════════════════════════ */
function PdaClaimContent() {
  const searchParams = useSearchParams();
  const urlToken = searchParams.get('token') || '';

  const [screen, setScreen] = useState<'token' | 'select' | 'scan'>('token');
  const [token, setToken] = useState(urlToken);
  const [tokenInput, setTokenInput] = useState(urlToken);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [error, setError] = useState('');

  // Select screen
  const [claims, setClaims] = useState<ActiveClaim[]>([]);
  const [loadingClaims, setLoadingClaims] = useState(false);

  // Scan screen
  const [selectedClaim, setSelectedClaim] = useState<ActiveClaim | null>(null);
  const [progress, setProgress] = useState<ClaimProgress | null>(null);
  const [scans, setScans] = useState<ScanResult[]>([]);
  const [serialInput, setSerialInput] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const serialRef = useRef<HTMLInputElement>(null);

  /* ── Queue-based fast scan ── */
  const scanQueueRef = useRef<string[]>([]);
  const processingQueueRef = useRef(false);

  const splitSerials = (input: string): string[] => {
    const pattern = /[A-Za-z0-9]+-\d{4}-\d{8}/g;
    const matches = input.match(pattern);
    return matches && matches.length > 0 ? matches : [input];
  };

  /* ── Token validation ── */
  const validateToken = useCallback(async (t: string) => {
    try {
      const res = await pdaApi<{ success: boolean; data: TokenInfo }>('GET', `/pda/validate?token=${t}`, t);
      if (res.success) {
        setTokenInfo(res.data);
        setToken(t);
        setError('');
        setScreen('select');
      }
    } catch {
      setError('Token ไม่ถูกต้องหรือหมดอายุ');
    }
  }, []);

  // Auto-validate if URL token
  useEffect(() => {
    if (urlToken) validateToken(urlToken);
  }, [urlToken, validateToken]);

  const handleTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;
    validateToken(tokenInput.trim());
  };

  /* ── Load active claims ── */
  const loadClaims = useCallback(async () => {
    if (!token) return;
    setLoadingClaims(true);
    try {
      const res = await pdaApi<{ success: boolean; data: ActiveClaim[] }>('GET', '/pda/claims/active', token);
      setClaims(res.data);
      // Auto-select if only one claim (CRL links always have 1)
      if (res.data.length === 1) {
        setSelectedClaim(res.data[0]);
        setScreen('scan');
      }
    } catch {
      setError('โหลดรายการไม่สำเร็จ');
    } finally {
      setLoadingClaims(false);
    }
  }, [token]);

  useEffect(() => {
    if (screen === 'select' && token) loadClaims();
  }, [screen, token, loadClaims]);

  /* ── Select claim → go to scan ── */
  const selectClaim = (c: ActiveClaim) => {
    setSelectedClaim(c);
    setScreen('scan');
  };

  /* ── Load progress + scans ── */
  const loadProgress = useCallback(async () => {
    if (!selectedClaim || !token) return;
    try {
      const [prog, sc] = await Promise.all([
        pdaApi<{ success: boolean; data: ClaimProgress }>('GET', `/pda/claims/${selectedClaim.id}/progress`, token),
        pdaApi<{ success: boolean; data: ScanResult[] }>('GET', `/pda/claims/${selectedClaim.id}/scans`, token),
      ]);
      setProgress(prog.data);
      setScans(sc.data);
    } catch { /* ignore */ }
  }, [selectedClaim, token]);

  useEffect(() => {
    if (screen === 'scan') {
      loadProgress();
      serialRef.current?.focus();
    }
  }, [screen, loadProgress]);

  /* ── Scan one serial ── */
  const scanOne = async (s: string) => {
    if (!s || !selectedClaim || !token) return;

    setScanning(true);
    setScanMessage(null);

    try {
      const res = await pdaApi<ScanResponse>('POST', '/pda/claims/scan', token, {
        claim_id: selectedClaim.id,
        serial_number: s,
      });

      if (res.success) {
        setScanMessage({ text: `${res.data?.product_name || s} — สแกนสำเร็จ`, type: 'success' });
        loadProgress();
      } else {
        setScanMessage({ text: res.message, type: 'error' });
      }
    } catch (err: unknown) {
      const e = err as { message?: string; status?: string };
      if (e.status === 'DUPLICATE') {
        setScanMessage({ text: e.message || 'Serial ซ้ำ', type: 'info' });
      } else {
        setScanMessage({ text: e.message || 'สแกนไม่สำเร็จ', type: 'error' });
      }
    } finally {
      setScanning(false);
      setTimeout(() => { serialRef.current?.focus(); }, 50);
    }
  };

  /* ── Process queue ── */
  const processQueue = async () => {
    if (processingQueueRef.current) return;
    processingQueueRef.current = true;
    while (scanQueueRef.current.length > 0) {
      const next = scanQueueRef.current.shift()!;
      await scanOne(next);
    }
    processingQueueRef.current = false;
  };

  /* ── Scan (form submit) ── */
  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const serial = serialInput.trim();
    if (!serial || !selectedClaim || !token) return;
    setSerialInput('');

    const parts = splitSerials(serial);
    scanQueueRef.current.push(...parts);
    processQueue();
  };

  /* ── Auto-detect fast scan in onChange ── */
  const handleSerialChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const parts = splitSerials(val);
    if (parts.length > 1) {
      setSerialInput('');
      scanQueueRef.current.push(...parts);
      processQueue();
    } else {
      setSerialInput(val);
    }
  };

  /* ── Delete scan ── */
  const deleteScan = async (lineId: number) => {
    if (!token) return;
    try {
      await pdaApi<{ success: boolean }>('DELETE', `/pda/claims/scans/${lineId}`, token);
      loadProgress();
      setScanMessage({ text: 'ลบรายการแล้ว', type: 'info' });
    } catch {
      setScanMessage({ text: 'ลบไม่สำเร็จ', type: 'error' });
    }
  };

  /* ── Update resolution ── */
  const updateResolution = async (lineId: number, resolution: string) => {
    if (!token) return;
    // Optimistic update — update local state immediately
    setScans(prev => prev.map(s => s.id === lineId ? { ...s, resolution: resolution || null } : s));
    try {
      await pdaApi<{ success: boolean }>('PUT', `/pda/claims/scans/${lineId}/resolution`, token, {
        resolution: resolution || null,
      });
    } catch {
      setScanMessage({ text: 'บันทึกไม่สำเร็จ', type: 'error' });
      // Revert on failure
      loadProgress();
    }
  };

  /* ════════════════════════════════════════════════════════════
     SCREEN: TOKEN ENTRY
     ════════════════════════════════════════════════════════════ */
  if (screen === 'token') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-800">PDA เคลมสินค้า</h1>
            <p className="mt-1 text-sm text-gray-500">สแกน Barcode เพื่อเพิ่มรายการเคลม</p>
          </div>

          <form onSubmit={handleTokenSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">PDA Token</label>
              <input
                type="text"
                value={tokenInput}
                onChange={e => { setTokenInput(e.target.value); setError(''); }}
                placeholder="กรอก Token..."
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200"
                autoFocus
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit"
              className="w-full rounded-xl bg-red-600 py-3 text-sm font-bold text-white hover:bg-red-700 active:bg-red-800">
              เข้าสู่ระบบ
            </button>
          </form>
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════
     SCREEN: SELECT CLAIM
     ════════════════════════════════════════════════════════════ */
  if (screen === 'select') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 p-4">
        <div className="mx-auto max-w-lg">
          {/* Header */}
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-lg font-bold text-gray-800">เลือกใบเคลม</h1>
            <div className="flex items-center gap-2">
              {tokenInfo && <span className="text-xs text-gray-500">{tokenInfo.name}</span>}
              <button onClick={() => { setScreen('token'); setToken(''); setTokenInfo(null); }}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
                ออก
              </button>
            </div>
          </div>

          {loadingClaims ? (
            <div className="rounded-xl bg-white p-8 text-center text-gray-400 shadow">กำลังโหลด...</div>
          ) : claims.length === 0 ? (
            <div className="rounded-xl bg-white p-8 text-center shadow">
              <p className="text-gray-400">ไม่มีใบเคลมที่เปิด CRL</p>
              <button onClick={loadClaims} className="mt-3 text-sm text-red-600 hover:underline">โหลดใหม่</button>
            </div>
          ) : (
            <div className="space-y-3">
              {claims.map(c => (
                <div key={c.id} className="rounded-xl border bg-white p-4 shadow-sm hover:border-red-300 hover:shadow-md transition-all">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-bold text-red-600">{c.code}</span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{c.status}</span>
                  </div>
                  <div className="mt-1 text-sm text-gray-600">{c.type_label}</div>
                  {c.customer_name && <div className="text-xs text-gray-400">{c.customer_name}</div>}
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-gray-500">สแกนแล้ว {c.total_qty} ชิ้น</span>
                    <button onClick={() => selectClaim(c)}
                      className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 active:bg-red-800">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                      </svg>
                      เปิดสแกน
                    </button>
                  </div>
                </div>
              ))}
              <button onClick={loadClaims} className="w-full rounded-xl border border-dashed border-gray-300 bg-white/50 py-3 text-sm text-gray-500 hover:bg-white">
                โหลดใหม่
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════
     SCREEN: SCAN
     ════════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50">
      {/* Top bar */}
      <div className="sticky top-0 z-10 border-b bg-white/90 px-3 py-2 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <button onClick={() => { setScreen('token'); setToken(''); setTokenInfo(null); setSelectedClaim(null); setScans([]); setProgress(null); setScanMessage(null); }}
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            ออก
          </button>
          <div className="text-center">
            <span className="font-mono text-sm font-bold text-red-600">{selectedClaim?.code}</span>
            {progress?.customer_name && <div className="text-[10px] text-gray-400">{progress.customer_name}</div>}
          </div>
          <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600">{progress?.total_qty ?? 0}</span>
        </div>
      </div>

      <div className="mx-auto max-w-lg px-3 py-2 space-y-2">
        {/* Scan input */}
        <div className="rounded-xl bg-white p-3 shadow-sm">
          <form onSubmit={handleScan} className="flex gap-2">
            <input
              ref={serialRef}
              type="text"
              value={serialInput}
              onChange={handleSerialChange}
              placeholder="ยิง Barcode / Serial..."
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-mono focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-200"
              autoFocus
              disabled={scanning}
            />
            <button type="submit" disabled={scanning || !serialInput.trim()}
              className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50 active:bg-red-800">
              {scanning ? '...' : 'สแกน'}
            </button>
          </form>

          {/* Scan message */}
          {scanMessage && (
            <div className={`mt-2 rounded-lg px-3 py-2 text-xs font-medium ${
              scanMessage.type === 'success' ? 'bg-green-50 text-green-700' :
              scanMessage.type === 'error' ? 'bg-red-50 text-red-700' :
              'bg-blue-50 text-blue-700'
            }`}>
              {scanMessage.text}
            </div>
          )}
        </div>

        {/* Scan history */}
        <div className="rounded-xl bg-white shadow-sm">
          <div className="border-b px-3 py-2">
            <h3 className="text-xs font-bold text-gray-600">ประวัติสแกน ({scans.length})</h3>
          </div>
          {scans.length === 0 ? (
            <div className="p-4 text-center text-xs text-gray-400">ยังไม่มีการสแกน</div>
          ) : (
            <div className="max-h-[60vh] overflow-auto divide-y">
              {scans.map((s) => (
                <div key={s.id} className="px-3 py-2 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-[11px] font-bold text-blue-600 truncate">{s.serial_number}</div>
                      <div className="text-[10px] text-gray-500 truncate">{s.product_code} — {s.product_name}</div>
                    </div>
                    <button onClick={() => deleteScan(s.id)}
                      className="shrink-0 rounded p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                  <select
                    value={s.resolution || ''}
                    onChange={e => updateResolution(s.id, e.target.value)}
                    className="w-full rounded border border-gray-200 px-2 py-1 text-[11px] text-gray-600 focus:border-red-400 focus:outline-none">
                    <option value="">— ยังไม่ระบุ —</option>
                    {RESOLUTION_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
