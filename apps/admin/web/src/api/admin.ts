import { http } from '@/utils/http';

// ---------- 类型 ----------

export interface AdminLoginResult {
  token: string;
  expiresIn: number;
  admin: {
    id: string;
    username: string;
    email: string | null;
    role: number;
    status: string;
  };
}

export interface AdminMeResult {
  code: number;
  msg: string;
  data: {
    id: string;
    username: string;
    email: string | null;
    role: number;
    status: string;
    lastLoginAt: string | null;
  };
}

export interface AdminItem {
  id: string;
  username: string;
  email: string | null;
  role: number;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface UserItem {
  id: string;
  username: string;
  email: string;
  role: number;
  status: string;
  bannedAt: string | null;
  bannedBy: string | null;
  createdAt: string;
}

export interface PagedAdmins {
  total: number;
  items: AdminItem[];
}

export interface PagedUsers {
  total: number;
  items: UserItem[];
}

// ---------- 端点 ----------

export const adminLogin = (body: { username: string; password: string }) =>
  http.request<AdminLoginResult>('post', '/admin/login', { data: body });

export const getAdminMe = () => http.request<AdminMeResult>('get', '/admin/me');

export const listAdmins = (params: { page?: number; pageSize?: number; keyword?: string }) =>
  http.request<PagedAdmins>('get', '/admin/admins', { params });

export const createAdmin = (body: {
  username: string;
  email?: string;
  password: string;
  role?: number;
}) =>
  http.request<{ code: number; msg: string; data: AdminItem }>('post', '/admin/admins', {
    data: body
  });

export const updateAdminRole = (adminId: string, role: number) =>
  http.request<{ code: number; msg: string }>('post', `/admin/admins/${adminId}/role`, {
    data: { role }
  });

export const setAdminStatus = (adminId: string, status: string) =>
  http.request<{ code: number; msg: string }>('post', `/admin/admins/${adminId}/status`, {
    data: { status }
  });

export const listUsers = (params: {
  page?: number;
  pageSize?: number;
  keyword?: string;
  role?: number;
  status?: string;
}) => http.request<PagedUsers>('get', '/admin/users', { params });

export const banUser = (userId: string, reason?: string) =>
  http.request<{ code: number; msg: string }>('post', `/admin/users/${userId}/ban`, {
    data: { reason }
  });

export const unbanUser = (userId: string) =>
  http.request<{ code: number; msg: string }>('post', `/admin/users/${userId}/unban`);

export const setUserRole = (userId: string, role: number) =>
  http.request<{ code: number; msg: string }>('post', `/admin/users/${userId}/role`, {
    data: { role }
  });
