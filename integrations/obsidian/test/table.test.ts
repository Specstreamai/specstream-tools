import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTable, caption, escapeCell, sourceLink } from "../src/table.ts";

const cell = (id: string, label: string, display: string | null, url?: string) => ({
	column_id: id,
	label,
	value: display,
	display,
	provenance: url ? { source_url: url } : null,
});

test("one column per field, plus a Source column that links the page", () => {
	const rows = [
		{ entity_id: "a", ordinal: 0, cells: [cell("name", "Name", "Acme Roofing", "https://www.acme.example/about"), cell("phone", "Phone", "555-0101")] },
		{ entity_id: "b", ordinal: 1, cells: [cell("name", "Name", "Bolt | Sons"), cell("phone", "Phone", null)], details: [cell("site", "Website", "bolt.example", "https://bolt.example/")] },
	];
	const table = buildTable(rows, { source: true });
	assert.deepEqual(table.markdown.split("\n"), [
		"| Name | Phone | Website | Source |",
		"| --- | --- | --- | --- |",
		"| Acme Roofing | 555-0101 |  | [acme.example](https://www.acme.example/about) |",
		"| Bolt \\| Sons |  | bolt.example | [bolt.example](https://bolt.example/) |",
	]);
	assert.equal(table.rows, 2);
	assert.equal(table.columns, 4);
});

test("absent facts stay blank and repeated labels stay distinct", () => {
	const rows = [{ entity_id: "a", ordinal: 0, cells: [{ ...cell("x", "Email", "a@b.example"), absence: "Not published" }, cell("y", "Email", "c@d.example")] }];
	const table = buildTable(rows, { source: false });
	assert.deepEqual(table.markdown.split("\n"), ["| Email | Email (2) |", "| --- | --- |", "|  | c@d.example |"]);
});

test("cells stay on one line and links only use http or https", () => {
	assert.equal(escapeCell("line one\nline  two"), "line one line two");
	assert.equal(sourceLink(new URL("https://example.org/a b(c)")), "[example.org](https://example.org/a%20b%28c%29)");
	const rows = [{ entity_id: "a", ordinal: 0, cells: [cell("n", "Name", "Odd", "javascript:alert(1)")] }];
	assert.ok(buildTable(rows, { source: true }).markdown.endsWith("| Odd |  |"));
});

test("the note under the table names the request, row count and date", () => {
	assert.equal(
		caption('food banks "in" Texas', "https://specstream.ai/workspace/collections/fnd_1", 1, new Date(2026, 9, 15)),
		'*From [SpecStream](https://specstream.ai/workspace/collections/fnd_1): "food banks \'in\' Texas" – 1 row, read 2026-10-15.*',
	);
});
