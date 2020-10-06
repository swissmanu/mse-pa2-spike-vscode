// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as ts from "typescript";
import * as ws from "ws";
import * as http from "http";
import { LineAndColumnComputer } from "./utils";
import { getDescendantAtRange } from "./compiler/getDescendantAtRange";
import { Event, EventSource, TreeMode } from "./types";
import { assert } from "console";

const DEFAULT_DEBUGGER_PORT = 9229;
let httpServer: http.Server | null = null;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // rxJsInspection -> link up with package.json contribution

  const collectedEvents: Event[] = [];
  let updateVisualizer: (events: ReadonlyArray<Event>) => void = () => {};

  context.subscriptions.push(
    vscode.commands.registerCommand("spike-vscode.commands.showVisualizer", () => {
      const panel = vscode.window.createWebviewPanel("visualizer", "Observable", vscode.ViewColumn.Beside, {});
      panel.onDidDispose(() => {}, null, context.subscriptions);
      updateVisualizer = (events) =>
        (panel.webview.html = `
      <html>
      <body>
        <ol>
          ${events.map((e) => `<li>${JSON.stringify(e)}</li>`)}
        </ol>
      </body>
      </html>
      `);
    })
  );

  const editor = vscode.window.activeTextEditor;
  if (editor) {
    ts.createSourceFile(editor.document.uri.toString(), editor.document.getText(), ts.ScriptTarget.Latest);

    const eventSourcesTreeDataProvider = new EventSourcesTreeDataProvider();
    const treeView = vscode.window.createTreeView("spike-vscode.views.eventSources", {
      treeDataProvider: eventSourcesTreeDataProvider,
    });
    context.subscriptions.push(treeView);

    context.subscriptions.push(
      vscode.commands.registerCommand("spike-vscode.commands.addEventSource", (eventSource: EventSource) => {
        assert(typeof eventSource.source === "string");
        eventSourcesTreeDataProvider.addEventSource(eventSource);
      })
    );

    httpServer = http.createServer();
    const webSocketServer = new ws.Server({ server: httpServer });
    webSocketServer.on("connection", (socket) => {
      socket.on("message", (m) => {
        const rawMessage = m.toString();
        try {
          const jsonMessage = JSON.parse(rawMessage);
          if (typeof jsonMessage.source === "string") {
            if (eventSourcesTreeDataProvider.hasEventSource(jsonMessage.source)) {
              collectedEvents.push(jsonMessage);
              updateVisualizer(collectedEvents);
            }
          }
        } catch {
          console.log(`${m}`);
        }
      });
    });
    httpServer.listen(DEFAULT_DEBUGGER_PORT + 1);
  }

  vscode.languages.registerCodeActionsProvider(
    { scheme: "file", language: "typescript" },
    {
      provideCodeActions: (document, range) => {
        const text = document.getText();
        const foo = new LineAndColumnComputer(text);
        const sourceFile = ts.createSourceFile("parsed", text, ts.ScriptTarget.Latest);
        const start = foo.getPosFromLineAndColumn(range.start.line, range.start.character);

        const node = getDescendantAtRange(TreeMode.forEachChild, sourceFile, [start, start], ts);
        // console.log(node)

        if (node) {
          const text = node.getText(sourceFile);
          if (text === "map" || text === "take") {
            const action = new vscode.CodeAction("Visualize Observable...", vscode.CodeActionKind.Empty);
            const eventSource: EventSource = { source: text };
            action.command = {
              command: "spike-vscode.commands.addEventSource",
              title: "Debug Observable...",
              arguments: [eventSource],
            };
            return [action];
          }
        }
      },
    }
  );
}

export function deactivate() {
  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }
}

class EventSourcesTreeDataProvider implements vscode.TreeDataProvider<EventSource> {
  private onDidChangeTreeDataEventEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData: vscode.Event<void> = this.onDidChangeTreeDataEventEmitter.event;

  private eventSources: ReadonlyArray<EventSource> = [];

  getChildren(element?: EventSource): EventSource[] {
    if (!element) {
      return this.eventSources as EventSource[];
    }
    return [];
  }

  getTreeItem(element: EventSource): vscode.TreeItem {
    return new vscode.TreeItem(element.source);
  }

  addEventSource(eventSource: EventSource) {
    this.eventSources = [...this.eventSources, eventSource];
    this.onDidChangeTreeDataEventEmitter.fire();
  }

  hasEventSource(source: EventSource["source"]): boolean {
    return this.eventSources.findIndex((es) => es.source === source) !== -1;
  }
}
