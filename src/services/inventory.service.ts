import api from '@/lib/api';
import type {
  Inventory,
  InventorySummary,
  InventoryAlert,
  PaginatedResponse,
  ApiResponse,
} from '@/lib/types';

export interface InventoryFilters {
  page?: number;
  per_page?: number;
  product_id?: number;
  location_id?: number;
  status?: string;
  condition?: string;
  search?: string;
  sort_by?: string;
  sort_dir?: 'asc' | 'desc';
}

export const inventoryService = {
  list: async (filters: InventoryFilters = {}) => {
    const { data } = await api.get<PaginatedResponse<Inventory>>('/inventory', { params: filters });
    return data;
  },

  get: async (id: number) => {
    const { data } = await api.get<ApiResponse<Inventory>>(`/inventory/${id}`);
    return data;
  },

  summary: async (search?: string) => {
    const params = search ? { search } : {};
    const { data } = await api.get<ApiResponse<InventorySummary[]>>('/inventory/summary', { params });
    return data;
  },

  alerts: async (inactiveDays = 30, longStoreDays = 90) => {
    const { data } = await api.get<ApiResponse<InventoryAlert>>('/inventory/alerts', {
      params: { inactive_days: inactiveDays, long_store_days: longStoreDays },
    });
    return data;
  },

  update: async (id: number, payload: { status?: string; condition?: string; location_id?: number | null; note?: string | null; reason: string }) => {
    const { data } = await api.put<ApiResponse<Inventory>>(`/inventory/${id}`, payload);
    return data;
  },
};
