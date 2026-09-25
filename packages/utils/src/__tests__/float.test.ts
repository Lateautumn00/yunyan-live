import { describe, expect, it } from 'vitest';
import { Fadd, Fdiv, Fmul, Fsub } from '../float';

describe('float precision (baseline freeze + Fmul bug fix)', () => {
  it('Fadd', () => {
    expect(Fadd(0.1, 0.2)).toBe(0.3);
    expect(Fadd(1.5, 2)).toBe(3.5);
    expect(Fadd(1, 2)).toBe(3);
    expect(Fadd(-1.5, 0.5)).toBe(-1);
    expect(Fadd(2.555, 1.444)).toBe(3.999);
  });

  it('Fsub', () => {
    expect(Fsub(0.3, 0.1)).toBe(0.2);
    expect(Fsub(1.5, 0.5)).toBe(1);
    expect(Fsub(5, 2)).toBe(3);
    expect(Fsub(-1.5, 0.5)).toBe(-2);
  });

  it('Fmul', () => {
    expect(Fmul(0.1, 0.2)).toBe(0.02);
    expect(Fmul(2, 3)).toBe(6);
    expect(Fmul(-1.5, 2)).toBe(-3);
    expect(Fmul(1.11, 2.22)).toBe(2.4642);
  });

  it('Fmul regression: Fmul(1.5, 2) must be 3, not 30', () => {
    expect(Fmul(1.5, 2)).toBe(3);
  });

  it('Fdiv', () => {
    expect(Fdiv(0.3, 0.1)).toBe(3);
    expect(Fdiv(6, 2)).toBe(3);
    expect(Fdiv(1, 3)).toBeCloseTo(0.3333, 4);
  });

  it('integer passthrough keeps exact values', () => {
    expect(Fadd(0, 0)).toBe(0);
    expect(Fmul(0, 5)).toBe(0);
    expect(Fdiv(0, 5)).toBe(0);
  });
});
