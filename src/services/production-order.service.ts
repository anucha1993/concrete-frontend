import api from '@/lib/api';
import type {
  ProductionOrder,
  ProductionOrderPayload,
  ReceivePayload,
  ProductionSerial,
  PaginatedResponse,
  ApiResponse,
} from '@/lib/types';

export interface ProductionOrderFilters {
  page?: number;
  per_page?: number;
  status?: string;
  search?: string;
  sort_by?: string;
  sort_dir?: 'asc' | 'desc';
}

export const productionOrderService = {
  list: async (filters: ProductionOrderFilters = {}) => {
    const { data } = await api.get<PaginatedResponse<ProductionOrder>>('/production-orders', { params: filters });
    return data;
  },

  get: async (id: number) => {
    const { data } = await api.get<ApiResponse<ProductionOrder>>(`/production-orders/${id}`);
    return data;
  },

  create: async (payload: ProductionOrderPayload) => {
    const { data } = await api.post<ApiResponse<ProductionOrder>>('/production-orders', payload);
    return data;
  },

  confirm: async (id: number) => {
    const { data } = await api.post<ApiResponse<ProductionOrder>>(`/production-orders/${id}/confirm`);
    return data;
  },

  start: async (id: number) => {
    const { data } = await api.post<ApiResponse<ProductionOrder>>(`/production-orders/${id}/start`);
    return data;
  },

  receive: async (id: number, payload: ReceivePayload) => {
    const { data } = await api.post<ApiResponse<ProductionOrder>>(`/production-orders/${id}/receive`, payload);
    return data;
  },

  cancel: async (id: number) => {
    const { data } = await api.post<ApiResponse<ProductionOrder>>(`/production-orders/${id}/cancel`);
    return data;
  },

  serials: async (id: number) => {
    const { data } = await api.get<ApiResponse<ProductionSerial[]>>(`/production-orders/${id}/serials`);
    return data;
  },
};
