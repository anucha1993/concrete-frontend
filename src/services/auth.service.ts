import api from '@/lib/api';
import type { LoginPayload, AuthResponse, ApiResponse, User } from '@/lib/types';

export const authService = {
  login: async (payload: LoginPayload) => {
    const { data } = await api.post<AuthResponse>('/login', payload);
    return data;
  },

  logout: async () => {
    const { data } = await api.post<{ success: boolean; message: string }>('/logout');
    return data;
  },

  me: async () => {
    const { data } = await api.get<ApiResponse<User>>('/me');
    return data;
  },
};
