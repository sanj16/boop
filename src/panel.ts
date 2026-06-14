import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class BoopPanel {
  private panel: vscode.WebviewPanel | null = null;
  private context: vscode.ExtensionContext;
  private disposeCallbacks: Array<() => void> = [];

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  onDispose(callback: () => void): void {
    this.disposeCallbacks.push(callback);
  }

  get isVisible(): boolean {
    return this.panel !== null;
  }

  show(): void {
    if (this.panel) {
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'boopBrief',
      'boop',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(this.context.extensionPath, 'media'))
        ]
      }
    );

    this.panel.webview.html = this.getHtml();

    this.panel.webview.onDidReceiveMessage(
      (message) => {
        if (message.type === 'close') {
          this.dispose();
        }
      },
      undefined,
      this.context.subscriptions
    );

    this.panel.onDidDispose(() => {
      this.panel = null;
      this.disposeCallbacks.forEach((cb) => cb());
    });
  }

  dispose(): void {
    if (this.panel) {
      this.panel.dispose();
      this.panel = null;
      this.disposeCallbacks.forEach((cb) => cb());
    }
  }

  toggle(): void {
    if (this.panel) {
      this.dispose();
    } else {
      this.show();
    }
  }

  sendMessage(message: any): void {
    if (this.panel) {
      this.panel.webview.postMessage(message);
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
