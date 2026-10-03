import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { SessionService } from '@yunyan-live/nest-shared';

export interface JwtPayload {
  sub: string;
  email: string;
  role: number;
  sid?: string;
}

export interface AuthUser {
  userId: string;
  email: string;
  role: number;
  sid?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private readonly sessionService: SessionService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET'),
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
      sid: payload.sid,
    };
  }
}
