import { describe, expect, test } from "vitest";
import { sign, timingSafeEqual, verifySignature } from "./signature.js";

describe("verifySignature", () => {
  const secret = "whsec_test";
  const body = '{"event":"find.completed","find_id":"fnd_1"}';
  const now = 1_760_000_000_000;
  const stamp = String(now / 1000);

  test("accepts a header signed with the secret", async () => {
    const hex = await sign(secret, stamp, body);
    expect(
      await verifySignature(secret, body, `t=${stamp},v1=${hex}`, now),
    ).toBe(true);
  });

  test("refuses a wrong secret, a changed body and a missing header", async () => {
    const hex = await sign("other", stamp, body);
    expect(
      await verifySignature(secret, body, `t=${stamp},v1=${hex}`, now),
    ).toBe(false);
    const good = await sign(secret, stamp, body);
    expect(
      await verifySignature(secret, body + " ", `t=${stamp},v1=${good}`, now),
    ).toBe(false);
    expect(await verifySignature(secret, body, null, now)).toBe(false);
    expect(await verifySignature(secret, body, "garbage", now)).toBe(false);
  });

  test("refuses a delivery more than five minutes from now", async () => {
    const old = String(now / 1000 - 301);
    const hex = await sign(secret, old, body);
    expect(await verifySignature(secret, body, `t=${old},v1=${hex}`, now)).toBe(
      false,
    );
    const fine = String(now / 1000 - 299);
    const hex2 = await sign(secret, fine, body);
    expect(
      await verifySignature(secret, body, `t=${fine},v1=${hex2}`, now),
    ).toBe(true);
  });

  test("timingSafeEqual compares whole strings", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "ab")).toBe(false);
  });
});
