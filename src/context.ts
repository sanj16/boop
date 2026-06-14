import * as vscode from 'vscode';
import * as path from 'path';
import { getDependencies, getDependents, getSymbols, getTotalCallSites } from './graph';
import { getGitLogForFile, getLastEditInfo, getHotFileInfo, getFileOwners, HotFileInfo, FileOwner } from './git';
import { detectEntrypoint, ProjectEntrypoint } from './entrypoint';

export interface FileContext {
  fileName: string;
  fileContent: string;
  language: string;
  dependencies: string[];
  dependents: { file: string; count: number }[];
  totalCallSites: number;
  symbols: string[];
  gitLog: string;
  gitBlame: string;
  hotFile: HotFileInfo;
  owners: FileOwner[];
  entrypoint: ProjectEntrypoint | null;
}

export async function gatherFileContext(document: vscode.TextDocument): Promise<FileContext> {
  const filePath = document.uri.fsPath;
  const fileName = path.basename(filePath);
  const fileContent = document.getText().split('\n').slice(0, 200).join('\n');
  const language = document.languageId;

  const dependencies = getDependencies(filePath);
  const dependents = getDependents(filePath);
  const totalCallSites = getTotalCallSites(filePath);
  const symbols = getSymbols(filePath);

  const [gitLog, gitBlame, hotFile, owners, entrypoint] = await Promise.all([
    getGitLogForFile(filePath),
    getLastEditInfo(filePath),
    getHotFileInfo(filePath),
    getFileOwners(filePath),
    detectEntrypoint(),
  ]);

  return {
    fileName,
    fileContent,
    language,
    dependencies,
    dependents,
    totalCallSites,
    symbols,
    gitLog,
    gitBlame,
    hotFile,
    owners,
    entrypoint,
  };
}
