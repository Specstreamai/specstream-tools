import { ConvexError } from "convex/values";
import { asCount, asString, specstreamRequest } from "./api.js";

export const DEFAULT_LOCALE = "en-US";
/** The most rows one list may ask for. */
export const MAX_ROWS = 1000;
/** Rows are read 100 at a time, the most the API returns per page. */
const ROW_PAGE = 100;
const MAX_ROW_PAGES = 60;
const MAX_STRING = 100_000;

const FINISHED = new Set(["completed", "partial"]);
const STOPPED = new Set(["failed", "canceled", "cancelled", "expired"]);

export type ListStatus =
  | "running"
  | "completed"
  | "partial"
  | "failed"
  | "canceled"
  | "expired";

/** Folds SpecStream's finer-grained statuses (queued, planning, running) into `running`. */
export function mapStatus(raw: unknown): ListStatus {
  const status = typeof raw === "string" ? raw : "";
  if (FINISHED.has(status)) return status as "completed" | "partial";
  if (STOPPED.has(status)) {
    return status === "cancelled" ? "canceled" : (status as ListStatus);
  }
  return "running";
}

export function isFinal(status: ListStatus): boolean {
  return status !== "running";
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function messageOf(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data as unknown;
    if (isObject(data) && typeof data.message === "string") return data.message;
  }
  return error instanceof Error ? error.message : String(error);
}

export function statusOf(error: unknown): number | undefined {
  if (error instanceof ConvexError) {
    const data = error.data as unknown;
    if (isObject(data) && typeof data.status === "number") return data.status;
  }
  return undefined;
}

export function fail(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

/**
 * Make a value storable in Convex: drop undefined, replace non-finite numbers,
 * cap very long strings, and rename keys Convex reserves (a leading `$` or `_`).
 */
export function clean(value: unknown, depth = 0): unknown {
  if (
    value === undefined ||
    typeof value === "function" ||
    typeof value === "symbol"
  ) {
    return null;
  }
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    return value.length > MAX_STRING ? value.slice(0, MAX_STRING) : value;
  }
  if (depth > 12) return null;
  if (Array.isArray(value)) return value.map((item) => clean(item, depth + 1));
  if (isObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) continue;
      const safe = /^[$_]/.test(key) ? `field${key}` : key;
      out[safe || "field"] = clean(item, depth + 1);
    }
    return out;
  }
  return null;
}

export type CellInput = {
  columnId: string;
  label: string;
  value?: unknown;
  display?: string;
  absence?: string;
  sourceUrl?: string;
  observedAt?: string;
};

export type RowInput = {
  entityId: string;
  ordinal: number;
  cells: CellInput[];
  details?: CellInput[];
  sourceUrl?: string;
  observedAt?: string;
  locked?: boolean;
};

function toCell(raw: unknown): CellInput | null {
  if (!isObject(raw)) return null;
  const columnId = asString(raw.column_id) ?? asString(raw.label);
  if (!columnId) return null;
  const out: CellInput = { columnId, label: asString(raw.label) ?? columnId };
  if (raw.value !== undefined) out.value = clean(raw.value);
  if (typeof raw.display === "string") out.display = raw.display;
  if (typeof raw.absence === "string" && raw.absence) out.absence = raw.absence;
  const provenance = isObject(raw.provenance) ? raw.provenance : null;
  const url = provenance ? asString(provenance.source_url) : undefined;
  if (url && /^https?:\/\//i.test(url)) out.sourceUrl = url;
  const observed = provenance ? asString(provenance.observed_at) : undefined;
  if (observed) out.observedAt = observed;
  return out;
}

function toCells(raw: unknown): CellInput[] {
  const cells: CellInput[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const parsed = toCell(item);
    if (parsed) cells.push(parsed);
  }
  return cells;
}

/** One accepted row from the API, shaped for storage. Returns null for anything unreadable. */
export function toRow(raw: unknown, position: number): RowInput | null {
  if (!isObject(raw) || !Array.isArray(raw.cells)) return null;
  const entityId = asString(raw.entity_id);
  if (!entityId) return null;
  const cells = toCells(raw.cells);
  const details = Array.isArray(raw.details) ? toCells(raw.details) : [];
  const row: RowInput = {
    entityId,
    ordinal: typeof raw.ordinal === "number" ? asCount(raw.ordinal) : position,
    cells,
  };
  if (details.length > 0) row.details = details;
  const source = [...cells, ...details].find((c) => c.sourceUrl);
  if (source?.sourceUrl) row.sourceUrl = source.sourceUrl;
  if (source?.observedAt) row.observedAt = source.observedAt;
  if (raw.locked === true) row.locked = true;
  return fitDocument(row);
}

const MAX_DOCUMENT_BYTES = 900_000;

const size = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).length;

/** Keeps a row under Convex's 1MB document limit: first drop the full detail set, then the raw values. */
function fitDocument(row: RowInput): RowInput {
  if (size(row) <= MAX_DOCUMENT_BYTES) return row;
  const { details: _details, ...slim } = row;
  if (size(slim) <= MAX_DOCUMENT_BYTES) return slim;
  slim.cells = slim.cells.map(({ value: _value, ...rest }) => ({
    ...rest,
    ...(rest.display === undefined
      ? {}
      : { display: rest.display.slice(0, 2_000) }),
  }));
  return slim;
}

/** Every accepted row of a list, following the pages. Reading is free. */
export async function readAllRows(
  specstreamListId: string,
): Promise<RowInput[]> {
  const rows: RowInput[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_ROW_PAGES; page++) {
    const query = new URLSearchParams({ limit: String(ROW_PAGE) });
    if (cursor) query.set("cursor", cursor);
    const data = await specstreamRequest(
      `/v1/finds/${encodeURIComponent(specstreamListId)}/rows?${query.toString()}`,
    );
    for (const raw of Array.isArray(data.rows) ? data.rows : []) {
      const row = toRow(raw, rows.length + 1);
      if (row) rows.push(row);
    }
    const next = asString(data.next_cursor);
    if (!next || next === cursor) break;
    cursor = next;
  }
  return rows;
}

export type Reading = {
  status: string;
  astHash?: string;
  canonicalSentence?: string;
  notice?: string;
  statedRows?: number;
  rowsInferred: boolean;
};

/** Reads the request into a priced-ready reading. Nothing runs and nothing is charged. */
export async function readRequest(
  request: string,
  locale: string = DEFAULT_LOCALE,
): Promise<Reading> {
  const q = request.trim();
  if (!q) fail("specstream_empty_request", "Describe the list to find.");
  const data = await specstreamRequest("/v1/parse", {
    method: "POST",
    body: { q, locale },
  });
  const ast = isObject(data.ast) ? data.ast : {};
  const limit = isObject(ast.limit) ? ast.limit : {};
  const inferred = limit.inferred !== false;
  const max = asCount(limit.max);
  return {
    status: asString(data.status) ?? "needs_edit",
    astHash: asString(data.ast_hash),
    canonicalSentence: asString(data.canonical_sentence),
    notice: asString(data.notice),
    statedRows: !inferred && max > 0 ? max : undefined,
    rowsInferred: inferred,
  };
}

export type PricedQuote = {
  quoteId: string;
  quoteHash: string;
  currency: string;
  maximumCents: number;
  unitCents?: number;
  expiresAt?: number;
  canAuthorize: boolean;
};

/** Prices a reading for a number of rows. Nothing runs and nothing is charged. */
export async function priceReading(
  astHash: string,
  rows: number,
): Promise<PricedQuote> {
  const data = await specstreamRequest("/v1/capacity/quotes", {
    method: "POST",
    body: { ast_hash: astHash, operation: "find", requested_units: rows },
  });
  const terms = isObject(data.terms) ? data.terms : {};
  const quoteId = asString(data.quote_id);
  const quoteHash = asString(data.quote_hash);
  if (!quoteId || !quoteHash) {
    fail(
      "specstream_unreadable",
      "SpecStream returned a price this component could not read.",
    );
  }
  const expires =
    typeof data.expires_at === "string" ? Date.parse(data.expires_at) : NaN;
  return {
    quoteId,
    quoteHash,
    currency: asString(data.currency) ?? "USD",
    maximumCents: asCount(data.maximum_cents),
    unitCents:
      typeof terms.unit_cents === "number" ? terms.unit_cents : undefined,
    expiresAt: Number.isFinite(expires) ? expires : undefined,
    canAuthorize: data.can_authorize !== false,
  };
}

const KEY_PATTERN = /^[A-Za-z0-9_.:-]{1,100}$/;

/** The key SpecStream uses to start a list once, however many times the approval is sent. */
export function executionKey(quoteId: string, idempotencyKey?: string): string {
  if (idempotencyKey !== undefined && !KEY_PATTERN.test(idempotencyKey)) {
    fail(
      "specstream_bad_idempotency_key",
      "idempotencyKey must be 1 to 100 letters, numbers, dots, colons, dashes or underscores.",
    );
  }
  return `convex-${idempotencyKey ?? quoteId}`.slice(0, 128);
}

export const _test = { clean, toRow };
