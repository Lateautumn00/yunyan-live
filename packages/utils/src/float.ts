function decimalPlaces(n: number): number {
  try {
    return n.toString().split('.')[1]?.length ?? 0;
  } catch {
    return 0;
  }
}

export function Fadd(a: number, b: number): number {
  const e = 10 ** Math.max(decimalPlaces(a), decimalPlaces(b));
  return (Fmul(a, e) + Fmul(b, e)) / e;
}

export function Fsub(a: number, b: number): number {
  const e = 10 ** Math.max(decimalPlaces(a), decimalPlaces(b));
  return (Fmul(a, e) - Fmul(b, e)) / e;
}

export function Fmul(a: number, b: number): number {
  const c = decimalPlaces(a) + decimalPlaces(b);
  const newA = Number(a.toString().replace('.', ''));
  const newB = Number(b.toString().replace('.', ''));
  return (newA * newB) / 10 ** c;
}

export function Fdiv(a: number, b: number): number {
  const e = decimalPlaces(a);
  const f = decimalPlaces(b);
  const c = Number(a.toString().replace('.', ''));
  const d = Number(b.toString().replace('.', ''));
  return Fmul(c / d, 10 ** Fsub(f, e));
}
