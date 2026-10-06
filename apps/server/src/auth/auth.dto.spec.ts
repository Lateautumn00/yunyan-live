import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { RegisterDto } from '@yunyan-live/nest-shared';

function buildDto(overrides: Partial<RegisterDto> = {}): RegisterDto {
  const dto = new RegisterDto();
  Object.assign(dto, {
    email: 'student@example.com',
    userName: '张三',
    password: 'u'.repeat(344),
    code: '123456',
    ...overrides
  });
  return dto;
}

describe('RegisterDto password (RSA-OAEP base64 ciphertext)', () => {
  it('accepts a 344-char RSA-2048 ciphertext', () => {
    expect(validateSync(buildDto())).toHaveLength(0);
  });

  it('accepts ciphertext up to 1024 chars', () => {
    expect(validateSync(buildDto({ password: 'u'.repeat(1024) }))).toHaveLength(0);
  });

  it('rejects ciphertext longer than 1024 chars', () => {
    const errors = validateSync(buildDto({ password: 'u'.repeat(1025) }));
    expect(errors).toHaveLength(1);
    expect(errors[0]?.property).toBe('password');
    expect(errors[0]?.constraints).toHaveProperty('maxLength');
  });

  it('still rejects plaintext shorter than 6 chars', () => {
    const errors = validateSync(buildDto({ password: '12345' }));
    expect(errors).toHaveLength(1);
    expect(errors[0]?.constraints).toHaveProperty('minLength');
  });
});
