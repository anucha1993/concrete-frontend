import api from '@/lib/api';
import type { User, UserPayload, PaginatedResponse, ApiResponse } from '@/lib/types';

export interface UserFilters {
  page?: number;
  per_page?: number;
  role_id?: number;
  status?: string;
  search?: string;
}

export const userService = {
  list: async (filters: UserFilters = {}) => {
    const { data } = await api.get<PaginatedResponse<User>>('/users', { params: filters });
    return data;
  },

  get: async (id: number) => {
    const { data } = await api.get<ApiResponse<User>>(`/users/${id}`);
    return data;
  },

  create: async (payload: UserPayload) => {
    const { data } = await api.post<ApiResponse<User>>('/users', payload);
    return data;
  },

  update: async (id: number, payload: Partial<UserPayload>) => {
    const { data } = await api.put<ApiResponse<User>>(`/users/${id}`, payload);
    return data;
  },

  delete: async (id: number) => {
    const { data } = await api.delete<ApiResponse<null>>(`/users/${id}`);
    return data;
  },
};
