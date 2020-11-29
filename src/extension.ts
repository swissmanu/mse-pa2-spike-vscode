import { assert } from "console";
import * as http from "http";
import * as ts from "typescript";
import * as vscode from "vscode";
import * as ws from "ws";
import { getDescendantAtRange } from "./compiler/getDescendantAtRange";
import { Event, EventSource, TreeMode } from "./types";
import { LineAndColumnComputer } from "./utils";

const DEFAULT_DEBUGGER_PORT = 9229;
let httpServer: http.Server | null = null;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  let collectedEvents: Event[] = [];
  let updateVisualizer: (events: ReadonlyArray<Event>) => void = () => {};

  context.subscriptions.push(
    vscode.commands.registerCommand("spike-vscode.commands.showVisualizer", () => {
      const panel = vscode.window.createWebviewPanel(
        "visualizer",
        "Observable Probe Monitor",
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
        }
      );
      panel.onDidDispose(() => {}, null, context.subscriptions);
      panel.webview.onDidReceiveMessage(({ command }) => {
        if (command === "clear") {
          collectedEvents = [];
          updateVisualizer(collectedEvents);
        }
      });
      updateVisualizer = (events) =>
        (panel.webview.html = `
      <html>
      <body>
        <h1>Observable Probe Monitor</h1>
        <button onclick="acquireVsCodeApi().postMessage({ command: 'clear' });">Clear</button>
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
        assert(typeof eventSource.fileName === "string");
        assert(typeof eventSource.lineNumber === "number");
        assert(typeof eventSource.columnNumber === "number");
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

          if (typeof jsonMessage.source === "object") {
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
        const documentText = document.getText();
        const lineAndColumnComputer = new LineAndColumnComputer(documentText);
        const sourceFile = ts.createSourceFile("parsed", documentText, ts.ScriptTarget.Latest);
        const start = lineAndColumnComputer.getPosFromLineAndColumn(range.start.line, range.start.character + 1);

        const nodeAtCursor = getDescendantAtRange(TreeMode.forEachChild, sourceFile, [start, start], ts);

        if (nodeAtCursor) {
          if (nodeAtCursor.kind === ts.SyntaxKind.CallExpression) {
            const identifier = findFirstIdentifierChild(nodeAtCursor, sourceFile);
            if (identifier) {
              return createCodeActions(sourceFile, identifier, document, lineAndColumnComputer);
            }
          } else if (nodeAtCursor.kind === ts.SyntaxKind.Identifier) {
            return createCodeActions(sourceFile, nodeAtCursor, document, lineAndColumnComputer);
          }
        }
      },
    }
  );
}

function findFirstIdentifierChild(node: ts.Node, sourceFile: ts.SourceFile): ts.Node | null {
  const children = node.getChildren(sourceFile);
  const index = children.findIndex((c) => c.kind === ts.SyntaxKind.Identifier);
  return index !== -1 ? children[index] : null;
}

const instrumentedOperatorNames = ["map", "take", "flatMap", "switchMap", "distinctUntilChanged", "tap", "startWith"];
function isInstrumentedOperator(x: string): boolean {
  return instrumentedOperatorNames.indexOf(x) !== -1;
}

function createCodeActions(
  sourceFile: ts.SourceFile,
  node: ts.Node,
  document: vscode.TextDocument,
  lineAndColumnComputer: LineAndColumnComputer
): vscode.CodeAction[] {
  const text = node.getText(sourceFile);

  if (isInstrumentedOperator(text)) {
    const action = new vscode.CodeAction("Probe Observable...", vscode.CodeActionKind.Empty);

    const lineAndColumnNumber = lineAndColumnComputer.getNumberAndColumnFromPos(node.getStart(sourceFile));

    const eventSource: EventSource = { fileName: document.uri.fsPath, ...lineAndColumnNumber };
    action.command = {
      command: "spike-vscode.commands.addEventSource",
      title: "Add Event Source",
      arguments: [eventSource],
    };

    return [action];
  }
  return [];
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
    return new vscode.TreeItem(`${element.fileName}:${element.lineNumber}:${element.columnNumber}`);
  }

  addEventSource(eventSource: EventSource) {
    this.eventSources = [...this.eventSources, eventSource];
    this.onDidChangeTreeDataEventEmitter.fire();
  }

  hasEventSource(source: EventSource): boolean {
    const sourceFileName = source.fileName.startsWith("webpack://") ? source.fileName.substr(10) : source.fileName;

    return (
      this.eventSources.findIndex(
        (es) =>
          es.fileName.endsWith(sourceFileName) &&
          es.lineNumber === source.lineNumber &&
          es.columnNumber === source.columnNumber + 1 // TODO WHY +1?!
      ) !== -1
    );
  }
}
