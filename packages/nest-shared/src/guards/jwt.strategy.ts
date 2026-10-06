import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../jwt';
import { SessionService } from '../session';

interface AuthUser {
  userId: string;
  email: string;
  role: number;
  sid?: string;
}

/** Bearer JWT 策略：校验签发合法性并叠加 Redis 会话状态（被顶下线/过期） */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly sessionService: SessionService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET')
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const state = await this.sessionService.validateSid(payload.sub, payload.sid);
    if (state === 'kicked') {
      throw new UnauthorizedException({ code: 4002, message: '账号已在其他设备登录' });
    }
    if (state === 'expired') {
      throw new UnauthorizedException({ code: 4001, message: '登录已过期，请重新登录' });
    }
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      sid: payload.sid
    };
  }
}
