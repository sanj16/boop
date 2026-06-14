import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface ProjectEntrypoint {
  mainFile: string;
  commands: { label: string; command: string }[];
}

export async function detectEntrypoint(): Promise<ProjectEntrypoint | null> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) return null;

  const root = workspaceFolder.uri.fsPath;

  // Check .boop.json override first
  const boopConfig = readBoopConfig(root);
  if (boopConfig) return boopConfig;

  // Auto-detect from project config files
  return autoDetect(root);
}

function readBoopConfig(root: string): ProjectEntrypoint | null {
  const configPath = path.join(root, '.boop.json');
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(raw);
      if (config.mainFile && config.commands) {
        return {
          mainFile: config.mainFile,
          commands: config.commands,
        };
      }
    }
  } catch {
    // Invalid config, fall through to auto-detect
  }
  return null;
}

function autoDetect(root: string): ProjectEntrypoint | null {
  // Try package.json (Node.js)
  const pkgResult = tryPackageJson(root);
  if (pkgResult) return pkgResult;

  // Try pyproject.toml / setup.py (Python)
  const pyResult = tryPython(root);
  if (pyResult) return pyResult;

  // Try Cargo.toml (Rust)
  const cargoResult = tryCargo(root);
  if (cargoResult) return cargoResult;

  // Try go.mod (Go)
  const goResult = tryGo(root);
  if (goResult) return goResult;

  // Try Makefile
  const makeResult = tryMakefile(root);
  if (makeResult) return makeResult;

  // Try Dockerfile
  const dockerResult = tryDockerfile(root);
  if (dockerResult) return dockerResult;

  return null;
}

function tryPackageJson(root: string): ProjectEntrypoint | null {
  const pkgPath = path.join(root, 'package.json');
  try {
    if (!fs.existsSync(pkgPath)) return null;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    const mainFile = pkg.main || 'index.js';
    const commands: { label: string; command: string }[] = [];

    if (pkg.scripts) {
      if (pkg.scripts.dev) commands.push({ label: 'Dev', command: `npm run dev` });
      if (pkg.scripts.start) commands.push({ label: 'Start', command: `npm start` });
      if (pkg.scripts.build) commands.push({ label: 'Build', command: `npm run build` });
      if (pkg.scripts.test) commands.push({ label: 'Test', command: `npm test` });
      if (pkg.scripts.lint) commands.push({ label: 'Lint', command: `npm run lint` });
    }

    if (commands.length === 0 && mainFile) {
      commands.push({ label: 'Run', command: `node ${mainFile}` });
    }

    return { mainFile, commands };
  } catch {
    return null;
  }
}

function tryPython(root: string): ProjectEntrypoint | null {
  // Check pyproject.toml
  const pyprojectPath = path.join(root, 'pyproject.toml');
  if (fs.existsSync(pyprojectPath)) {
    const content = fs.readFileSync(pyprojectPath, 'utf-8');
    const commands: { label: string; command: string }[] = [];

    // Look for scripts section
    const scriptMatch = content.match(/\[tool\.poetry\.scripts\]\s*\n([\s\S]*?)(?:\n\[|$)/);
    if (scriptMatch) {
      commands.push({ label: 'Run', command: 'poetry run start' });
    }

    commands.push({ label: 'Install', command: 'pip install -e .' });
    commands.push({ label: 'Test', command: 'pytest' });

    const mainFile = fs.existsSync(path.join(root, 'main.py')) ? 'main.py'
      : fs.existsSync(path.join(root, 'app.py')) ? 'app.py'
      : 'main.py';

    commands.unshift({ label: 'Run', command: `python ${mainFile}` });
    return { mainFile, commands };
  }

  // Check for main.py / app.py
  if (fs.existsSync(path.join(root, 'main.py'))) {
    return {
      mainFile: 'main.py',
      commands: [
        { label: 'Run', command: 'python main.py' },
        { label: 'Test', command: 'pytest' },
      ],
    };
  }
  if (fs.existsSync(path.join(root, 'app.py'))) {
    return {
      mainFile: 'app.py',
      commands: [
        { label: 'Run', command: 'python app.py' },
        { label: 'Flask', command: 'flask run' },
      ],
    };
  }
  if (fs.existsSync(path.join(root, 'manage.py'))) {
    return {
      mainFile: 'manage.py',
      commands: [
        { label: 'Run', command: 'python manage.py runserver' },
        { label: 'Migrate', command: 'python manage.py migrate' },
        { label: 'Test', command: 'python manage.py test' },
      ],
    };
  }

  return null;
}

function tryCargo(root: string): ProjectEntrypoint | null {
  const cargoPath = path.join(root, 'Cargo.toml');
  if (!fs.existsSync(cargoPath)) return null;

  return {
    mainFile: 'src/main.rs',
    commands: [
      { label: 'Run', command: 'cargo run' },
      { label: 'Build', command: 'cargo build' },
      { label: 'Test', command: 'cargo test' },
    ],
  };
}

function tryGo(root: string): ProjectEntrypoint | null {
  const goModPath = path.join(root, 'go.mod');
  if (!fs.existsSync(goModPath)) return null;

  const mainFile = fs.existsSync(path.join(root, 'cmd', 'main.go')) ? 'cmd/main.go' : 'main.go';

  return {
    mainFile,
    commands: [
      { label: 'Run', command: 'go run .' },
      { label: 'Build', command: 'go build .' },
      { label: 'Test', command: 'go test ./...' },
    ],
  };
}

function tryMakefile(root: string): ProjectEntrypoint | null {
  const makePath = path.join(root, 'Makefile');
  if (!fs.existsSync(makePath)) return null;

  const content = fs.readFileSync(makePath, 'utf-8');
  const commands: { label: string; command: string }[] = [];

  const targets = content.match(/^([a-zA-Z_-]+):/gm);
  if (targets) {
    for (const target of targets.slice(0, 5)) {
      const name = target.replace(':', '');
      commands.push({ label: name, command: `make ${name}` });
    }
  }

  return commands.length > 0 ? { mainFile: 'Makefile', commands } : null;
}

function tryDockerfile(root: string): ProjectEntrypoint | null {
  const dockerPath = path.join(root, 'Dockerfile');
  if (!fs.existsSync(dockerPath)) return null;

  const commands: { label: string; command: string }[] = [
    { label: 'Build', command: 'docker build -t app .' },
    { label: 'Run', command: 'docker run app' },
  ];

  // Check docker-compose
  if (fs.existsSync(path.join(root, 'docker-compose.yml')) || fs.existsSync(path.join(root, 'compose.yml'))) {
    commands.unshift({ label: 'Up', command: 'docker compose up' });
  }

  return { mainFile: 'Dockerfile', commands };
}
