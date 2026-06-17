import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class BoopPanel implements vscode.WebviewViewProvider {
  public static readonly viewId = 'boop.panel';
  public static readonly viewIdCursor = 'boop.panel.cursor';

  private view: vscode.WebviewView | null = null;
  private context: vscode.ExtensionContext;
  private disposeCallbacks: Array<() => void> = [];
  private pendingMessages: any[] = [];

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(this.context.extensionPath, 'media'))
      ]
    };

    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage(
      (message) => {
        if (message.type === 'close') {
          // Hide the sidebar
          vscode.commands.executeCommand('workbench.action.closeSidebar');
        }
      },
      undefined,
      this.context.subscriptions
    );

    webviewView.onDidDispose(() => {
      this.view = null;
      this.disposeCallbacks.forEach((cb) => cb());
    });

    // Send any messages that were queued before the view was ready
    for (const msg of this.pendingMessages) {
      webviewView.webview.postMessage(msg);
    }
    this.pendingMessages = [];
  }

  onDispose(callback: () => void): void {
    this.disposeCallbacks.push(callback);
  }

  get isVisible(): boolean {
    return this.view?.visible ?? false;
  }

  show(): void {
    if (this.view) {
      this.view.show?.(true);
    } else {
      // Reveal the boop sidebar which will trigger resolveWebviewView
      vscode.commands.executeCommand('boop.panel.focus');
    }
  }

  dispose(): void {
    // For sidebar views, we just hide it
    vscode.commands.executeCommand('workbench.action.closeSidebar');
    this.disposeCallbacks.forEach((cb) => cb());
  }

  sendMessage(message: any): void {
    if (this.view) {
      this.view.webview.postMessage(message);
    } else {
      this.pendingMessages.push(message);
    }
  }

  startStream(fileName: string, metadata?: { commands?: { label: string; command: string }[]; mainFile?: string; hotFile?: { level: string; commits2Weeks: number; uniqueAuthors: number }; owners?: { name: string; commits: number }[] }): void {
    this.show();
    this.sendMessage({ type: 'startStream', fileName, metadata });
  }

  streamChunk(text: string): void {
    this.sendMessage({ type: 'streamChunk', text });
  }

  endStream(): void {
    this.sendMessage({ type: 'endStream' });
  }

  showError(text: string): void {
    this.show();
    this.sendMessage({ type: 'error', text });
  }

  showLoading(fileName: string, text?: string): void {
    this.show();
    this.sendMessage({ type: 'loading', fileName, text: text || 'Analyzing...' });
  }

  private getHtml(): string {
    const htmlPath = path.join(this.context.extensionPath, 'media', 'panel.html');
    return fs.readFileSync(htmlPath, 'utf-8');
  }
}
