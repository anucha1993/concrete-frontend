import api from '@/lib/api';

export interface ReportFilters {
  page?: number;
  per_page?: number;
  search?: string;
  status?: string;
  type?: string;
  condition?: string;
  resolution?: string;
  product_id?: number;
  location_id?: number;
  category_id?: number;
  date_from?: string;
  date_to?: string;
}

export interface ReportResponse<T> {
  success: boolean;
  summary: Record<string, number>;
  data: T[];
  meta: { current_page: number; last_page: number; per_page: number; total: number };
}

export const reportService = {
  inventory: async (filters: ReportFilters = {}) => {
    const { data } = await api.get<ReportResponse<Record<string, unknown>>>('/reports/inventory', { params: filters });
    return data;
  },

  stockDeductions: async (filters: ReportFilters = {}) => {
    const { data } = await api.get<ReportResponse<Record<string, unknown>>>('/reports/stock-deductions', { params: filters });
    return data;
  },

  claims: async (filters: ReportFilters = {}) => {
    const { data } = await api.get<ReportResponse<Record<string, unknown>>>('/reports/claims', { params: filters });
    return data;
  },

  production: async (filters: ReportFilters = {}) => {
    const { data } = await api.get<ReportResponse<Record<string, unknown>>>('/reports/production', { params: filters });
    return data;
  },

  movements: async (filters: ReportFilters = {}) => {
    const { data } = await api.get<ReportResponse<Record<string, unknown>>>('/reports/movements', { params: filters });
    return data;
  },

  /** Download Excel via authenticated blob request */
  exportExcel: async (report: string, filters: ReportFilters = {}) => {
    const response = await api.get(`/reports/export/${report}`, {
      params: filters,
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const a = document.createElement('a');
    a.href = url;
    const disposition = response.headers['content-disposition'];
    const filename = disposition
      ? disposition.split('filename=')[1]?.replace(/"/g, '') || `${report}_report.xlsx`
      : `${report}_report.xlsx`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
};
