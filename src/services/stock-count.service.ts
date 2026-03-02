import api from '@/lib/api';
import type {
  StockCount,
  StockCountScan,
  StockCountStats,
  StockCountPayload,
  StockCountUnresolved,
  StockCountResolveSerialPayload,
  StockCountResolveScanPayload,
  ApiResponse,
} from '@/lib/types';

export interface StockCountFilters {
  page?: number;
  per_page?: number;
  status?: string;
  type?: string;
  search?: string;
}

export const stockCountService = {
  /* ── List ── */
  list: async (filters: StockCountFilters = {}) => {
    const { data } = await api.get('/stock-counts', { params: filters });
    return data;
  },

  /* ── Detail ── */
  get: async (id: number) => {
    const { data } = await api.get<{
      success: boolean;
      data: StockCount;
      stats: StockCountStats;
      unexpected_scans: StockCountScan[];
      missing_by_product: Record<number, { missing_count: number; resolved_count: number }>;
      unresolved: StockCountUnresolved;
    }>(`/stock-counts/${id}`);
    return data;
  },

  /* ── Create ── */
  create: async (payload: StockCountPayload) => {
    const { data } = await api.post<ApiResponse<StockCount>>('/stock-counts', payload);
    return data;
  },

  /* ── Workflow actions ── */
  start: async (id: number) => {
    const { data } = await api.post<ApiResponse<StockCount>>(`/stock-counts/${id}/start`);
    return data;
  },

  complete: async (id: number) => {
    const { data } = await api.post<ApiResponse<StockCount>>(`/stock-counts/${id}/complete`);
    return data;
  },

  approve: async (id: number) => {
    const { data } = await api.post<ApiResponse<StockCount>>(`/stock-counts/${id}/approve`);
    return data;
  },

  cancel: async (id: number) => {
    const { data } = await api.post<ApiResponse<StockCount>>(`/stock-counts/${id}/cancel`);
    return data;
  },

  /* ── Scans ── */
  scans: async (id: number, params: Record<string, unknown> = {}) => {
    const { data } = await api.get(`/stock-counts/${id}/scans`, { params });
    return data;
  },

  /* ── Missing serials ── */
  missingSerials: async (id: number, params: Record<string, unknown> = {}) => {
    const { data } = await api.get(`/stock-counts/${id}/missing-serials`, { params });
    return data;
  },

  /* ── Resolve discrepancies ── */
  resolveSerial: async (id: number, payload: StockCountResolveSerialPayload) => {
    const { data } = await api.post<ApiResponse<null>>(
      `/stock-counts/${id}/resolve-serial`,
      payload
    );
    return data;
  },

  resolveScan: async (id: number, payload: StockCountResolveScanPayload) => {
    const { data } = await api.post<ApiResponse<null>>(
      `/stock-counts/${id}/resolve-scan`,
      payload
    );
    return data;
  },

  /* ── Report (for printing) ── */
  report: async (id: number) => {
    const { data } = await api.get(`/stock-counts/${id}/report`);
    return data;
  },
};
