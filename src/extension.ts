// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as ts from "typescript";
import * as ipc from "node-ipc";
import * as ws from "ws";
import * as http from "http";

const DEFAULT_DEBUGGER_PORT = 9229;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // rxJsInspection -> link up with package.json contribution

  const editor = vscode.window.activeTextEditor;
  if (editor) {
    ts.createSourceFile(editor.document.uri.toString(), editor.document.getText(), ts.ScriptTarget.Latest);

    const breakpointTreeDataProvider = new BreakpointTreeDataProvider();
    vscode.debug.onDidChangeBreakpoints((e) => {
      breakpointTreeDataProvider.updateFrom(e);
    });

    const treeView = vscode.window.createTreeView("rxJsInspection", {
      treeDataProvider: breakpointTreeDataProvider,
    });
    context.subscriptions.push(treeView);
  }

  // ipc.config.retry = 1500;
  // ipc.config.maxRetries = 5;
  // ipc.connectTo("spike", () => {
  //   ipc.of.world.on("message", (data: unknown) => console.log(data));
  // });

  const httpServer = http.createServer();
  const webSocketServer = new ws.Server({ server: httpServer });
  webSocketServer.on("connection", (socket) => {
    socket.on("message", (m) => console.log("%s", m));
  });
  httpServer.listen(DEFAULT_DEBUGGER_PORT + 1);

  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "spike-vscode" is now active!');

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  let disposable = vscode.commands.registerCommand("spike-vscode.helloWorld", () => {
    // The code you place here will be executed every time your command is executed

    // Display a message box to the user
    vscode.window.showInformationMessage("Hello World from spike-vscode!");
  });

  context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}

class BreakpointTreeDataProvider implements vscode.TreeDataProvider<vscode.Breakpoint> {
  private _onDidChangeTreeData: vscode.EventEmitter<undefined> = new vscode.EventEmitter<undefined>();
  readonly onDidChangeTreeData: vscode.Event<undefined> = this._onDidChangeTreeData.event;

  private breakpoints: Map<vscode.Breakpoint["id"], vscode.Breakpoint> = new Map();

  getChildren(element?: vscode.Breakpoint): vscode.Breakpoint[] {
    if (!element) {
      return [...this.breakpoints.values()].filter((b) => b instanceof vscode.SourceBreakpoint);
    }
    return [];
  }

  getTreeItem(element: vscode.Breakpoint): vscode.TreeItem {
    return new vscode.TreeItem(element.id);
  }

  updateFrom(e: vscode.BreakpointsChangeEvent) {
    for (const b of e.changed) {
      this.breakpoints.set(b.id, b);
    }
    for (const b of e.removed) {
      this.breakpoints.delete(b.id);
    }
    for (const b of e.added) {
      this.breakpoints.set(b.id, b);
    }
    this._onDidChangeTreeData.fire(undefined);
  }
}
