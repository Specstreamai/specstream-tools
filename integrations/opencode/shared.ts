import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const MCP_NAME = "specstream";
export const MCP_URL = "https://api.specstream.ai/mcp";

export const skillsDir = join(dirname(fileURLToPath(import.meta.url)), "skills");

export type Options = { mcp?: boolean; skills?: boolean };

export type RemoteServer = {
  type: "remote";
  url: string;
  headers?: Record<string, string>;
  oauth?: false;
};

/** Reads a plugin option that defaults to on. Only an explicit `false` turns it off. */
export function enabled(options: unknown, key: keyof Options): boolean {
  if (typeof options !== "object" || options === null) return true;
  return (options as Options)[key] !== false;
}

/**
 * The hosted server signs people in through the browser (OAuth), so no key is needed.
 * A SPECSTREAM_API_KEY in the environment switches to a bearer header, for machines with no browser.
 */
export function remoteServer(env: Record<string, string | undefined> = process.env): RemoteServer {
  const key = env.SPECSTREAM_API_KEY?.trim();
  if (!key) return { type: "remote", url: MCP_URL };
  return { type: "remote", url: MCP_URL, headers: { Authorization: `Bearer ${key}` }, oauth: false };
}

export type Skill = { id: string; name: string; description: string; path: string; content: string };

/** Reads one skill file: single-line `name` and `description` frontmatter, then the body. */
export function parseSkill(file: string): Skill {
  const raw = readFileSync(file, "utf8");
  const fence = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!fence) throw new Error(`${file} has no frontmatter`);
  const field = (key: string) =>
    fence[1].match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1]?.trim().replace(/^(["'])(.*)\1$/, "$2") ?? "";
  const name = field("name");
  if (!name) throw new Error(`${file} has no name`);
  return { id: name, name, description: field("description"), path: file, content: raw.slice(fence[0].length).trim() };
}

export function bundledSkills(root: string = skillsDir): Skill[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => parseSkill(join(root, entry.name, "SKILL.md")))
    .sort((a, b) => a.name.localeCompare(b.name));
}
