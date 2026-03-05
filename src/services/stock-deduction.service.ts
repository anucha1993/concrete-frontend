import api from '@/lib/api';
import type {
  StockDeduction,
  StockDeductionPayload,
  ApiResponse,
  PaginatedResponse,
} from '@/lib/types';

export interface StockDeductionFilters {
  search?: string;
  status?: string;
  type?: string;
  page?: number;
  per_page?: number;
}

export interface StockDeductionShowResponse {
  success: boolean;
  data: StockDeduction;
  stats: {
    total_planned: number;
    total_scanned: number;
    lines_count: number;
    scans_count: number;
  };
}

export const stockDeductionService = {
  list: async (filters: StockDeductionFilters = {}) => {
    const res = await api.get<PaginatedResponse<StockDeduction> & { status_counts?: Record<string, number> }>('/stock-deductions', { params: filters });
    return res.data;
  },

  show: async (id: number) => {
    const res = await api.get<StockDeductionShowResponse>(`/stock-deductions/${id}`);
    return res.data;
  },

  create: async (payload: StockDeductionPayload) => {
    const res = await api.post<ApiResponse<StockDeduction>>('/stock-deductions', payload);
    return res.data;
  },

  update: async (id: number, payload: Partial<StockDeductionPayload>) => {
    const res = await api.put<ApiResponse<StockDeduction>>(`/stock-deductions/${id}`, payload);
    return res.data;
  },

  submit: async (id: number) => {
    const res = await api.post<ApiResponse<StockDeduction> & { pda_token?: string }>(`/stock-deductions/${id}/submit`);
    return res.data;
  },

  complete: async (id: number) => {
    const res = await api.post<ApiResponse<StockDeduction>>(`/stock-deductions/${id}/complete`);
    return res.data;
  },

  approve: async (id: number) => {
    const res = await api.post<ApiResponse<StockDeduction>>(`/stock-deductions/${id}/approve`);
    return res.data;
  },

  cancel: async (id: number) => {
    const res = await api.post<ApiResponse<StockDeduction>>(`/stock-deductions/${id}/cancel`);
    return res.data;
  },

  delete: async (id: number) => {
    const res = await api.delete<ApiResponse<null>>(`/stock-deductions/${id}`);
    return res.data;
  },

  scan: async (id: number, serial_number: string) => {
    const res = await api.post<ApiResponse<{ serial_number: string; product_name: string; product_code: string; line_progress: string; all_fulfilled: boolean; is_over_quantity?: boolean }>>(`/stock-deductions/${id}/scan`, { serial_number });
    return res.data;
  },

  deleteScan: async (deductionId: number, scanId: number) => {
    const res = await api.delete<ApiResponse<null>>(`/stock-deductions/${deductionId}/scans/${scanId}`);
    return res.data;
  },

  generatePrintToken: async (id: number) => {
    const res = await api.post<{ success: boolean; pda_token: string | null; message: string }>(`/stock-deductions/${id}/generate-print-token`);
    return res.data;
  },
};
