import { requestUrl } from "obsidian";

export const API_BASE = "https://api.specstream.ai";
export const WORKSPACE_URL = "https://specstream.ai/workspace";
export const API_KEYS_URL = "https://specstream.ai/workspace/agents";

export class SpecStreamError extends Error {
	readonly status: number | null;
	readonly code: string | null;

	constructor(message: string, status: number | null = null, code: string | null = null) {
		super(message);
		this.name = "SpecStreamError";
		this.status = status;
		this.code = code;
	}
}

export type Reading = {
	status: string;
	ast_hash: string | null;
	canonical_sentence: string | null;
	notice: string | null;
	/** The row count in the request itself, when the request names one. */
	stated_rows: number | null;
	/** True when SpecStream filled in a default count because the request names none. */
	rows_inferred: boolean;
};

export type Quote = {
	quote_id: string;
	quote_hash: string;
	currency: string;
	maximum_cents: number;
	expires_at: string;
	can_authorize: boolean;
	terms: { unit_cents?: number };
};

export type Execution = {
	find_id: string | null;
	state: string;
};

export type FindState = {
	status: string;
	requested_count: number;
	accepted_count: number;
};

export type Provenance = {
	source_url?: string | null;
	observed_at?: string | null;
};

export type RowCell = {
	column_id: string;
	label: string;
	value: unknown;
	display?: string | null;
	absence?: string | null;
	provenance?: Provenance | null;
};

export type AcceptedRow = {
	entity_id: string;
	ordinal: number;
	cells: RowCell[];
	details?: RowCell[];
};

export type ListSummary = {
	id: string;
	name: string;
	kind: string;
	find_id: string | null;
	row_count: number;
	created_at: string;
};

export type Account = {
	email: string | null;
	availableCents: number | null;
};

const FINISHED = new Set(["completed", "partial"]);
const STOPPED = new Set(["failed", "canceled", "cancelled", "expired"]);

export const isFinished = (status: string): boolean => FINISHED.has(status);
export const isStopped = (status: string): boolean => STOPPED.has(status);

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
	return typeof value === "string" && value ? value : null;
}

function asCount(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;
}

function plainError(status: number, code: string | null, message: string | null): string {
	if (status === 401) {
		return "SpecStream did not accept the API key. Check it in the plugin settings, or create a new one under Agents & API in your workspace.";
	}
	if (status === 402) {
		return "Your SpecStream balance can't cover this. Add funds in your workspace, then try again.";
	}
	if (status === 429) {
		return "SpecStream is asking for a short pause. Try again in a minute.";
	}
	if (message) return message;
	return code ? `SpecStream could not do that (${code}).` : `SpecStream answered with an error (HTTP ${status}).`;
}

/** The few SpecStream REST calls the plugin makes, over Obsidian's requestUrl. */
export class SpecStreamClient {
	private readonly apiKey: string;
	private readonly userAgent: string;

	constructor(apiKey: string, version: string) {
		const key = apiKey.trim();
		if (!key) throw new SpecStreamError("Add your SpecStream API key in the plugin settings first.");
		this.apiKey = key;
		this.userAgent = `specstream-obsidian/${version}`;
	}

	private async request(method: "GET" | "POST", path: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
		let response;
		try {
			response = await requestUrl({
				url: API_BASE + path,
				method,
				headers: {
					Authorization: /^bearer /i.test(this.apiKey) ? this.apiKey : `Bearer ${this.apiKey}`,
					Accept: "application/json",
					"User-Agent": this.userAgent,
				},
				contentType: body === undefined ? undefined : "application/json",
				body: body === undefined ? undefined : JSON.stringify(body),
				throw: false,
			});
		} catch {
			throw new SpecStreamError("Could not reach SpecStream. Check your connection and try again.");
		}
		let payload: unknown = null;
		try {
			payload = JSON.parse(response.text || "null");
		} catch {
			payload = null;
		}
		if (response.status < 200 || response.status >= 300) {
			const detail = isObject(payload) && isObject(payload.error) ? payload.error : {};
			throw new SpecStreamError(
				plainError(response.status, asString(detail.code), asString(detail.message)),
				response.status,
				asString(detail.code),
			);
		}
		const data = isObject(payload) ? payload.data : undefined;
		if (!isObject(data)) {
			throw new SpecStreamError("SpecStream returned something this plugin could not read.", response.status);
		}
		return data;
	}

	/** Reads the request into a priced-ready reading. */
	async read(request: string): Promise<Reading> {
		const data = await this.request("POST", "/v1/parse", { q: request, locale: "en-US" });
		const ast = isObject(data.ast) ? data.ast : {};
		const limit = isObject(ast.limit) ? ast.limit : {};
		const inferred = limit.inferred !== false;
		const max = asCount(limit.max);
		return {
			status: asString(data.status) ?? "needs_edit",
			ast_hash: asString(data.ast_hash),
			canonical_sentence: asString(data.canonical_sentence),
			notice: asString(data.notice),
			stated_rows: !inferred && max > 0 ? max : null,
			rows_inferred: inferred,
		};
	}

	/** Prices the reading. Nothing runs and nothing is charged. */
	async quote(astHash: string, rows: number): Promise<Quote> {
		const data = await this.request("POST", "/v1/capacity/quotes", {
			ast_hash: astHash,
			operation: "find",
			requested_units: rows,
		});
		const terms = isObject(data.terms) ? data.terms : {};
		const quoteId = asString(data.quote_id);
		const quoteHash = asString(data.quote_hash);
		if (!quoteId || !quoteHash) throw new SpecStreamError("SpecStream returned a price this plugin could not read.");
		return {
			quote_id: quoteId,
			quote_hash: quoteHash,
			currency: asString(data.currency) ?? "USD",
			maximum_cents: asCount(data.maximum_cents),
			expires_at: asString(data.expires_at) ?? "",
			can_authorize: data.can_authorize !== false,
			terms: typeof terms.unit_cents === "number" ? { unit_cents: terms.unit_cents } : {},
		};
	}

	/** Approves exactly this quote at exactly its maximum. Only call it after the user clicked approve. */
	async approve(quote: Quote): Promise<Execution> {
		const data = await this.request("POST", "/v1/capacity/executions", {
			quote_id: quote.quote_id,
			quote_hash: quote.quote_hash,
			confirm_max_cents: quote.maximum_cents,
			idempotency_key: `obsidian-${quote.quote_id}`.slice(0, 128),
		});
		return { find_id: asString(data.find_id), state: asString(data.state) ?? "reserved" };
	}

	async findState(findId: string): Promise<FindState> {
		const data = await this.request("GET", `/v1/finds/${encodeURIComponent(findId)}`);
		return {
			status: asString(data.status) ?? "running",
			requested_count: asCount(data.requested_count),
			accepted_count: asCount(data.accepted_count),
		};
	}

	/** Stops a running list. What it found so far is kept. */
	async cancel(findId: string): Promise<void> {
		await this.request("POST", `/v1/finds/${encodeURIComponent(findId)}/cancel`);
	}

	/** Every row of a list you own, following the pages. Reading is free. */
	async rows(findId: string): Promise<AcceptedRow[]> {
		const rows: AcceptedRow[] = [];
		let cursor: string | null = null;
		for (let page = 0; page < 120; page += 1) {
			const query = new URLSearchParams({ limit: "100" });
			if (cursor) query.set("cursor", cursor);
			const data = await this.request("GET", `/v1/finds/${encodeURIComponent(findId)}/rows?${query.toString()}`);
			for (const row of Array.isArray(data.rows) ? data.rows : []) {
				if (isObject(row) && Array.isArray(row.cells)) rows.push(row as unknown as AcceptedRow);
			}
			const next = asString(data.next_cursor);
			if (!next || next === cursor) break;
			cursor = next;
		}
		return rows;
	}

	/** The lists you can open, newest first. Only lists SpecStream found for you carry a run to read from. */
	async lists(): Promise<ListSummary[]> {
		const found: ListSummary[] = [];
		let after = "";
		for (let page = 0; page < 5; page += 1) {
			const query = new URLSearchParams({ limit: "100", sort: "recent" });
			if (after) query.set("after", after);
			const data = await this.request("GET", `/v1/workspace/collections?${query.toString()}`);
			for (const item of Array.isArray(data.collections) ? data.collections : []) {
				if (!isObject(item)) continue;
				const id = asString(item.id);
				if (!id) continue;
				const findId = asString(item.find_id) ?? (id.startsWith("fnd_") ? id : null);
				found.push({
					id,
					name: asString(item.name) ?? id,
					kind: asString(item.kind) ?? "find",
					find_id: findId,
					row_count: asCount(item.row_count ?? item.total),
					created_at: asString(item.created_at) ?? "",
				});
			}
			const next = asString(data.next_after);
			if (!next || next === after) break;
			after = next;
		}
		return found;
	}

	/** Who the key belongs to and what is left to spend, for the settings check. */
	async account(): Promise<Account> {
		const me = await this.request("GET", "/v1/me");
		let availableCents: number | null = null;
		try {
			const balance = await this.request("GET", "/v1/capacity/balance");
			if (typeof balance.available_cents === "number") availableCents = balance.available_cents;
		} catch {
			availableCents = null;
		}
		return { email: asString(me.email), availableCents };
	}
}

export function listLink(findId: string): string {
	return `${WORKSPACE_URL}/collections/${encodeURIComponent(findId)}`;
}

export function money(cents: number, currency = "USD"): string {
	const symbol = currency === "EUR" ? "€" : "$";
	return `${symbol}${(cents / 100).toFixed(2)}`;
}
