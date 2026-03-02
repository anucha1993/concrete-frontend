import api from '@/lib/api';
import type {
  Inventory,
  LabelPrintLog,
  LabelReprintRequest,
  LabelStats,
  ProductionOrderLabelInfo,
  ProductionOrderSerialsResponse,
  ApiResponse,
  PaginatedResponse,
} from '@/lib/types';

export const labelService = {
  /* ── Production Orders with label info ── */
  productionOrders: async (params: Record<string, unknown> = {}) => {
    const { data } = await api.get<PaginatedResponse<ProductionOrderLabelInfo>>('/labels/production-orders', { params });
    return data;
  },

  /* ── Serials for a specific PO ── */
  productionOrderSerials: async (poId: number, params: Record<string, unknown> = {}) => {
    const { data } = await api.get<ProductionOrderSerialsResponse>(`/labels/production-orders/${poId}/serials`, { params });
    return data;
  },

  /* ── Print all unprinted in a PO ── */
  printByPo: async (payload: { production_order_id: number; paper_size?: string }) => {
    const { data } = await api.post<ApiResponse<null>>('/labels/print-by-po', payload);
    return data;
  },

  /* ── Printable serials ── */
  printable: async (params: Record<string, unknown> = {}) => {
    const { data } = await api.get<PaginatedResponse<Inventory>>('/labels/printable', { params });
    return data;
  },

  /* ── Print (first time, or admin reprint) ── */
  print: async (payload: { inventory_ids: number[]; paper_size?: string; reprint_reason?: string }) => {
    const { data } = await api.post<ApiResponse<Inventory[]>>('/labels/print', payload);
    return data;
  },

  /* ── Verify (PDA scan) ── */
  verify: async (serial_number: string) => {
    const { data } = await api.post<ApiResponse<Inventory>>('/labels/verify', { serial_number });
    return data;
  },

  verifyBatch: async (serial_numbers: string[]) => {
    const { data } = await api.post<ApiResponse<{ verified: string[]; skipped: string[]; errors: string[] }>>('/labels/verify-batch', { serial_numbers });
    return data;
  },

  /* ── Print history ── */
  history: async (params: Record<string, unknown> = {}) => {
    const { data } = await api.get<PaginatedResponse<LabelPrintLog>>('/labels/history', { params });
    return data;
  },

  /* ── Stats ── */
  stats: async () => {
    const { data } = await api.get<ApiResponse<LabelStats>>('/labels/stats');
    return data;
  },

  /* ── Reprint Requests ── */
  reprintRequests: async (params: Record<string, unknown> = {}) => {
    const { data } = await api.get<PaginatedResponse<LabelReprintRequest>>('/labels/reprint-requests', { params });
    return data;
  },

  showReprintRequest: async (id: number) => {
    const { data } = await api.get<ApiResponse<LabelReprintRequest>>(`/labels/reprint-requests/${id}`);
    return data;
  },

  createReprintRequest: async (payload: {
    reason: string;
    inventory_ids: number[];
    production_order_id?: number;
  }) => {
    const { data } = await api.post<ApiResponse<LabelReprintRequest>>('/labels/reprint-requests', payload);
    return data;
  },

  approveReprint: async (id: number) => {
    const { data } = await api.post<ApiResponse<LabelReprintRequest>>(`/labels/reprint-requests/${id}/approve`);
    return data;
  },

  rejectReprint: async (id: number, reject_reason: string) => {
    const { data } = await api.post<ApiResponse<LabelReprintRequest>>(`/labels/reprint-requests/${id}/reject`, { reject_reason });
    return data;
  },

  /* ── Execute reprint (from approved request) ── */
  reprint: async (payload: {
    reprint_request_id: number;
    inventory_ids: number[];
    paper_size?: string;
  }) => {
    const { data } = await api.post<ApiResponse<Inventory[]>>('/labels/reprint', payload);
    return data;
  },

  /* ── PDA Token Management (admin) ── */
  createPdaToken: async (name?: string) => {
    const { data } = await api.post<ApiResponse<{ id: number; token: string; name: string; expires_at: string; created_by: string }>>('/pda-tokens', { name });
    return data;
  },

  listPdaTokens: async () => {
    const { data } = await api.get<ApiResponse<Array<{
      id: number; name: string; token: string; expires_at: string;
      is_expired: boolean; is_revoked: boolean; is_valid: boolean;
      scan_count: number; last_used_at: string | null;
      created_by: string; created_at: string;
    }>>>('/pda-tokens');
    return data;
  },

  revokePdaToken: async (id: number) => {
    const { data } = await api.post<ApiResponse<null>>(`/pda-tokens/${id}/revoke`);
    return data;
  },
};
