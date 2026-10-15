const encoder = new TextEncoder();

/** Constant-time string compare, so a mismatch leaks nothing through timing. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** HMAC-SHA256 of `${timestamp}.${body}`, hex encoded. */
export async function sign(
  secret: string,
  timestamp: string,
  body: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${timestamp}.${body}`),
  );
  return toHex(signature);
}

/** How far a delivery's timestamp may be from now, in seconds. */
export const TOLERANCE_SECONDS = 300;

/**
 * Verify a `Specstream-Signature` header, which looks like
 * `t=<unix seconds>,v1=<hex hmac-sha256 of "<t>.<raw body>" with your webhook secret>`.
 * A delivery older or newer than five minutes is refused.
 */
export async function verifySignature(
  secret: string,
  body: string,
  header: string | null,
  nowMs: number = Date.now(),
): Promise<boolean> {
  if (!header) return false;
  const match = /^t=(\d+),v1=([a-f0-9]{64})$/i.exec(header.trim());
  if (!match) return false;
  const [, timestamp, received] = match;
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) {
    return false;
  }
  const expected = await sign(secret, timestamp, body);
  return timingSafeEqual(expected, received.toLowerCase());
}
