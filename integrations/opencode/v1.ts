import type { Plugin } from "@opencode-ai/plugin";
import { MCP_NAME, enabled, remoteServer, skillsDir } from "./shared.ts";

/** OpenCode 1: the config hook adds the MCP server and the skills folder. Anything the user already set wins. */
export const server: Plugin = async (_input, options) => {
  return {
    async config(input) {
      if (enabled(options, "mcp")) {
        input.mcp ??= {};
        input.mcp[MCP_NAME] ??= remoteServer();
      }
      if (enabled(options, "skills")) {
        // The V1 SDK's Config type does not declare skills.paths yet; OpenCode reads it.
        const config = input as typeof input & { skills?: { paths?: string[] } };
        config.skills ??= {};
        config.skills.paths ??= [];
        if (!config.skills.paths.includes(skillsDir)) config.skills.paths.push(skillsDir);
      }
    },
  };
};
