import { describe, expect, it } from 'vitest';
import { isCheckedAllRules, isCheckedLength, isVoid, regexp } from '../index';

describe('regexp rules (baseline freeze)', () => {
  it('phone', () => {
    expect(regexp.phone.test('13812345678')).toBe(true);
    expect(regexp.phone.test('12812345678')).toBe(false);
    expect(regexp.phone.test('1381234567')).toBe(false);
    expect(regexp.phone.test('23812345678')).toBe(false);
    expect(regexp.phone.test('138123456789')).toBe(false);
  });

  it('email', () => {
    expect(regexp.email.test('user@example.com')).toBe(true);
    expect(regexp.email.test('a.b_c@example.com')).toBe(true);
    expect(regexp.email.test('user@example')).toBe(true);
    expect(regexp.email.test('user@example.c')).toBe(false);
    expect(regexp.email.test('user@exa-mple.com')).toBe(false);
  });

  it('commonName (2-15: 中英文/数字/下划线)', () => {
    expect(regexp.commonName.test('张三')).toBe(true);
    expect(regexp.commonName.test('Zhang_01')).toBe(true);
    expect(regexp.commonName.test('a')).toBe(false);
    expect(regexp.commonName.test('1234567890123456')).toBe(false);
    expect(regexp.commonName.test('a b')).toBe(false);
  });

  it('liveName (1-49: 中英文/数字/下划线)', () => {
    expect(regexp.liveName.test('云砚直播课')).toBe(true);
    expect(regexp.liveName.test('a')).toBe(true);
    expect(regexp.liveName.test('')).toBe(false);
    expect(regexp.liveName.test('a'.repeat(50))).toBe(false);
  });

  it('passWord (6-16 纯字母数字)', () => {
    expect(regexp.passWord.test('abc123')).toBe(true);
    expect(regexp.passWord.test('abc12')).toBe(false);
    expect(regexp.passWord.test('abcdefghijklmnopq')).toBe(false);
    expect(regexp.passWord.test('abc_123')).toBe(false);
  });

  it('password (8-30，至少包含三类字符)', () => {
    expect(regexp.password.test('Abcdefg1')).toBe(true);
    expect(regexp.password.test('Abcdefgh')).toBe(false);
    expect(regexp.password.test('abcdefg1')).toBe(false);
    expect(regexp.password.test('Abc_1234')).toBe(true);
    expect(regexp.password.test('Abc12')).toBe(false);
  });
});

describe('isVoid', () => {
  it('true for empty/undefined/null, false otherwise', () => {
    expect(isVoid('')).toBe(true);
    expect(isVoid('x')).toBe(false);
    expect(isVoid(' ')).toBe(false);
  });
});

describe('isCheckedLength', () => {
  it('checks inclusive bounds', () => {
    expect(isCheckedLength('abc', 2, 4)).toBe(true);
    expect(isCheckedLength('a', 2, 4)).toBe(false);
    expect(isCheckedLength('abcde', 2, 4)).toBe(false);
    expect(isCheckedLength('', 0, 0)).toBe(true);
  });
});

describe('isCheckedAllRules', () => {
  it('dispatches to the right rule', () => {
    expect(isCheckedAllRules('13812345678', 'phone')).toBe(true);
    expect(isCheckedAllRules('abc', 'passWord')).toBe(false);
    expect(isCheckedAllRules('abc123', 'passWord')).toBe(true);
  });
});
