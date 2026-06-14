import * as vscode from 'vscode';
import * as path from 'path';
import {
  addFileNode,
  addSymbolNode,
  addImportEdge,
  addReferenceEdge,
  clearFileEdges,
  saveToDisk,
  NodeType,
} from './graph';

const SYMBOL_KIND_MAP: Partial<Record<vscode.SymbolKind, NodeType>> = {
  [vscode.SymbolKind.Function]: 'function',
  [vscode.SymbolKind.Method]: 'method',
  [vscode.SymbolKind.Class]: 'class',
  [vscode.SymbolKind.Constructor]: 'method',
};

export async function indexFile(document: vscode.TextDocument): Promise<void> {
  const filePath = document.uri.fsPath;
  const language = document.languageId;

  addFileNode(filePath, language);
  clearFileEdges(filePath);

  const symbols = await getDocumentSymbols(document);
  if (!symbols || symbols.length === 0) return;

  for (const symbol of flattenSymbols(symbols)) {
    const nodeType = SYMBOL_KIND_MAP[symbol.kind];
    if (nodeType) {
      addSymbolNode(filePath, symbol.name, nodeType);
    }
  }

  await indexDependencies(document, symbols);
  await indexReferences(document, symbols);

  saveToDisk();
}

export async function indexWorkspace(
  progress?: vscode.Progress<{ message?: string; increment?: number }>
): Promise<void> {
  const files = await vscode.workspace.findFiles(
    '**/*.{ts,tsx,js,jsx,py,go,rs,java,cpp,c,h,hpp,rb,php,swift,kt}',
    '**/node_modules/**',
    500
  );

  const total = files.length;
  let indexed = 0;

  for (const file of files) {
    try {
      const doc = await vscode.workspace.openTextDocument(file);
      await indexFile(doc);
      indexed++;
      if (progress) {
        progress.report({
          message: `Indexed ${indexed}/${total} files`,
          increment: (1 / total) * 100,
        });
      }
    } catch {
      // Skip files that can't be opened
    }
  }

  saveToDisk();
}

async function indexDependencies(
  document: vscode.TextDocument,
  symbols: vscode.DocumentSymbol[]
): Promise<void> {
  const filePath = document.uri.fsPath;
  const seen = new Set<string>();

  const topLevelSymbols = symbols.slice(0, 20);

  const promises = topLevelSymbols.map(async (symbol) => {
    try {
      const definitions = await withTimeout(
        vscode.commands.executeCommand<vscode.Location[]>(
          'vscode.executeDefinitionProvider',
          document.uri,
          symbol.range.start
        ),
        2000
      );

      if (!definitions) return;

      for (const def of definitions) {
        const defPath = def.uri.fsPath;
        if (defPath !== filePath && !seen.has(defPath)) {
          seen.add(defPath);
          addImportEdge(filePath, defPath);
        }
      }
    } catch {
      // LSP not available for this symbol
    }
  });

  await Promise.all(promises);
}

async function indexReferences(
  document: vscode.TextDocument,
  symbols: vscode.DocumentSymbol[]
): Promise<void> {
  const filePath = document.uri.fsPath;

  const exportedSymbols = symbols
    .filter((s) => SYMBOL_KIND_MAP[s.kind])
    .slice(0, 15);

  const promises = exportedSymbols.map(async (symbol) => {
    try {
      const references = await withTimeout(
        vscode.commands.executeCommand<vscode.Location[]>(
          'vscode.executeReferenceProvider',
          document.uri,
          symbol.range.start
        ),
        2000
      );

      if (!references) return;

      for (const ref of references) {
        if (ref.uri.fsPath !== filePath) {
          addReferenceEdge(ref.uri.fsPath, filePath, symbol.name);
        }
      }
    } catch {
      // LSP not available
    }
  });

  await Promise.all(promises);
}

async function getDocumentSymbols(
  document: vscode.TextDocument
): Promise<vscode.DocumentSymbol[] | undefined> {
  try {
    const result = await withTimeout(
      vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        document.uri
      ),
      3000
    );
    return result ?? undefined;
  } catch {
    return undefined;
  }
}

function flattenSymbols(symbols: vscode.DocumentSymbol[]): vscode.DocumentSymbol[] {
  const result: vscode.DocumentSymbol[] = [];
  for (const symbol of symbols) {
    result.push(symbol);
    if (symbol.children && symbol.children.length > 0) {
      result.push(...flattenSymbols(symbol.children));
    }
  }
  return result;
}

async function withTimeout<T>(thenable: Thenable<T>, ms: number): Promise<T | null> {
  const promise = Promise.resolve(thenable);
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}
