import * as vscode from 'vscode';
import { BoopPanel } from './panel';
import { initGraph, saveToDisk } from './graph';
import { indexFile, indexWorkspace } from './indexer';
import { gatherFileContext } from './context';
import { getChangeContext } from './changes';
import { streamCompletion, resetClient } from './ai';
import { BRIEF_SYSTEM_PROMPT, buildBriefPrompt, CHANGES_SYSTEM_PROMPT, buildChangesPrompt } from './prompts';

let boopPanel: BoopPanel;

export function activate(context: vscode.ExtensionContext) {
  initGraph(context);
  boopPanel = new BoopPanel(context);

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

  const showBriefCmd = vscode.commands.registerCommand('boop.showBrief', () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage('boop: Open a file first');
      return;
    }

    if (boopPanel.isVisible) {
      boopPanel.dispose();
    } else {
      runBrief(editor.document);
    }
  });

  const reviewChangesCmd = vscode.commands.registerCommand('boop.reviewChanges', () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage('boop: Open a file first');
      return;
    }
    runChangeReview(editor.document);
  });

  const debugGitCmd = vscode.commands.registerCommand('boop.debugGit', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage('boop: Open a file first');
      return;
    }
    const filePath = editor.document.uri.fsPath;
    const { debugGit } = await import('./git');
    const info = await debugGit(filePath);
    vscode.window.showInformationMessage(info, { modal: true });
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

    await indexFile(editor.document);

    const config = vscode.workspace.getConfiguration('boop');
    if (config.get<boolean>('autoShow')) {
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
    showBriefCmd, reviewChangesCmd, debugGitCmd, configChange, fileSave, fileOpen,
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
  const fileName = document.fileName.split('/').pop() || 'unknown';

  boopPanel.showLoading(fileName, 'Gathering context...');

  try {
    const ctx = await gatherFileContext(document);
    const userPrompt = buildBriefPrompt(ctx);

    boopPanel.startStream(ctx.fileName);

    await streamCompletion(
      BRIEF_SYSTEM_PROMPT,
      userPrompt,
      (chunk) => boopPanel.streamChunk(chunk),
      () => boopPanel.endStream(),
      (error) => boopPanel.showError(error)
    );
  } catch (error: any) {
    boopPanel.showError(error.message || 'Failed to generate brief');
  }
}

async function runChangeReview(document: vscode.TextDocument) {
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

    boopPanel.startStream(`${ctx.fileName} — impact`);

    await streamCompletion(
      CHANGES_SYSTEM_PROMPT,
      userPrompt,
      (chunk) => boopPanel.streamChunk(chunk),
      () => boopPanel.endStream(),
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
