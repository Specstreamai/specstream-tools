"use strict";

function requireConfirmMaxUsd(input) {
  if (input == null || typeof input !== "object") {
    throw new Error("confirm_max_usd is required");
  }
  if (
    !Object.prototype.hasOwnProperty.call(input, "confirm_max_usd") ||
    input.confirm_max_usd === undefined ||
    input.confirm_max_usd === null ||
    input.confirm_max_usd === ""
  ) {
    throw new Error("confirm_max_usd is required");
  }
  if (typeof input.confirm_max_usd !== "number" && typeof input.confirm_max_usd !== "string") {
    throw new Error("confirm_max_usd must be an explicit numeric amount");
  }
  const n = Number(input.confirm_max_usd);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("confirm_max_usd must be greater than 0");
  }
  return n;
}

module.exports = { requireConfirmMaxUsd };
