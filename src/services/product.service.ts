import api from '@/lib/api';
import type { Product, ProductPayload, PaginatedResponse, ApiResponse } from '@/lib/types';

export interface ProductFilters {
  page?: number;
  per_page?: number;
  category_id?: number;
  size_type?: string;
  is_active?: boolean;
  search?: string;
  sort_by?: string;
  sort_dir?: 'asc' | 'desc';
  with_stock?: boolean;
}

export const productService = {
  list: async (filters: ProductFilters = {}) => {
    const { data } = await api.get<PaginatedResponse<Product>>('/products', { params: filters });
    return data;
  },

  get: async (id: number) => {
    const { data } = await api.get<ApiResponse<Product>>(`/products/${id}`);
    return data;
  },

  create: async (payload: ProductPayload) => {
    const { data } = await api.post<ApiResponse<Product>>('/products', payload);
    return data;
  },

  update: async (id: number, payload: Partial<ProductPayload>) => {
    const { data } = await api.put<ApiResponse<Product>>(`/products/${id}`, payload);
    return data;
  },

  delete: async (id: number) => {
    const { data } = await api.delete<ApiResponse<null>>(`/products/${id}`);
    return data;
  },
};
