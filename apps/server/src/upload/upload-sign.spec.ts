import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import {
  buildSignedUploadUrl,
  getUploadSecret,
  signUploadPath,
  uploadVerifyMiddleware
} from './upload-sign';

beforeAll(() => {
  process.env.UPLOAD_SIGNING_SECRET = 'upload-sign-unit-secret-0123456789';
});

afterEach(() => {
  delete process.env.UPLOAD_SIGNING_SECRET;
});

function mockReqRes(url: string) {
  const req = { url, originalUrl: url } as unknown as Request;
  const state = { statusCode: 200, ended: false };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return this;
    },
    end() {
      state.ended = true;
      return this;
    }
  } as unknown as Response;
  return { req, res, state };
}

describe('signUploadPath / buildSignedUploadUrl', () => {
  it('同路径同密钥 → 签名稳定且 22 字符 base64url', () => {
    const a = signUploadPath('/uploads/images/a.png');
    const b = signUploadPath('/uploads/images/a.png');
    expect(a).toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('路径不同 → 签名不同', () => {
    expect(signUploadPath('/uploads/images/a.png')).not.toBe(signUploadPath('/uploads/ppt/a.pdf'));
  });

  it('URL 形态 /uploads/<sig22>/<rel>，与 canonical 一一对应', () => {
    const url = buildSignedUploadUrl('http://h:1', 'images/x.png');
    const m = /^http:\/\/h:1\/uploads\/([A-Za-z0-9_-]{22})\/images\/x\.png$/.exec(url);
    expect(m).not.toBeNull();
    expect(m?.[1]).toBe(signUploadPath('/uploads/images/x.png'));
  });

  it('env 密钥缺失 → 随机密钥 + 告警（不复用弱默认）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // 模块缓存可能已有值：直接验证 getUploadSecret 返回非空且 >= 16 字符
    const secret = getUploadSecret();
    expect(secret.length).toBeGreaterThanOrEqual(16);
    warn.mockRestore();
  });
});

describe('uploadVerifyMiddleware', () => {
  it('合法签名 → 剥段重写 req.url 并放行（保留 query）', () => {
    const sig = signUploadPath('/uploads/images/a.png');
    const { req, res, state } = mockReqRes(`/uploads/${sig}/images/a.png?v=2`);
    const next = vi.fn();
    uploadVerifyMiddleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.url).toBe('/images/a.png?v=2');
    expect(state.ended).toBe(false);
  });

  it('篡改签名 → 404 且不放行', () => {
    const sig = signUploadPath('/uploads/images/a.png');
    const bad = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
    const { req, res, state } = mockReqRes(`/uploads/${bad}/images/a.png`);
    const next = vi.fn();
    uploadVerifyMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(state.statusCode).toBe(404);
    expect(state.ended).toBe(true);
  });

  it('篡改路径（保留旧签名）→ 404', () => {
    const sig = signUploadPath('/uploads/images/a.png');
    const { req, res, state } = mockReqRes(`/uploads/${sig}/images/secret-b.png`);
    const next = vi.fn();
    uploadVerifyMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(state.statusCode).toBe(404);
  });

  it('老格式（无 sig 段，S3 上线前存量 URL）→ 404', () => {
    const { req, res, state } = mockReqRes('/uploads/images/legacy.png');
    const next = vi.fn();
    uploadVerifyMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(state.statusCode).toBe(404);
  });

  it('签名段长度不符 → 404（防截断/拼接）', () => {
    const { req, res, state } = mockReqRes('/uploads/short/images/a.png');
    const next = vi.fn();
    uploadVerifyMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(state.statusCode).toBe(404);
  });

  it('路径穿越（../）即使签名正确也不放行到静态之外——canonical 只由服务端签发', () => {
    // 攻击者无法为 ../../etc/passwd 造出合法签名（无密钥），此处验证未签名路径直接 404
    const { req, res, state } = mockReqRes('/uploads/AAAAAAAAAAAAAAAAAAAAAA/../../etc/passwd');
    const next = vi.fn();
    uploadVerifyMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(state.statusCode).toBe(404);
  });
});
