import * as vscode from "vscode";

export const KEY_SECRET = "specstream.apiKey";
export const PROVIDER_ID = "specstream.mcp";

/**
 * Registers SpecStream's remote MCP server. With no key stored, VS Code runs its own MCP sign-in
 * (OAuth with a client ID metadata document, or dynamic client registration) the first time the server needs it. If the person chose to use an
 * API key, it is read from SecretStorage when the server starts and sent as a bearer header.
 */
export function registerMcpProvider(context: vscode.ExtensionContext): vscode.Disposable {
  const changed = new vscode.EventEmitter<void>();
  const url = () => vscode.workspace.getConfiguration("specstream").get<string>("serverUrl") || "https://api.specstream.ai/mcp";

  const provider: vscode.McpServerDefinitionProvider<vscode.McpHttpServerDefinition> = {
    onDidChangeMcpServerDefinitions: changed.event,
    provideMcpServerDefinitions: async () => [
      new vscode.McpHttpServerDefinition("SpecStream", vscode.Uri.parse(url()), {}, context.extension.packageJSON.version),
    ],
    resolveMcpServerDefinition: async (server) => {
      const key = await context.secrets.get(KEY_SECRET);
      if (key) server.headers = { ...server.headers, Authorization: `Bearer ${key}` };
      return server;
    },
  };

  return vscode.Disposable.from(
    changed,
    vscode.lm.registerMcpServerDefinitionProvider(PROVIDER_ID, provider),
    context.secrets.onDidChange((e) => e.key === KEY_SECRET && changed.fire()),
    vscode.workspace.onDidChangeConfiguration((e) => e.affectsConfiguration("specstream.serverUrl") && changed.fire()),
  );
}
