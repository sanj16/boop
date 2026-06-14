import * as vscode from 'vscode';
import * as path from 'path';
import { getDependencies, getDependents, getSymbols, getTotalCallSites } from './graph';
import { getGitLogForFile, getLastEditInfo } from './git';

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
  const gitLog = await getGitLogForFile(filePath);
  const gitBlame = await getLastEditInfo(filePath);

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
  };
}
