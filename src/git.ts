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

export async function debugGit(filePath: string): Promise<string> {
  const lines: string[] = [];

  // 1. Git binary resolution
  const gitExtension = vscode.extensions.getExtension('vscode.git');
  lines.push(`git ext found: ${!!gitExtension}`);
  lines.push(`git ext active: ${gitExtension?.isActive}`);

  let git = 'git';
  try {
    git = await resolveGitBinary();
    lines.push(`resolved binary: ${git}`);
  } catch (e: any) {
    lines.push(`binary resolve FAILED: ${e.message}`);
  }

  // 2. Working dir
  const cwd = getWorkingDir(filePath);
  lines.push(`workingDir: ${cwd}`);
  lines.push(`filePath: ${filePath}`);

  // 3. Try rev-parse
  try {
    const root = execGit(git, ['rev-parse', '--show-toplevel'], cwd);
    lines.push(`repoRoot: ${root}`);
    const rel = path.relative(root, filePath);
    lines.push(`relativePath: ${rel}`);

    // 4. Try diff
    try {
      const diff = execGit(git, ['diff', '--', rel], root);
      lines.push(`diff length: ${diff.length}`);
      lines.push(`diff preview: ${diff.substring(0, 100)}`);
    } catch (e: any) {
      lines.push(`diff FAILED: ${e.message}`);
    }

    // 5. Try log
    try {
      const log = execGit(git, ['log', '--format=%ar | %s', '-3', '--', rel], root);
      lines.push(`log: ${log.substring(0, 150)}`);
    } catch (e: any) {
      lines.push(`log FAILED: ${e.message}`);
    }
  } catch (e: any) {
    lines.push(`rev-parse FAILED: ${e.message}`);
  }

  // 6. Env PATH
  lines.push(`PATH: ${(process.env.PATH || '').substring(0, 200)}`);

  return lines.join('\n');
}
