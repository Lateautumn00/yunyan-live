import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadPersistenceConfig, requireDatabaseUrl, requireRabbitUrl } from './config';

function env(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { ...overrides } as NodeJS.ProcessEnv;
}

describe('loadPersistenceConfig（方案 §4.7 单布尔开关矩阵）', () => {
  it('双 URL 齐备 → enabled，disabledReason=null', () => {
    const cfg = loadPersistenceConfig(
      env({ DATABASE_URL: 'postgresql://x/y', RABBITMQ_URL: 'amqp://x' })
    );
    expect(cfg).toMatchObject({
      enabled: true,
      disabledReason: null,
      databaseUrl: 'postgresql://x/y',
      rabbitUrl: 'amqp://x'
    });
  });

  it('只配 DATABASE_URL → 半配置按关闭处理（防"只开 MQ"无界积压的对称面）', () => {
    const cfg = loadPersistenceConfig(env({ DATABASE_URL: 'postgresql://x/y' }));
    expect(cfg.enabled).toBe(false);
    expect(cfg.disabledReason).toBe('half_configured');
    expect(cfg.databaseUrl).toBe('postgresql://x/y');
    expect(cfg.rabbitUrl).toBeUndefined();
  });

  it('只配 RABBITMQ_URL → 半配置按关闭处理', () => {
    const cfg = loadPersistenceConfig(env({ RABBITMQ_URL: 'amqp://x' }));
    expect(cfg).toMatchObject({ enabled: false, disabledReason: 'half_configured' });
  });

  it('双缺 → not_configured', () => {
    expect(loadPersistenceConfig(env())).toMatchObject({
      enabled: false,
      disabledReason: 'not_configured'
    });
  });

  it('空串等价未配置（"" !== 已配置）', () => {
    expect(loadPersistenceConfig(env({ DATABASE_URL: '', RABBITMQ_URL: '' }))).toMatchObject({
      enabled: false,
      disabledReason: 'not_configured'
    });
  });

  it('historyTimeoutMs 默认 3000，env 覆盖生效，非法值回落默认', () => {
    expect(loadPersistenceConfig(env()).historyTimeoutMs).toBe(3000);
    expect(loadPersistenceConfig(env({ CHAT_HISTORY_TIMEOUT_MS: '1500' })).historyTimeoutMs).toBe(
      1500
    );
    expect(loadPersistenceConfig(env({ CHAT_HISTORY_TIMEOUT_MS: 'abc' })).historyTimeoutMs).toBe(
      3000
    );
    expect(loadPersistenceConfig(env({ CHAT_HISTORY_TIMEOUT_MS: '0' })).historyTimeoutMs).toBe(
      3000
    );
  });
});

describe('require* fail-fast（仅开关开启分支调用；缺失 exit 1）', () => {
  afterEach(() => vi.restoreAllMocks());

  it('requireDatabaseUrl 缺失 → 打指引并 exit(1)', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const url = requireDatabaseUrl(env());
    expect(exit).toHaveBeenCalledWith(1);
    expect(err).toHaveBeenCalledWith(expect.stringContaining('DATABASE_URL is not set'));
    expect(url).toBe('');
  });

  it('requireRabbitUrl 缺失 → 打指引并 exit(1)', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const url = requireRabbitUrl(env());
    expect(exit).toHaveBeenCalledWith(1);
    expect(err).toHaveBeenCalledWith(expect.stringContaining('RABBITMQ_URL is not set'));
    expect(url).toBe('');
  });

  it('存在时原样返回，不触发 exit', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    expect(requireDatabaseUrl(env({ DATABASE_URL: 'postgresql://x/y' }))).toBe('postgresql://x/y');
    expect(requireRabbitUrl(env({ RABBITMQ_URL: 'amqp://x' }))).toBe('amqp://x');
    expect(exit).not.toHaveBeenCalled();
  });
});
