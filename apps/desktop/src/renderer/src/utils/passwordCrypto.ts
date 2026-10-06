import { PASSWORD_PUBLIC_KEY_PEM } from './passwordPublicKey';

// RSA-2048 + OAEP(SHA-256) 可加密明文上限: 256 - 2*32 - 2 = 190 字节
const MAX_PLAINTEXT_BYTES = 190;

function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem.replace(/-----(?:BEGIN|END) PUBLIC KEY-----/g, '').replace(/\s+/g, '');
  const binary = atob(body);
  const der = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    der[i] = binary.charCodeAt(i);
  }
  return der;
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export async function encryptPassword(
  plain: string,
  publicKeyPem: string = PASSWORD_PUBLIC_KEY_PEM
): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('当前环境不支持 WebCrypto (crypto.subtle)，无法加密密码');
  }
  const plaintext = new TextEncoder().encode(plain);
  if (plaintext.length > MAX_PLAINTEXT_BYTES) {
    throw new Error(`密码过长，无法加密（上限 ${MAX_PLAINTEXT_BYTES} 字节）`);
  }
  const key = await subtle.importKey(
    'spki',
    pemToDer(publicKeyPem),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );
  const encrypted = await subtle.encrypt({ name: 'RSA-OAEP' }, key, plaintext);
  return toBase64(encrypted);
}
