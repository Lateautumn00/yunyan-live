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
  id: string;
  username: string;
  email: string | null;
  role: number;
  status: string;
  lastLoginAt: string | null;
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

// ---------- 批次 7c：直播间全局管理 ----------

export interface LiveRoomItem {
  roomId: string;
  title: string;
  liveUserId: string;
  speakerName: string;
  joinCode: string;
  status: number;
  type: number;
  startTime: string;
  duration: number;
  liveNums: number;
  createdAt: string;
}

export interface RecordingItem {
  id: string;
  roomId: string;
  roomTitle: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  duration: number;
  recordType: number;
  teacherName: string;
  createdAt: string;
}

export interface CoursewareItem {
  id: string;
  roomId: string;
  roomTitle: string;
  filename: string;
  filext: string;
  filesize: number;
  fileurl: string;
  createUserId: string;
  createdAt: string;
}

export interface PagedLiveRooms {
  total: number;
  items: LiveRoomItem[];
}

export interface PagedRecordings {
  total: number;
  items: RecordingItem[];
}

export interface PagedCoursewares {
  total: number;
  items: CoursewareItem[];
}

export interface DashboardStats {
  totalUsers: number;
  todayNewUsers: number;
  bannedUsers: number;
  totalLiveRooms: number;
  activeLiveRooms: number;
  totalRecords: number;
  totalCoursewares: number;
  todayNewRooms: number;
}

export interface AuditLogItem {
  id: string;
  occurredAt: string;
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  requestId: string;
  ip: string;
  detail: unknown;
}

export interface PagedAuditLogs {
  total: number;
  items: AuditLogItem[];
}

export const listLiveRooms = (params: {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: number;
  type?: number;
  startTime?: string;
  endTime?: string;
}) => http.request<PagedLiveRooms>('get', '/admin/live/rooms', { params });

export const getLiveRoom = (roomId: string) =>
  http.request<LiveRoomItem>('get', `/admin/live/rooms/${roomId}`);

export const deleteLiveRoom = (roomId: string) =>
  http.request<{ code: number; msg: string }>('delete', `/admin/live/rooms/${roomId}`);

export const listRecordings = (params: {
  page?: number;
  pageSize?: number;
  keyword?: string;
  roomId?: string;
}) => http.request<PagedRecordings>('get', '/admin/live/recordings', { params });

export const deleteRecordings = (by: 'room' | 'video', ids: string[]) =>
  http.request<{ code: number; msg: string; deleted: number }>(
    'post',
    '/admin/live/recordings/delete',
    { data: { by, ids } }
  );

export const listCoursewares = (params: {
  page?: number;
  pageSize?: number;
  keyword?: string;
  roomId?: string;
}) => http.request<PagedCoursewares>('get', '/admin/live/coursewares', { params });

export const deleteCourseware = (id: string) =>
  http.request<{ code: number; msg: string }>('delete', `/admin/live/coursewares/${id}`);

// ---------- 批次 7c：数据看板 / 审计日志 ----------

export const getDashboardStats = () =>
  http.request<DashboardStats>('get', '/admin/dashboard/stats');

export const listAuditLogs = (params: {
  page?: number;
  pageSize?: number;
  action?: string;
  actor?: string;
  from?: string;
  to?: string;
}) => http.request<PagedAuditLogs>('get', '/admin/audit/logs', { params });
