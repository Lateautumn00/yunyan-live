import { generateKeyPairSync, createPublicKey, webcrypto, KeyObject } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { RpcException } from '@nestjs/microservices';
import { of } from 'rxjs';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';

const PLAIN_OLD_PASSWORD = 'OldPass!1';
const PLAIN_NEW_PASSWORD = 'NewPass!2';
const USER_ID = 'user-1';

let privateKey: KeyObject;

async function encryptForClient(plaintext: string): Promise<string> {
  const key = await webcrypto.subtle.importKey(
    'spki',
    createPublicKey(privateKey).export({ type: 'spki', format: 'der' }),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );
  const ciphertext = await webcrypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    key,
    new TextEncoder().encode(plaintext)
  );
  return Buffer.from(ciphertext).toString('base64');
}

function setupPrivateKeyEnv() {
  process.env.PASSWORD_PRIVATE_KEY = Buffer.from(
    privateKey.export({ type: 'pkcs8', format: 'der' })
  ).toString('base64');
}

function buildService(options?: { passwordHash?: string; emailExists?: boolean }) {
  const passwordHash = options?.passwordHash ?? bcrypt.hashSync(PLAIN_OLD_PASSWORD, 10);
  const user = {
    id: USER_ID,
    username: '张三',
    email: 'teacher@example.com',
    passwordHash,
    role: 1
  };
  const usersService = {
    findByEmail: vi.fn((_email?: unknown) => (options?.emailExists === false ? null : user)),
    findById: vi.fn((_id?: unknown) => user),
    create: vi.fn((_options?: unknown) => user),
    updatePassword: vi.fn((..._args: unknown[]) => undefined),
    updateUsername: vi.fn((..._args: unknown[]) => undefined)
  };
  const jwtService = { sign: vi.fn(() => 'signed-token') };
  const mailClient = {
    getService: vi.fn(() => ({
      verifyCode: () => of({ valid: true })
    }))
  };

  const service = new AuthService(
    usersService as unknown as UsersService,
    jwtService as unknown as JwtService,
    mailClient as never
  );
  service.onModuleInit();
  return { service, usersService, jwtService };
}

beforeAll(() => {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  privateKey = pair.privateKey;
  setupPrivateKeyEnv();
});

beforeEach(() => {
  setupPrivateKeyEnv();
});

describe('AuthService password flows (RSA-OAEP encrypted)', () => {
  it('login decrypts ciphertext before bcrypt compare', async () => {
    const { service, jwtService } = buildService();
    const result = await service.login({
      email: 'teacher@example.com',
      password: await encryptForClient(PLAIN_OLD_PASSWORD)
    });
    expect(result.access_token).toBe('signed-token');
    expect(jwtService.sign).toHaveBeenCalled();
  });

  it('login rejects wrong password', async () => {
    const { service } = buildService();
    await expect(
      service.login({
        email: 'teacher@example.com',
        password: await encryptForClient('Wrong!pass1')
      })
    ).rejects.toThrow(/密码错误/);
  });

  it('login rejects legacy plaintext password', async () => {
    const { service } = buildService();
    await expect(
      service.login({ email: 'teacher@example.com', password: PLAIN_OLD_PASSWORD })
    ).rejects.toThrow(RpcException);
  });

  it('register hashes the decrypted password', async () => {
    const { service, usersService } = buildService({ emailExists: false });
    await service.register({
      email: 'new@example.com',
      userName: '新用户',
      password: await encryptForClient(PLAIN_NEW_PASSWORD),
      code: '123456',
      role: 2
    });
    expect(usersService.create).toHaveBeenCalled();
    const created = usersService.create.mock.calls[0]?.[0] as { passwordHash: string };
    expect(await bcrypt.compare(PLAIN_NEW_PASSWORD, created.passwordHash)).toBe(true);
  });

  it('resetPassword stores hash of decrypted password', async () => {
    const { service, usersService } = buildService();
    await service.resetPassword({
      email: 'teacher@example.com',
      code: '123456',
      password: await encryptForClient(PLAIN_NEW_PASSWORD)
    });
    expect(usersService.updatePassword).toHaveBeenCalled();
    const updated = usersService.updatePassword.mock.calls[0];
    expect(updated?.[0]).toBe(USER_ID);
    expect(await bcrypt.compare(PLAIN_NEW_PASSWORD, updated?.[1] as string)).toBe(true);
  });

  it('changePassword verifies old and stores new decrypted password', async () => {
    const { service, usersService } = buildService();
    await service.changePassword(
      {
        oldPassword: await encryptForClient(PLAIN_OLD_PASSWORD),
        password: await encryptForClient(PLAIN_NEW_PASSWORD)
      },
      USER_ID
    );
    const updated = usersService.updatePassword.mock.calls[0];
    expect(await bcrypt.compare(PLAIN_NEW_PASSWORD, updated?.[1] as string)).toBe(true);
  });

  it('changePassword rejects wrong old password', async () => {
    const { service } = buildService();
    await expect(
      service.changePassword(
        {
          oldPassword: await encryptForClient('Wrong!pass1'),
          password: await encryptForClient(PLAIN_NEW_PASSWORD)
        },
        USER_ID
      )
    ).rejects.toThrow(/旧密码错误/);
  });

  it('changePassword rejects legacy plaintext old password', async () => {
    const { service } = buildService();
    await expect(
      service.changePassword(
        { oldPassword: PLAIN_OLD_PASSWORD, password: await encryptForClient(PLAIN_NEW_PASSWORD) },
        USER_ID
      )
    ).rejects.toThrow(RpcException);
  });
});
