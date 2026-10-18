import { randomUUID } from 'node:crypto';

/** O7 桥接：x-request-id 取客户端自带值（截断），否则生成 uuid；响应回写同名头供前后端串联。 */
export const REQUEST_ID_HEADER = 'x-request-id';
export const MAX_REQUEST_ID_LENGTH = 64;

export interface RequestIdRequest {
  headers: Record<string, string | string[] | undefined>;
  requestId?: string;
}

export interface RequestIdResponse {
  setHeader(name: string, value: string): unknown;
}

export function requestIdMiddleware(
  req: RequestIdRequest,
  res: RequestIdResponse,
  next: () => void
): void {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const raw = Array.isArray(incoming) ? incoming[0] : incoming;
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  req.requestId = trimmed ? trimmed.slice(0, MAX_REQUEST_ID_LENGTH) : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, req.requestId);
  next();
}
