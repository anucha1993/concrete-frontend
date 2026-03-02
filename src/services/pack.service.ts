import api from '@/lib/api';
import type { Pack, PackPayload, PaginatedResponse, ApiResponse } from '@/lib/types';

export interface PackFilters {
  page?: number;
  per_page?: number;
  is_active?: boolean;
  search?: string;
  sort_by?: string;
  sort_dir?: 'asc' | 'desc';
}

export const packService = {
  list: async (filters: PackFilters = {}) => {
    const { data } = await api.get<PaginatedResponse<Pack>>('/packs', { params: filters });
    return data;
  },

  get: async (id: number) => {
    const { data } = await api.get<ApiResponse<Pack>>(`/packs/${id}`);
    return data;
  },

  create: async (payload: PackPayload) => {
    const { data } = await api.post<ApiResponse<Pack>>('/packs', payload);
    return data;
  },

  update: async (id: number, payload: Partial<PackPayload>) => {
    const { data } = await api.put<ApiResponse<Pack>>(`/packs/${id}`, payload);
    return data;
  },

  delete: async (id: number) => {
    const { data } = await api.delete<ApiResponse<null>>(`/packs/${id}`);
    return data;
  },
};
