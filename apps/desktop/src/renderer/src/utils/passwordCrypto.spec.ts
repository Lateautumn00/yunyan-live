import { describe, expect, it } from 'vitest';
import { encryptPassword } from './passwordCrypto';
import { PASSWORD_PUBLIC_KEY_PEM } from './passwordPublicKey';

function bytesToBinaryString(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return binary;
}

function derToPublicKeyPem(der: Uint8Array): string {
  const b64 = btoa(bytesToBinaryString(der));
  const lines = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`;
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function generateOaepKeyPair(): Promise<CryptoKeyPair> {
  return globalThis.crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256'
    },
    true,
    ['encrypt', 'decrypt']
  );
}

describe('encryptPassword', () => {
  it('round-trip: RSA-OAEP-SHA256 密文可被对应私钥解密', async () => {
    const keyPair = await generateOaepKeyPair();
    const publicPem = derToPublicKeyPem(new Uint8Array(await globalThis.crypto.subtle.exportKey('spki', keyPair.publicKey)));

    const cipherBase64 = await encryptPassword('Str0ng!pass', publicPem);

    const decrypted = await globalThis.crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      keyPair.privateKey,
      base64ToBytes(cipherBase64)
    );
    expect(new TextDecoder().decode(decrypted)).toBe('Str0ng!pass');
  });

  it('使用内置公钥输出 256 字节（RSA-2048）base64 密文', async () => {
    const cipherBase64 = await encryptPassword('Str0ng!pass');
    expect(atob(cipherBase64)).toHaveLength(256);
    expect(cipherBase64).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(PASSWORD_PUBLIC_KEY_PEM).toContain('BEGIN PUBLIC KEY');
  });

  it('不同明文产生不同密文（OAEP 随机填充）', async () => {
    const [a, b] = await Promise.all([encryptPassword('Str0ng!pass'), encryptPassword('Str0ng!pass')]);
    expect(a).not.toBe(b);
  });

  it('明文超过 190 字节时抛错', async () => {
    await expect(encryptPassword('a'.repeat(191))).rejects.toThrow('密码过长');
  });
});
