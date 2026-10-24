import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

interface AdminAuthUser {
  adminId: string;
  username: string;
  role: number;
}

/**
 * 批次 7 / GAP-F8：管理员 JWT 策略（独立 audience=admin，与用户 JwtStrategy 物理隔离）。
 * - 不注册 Redis 会话校验（管理员无 sid 概念，7b 扩展吊销机制）。
 * - 策略名 'admin-jwt'（区别于 'jwt'），可并行注册不覆盖。
 * - 用户 token（无 aud=admin）经 passport-jwt audience 校验天然拒绝；admin token 反向同理。
 */
@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET'),
      audience: 'admin'
    });
  }

  async validate(payload: { sub: string; username: string; role: number }): Promise<AdminAuthUser> {
    return {
      adminId: payload.sub,
      username: payload.username,
      role: payload.role
    };
  }
}
