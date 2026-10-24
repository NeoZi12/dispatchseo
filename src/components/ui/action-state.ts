// What a dashboard server action reports back to the form that called it.
// `at` makes two identical messages in a row still re-announce (the toast
// keys on it), and `field` lets a form put an error under the right input.
export type ActionState = { ok: boolean; message: string; at: number; field?: string } | null;
