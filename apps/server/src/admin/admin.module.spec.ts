import { describe, expect, it } from 'vitest';
import { SessionService } from '@yunyan-live/nest-shared';
import { AdminModule } from './admin.module';

/**
 * 回归点：AdminController 构造器注入了 SessionService（封禁时踢在线会话），
 * 但 AdminModule 曾漏注册该 provider，导致 `pnpm dev:gateway` 启动即报
 * "Nest can't resolve dependencies of the AdminController (…, SessionService)"。
 * 这里直接断言模块元数据，避免再依赖"手动起服务才发现"。
 */
describe('AdminModule 依赖装配', () => {
  it('本地注册 SessionService（RedisModule 为 @Global，只需 provider）', () => {
    const providers = (Reflect.getMetadata('providers', AdminModule) ?? []) as unknown[];
    expect(providers).toContain(SessionService);
  });
});
