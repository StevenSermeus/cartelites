/** Normalized coordinates in a 3:1 signing area, shared by touch, pen and PDF. */
export type Signature = number[][][];
export type ReceiptSignatures = { company: Signature; client: Signature; signedAt: number };
export function validSignature(value: unknown): value is Signature {
  if (!Array.isArray(value) || value.length < 1 || value.length > 80) return false;
  let count = 0,
    length = 0;
  for (const stroke of value) {
    if (!Array.isArray(stroke) || stroke.length < 2) return false;
    for (let i = 0; i < stroke.length; i++) {
      const p = stroke[i];
      if (
        !Array.isArray(p) ||
        p.length !== 2 ||
        p.some((n) => typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1)
      )
        return false;
      if (i) length += Math.hypot(p[0] - stroke[i - 1][0], (p[1] - stroke[i - 1][1]) / 3);
      if (++count > 3000) return false;
    }
  }
  return count >= 5 && length > 0.08;
}
export function signaturePdf(
  signature: Signature,
  x: number,
  y: number,
  width = 210,
  height = 70,
): string {
  if (!validSignature(signature)) throw new Error('INVALID_SIGNATURE');
  return `q 0.08 0.12 0.22 RG 1.3 w 1 J 1 j\n${signature.map((stroke) => stroke.map((p, i) => `${(x + p[0] * width).toFixed(2)} ${(y + (1 - p[1]) * height).toFixed(2)} ${i ? 'l' : 'm'}`).join('\n') + '\nS').join('\n')}\nQ`;
}
