// Monotone cubic (Fritsch-Carlson) through the points: smooth like Polar's
// lines, but it never overshoots - a day of 0 stays on the floor instead of
// dipping below it, which a plain Catmull-Rom curve would draw.
export function monotonePath(xs: number[], ys: number[]): string {
  const n = xs.length;
  if (n === 0) return "";
  const r = (v: number) => Math.round(v * 100) / 100;
  if (n === 1) return `M${r(xs[0])},${r(ys[0])}`;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = xs[i + 1] - xs[i];
    m[i] = (ys[i + 1] - ys[i]) / (dx[i] || 1);
  }
  const t: number[] = new Array(n);
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      t[i] = k * a * m[i];
      t[i + 1] = k * b * m[i];
    }
  }
  let d = `M${r(xs[0])},${r(ys[0])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${r(xs[i] + h)},${r(ys[i] + h * t[i])} ${r(xs[i + 1] - h)},${r(ys[i + 1] - h * t[i + 1])} ${r(xs[i + 1])},${r(ys[i + 1])}`;
  }
  return d;
}

/** A round ceiling for an axis: 7 -> 8, 130 -> 150, 0 -> 1. */
export function niceMax(v: number): number {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const step = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => v / p <= x) ?? 10;
  return step * p;
}

export type Tone = "blue" | "green" | "violet" | "gray";

export const TONE_VAR: Record<Tone, string> = {
  blue: "var(--color-info)",
  green: "var(--color-ok)",
  violet: "var(--color-accent)",
  gray: "var(--color-ink-faint)",
};
