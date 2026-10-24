import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModuleAsyncOptions } from '@nestjs/jwt';
import jwt from 'jsonwebtoken';

/** 默认签发有效期（与 .env.example 的 JWT_EXPIRES_IN=7d 一致） */
export const JWT_EXPIRES_IN_DEFAULT = '7d';

/** JWT_EXPIRES_IN 默认值的秒数表示（7d，接口 expires_in 字段用） */
export const JWT_EXPIRES_IN_SECONDS = 7 * 24 * 60 * 60;

/** JWT 载荷（sign/verify 共用；WS 网关亦依赖 sid 做会话校验） */
export interface JwtPayload {
  sub: string;
  email: string;
  role: number;
  sid?: string;
  /** 批次 7 / GAP-F8：管理员 token 显式携带 aud='admin'；用户 token 无此字段 */
  aud?: string;
}

/** 启动时读取 JWT_SECRET，缺失则打印指引并退出（WS 网关 fail-fast） */
export function requireJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.JWT_SECRET ?? '';
  if (!secret) {
    console.error('JWT_SECRET is not set. Copy .env.example to .env and set a strong secret.');
    process.exit(1);
  }
  return secret;
}

/**
 * 校验 token，返回载荷；无效/过期返回 null。
 * 批次 7 / GAP-F8：显式拒绝 admin audience 的 token（WS 网关等用户侧调用点）。
 * admin token（aud='admin'）若被误用于 WS 握手，其 role=1 会被 chat-ws 误判为教师；
 * 此处直接拒，杜绝跨受众越权。
 */
export function verifyToken(token: string, secret: string): JwtPayload | null {
  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, secret) as JwtPayload;
  } catch {
    return null;
  }
  if (payload.aud === 'admin') return null;
  return payload;
}

/** server / auth-service 共用的 JwtModule.registerAsync 配置（secret + 7d 默认值单源） */
export function jwtModuleAsyncOptions(): JwtModuleAsyncOptions {
  return {
    imports: [ConfigModule],
    useFactory: (config: ConfigService) => ({
      secret: config.get('JWT_SECRET'),
      signOptions: { expiresIn: config.get('JWT_EXPIRES_IN', JWT_EXPIRES_IN_DEFAULT) }
    }),
    inject: [ConfigService]
  };
}
