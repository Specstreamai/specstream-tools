import type { Plugin } from "@opencode/plugin";
import { MCP_NAME, bundledSkills, enabled, remoteServer } from "./shared.ts";

/**
 * OpenCode 2: the same two additions, through the MCP and skill transforms.
 * Type-only import: OpenCode 1 loads this file too and has no `@opencode/plugin` to resolve.
 */
export const v2: Plugin.Plugin = {
  id: "specstream",
  async setup(ctx) {
    if (enabled(ctx.options, "mcp")) {
      await ctx.mcp.transform((editor) => {
        if (!editor.get(MCP_NAME)) {
          // The config schema classes are structural; a plain object is accepted at runtime.
          editor.set(MCP_NAME, remoteServer() as never);
        }
      });
    }
    if (enabled(ctx.options, "skills")) {
      const skills = bundledSkills();
      await ctx.skill.transform((editor) => {
        for (const skill of skills) {
          if (!editor.get(skill.id)) editor.add(skill as never);
        }
      });
    }
  },
};
