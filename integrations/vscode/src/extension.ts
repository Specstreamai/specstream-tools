import * as vscode from "vscode";
import { KEY_SECRET, registerMcpProvider } from "./mcp";
import { registerParticipant } from "./participant";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    registerMcpProvider(context),
    registerParticipant(context),
    vscode.commands.registerCommand("specstream.connect", async () => {
      // VS Code owns the sign-in. Opening its server list is where the person starts SpecStream and signs in.
      try {
        await vscode.commands.executeCommand("workbench.mcp.listServer");
      } catch {
        void vscode.window.showInformationMessage(
          "Run MCP: List Servers from the Command Palette, choose SpecStream and start it. VS Code asks you to sign in.",
        );
      }
    }),
    vscode.commands.registerCommand("specstream.setApiKey", async () => {
      const key = await vscode.window.showInputBox({
        title: "SpecStream API key",
        prompt: "Paste a key from your SpecStream account settings. It is kept in VS Code's secret storage.",
        password: true,
        ignoreFocusOut: true,
      });
      if (!key?.trim()) return;
      await context.secrets.store(KEY_SECRET, key.trim());
      void vscode.window.showInformationMessage("SpecStream will use your API key.");
    }),
    vscode.commands.registerCommand("specstream.clearApiKey", async () => {
      await context.secrets.delete(KEY_SECRET);
      void vscode.window.showInformationMessage("API key removed. SpecStream goes back to signing in.");
    }),
  );
}

export function deactivate() {}
