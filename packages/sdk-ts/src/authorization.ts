/** Explicit review is required even when JavaScript bypasses static types. */
export function requireWorkAuthorization(value: unknown): void {
  const required = ["quote_id", "quote_hash", "idempotency_key", "confirm_max_cents"];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Provide the exact signed-work authorization");
  }
  const body = value as Record<string, unknown>;
  const allowed = new Set([...required, "authority_id"]);
  if (!required.every(key => Object.hasOwn(body, key)) || Object.keys(body).some(key => !allowed.has(key))) {
    throw new Error("Provide the exact quote identity, signature, maximum cents and request key");
  }
  if (typeof body.quote_id !== "string" || !body.quote_id ||
      typeof body.quote_hash !== "string" || !/^[0-9a-f]{64}$/.test(body.quote_hash)) {
    throw new Error("The reviewed quote identity and signature are required");
  }
  if (typeof body.idempotency_key !== "string" || body.idempotency_key.length < 8 || body.idempotency_key.length > 128) {
    throw new Error("Use a stable request key containing 8 to 128 characters");
  }
  if (typeof body.confirm_max_cents !== "number" || !Number.isSafeInteger(body.confirm_max_cents) || body.confirm_max_cents < 0) {
    throw new Error("The approved maximum must be an explicit nonnegative integer in cents");
  }
  if (body.authority_id !== undefined && body.authority_id !== null && typeof body.authority_id !== "string") {
    throw new Error("Authority must be an explicit existing identifier");
  }
}
