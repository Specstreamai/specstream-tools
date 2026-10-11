"use strict";

const assert = require("assert");
const { requireConfirmMaxUsd } = require("../lib/confirm_max_usd");

function throws(fn, re) {
  let err;
  try {
    fn();
  } catch (e) {
    err = e;
  }
  assert(err, "expected throw");
  assert(re.test(String(err.message || err)), String(err));
}

throws(() => requireConfirmMaxUsd({}), /confirm_max_usd is required/);
throws(() => requireConfirmMaxUsd({ confirm_max_usd: 0 }), /greater than 0/);
assert.strictEqual(requireConfirmMaxUsd({ confirm_max_usd: 9 }), 9);
console.log("n8n confirm_max_usd ok");
