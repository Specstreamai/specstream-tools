import { build } from "esbuild";
import { fileURLToPath } from "node:url";

await build({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  platform: "node",
  target: "node22",
  format: "cjs",
  external: ["vscode"],
  minify: true,
  sourcemap: false,
  // The TypeScript client lives in this repo; bundle its source so the extension needs no registry install.
  alias: { "@specstream/sdk": fileURLToPath(new URL("../../packages/sdk-ts/src/index.ts", import.meta.url)) },
});
