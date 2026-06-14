import * as vscode from 'vscode';
import * as path from 'path';
import { getDependents, getTotalCallSites } from './graph';
import { getGitDiffForFile } from './git';

export interface ChangeContext {
  fileName: string;
  fileContent: string;
  diff: string;
  impactedFiles: { file: string; count: number }[];
  totalCallSites: number;
}

export async function getChangeContext(document: vscode.TextDocument): Promise<ChangeContext | null> {
  const filePath = document.uri.fsPath;
  const fileName = path.basename(filePath);
  const fileContent = document.getText().split('\n').slice(0, 200).join('\n');

  const diff = await getGitDiffForFile(filePath);
  if (!diff) return null;

  const impactedFiles = getDependents(filePath);
  const totalCallSites = getTotalCallSites(filePath);

  return { fileName, fileContent, diff, impactedFiles, totalCallSites };
}
