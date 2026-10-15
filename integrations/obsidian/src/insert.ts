import type { Editor } from "obsidian";
import type { AcceptedRow } from "./api";
import { buildTable, caption } from "./table";

export type InsertOptions = {
	/** What to name the list in the note under the table: the request, or the list's name. */
	title: string;
	link: string;
	addNote: boolean;
};

/** Builds the table for these rows and puts it at the cursor, on its own lines. Returns the row count. */
export function insertRows(editor: Editor, rows: AcceptedRow[], options: InsertOptions): number {
	const table = buildTable(rows, { source: true });
	if (!table.rows) return 0;
	const cursor = editor.getCursor("from");
	const before = editor.getLine(cursor.line).slice(0, cursor.ch);
	const lead = before.trim() ? "\n\n" : "";
	const note = options.addNote ? `\n\n${caption(options.title, options.link, table.rows, new Date())}` : "";
	editor.replaceSelection(`${lead}${table.markdown}${note}\n`);
	return table.rows;
}
