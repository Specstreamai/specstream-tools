import { Notice, Plugin } from "obsidian";
import { SpecStreamClient, SpecStreamError } from "./api";
import { DEFAULT_SETTINGS, cleanLimit, clampRows, SpecStreamSettingTab, type SpecStreamSettings } from "./settings";
import { FindListModal } from "./ui/findModal";
import { SavedListModal } from "./ui/listModal";

export default class SpecStreamPlugin extends Plugin {
	settings: SpecStreamSettings = { ...DEFAULT_SETTINGS };

	async onload(): Promise<void> {
		await this.loadSettings();

		this.addCommand({
			id: "find-list",
			name: "Find a list",
			editorCallback: (editor) => {
				if (!this.ready()) return;
				new FindListModal(this, editor).open();
			},
		});

		this.addCommand({
			id: "insert-saved-list",
			name: "Insert a saved list",
			editorCallback: (editor) => {
				if (!this.ready()) return;
				new SavedListModal(this, editor).open();
			},
		});

		this.addSettingTab(new SpecStreamSettingTab(this));
	}

	async loadSettings(): Promise<void> {
		const saved = (await this.loadData()) as Partial<SpecStreamSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...(saved ?? {}) };
		this.settings.defaultRows = clampRows(Number(this.settings.defaultRows));
		this.settings.spendingLimit = cleanLimit(Number(this.settings.spendingLimit));
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/** The API key, read from Obsidian's secret storage. */
	private apiKey(): string {
		return this.app.secretStorage.getSecret(this.settings.apiKeySecret) ?? "";
	}

	client(): SpecStreamClient {
		return new SpecStreamClient(this.apiKey(), this.manifest.version);
	}

	/** Tells the user what to do when there is no key yet, instead of opening a window that can't work. */
	private ready(): boolean {
		try {
			this.client();
			return true;
		} catch (error) {
			if (error instanceof SpecStreamError) new Notice(error.message);
			return false;
		}
	}
}
