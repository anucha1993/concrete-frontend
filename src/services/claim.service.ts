import api from '@/lib/api';
import type {
  Claim,
  ClaimPayload,
  ClaimSearchItem,
  ApiResponse,
  PaginatedResponse,
} from '@/lib/types';

export interface ClaimFilters {
  search?: string;
  status?: string;
  type?: string;
  page?: number;
  per_page?: number;
}

export interface ClaimShowResponse {
  success: boolean;
  data: Claim;
  stats: {
    total_qty: number;
    lines_count: number;
  };
}

export const claimService = {
  list: async (filters: ClaimFilters = {}) => {
    const res = await api.get<PaginatedResponse<Claim>>('/claims', { params: filters });
    return res.data;
  },

  show: async (id: number) => {
    const res = await api.get<ClaimShowResponse>(`/claims/${id}`);
    return res.data;
  },

  create: async (payload: ClaimPayload) => {
    const res = await api.post<ApiResponse<Claim>>('/claims', payload);
    return res.data;
  },

  update: async (id: number, payload: Partial<ClaimPayload>) => {
    const res = await api.put<ApiResponse<Claim>>(`/claims/${id}`, payload);
    return res.data;
  },

  delete: async (id: number) => {
    const res = await api.delete<ApiResponse<null>>(`/claims/${id}`);
    return res.data;
  },

  submit: async (id: number) => {
    const res = await api.post<ApiResponse<Claim>>(`/claims/${id}/submit`);
    return res.data;
  },

  approve: async (id: number) => {
    const res = await api.post<ApiResponse<Claim>>(`/claims/${id}/approve`);
    return res.data;
  },

  reject: async (id: number, reject_reason: string) => {
    const res = await api.post<ApiResponse<Claim>>(`/claims/${id}/reject`, { reject_reason });
    return res.data;
  },

  cancel: async (id: number) => {
    const res = await api.post<ApiResponse<Claim>>(`/claims/${id}/cancel`);
    return res.data;
  },
  searchItems: async (q: string) => {
    const res = await api.get<{ success: boolean; data: ClaimSearchItem[] }>('/claims/search-items', { params: { q } });
    return res.data;
  },

  generatePda: async (id: number) => {
    const res = await api.post<ApiResponse<{ pda_token: string }>>(`/claims/${id}/generate-pda`);
    return res.data;
  },
};
