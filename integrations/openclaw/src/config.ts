import { DEFAULT_WAIT_SECONDS, MAX_RESULTS } from "./client.js";

export const DEFAULT_MAX_PRICE_USD = 5;
export const DEFAULT_MAX_RESULTS = 25;

export const MISSING_KEY_MESSAGE =
  "SpecStream has no API key. Set plugins.entries.specstream.config.apiKey (a SecretRef works) or the SPECSTREAM_API_KEY environment variable. " +
  "Create a key under Agents & API in your SpecStream workspace.";

export type PluginConfig = {
  apiKey?: unknown;
  maxPriceUsd?: number;
  waitSeconds?: number;
};

export type ResolvedConfig = {
  apiKey: string;
  maxPriceUsd: number;
  waitSeconds: number;
};

/** Reads the plugin config, falling back to SPECSTREAM_API_KEY for the key. Throws when no key is set. */
export function resolveConfig(config: PluginConfig | undefined, env: NodeJS.ProcessEnv = process.env): ResolvedConfig {
  const fromConfig = typeof config?.apiKey === "string" ? config.apiKey.trim() : "";
  const apiKey = fromConfig || (env.SPECSTREAM_API_KEY ?? "").trim();
  if (!apiKey) throw new Error(MISSING_KEY_MESSAGE);

  const maxPriceUsd = config?.maxPriceUsd ?? DEFAULT_MAX_PRICE_USD;
  if (!Number.isFinite(maxPriceUsd) || maxPriceUsd <= 0) {
    throw new Error("plugins.entries.specstream.config.maxPriceUsd must be greater than 0.");
  }
  return { apiKey, maxPriceUsd, waitSeconds: config?.waitSeconds ?? DEFAULT_WAIT_SECONDS };
}

/**
 * The ceiling for one call. The model may ask for a lower ceiling than the configured one and never a higher one,
 * because the configured value is the limit the person agreed to.
 */
export function effectiveCeiling(configuredUsd: number, requestedUsd: number | undefined): number {
  if (requestedUsd === undefined || !Number.isFinite(requestedUsd) || requestedUsd <= 0) return configuredUsd;
  return Math.min(configuredUsd, requestedUsd);
}

export function clampResults(requested: number | undefined): number {
  const whole = Math.trunc(Number(requested ?? DEFAULT_MAX_RESULTS));
  if (!Number.isFinite(whole) || whole < 1) return DEFAULT_MAX_RESULTS;
  return Math.min(whole, MAX_RESULTS);
}
