import { assert } from "console";
import * as http from "http";
import * as ts from "typescript";
import * as vscode from "vscode";
import * as ws from "ws";
import { getDescendantAtRange } from "./compiler/getDescendantAtRange";
import { Event, TreeMode } from "./types";
import { LineAndColumnComputer } from "./utils";

const DEFAULT_DEBUGGER_PORT = 9229;
let httpServer: http.Server | null = null;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  let collectedEvents: ({ source: Event.Source } & Event.Event)[] = [];
  let updateVisualizer: (events: ReadonlyArray<{ source: Event.Source } & Event.Event>) => void = () => {};

  function createVisualizer(panel: vscode.WebviewPanel) {
    return (events: ReadonlyArray<{ source: Event.Source } & Event.Event>): void => {
      panel.webview.html = `
        <html>
        <body>
          <h1>Observable Log Points</h1>
          <button onclick="acquireVsCodeApi().postMessage({ command: 'clear' });">Clear</button>
          <table>
            <thead style="border-bottom: 1px solid">
              <tr>
                <th>Event</th>
                <th>Value</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              ${events
                .map(
                  (e) => `
                  <tr>
                    <td>
                      ${Event.match(e)({
                        Completed: () => "Completed",
                        Error: () => "Error",
                        Next: () => "Next",
                        Subscribe: () => "Subscribe",
                        Unsubscribe: () => "Unsubscribed",
                      })}
                    </td>
                    <td>
                      ${Event.match(e)({
                        Completed: () => "",
                        Error: ({ error }) => error,
                        Next: ({ value }) => value,
                        Subscribe: () => "",
                        Unsubscribe: () => "",
                      })}
                    </td>
                    <td>${e.source.fileName}:${e.source.lineNumber}:${e.source.columnNumber}</td>
                  </tr>`
                )
                .join("\n")}
            </tbody>
          </table>
        </body>
        </html>
      `;
    };
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("spike-vscode.commands.showVisualizer", () => {
      const panel = vscode.window.createWebviewPanel("visualizer", "Observable Log Points", vscode.ViewColumn.Beside, {
        enableScripts: true,
      });
      panel.onDidDispose(() => {}, null, context.subscriptions);
      panel.webview.onDidReceiveMessage(({ command }) => {
        if (command === "clear") {
          collectedEvents = [];
          updateVisualizer(collectedEvents);
        }
      });
      updateVisualizer = createVisualizer(panel);
      updateVisualizer(collectedEvents);
    })
  );

  const editor = vscode.window.activeTextEditor;
  if (editor) {
    ts.createSourceFile(editor.document.uri.toString(), editor.document.getText(), ts.ScriptTarget.Latest);

    const eventSourcesTreeDataProvider = new EventSourcesTreeDataProvider();
    vscode.window.registerTreeDataProvider("spike-vscode.views.eventSources", eventSourcesTreeDataProvider);
    const treeView = vscode.window.createTreeView("spike-vscode.views.eventSources", {
      treeDataProvider: eventSourcesTreeDataProvider,
    });
    context.subscriptions.push(treeView);

    context.subscriptions.push(
      vscode.commands.registerCommand("spike-vscode.commands.addEventSource", (eventSource: Event.Source) => {
        assert(typeof eventSource.fileName === "string");
        assert(typeof eventSource.lineNumber === "number");
        assert(typeof eventSource.columnNumber === "number");

        if (eventSourcesTreeDataProvider.getChildren().length === 0) {
          vscode.commands.executeCommand("spike-vscode.commands.showVisualizer");
        }

        eventSourcesTreeDataProvider.addEventSource(eventSource);
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("spike-vscode.commands.removeEventSource", (eventSource: Event.Source) => {
        eventSourcesTreeDataProvider.removeEventSource(eventSource);
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("spike-vscode.commands.removeAllEventSources", () => {
        eventSourcesTreeDataProvider.removeAllEventSources();
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
            // TODO do actual parsing
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

const instrumentedOperatorNames = [
  "map",
  "take",
  "flatMap",
  "switchMap",
  "distinctUntilChanged",
  "tap",
  "startWith",
  "scan",
  "filter",
];
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
    const action = new vscode.CodeAction("Add Log Point to Operator...", vscode.CodeActionKind.Empty);

    const lineAndColumnNumber = lineAndColumnComputer.getNumberAndColumnFromPos(node.getStart(sourceFile));

    const eventSource: Event.Source = { fileName: document.uri.fsPath, ...lineAndColumnNumber };
    action.command = {
      command: "spike-vscode.commands.addEventSource",
      title: "Add Log Point to Operator...",
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

class EventSourcesTreeDataProvider implements vscode.TreeDataProvider<Event.Source> {
  private onDidChangeTreeDataEventEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData: vscode.Event<void> = this.onDidChangeTreeDataEventEmitter.event;

  private eventSources: ReadonlyArray<Event.Source> = [];

  getChildren(element?: Event.Source): Event.Source[] {
    if (!element) {
      return this.eventSources as Event.Source[];
    }
    return [];
  }

  getTreeItem(element: Event.Source): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(vscode.workspace.asRelativePath(element.fileName));
    treeItem.description = `Ln ${element.lineNumber}, Col ${element.columnNumber}`;
    treeItem.contextValue = "eventSource";
    treeItem.iconPath = new vscode.ThemeIcon("pulse");
    return treeItem;
  }

  addEventSource(eventSource: Event.Source) {
    this.eventSources = [
      ...this.eventSources,
      {
        ...eventSource,
        fileName: eventSource.fileName.replace(/\\/g, "/"), // Windows uses backslashes 🤷‍♂️
      },
    ];
    this.onDidChangeTreeDataEventEmitter.fire();
  }

  removeEventSource(eventSource: Event.Source) {
    const index = this.eventSources.indexOf(eventSource);
    if (index !== -1) {
      this.eventSources = [...this.eventSources.slice(0, index), ...this.eventSources.slice(index + 1)];
      this.onDidChangeTreeDataEventEmitter.fire();
    }
  }

  removeAllEventSources() {
    this.eventSources = [];
    this.onDidChangeTreeDataEventEmitter.fire();
  }

  hasEventSource(source: Event.Source): boolean {
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
