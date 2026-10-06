import { createPrivateKey, privateDecrypt, constants, KeyObject } from 'node:crypto';
import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import { grpcError } from '@yunyan-live/nest-shared';

function getPrivateKey(): KeyObject {
  const raw = process.env.PASSWORD_PRIVATE_KEY;
  if (!raw) {
    throw grpcError(
      status.INTERNAL,
      '服务端未配置 PASSWORD_PRIVATE_KEY（运行 pnpm gen:keys --write-env 生成）'
    );
  }
  try {
    return createPrivateKey({
      key: Buffer.from(raw.trim(), 'base64'),
      format: 'der',
      type: 'pkcs8'
    });
  } catch {
    throw grpcError(status.INTERNAL, 'PASSWORD_PRIVATE_KEY 格式无效，需为 PKCS8 DER base64');
  }
}

/**
 * 解密客户端 RSA-OAEP-SHA256 加密的密码密文（base64）。
 * 解密失败或明文长度非法时抛出 gRPC RpcException，密码仅在内存中短暂出现。
 */
export function decryptPassword(cipherBase64: string): string {
  if (!cipherBase64) {
    throw grpcError(status.INVALID_ARGUMENT, '密码不能为空');
  }
  let plaintext: Buffer;
  try {
    // WebCrypto RSA-OAEP 使用 SHA-256（OAEP 与 MGF1 同 hash），Node 默认 SHA-1 不兼容
    plaintext = privateDecrypt(
      { key: getPrivateKey(), padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      Buffer.from(cipherBase64, 'base64')
    );
  } catch (err) {
    if (err instanceof RpcException) throw err;
    throw grpcError(status.INVALID_ARGUMENT, '密码解密失败，请使用最新版客户端重试');
  }
  const password = plaintext.toString('utf8');
  if (password.length < 6 || password.length > 190) {
    throw grpcError(status.INVALID_ARGUMENT, '密码长度需为 6-190 字符');
  }
  return password;
}
