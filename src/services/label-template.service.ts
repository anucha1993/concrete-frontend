import api from '@/lib/api';
import type { ApiResponse } from '@/lib/types';

export interface LabelTemplate {
  id: number;
  name: string;
  paper_width: string;
  paper_height: string;
  template_json: Record<string, unknown>;
  is_default: boolean;
  is_active: boolean;
  created_by: number | null;
  updated_by: number | null;
  creator?: { id: number; name: string } | null;
  updater?: { id: number; name: string } | null;
  created_at: string;
  updated_at: string;
}

export interface LabelTemplatePayload {
  name: string;
  paper_width: string;
  paper_height: string;
  template_json: Record<string, unknown>;
  is_default?: boolean;
  is_active?: boolean;
}

export const labelTemplateService = {
  list: async (activeOnly = false) => {
    const params = activeOnly ? { active_only: true } : {};
    const { data } = await api.get<ApiResponse<LabelTemplate[]>>('/label-templates', { params });
    return data;
  },

  get: async (id: number) => {
    const { data } = await api.get<ApiResponse<LabelTemplate>>(`/label-templates/${id}`);
    return data;
  },

  create: async (payload: LabelTemplatePayload) => {
    const { data } = await api.post<ApiResponse<LabelTemplate>>('/label-templates', payload);
    return data;
  },

  update: async (id: number, payload: Partial<LabelTemplatePayload>) => {
    const { data } = await api.put<ApiResponse<LabelTemplate>>(`/label-templates/${id}`, payload);
    return data;
  },

  delete: async (id: number) => {
    const { data } = await api.delete<ApiResponse<null>>(`/label-templates/${id}`);
    return data;
  },
};
