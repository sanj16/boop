import * as vscode from 'vscode';
import { BoopPanel } from './panel';
import { initGraph, saveToDisk } from './graph';
import { indexFile, indexWorkspace } from './indexer';
import { gatherFileContext } from './context';
import { getChangeContext } from './changes';
import { streamCompletion, resetClient, cancelCurrentStream } from './ai';
import { BRIEF_SYSTEM_PROMPT, buildBriefPrompt, CHANGES_SYSTEM_PROMPT, buildChangesPrompt } from './prompts';

let boopPanel: BoopPanel;

interface CacheEntry {
  brief?: string;
  briefMeta?: { commands?: { label: string; command: string }[]; mainFile?: string; hotFile?: { level: string; commits2Weeks: number; uniqueAuthors: number }; owners?: { name: string; commits: number }[] };
  changes?: string;
}
const cache = new Map<string, CacheEntry>();

function getCacheKey(doc: vscode.TextDocument): string {
  return doc.uri.fsPath;
}

function clearCache(filePath?: string) {
  if (filePath) {
    cache.delete(filePath);
  } else {
    cache.clear();
  }
}

export function activate(context: vscode.ExtensionContext) {
  initGraph(context);
  boopPanel = new BoopPanel(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(BoopPanel.viewId, boopPanel, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );


  // Clear cache when panel is fully closed
  boopPanel.onDispose(() => {
    clearCache();
  });

  // Status bar buttons (always visible)
  const infoButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  infoButton.text = '🐶 ℹ️';
  infoButton.tooltip = 'Show file brief — what this file does, who uses it, watch-outs';
  infoButton.command = 'boop.showBrief';
  infoButton.show();

  const refreshButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
  refreshButton.text = '🐶↻';
  refreshButton.tooltip = 'Review uncommitted changes — impact analysis';
  refreshButton.command = 'boop.reviewChanges';
  refreshButton.show();

  let lastMode: 'brief' | 'changes' | null = null;
  let lastDocument: vscode.TextDocument | null = null;

  const showBriefCmd = vscode.commands.registerCommand('boop.showBrief', () => {
    const editor = vscode.window.activeTextEditor;
    const doc = editor?.document || lastDocument;
    if (!doc) {
      vscode.window.showInformationMessage('boop: Open a file first');
      return;
    }

    if (boopPanel.isVisible && lastMode === 'brief') {
      boopPanel.dispose();
      lastMode = null;
    } else {
      cancelCurrentStream();
      lastMode = 'brief';
      lastDocument = doc;
      runBrief(doc);
    }
  });

  const reviewChangesCmd = vscode.commands.registerCommand('boop.reviewChanges', () => {
    const editor = vscode.window.activeTextEditor;
    const doc = editor?.document || lastDocument;
    if (!doc) {
      vscode.window.showInformationMessage('boop: Open a file first');
      return;
    }

    if (boopPanel.isVisible && lastMode === 'changes') {
      boopPanel.dispose();
      lastMode = null;
    } else {
      cancelCurrentStream();
      lastMode = 'changes';
      lastDocument = doc;
      runChangeReview(doc);
    }
  });


  const configChange = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('boop.anthropicApiKey')) {
      resetClient();
    }
  });

  const fileSave = vscode.workspace.onDidSaveTextDocument(async (document) => {
    await indexFile(document);
  });

  const fileOpen = vscode.window.onDidChangeActiveTextEditor(async (editor) => {
    if (!editor) return;
    // Ignore non-file schemes (output panels, settings, webviews)
    if (editor.document.uri.scheme !== 'file') return;

    lastDocument = editor.document;
    await indexFile(editor.document);

    const config = vscode.workspace.getConfiguration('boop');
    if (config.get<boolean>('autoShow')) {
      cancelCurrentStream();
      lastMode = 'brief';
      runBrief(editor.document);
    }
  });

  // Index workspace on activation (background, non-blocking)
  vscode.window.withProgress(
    { location: vscode.ProgressLocation.Window, title: 'boop: indexing workspace' },
    async (progress) => {
      await indexWorkspace(progress);
    }
  );

  context.subscriptions.push(
    showBriefCmd, reviewChangesCmd, configChange, fileSave, fileOpen,
    infoButton, refreshButton
  );

  context.subscriptions.push({
    dispose: () => {
      saveToDisk();
      boopPanel?.dispose();
    },
  });
}

async function runBrief(document: vscode.TextDocument) {
  const key = getCacheKey(document);
  const cached = cache.get(key);

  // If cached, replay instantly with full state
  if (cached?.brief) {
    const fileName = document.fileName.split('/').pop() || 'unknown';
    boopPanel.show();
    boopPanel.setCompleteState(fileName, cached.brief, cached.briefMeta);
    boopPanel.sendMessage({ type: 'showComplete', fileName, text: cached.brief, metadata: cached.briefMeta });
    return;
  }

  const fileName = document.fileName.split('/').pop() || 'unknown';
  boopPanel.showLoading(fileName, 'Gathering context...');

  try {
    const ctx = await gatherFileContext(document);
    const userPrompt = buildBriefPrompt(ctx);
    const metadata = {
      commands: ctx.entrypoint?.commands,
      mainFile: ctx.entrypoint?.mainFile,
      hotFile: ctx.hotFile,
      owners: ctx.owners,
    };

    boopPanel.startStream(ctx.fileName, metadata);

    let fullText = '';

    await streamCompletion(
      BRIEF_SYSTEM_PROMPT,
      userPrompt,
      (chunk) => {
        fullText += chunk;
        boopPanel.streamChunk(chunk);
      },
      () => {
        boopPanel.endStream();
        boopPanel.setCompleteState(ctx.fileName, fullText, metadata);
        const entry = cache.get(key) || {};
        entry.brief = fullText;
        entry.briefMeta = metadata;
        cache.set(key, entry);
      },
      (error) => boopPanel.showError(error)
    );
  } catch (error: any) {
    boopPanel.showError(error.message || 'Failed to generate brief');
  }
}

async function runChangeReview(document: vscode.TextDocument) {
  const key = getCacheKey(document);
  const cached = cache.get(key);

  // If cached, replay instantly with full state
  if (cached?.changes) {
    const fileName = document.fileName.split('/').pop() || 'unknown';
    const changesFileName = `${fileName} — impact`;
    boopPanel.show();
    boopPanel.setCompleteState(changesFileName, cached.changes);
    boopPanel.sendMessage({ type: 'showComplete', fileName: changesFileName, text: cached.changes });
    return;
  }

  const fileName = document.fileName.split('/').pop() || 'unknown';
  boopPanel.showLoading(fileName, 'Checking changes...');

  const ctx = await getChangeContext(document);

  if (!ctx) {
    boopPanel.show();
    boopPanel.startStream(fileName);
    boopPanel.streamChunk('No uncommitted changes in this file.');
    boopPanel.endStream();
    return;
  }

  try {
    const userPrompt = buildChangesPrompt(ctx);

    const changesFileName = `${ctx.fileName} — impact`;
    boopPanel.startStream(changesFileName);

    let fullText = '';

    await streamCompletion(
      CHANGES_SYSTEM_PROMPT,
      userPrompt,
      (chunk) => {
        fullText += chunk;
        boopPanel.streamChunk(chunk);
      },
      () => {
        boopPanel.endStream();
        boopPanel.setCompleteState(changesFileName, fullText);
        const entry = cache.get(key) || {};
        entry.changes = fullText;
        cache.set(key, entry);
      },
      (error) => boopPanel.showError(error)
    );
  } catch (error: any) {
    boopPanel.showError(error.message || 'Failed to review changes');
  }
}

export function deactivate() {
  saveToDisk();
  boopPanel?.dispose();
}
