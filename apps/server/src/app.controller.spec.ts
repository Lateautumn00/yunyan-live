import { describe, expect, it, vi } from 'vitest';
import { AppController } from './app.controller';

describe('AppController', () => {
  it('getHealth 委托 AppService.getHealth', () => {
    const health = { status: 'ok', service: '@yunyan-live/server', timestamp: 1 };
    const service = { getHealth: vi.fn(() => health) };
    const controller = new AppController(service as never);
    expect(controller.getHealth()).toBe(health);
    expect(service.getHealth).toHaveBeenCalledTimes(1);
  });

  it('getServicesHealth 委托 AppService.getServicesHealth', async () => {
    const payload = { status: 'ok', services: [] };
    const service = { getServicesHealth: vi.fn(async () => payload) };
    const controller = new AppController(service as never);
    await expect(controller.getServicesHealth()).resolves.toBe(payload);
    expect(service.getServicesHealth).toHaveBeenCalledTimes(1);
  });
});
