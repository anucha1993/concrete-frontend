import api from '@/lib/api';
import type { Category, CategoryPayload, Location, LocationPayload, ApiResponse } from '@/lib/types';

export const categoryService = {
  list: async (isActive?: boolean) => {
    const params = isActive !== undefined ? { is_active: isActive } : {};
    const { data } = await api.get<ApiResponse<Category[]>>('/categories', { params });
    return data;
  },

  get: async (id: number) => {
    const { data } = await api.get<ApiResponse<Category>>(`/categories/${id}`);
    return data;
  },

  create: async (payload: CategoryPayload) => {
    const { data } = await api.post<ApiResponse<Category>>('/categories', payload);
    return data;
  },

  update: async (id: number, payload: Partial<CategoryPayload>) => {
    const { data } = await api.put<ApiResponse<Category>>(`/categories/${id}`, payload);
    return data;
  },

  delete: async (id: number) => {
    const { data } = await api.delete<ApiResponse<null>>(`/categories/${id}`);
    return data;
  },
};

export const locationService = {
  list: async (isActive?: boolean) => {
    const params = isActive !== undefined ? { is_active: isActive } : {};
    const { data } = await api.get<ApiResponse<Location[]>>('/locations', { params });
    return data;
  },

  get: async (id: number) => {
    const { data } = await api.get<ApiResponse<Location>>(`/locations/${id}`);
    return data;
  },

  create: async (payload: LocationPayload) => {
    const { data } = await api.post<ApiResponse<Location>>('/locations', payload);
    return data;
  },

  update: async (id: number, payload: Partial<LocationPayload>) => {
    const { data } = await api.put<ApiResponse<Location>>(`/locations/${id}`, payload);
    return data;
  },

  delete: async (id: number) => {
    const { data } = await api.delete<ApiResponse<null>>(`/locations/${id}`);
    return data;
  },
};
