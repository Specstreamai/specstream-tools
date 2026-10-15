import type { AcceptedRow, RowCell } from "./api";

export type TableOptions = {
	/** Add a final "Source" column that links each row's page. */
	source: boolean;
};

export type TableResult = {
	markdown: string;
	rows: number;
	columns: number;
};

const SOURCE_LABEL = "Source";

function cellText(cell: RowCell): string {
	if (cell.absence) return "";
	const shown = cell.display ?? cell.value;
	if (shown === null || shown === undefined) return "";
	if (typeof shown === "string") return shown;
	if (typeof shown === "number" || typeof shown === "boolean") return String(shown);
	if (Array.isArray(shown)) return shown.map((item) => (typeof item === "string" ? item : JSON.stringify(item))).join(", ");
	return JSON.stringify(shown);
}

/** Keeps one value on one table line: no line breaks, and pipes escaped so they don't split the cell. */
export function escapeCell(text: string): string {
	return text
		.replace(/\r\n|\r|\n/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/\\/g, "\\\\")
		.replace(/\|/g, "\\|");
}

function safeUrl(raw: string | null | undefined): URL | null {
	if (!raw) return null;
	try {
		const url = new URL(raw);
		return url.protocol === "https:" || url.protocol === "http:" ? url : null;
	} catch {
		return null;
	}
}

/** The page a row was read from: the first page any of its facts names. */
export function sourceOf(row: AcceptedRow): URL | null {
	for (const cell of [...row.cells, ...(row.details ?? [])]) {
		const url = safeUrl(cell.provenance?.source_url);
		if (url) return url;
	}
	return null;
}

export function sourceLink(url: URL): string {
	const label = url.hostname.replace(/^www\./, "") || url.href;
	const target = url.href.replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29");
	return `[${escapeCell(label).replace(/[[\]]/g, "")}](${target})`;
}

/** One column per field the list carries, in the order the rows show them, plus a Source column. */
export function buildTable(rows: AcceptedRow[], options: TableOptions): TableResult {
	const labels = new Map<string, string>();
	const used = new Set<string>();
	for (const row of rows) {
		for (const cell of [...row.cells, ...(row.details ?? [])]) {
			if (labels.has(cell.column_id)) continue;
			const base = (cell.label || cell.column_id).trim() || cell.column_id;
			let label = base;
			for (let n = 2; used.has(label.toLowerCase()); n += 1) label = `${base} (${n})`;
			used.add(label.toLowerCase());
			labels.set(cell.column_id, label);
		}
	}
	const ids = [...labels.keys()];
	const headers = ids.map((id) => escapeCell(labels.get(id) ?? id));
	if (options.source) headers.push(SOURCE_LABEL);
	if (!headers.length) return { markdown: "", rows: 0, columns: 0 };

	const lines = [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`];
	for (const row of rows) {
		const byId = new Map<string, RowCell>();
		for (const cell of [...row.cells, ...(row.details ?? [])]) if (!byId.has(cell.column_id)) byId.set(cell.column_id, cell);
		const values = ids.map((id) => {
			const cell = byId.get(id);
			return cell ? escapeCell(cellText(cell)) : "";
		});
		if (options.source) {
			const url = sourceOf(row);
			values.push(url ? sourceLink(url) : "");
		}
		lines.push(`| ${values.join(" | ")} |`);
	}
	return { markdown: lines.join("\n"), rows: rows.length, columns: headers.length };
}

/** The line under the table: where the list came from and when it was read. */
export function caption(request: string, link: string, rows: number, date: Date): string {
	const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
	const words = request.replace(/\s+/g, " ").trim().replace(/"/g, "'").replace(/[*_[\]]/g, "");
	const clipped = words.length > 160 ? `${words.slice(0, 157)}...` : words;
	const count = rows === 1 ? "1 row" : `${rows} rows`;
	return `*From [SpecStream](${link}): "${clipped}" – ${count}, read ${day}.*`;
}
