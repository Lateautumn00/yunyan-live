import { generateKeyPairSync, createPublicKey, webcrypto, KeyObject, constants, privateDecrypt } from 'node:crypto';
import { afterEach, beforeAll, afterAll, describe, expect, it } from 'vitest';
import { RpcException } from '@nestjs/microservices';
import { decryptPassword } from './password-crypto';

const ORIGINAL_ENV = process.env.PASSWORD_PRIVATE_KEY;

let privateKey: KeyObject;

async function encryptForClient(plaintext: string): Promise<string> {
  const publicKey = createPublicKey(privateKey);
  const key = await webcrypto.subtle.importKey(
    'spki',
    publicKey.export({ type: 'spki', format: 'der' }),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  );
  const ciphertext = await webcrypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    key,
    new TextEncoder().encode(plaintext),
  );
  return Buffer.from(ciphertext).toString('base64');
}

function expectRpcError(fn: () => unknown, pattern: RegExp) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(RpcException);
    expect(JSON.stringify((err as RpcException).getError())).toMatch(pattern);
    return;
  }
  throw new Error('expected RpcException to be thrown');
}

beforeAll(() => {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  privateKey = pair.privateKey;
  const pkcs8 = privateKey.export({ type: 'pkcs8', format: 'der' });
  process.env.PASSWORD_PRIVATE_KEY = Buffer.from(pkcs8).toString('base64');
});

afterAll(() => {
  if (ORIGINAL_ENV === undefined) {
    delete process.env.PASSWORD_PRIVATE_KEY;
  } else {
    process.env.PASSWORD_PRIVATE_KEY = ORIGINAL_ENV;
  }
});

afterEach(() => {
  process.env.PASSWORD_PRIVATE_KEY = Buffer.from(privateKey.export({ type: 'pkcs8', format: 'der' })).toString('base64');
});

describe('decryptPassword', () => {
  it('decrypts RSA-OAEP-SHA256 ciphertext from desktop client', async () => {
    const cipher = await encryptForClient('Str0ng!pass');
    expect(decryptPassword(cipher)).toBe('Str0ng!pass');
  });

  it('interoperates with node oaepHash decryption (same as service)', async () => {
    const cipher = await encryptForClient('Str0ng!pass');
    const plain = privateDecrypt(
      { key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      Buffer.from(cipher, 'base64'),
    );
    expect(plain.toString('utf8')).toBe('Str0ng!pass');
  });

  it('rejects legacy plaintext passwords (no ciphertext)', () => {
    expectRpcError(() => decryptPassword('plainPassword123'), /密码解密失败/);
  });

  it('rejects garbage base64', () => {
    expectRpcError(() => decryptPassword('%%%not-base64%%%'), /密码解密失败/);
  });

  it('rejects empty cipher', () => {
    expectRpcError(() => decryptPassword(''), /密码不能为空/);
  });

  it('rejects plaintext shorter than 6 chars after decryption', async () => {
    const cipher = await encryptForClient('12345');
    expectRpcError(() => decryptPassword(cipher), /6-190/);
  });

  it('fails when PASSWORD_PRIVATE_KEY is missing', async () => {
    const cipher = await encryptForClient('Str0ng!pass');
    delete process.env.PASSWORD_PRIVATE_KEY;
    expectRpcError(() => decryptPassword(cipher), /PASSWORD_PRIVATE_KEY/);
  });

  it('fails when PASSWORD_PRIVATE_KEY is malformed', async () => {
    const cipher = await encryptForClient('Str0ng!pass');
    process.env.PASSWORD_PRIVATE_KEY = 'not-a-valid-key';
    expectRpcError(() => decryptPassword(cipher), /格式无效/);
  });
});
