// 该文件由 scripts/gen-password-keypair.mjs 自动生成，请勿手动编辑。
//
// RSA-OAEP-SHA256 公钥（SPKI PEM），客户端用它加密密码后再发送。
// 轮换步骤: 1) 本脚本加 --force 重新生成  2) 更新 auth-service .env 的
// PASSWORD_PRIVATE_KEY  3) 发布包含新公钥的桌面端版本。

export const PASSWORD_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwxCR1A4U2XG9WWgwnYIq
qIMoPdsLXnL3W40S5YD5atytjwEHG5sWGQ6N2QQuuzamK02Ktv4kztKI4Y091WPb
rk+uSRtqVmb7VGlXrJ/3iY19K0BNso0owWz8gZ042YvSGlBTnAR6auRYwsLPe46d
YuNvZcStpTF3YZGDxRvMbvY15nwUo0kWHB/cIUWBFW5y9HN5qWlQdXAgW1bLonh8
uJOboBP2QbKL7kuYgNY6GXZ8MeEDy7JgbPlzLjYsVaTO/6Y6aQHWa9Vy93nUDP02
D/0oq99VoOVyZ/4gMSuvgCnIWPifLYPs3MKFd/uIfAmwGYWt8CzXuOMIJFeKCciu
TQIDAQAB
-----END PUBLIC KEY-----`;
