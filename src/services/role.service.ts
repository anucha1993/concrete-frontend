import api from '@/lib/api';
import type { Role, RolePayload, ApiResponse, Permission } from '@/lib/types';

export const roleService = {
  list: async () => {
    const { data } = await api.get<ApiResponse<Role[]>>('/roles');
    return data;
  },

  get: async (id: number) => {
    const { data } = await api.get<ApiResponse<Role>>(`/roles/${id}`);
    return data;
  },

  create: async (payload: RolePayload) => {
    const { data } = await api.post<ApiResponse<Role>>('/roles', payload);
    return data;
  },

  update: async (id: number, payload: Partial<RolePayload>) => {
    const { data } = await api.put<ApiResponse<Role>>(`/roles/${id}`, payload);
    return data;
  },

  delete: async (id: number) => {
    const { data } = await api.delete<ApiResponse<null>>(`/roles/${id}`);
    return data;
  },

  assignPermissions: async (roleId: number, permissionIds: number[]) => {
    const { data } = await api.post<ApiResponse<Role>>(`/roles/${roleId}/permissions`, {
      permissions: permissionIds,
    });
    return data;
  },

  listPermissions: async () => {
    const { data } = await api.get<ApiResponse<Permission[]>>('/permissions');
    return data;
  },
};
