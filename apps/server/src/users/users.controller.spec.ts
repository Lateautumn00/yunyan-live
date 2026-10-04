import { afterEach, describe, expect, it, vi } from 'vitest';
import { UsersController } from './users.controller';

afterEach(() => {
  vi.useRealTimers();
});

describe('UsersController', () => {
  it('getNowTime 返回当前时间戳字符串', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-02T03:04:05.678Z'));
    const controller = new UsersController();
    expect(controller.getNowTime()).toEqual({
      nowTime: new Date('2024-01-02T03:04:05.678Z').getTime().toString()
    });
  });
});
