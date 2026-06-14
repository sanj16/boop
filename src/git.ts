import { execFileSync } from 'child_process';
import * as vscode from 'vscode';
import * as path from 'path';

interface GitExtensionAPI {
  getAPI(version: number): { git: { path: string } };
}

let gitBinaryPath: string = '';

async function resolveGitBinary(): Promise<string> {
  if (gitBinaryPath) return gitBinaryPath;

  // Try to get path from VS Code's git extension (most reliable — works on all platforms)
  const gitExtension = vscode.extensions.getExtension<GitExtensionAPI>('vscode.git');
  if (gitExtension) {
    if (!gitExtension.isActive) {
      await gitExtension.activate();
    }
    try {
      const api = gitExtension.exports.getAPI(1);
      if (api?.git?.path) {
        gitBinaryPath = api.git.path;
        return gitBinaryPath;
      }
    } catch {
      // Fall through
    }
  }

  // Check user config
  const configured = vscode.workspace.getConfiguration('git').get<string>('path');
  if (configured) {
    gitBinaryPath = configured;
    return gitBinaryPath;
  }

  gitBinaryPath = 'git';
  return gitBinaryPath;
}

function getWorkingDir(filePath: string): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder?.uri.fsPath || path.dirname(filePath);
}

function getEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (process.platform === 'win32') {
    env.PATH = `${env.PATH || ''};C:\\Program Files\\Git\\cmd;C:\\Program Files (x86)\\Git\\cmd`;
  } else {
    env.PATH = `${env.PATH || ''}:/usr/bin:/usr/local/bin:/opt/homebrew/bin`;
  }
  return env;
}

function execGit(git: string, args: string[], cwd: string): string {
  return execFileSync(git, args, {
    cwd,
    encoding: 'utf-8',
    timeout: 5000,
    env: getEnv(),
  }).trim();
}

async function getRepoRoot(filePath: string): Promise<string> {
  const fileDir = path.dirname(filePath);
  const git = await resolveGitBinary();
  try {
    return execGit(git, ['rev-parse', '--show-toplevel'], fileDir);
  } catch {
    return getWorkingDir(filePath);
  }
}

export async function getGitDiffForFile(filePath: string): Promise<string> {
  const git = await resolveGitBinary();
  const repoRoot = await getRepoRoot(filePath);
  const relativePath = path.relative(repoRoot, filePath);

  try {
    const unstaged = execGit(git, ['diff', '--', relativePath], repoRoot);
    const staged = execGit(git, ['diff', '--cached', '--', relativePath], repoRoot);
    if (staged && unstaged) return `${unstaged}\n${staged}`;
    if (staged) return staged;
    return unstaged;
  } catch (e: any) {
    console.error('[boop] git diff failed:', e.message);
    return '';
  }
}

export async function getGitLogForFile(filePath: string, maxEntries: number = 5): Promise<string> {
  const git = await resolveGitBinary();
  const repoRoot = await getRepoRoot(filePath);
  const relativePath = path.relative(repoRoot, filePath);
  try {
    return execGit(git, ['log', `--format=%ar | %s`, `-${maxEntries}`, '--', relativePath], repoRoot);
  } catch {
    return '';
  }
}

export async function getLastEditInfo(filePath: string): Promise<string> {
  const git = await resolveGitBinary();
  const repoRoot = await getRepoRoot(filePath);
  const relativePath = path.relative(repoRoot, filePath);
  try {
    return execGit(git, ['log', '--format=%h %ar %an', '-1', '--', relativePath], repoRoot);
  } catch {
    return '';
  }
}

export interface HotFileInfo {
  commits2Weeks: number;
  uniqueAuthors: number;
  level: 'stable' | 'active' | 'hot';
}

export async function getHotFileInfo(filePath: string): Promise<HotFileInfo> {
  const git = await resolveGitBinary();
  const repoRoot = await getRepoRoot(filePath);
  const relativePath = path.relative(repoRoot, filePath);

  let commits2Weeks = 0;
  let uniqueAuthors = 0;

  try {
    const log = execGit(git, ['log', '--since=2 weeks ago', '--format=%an', '--', relativePath], repoRoot);
    if (log) {
      const lines = log.split('\n').filter(Boolean);
      commits2Weeks = lines.length;
      uniqueAuthors = new Set(lines).size;
    }
  } catch {
    // No git history
  }

  let level: 'stable' | 'active' | 'hot' = 'stable';
  if (commits2Weeks >= 8 || uniqueAuthors >= 3) {
    level = 'hot';
  } else if (commits2Weeks >= 3 || uniqueAuthors >= 2) {
    level = 'active';
  }

  return { commits2Weeks, uniqueAuthors, level };
}

export interface FileOwner {
  name: string;
  commits: number;
}

export async function getFileOwners(filePath: string, maxOwners: number = 3): Promise<FileOwner[]> {
  const git = await resolveGitBinary();
  const repoRoot = await getRepoRoot(filePath);
  const relativePath = path.relative(repoRoot, filePath);

  try {
    const output = execGit(git, ['shortlog', '-sn', '--no-merges', 'HEAD', '--', relativePath], repoRoot);
    if (!output) return [];

    return output
      .split('\n')
      .filter(Boolean)
      .slice(0, maxOwners)
      .map((line) => {
        const match = line.trim().match(/^(\d+)\s+(.+)$/);
        if (!match) return { name: 'unknown', commits: 0 };
        return { name: match[2].trim(), commits: parseInt(match[1], 10) };
      });
  } catch {
    return [];
  }
}

