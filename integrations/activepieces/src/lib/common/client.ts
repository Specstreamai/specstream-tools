import { createHash, createHmac, timingSafeEqual } from 'crypto';
import {
  HttpError,
  HttpMethod,
  httpClient,
} from '@activepieces/pieces-common';

export const BASE_URL = 'https://api.specstream.ai';
export const WORKSPACE_URL = 'https://specstream.ai/workspace/collections';

export const specstreamApi = { call, statusOf, listLink, runKey, isAllowedUrl };

// Fields every row carries; a column with the same name is renamed so it can't overwrite them.
const RESERVED = new Set(['id', 'list_id', 'list_link', 'position', 'source_url', 'checked_at', '__proto__']);
const FINISHED = new Set(['completed', 'partial']);
export const specstreamRows = { flatten, latest, columnName };
export const specstreamWebhook = { verify };

async function call<T>({
  apiKey,
  method,
  path,
  body,
}: {
  apiKey: string;
  method: HttpMethod;
  path: string;
  body?: unknown;
}): Promise<T> {
  let response;
  try {
    response = await httpClient.sendRequest<{ data?: unknown; error?: unknown }>({
      method,
      url: `${BASE_URL}${path}`,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body,
    });
  } catch (e) {
    const status = statusOf(e);
    const message = messageOf(e);
    throw new Error(
      `SpecStream ${status ? `returned HTTP ${status}` : 'could not be reached'}${message ? `: ${message}` : ''}`,
    );
  }
  // A success status must still carry a data object and no error, or the step stops.
  const payload = response.body;
  if (
    !payload || typeof payload !== 'object' || payload.error != null ||
    !payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)
  ) {
    throw new Error('SpecStream returned a response this piece could not read');
  }
  return payload.data as T;
}

// Credentials go only to https://api.specstream.ai: a path on it, or a full URL whose origin is exactly it.
function isAllowedUrl(url: string): boolean {
  if (url.includes('\\') || /[\u0000-\u001f]/.test(url)) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    try {
      const parsed = new URL(url);
      return parsed.origin === BASE_URL && !parsed.username && !parsed.password;
    } catch {
      return false;
    }
  }
  return url.startsWith('/') && !url.startsWith('//');
}

// The same request, count and price within the same UTC hour share one key, so a retry after a lost
// response reaches the list that already started instead of buying another. Output format matches the Make app.
function runKey({
  request,
  count,
  maxPrice,
  override,
  now = new Date(),
}: {
  request: string;
  count: number;
  maxPrice: number;
  override?: string;
  now?: Date;
}): string {
  const given = (override ?? '').trim();
  if (given) return given;
  const hour = now.toISOString().slice(0, 13);
  const digest = createHash('sha256').update(`${request}|${count}|${maxPrice}|${hour}`).digest('hex');
  return `activepieces-${digest.slice(0, 32)}`;
}

function statusOf(e: unknown): number | undefined {
  return e instanceof HttpError ? e.response.status : undefined;
}

function messageOf(e: unknown): string | undefined {
  if (!(e instanceof HttpError)) return undefined;
  const body = e.response.body as { error?: { message?: string } } | undefined;
  return body?.error?.message;
}

function listLink(listId: string): string {
  return `${WORKSPACE_URL}/${encodeURIComponent(listId)}`;
}

type Cell = {
  label?: string;
  column_id?: string;
  display?: unknown;
  value?: unknown;
  provenance?: { source_url?: string; observed_at?: string } | null;
};

export type ListRecord = { entity_id: string; ordinal?: number; cells?: Cell[] };

// One row as flat fields a flow can map: each column's label holds what the list shows,
// plus the page the row's first value was read from and the link to the list. The built-in fields
// always win: a column whose label is one of them, or repeats an earlier column, gets " (column)" added.
function columnName(label: string, taken: Set<string>): string {
  if (!RESERVED.has(label) && !taken.has(label)) return label;
  let name = `${label} (column)`;
  for (let n = 2; RESERVED.has(name) || taken.has(name); n++) name = `${label} (column ${n})`;
  return name;
}

function flatten(listId: string, record: ListRecord): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: `${listId}:${record.entity_id}`,
    list_id: listId,
    list_link: listLink(listId),
    position: record.ordinal,
  };
  const taken = new Set<string>();
  let source: Cell['provenance'] = null;
  for (const cell of record.cells ?? []) {
    const label = String(cell.label ?? cell.column_id ?? '').trim();
    if (!label) continue;
    const name = columnName(label, taken);
    taken.add(name);
    row[name] = cell.display ?? cell.value ?? '';
    if (!source && cell.provenance?.source_url) source = cell.provenance;
  }
  row['source_url'] = source?.source_url ?? '';
  row['checked_at'] = source?.observed_at ?? '';
  return row;
}

type FindInfo = { find_id: string; status?: string; created_at?: string; updated_at?: string };

// The newest finished list on the account (by date, not by position in a history), so a trigger test
// shows real rows and never a list that is still running.
async function latest(apiKey: string, limit = 3): Promise<Record<string, unknown>[]> {
  const specs = await call<{ specs: { spec_id: string }[] }>({
    apiKey,
    method: HttpMethod.GET,
    path: '/v1/specs?limit=10',
  });
  const ids: string[] = [];
  for (const spec of specs.specs ?? []) {
    const history = await call<{ finds: { find_id: string }[] }>({
      apiKey,
      method: HttpMethod.GET,
      path: `/v1/specs/${encodeURIComponent(spec.spec_id)}/finds?limit=5`,
    });
    for (const find of history.finds ?? []) if (!ids.includes(find.find_id)) ids.push(find.find_id);
  }
  const finds: FindInfo[] = [];
  for (const id of ids) {
    finds.push(
      await call<FindInfo>({ apiKey, method: HttpMethod.GET, path: `/v1/finds/${encodeURIComponent(id)}` }),
    );
  }
  const dateOf = (find: FindInfo) => Date.parse(find.updated_at ?? find.created_at ?? '') || 0;
  const finished = finds.filter((find) => FINISHED.has(String(find.status))).sort((x, y) => dateOf(y) - dateOf(x));
  for (const find of finished) {
    const page = await call<{ find_id: string; status: string; rows: ListRecord[] }>({
      apiKey,
      method: HttpMethod.GET,
      path: `/v1/finds/${encodeURIComponent(find.find_id)}/rows`,
    });
    if (FINISHED.has(page.status) && page.rows?.length) {
      return page.rows.slice(0, limit).map((record) => flatten(page.find_id, record));
    }
  }
  return [];
}

// SpecStream signs every delivery: header `t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">`.
function verify({
  headers,
  rawBody,
  secret,
}: {
  headers: Record<string, string | string[] | undefined>;
  rawBody: unknown;
  secret: string;
}): boolean {
  const header = Object.entries(headers ?? {}).find(
    ([name]) => name.toLowerCase() === 'specstream-signature',
  )?.[1];
  const value = Array.isArray(header) ? header[0] : header;
  const match = /^t=(\d+),v1=([a-f0-9]{64})$/.exec(String(value ?? ''));
  const body =
    typeof rawBody === 'string'
      ? rawBody
      : Buffer.isBuffer(rawBody)
        ? rawBody.toString('utf8')
        : undefined;
  if (!match || !secret || body === undefined) return false;
  if (Math.abs(Date.now() / 1000 - Number(match[1])) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${match[1]}.${body}`).digest();
  const given = Buffer.from(match[2], 'hex');
  return given.length === expected.length && timingSafeEqual(expected, given);
}
