import { Editor, Notice, SuggestModal } from "obsidian";
import type SpecStreamPlugin from "../main";
import { listLink, type ListSummary } from "../api";
import { insertRows } from "../insert";

function when(value: string): string {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Pick one of your lists and insert it. Reading a list you own is free. */
export class SavedListModal extends SuggestModal<ListSummary> {
	private lists: ListSummary[] | null = null;

	constructor(
		private readonly plugin: SpecStreamPlugin,
		private readonly editor: Editor,
	) {
		super(plugin.app);
		this.setPlaceholder("Search your lists");
		this.emptyStateText = "No lists to insert yet. Ask for one with SpecStream: Find a list.";
	}

	async getSuggestions(query: string): Promise<ListSummary[]> {
		if (this.lists === null) {
			try {
				const all = await this.plugin.client().lists();
				this.lists = all.filter((list) => list.find_id);
			} catch (error) {
				new Notice(error instanceof Error ? error.message : "Could not read your lists.");
				this.lists = [];
			}
		}
		const needle = query.trim().toLowerCase();
		return this.lists.filter((list) => !needle || list.name.toLowerCase().includes(needle));
	}

	renderSuggestion(list: ListSummary, el: HTMLElement): void {
		el.addClass("specstream-list-item");
		el.createDiv({ cls: "specstream-list-name", text: list.name });
		const rows = `${list.row_count} ${list.row_count === 1 ? "row" : "rows"}`;
		const date = when(list.created_at);
		el.createDiv({ cls: "specstream-list-meta", text: date ? `${rows} · ${date}` : rows });
	}

	onChooseSuggestion(list: ListSummary): void {
		void this.insert(list);
	}

	private async insert(list: ListSummary): Promise<void> {
		const findId = list.find_id;
		if (!findId) return;
		const working = new Notice("Reading your list...", 0);
		try {
			const rows = await this.plugin.client().rows(findId);
			const inserted = insertRows(this.editor, rows, {
				title: list.name,
				link: listLink(findId),
				addNote: this.plugin.settings.addNote,
			});
			working.hide();
			new Notice(inserted ? `Inserted ${inserted} ${inserted === 1 ? "row" : "rows"} from ${list.name}.` : "That list has no rows to insert.");
		} catch (error) {
			working.hide();
			new Notice(error instanceof Error ? error.message : "Could not read that list.");
		}
	}
}
