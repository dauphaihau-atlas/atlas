export interface ApiResponse<T> {
  data: T;
  message?: string;
  meta?: PaginationMeta;
}

export interface PaginationMeta {
  total: number;
  per_page: number;
  current_page: number;
}

export interface User {
  id: number;
  name: string;
  email: string;
  avatar_url: string | null;
  roles: string[];
  tenant_id: number | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface UserStats {
  total_active: number;
  total_deleted: number;
  created_today: number;
}

export interface Tenant {
  id: number;
  name: string;
  slug: string;
  settings: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ActivityLog {
  id: number;
  log_name: string;
  event: string;
  subject_type: string;
  subject_id: number;
  causer_type: string | null;
  causer_id: number | null;
  causer_name: string | null;
  causer_email: string | null;
  properties: Record<string, unknown> | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
}
