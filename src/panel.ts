import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class BoopPanel implements vscode.WebviewViewProvider {
  public static readonly viewId = 'boop.panel';

  private view: vscode.WebviewView | null = null;
  private context: vscode.ExtensionContext;
  private disposeCallbacks: Array<() => void> = [];
  private lastState: { payload: any } | null = null;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    // Always re-initialize — Cursor recreates the webview when switching tabs
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(this.context.extensionPath, 'media'))
      ]
    };

    webviewView.webview.html = this.getHtml();

    // Replay last known state immediately after init
    if (this.lastState) {
      webviewView.webview.postMessage(this.lastState.payload);
    }

    // Also replay when visibility changes (tab switch back)
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible && this.lastState) {
        webviewView.webview.postMessage(this.lastState.payload);
      }
    });

    webviewView.webview.onDidReceiveMessage(
      (message) => {
        if (message.type === 'close') {
          vscode.commands.executeCommand('workbench.action.closePanel');
        }
      },
      undefined,
      this.context.subscriptions
    );

    webviewView.onDidDispose(() => {
      if (this.view === webviewView) {
        this.view = null;
      }
      this.disposeCallbacks.forEach((cb) => cb());
    });
  }

  onDispose(callback: () => void): void {
    this.disposeCallbacks.push(callback);
  }

  get isVisible(): boolean {
    return this.view?.visible ?? false;
  }

  show(): void {
    vscode.commands.executeCommand(`${BoopPanel.viewId}.focus`);
  }

  dispose(): void {
    this.disposeCallbacks.forEach((cb) => cb());
  }

  sendMessage(message: any): void {
    this.view?.webview.postMessage(message);
  }

  startStream(fileName: string, metadata?: { commands?: { label: string; command: string }[]; mainFile?: string; hotFile?: { level: string; commits2Weeks: number; uniqueAuthors: number }; owners?: { name: string; commits: number }[] }): void {
    this.show();
    const msg = { type: 'startStream', fileName, metadata };
    // Store start state so visibility replay shows at least metadata while streaming
    this.lastState = { payload: msg };
    this.sendMessage(msg);
  }

  streamChunk(text: string): void {
    this.sendMessage({ type: 'streamChunk', text });
  }

  endStream(): void {
    this.sendMessage({ type: 'endStream' });
  }

  // Call this after streaming completes so tab-switch replays the full result
  setCompleteState(fileName: string, text: string, metadata?: { commands?: { label: string; command: string }[]; mainFile?: string; hotFile?: { level: string; commits2Weeks: number; uniqueAuthors: number }; owners?: { name: string; commits: number }[] }): void {
    this.lastState = {
      payload: { type: 'showComplete', fileName, text, metadata }
    };
  }

  showError(text: string): void {
    this.show();
    const msg = { type: 'error', text };
    this.lastState = { payload: msg };
    this.sendMessage(msg);
  }

  showLoading(fileName: string, text?: string): void {
    this.show();
    const msg = { type: 'loading', fileName, text: text || 'Analyzing...' };
    this.lastState = { payload: msg };
    this.sendMessage(msg);
  }

  private getHtml(): string {
    const htmlPath = path.join(this.context.extensionPath, 'media', 'panel.html');
    return fs.readFileSync(htmlPath, 'utf-8');
  }
}
