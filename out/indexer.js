"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.indexFile = indexFile;
exports.indexWorkspace = indexWorkspace;
const vscode = __importStar(require("vscode"));
const graph_1 = require("./graph");
const SYMBOL_KIND_MAP = {
    [vscode.SymbolKind.Function]: 'function',
    [vscode.SymbolKind.Method]: 'method',
    [vscode.SymbolKind.Class]: 'class',
    [vscode.SymbolKind.Constructor]: 'method',
};
async function indexFile(document) {
    const filePath = document.uri.fsPath;
    const language = document.languageId;
    (0, graph_1.addFileNode)(filePath, language);
    (0, graph_1.clearFileEdges)(filePath);
    const symbols = await getDocumentSymbols(document);
    if (!symbols || symbols.length === 0)
        return;
    for (const symbol of flattenSymbols(symbols)) {
        const nodeType = SYMBOL_KIND_MAP[symbol.kind];
        if (nodeType) {
            (0, graph_1.addSymbolNode)(filePath, symbol.name, nodeType);
        }
    }
    await indexDependencies(document, symbols);
    await indexReferences(document, symbols);
    (0, graph_1.saveToDisk)();
}
async function indexWorkspace(progress) {
    const files = await vscode.workspace.findFiles('**/*.{ts,tsx,js,jsx,py,go,rs,java,cpp,c,h,hpp,rb,php,swift,kt}', '**/node_modules/**', 500);
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
        }
        catch {
            // Skip files that can't be opened
        }
    }
    (0, graph_1.saveToDisk)();
}
async function indexDependencies(document, symbols) {
    const filePath = document.uri.fsPath;
    const seen = new Set();
    const topLevelSymbols = symbols.slice(0, 20);
    const promises = topLevelSymbols.map(async (symbol) => {
        try {
            const definitions = await withTimeout(vscode.commands.executeCommand('vscode.executeDefinitionProvider', document.uri, symbol.range.start), 2000);
            if (!definitions)
                return;
            for (const def of definitions) {
                const defPath = def.uri.fsPath;
                if (defPath !== filePath && !seen.has(defPath)) {
                    seen.add(defPath);
                    (0, graph_1.addImportEdge)(filePath, defPath);
                }
            }
        }
        catch {
            // LSP not available for this symbol
        }
    });
    await Promise.all(promises);
}
async function indexReferences(document, symbols) {
    const filePath = document.uri.fsPath;
    const exportedSymbols = symbols
        .filter((s) => SYMBOL_KIND_MAP[s.kind])
        .slice(0, 15);
    const promises = exportedSymbols.map(async (symbol) => {
        try {
            const references = await withTimeout(vscode.commands.executeCommand('vscode.executeReferenceProvider', document.uri, symbol.range.start), 2000);
            if (!references)
                return;
            for (const ref of references) {
                if (ref.uri.fsPath !== filePath) {
                    (0, graph_1.addReferenceEdge)(ref.uri.fsPath, filePath, symbol.name);
                }
            }
        }
        catch {
            // LSP not available
        }
    });
    await Promise.all(promises);
}
async function getDocumentSymbols(document) {
    try {
        const result = await withTimeout(vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', document.uri), 3000);
        return result ?? undefined;
    }
    catch {
        return undefined;
    }
}
function flattenSymbols(symbols) {
    const result = [];
    for (const symbol of symbols) {
        result.push(symbol);
        if (symbol.children && symbol.children.length > 0) {
            result.push(...flattenSymbols(symbol.children));
        }
    }
    return result;
}
async function withTimeout(thenable, ms) {
    const promise = Promise.resolve(thenable);
    return Promise.race([
        promise,
        new Promise((resolve) => setTimeout(() => resolve(null), ms)),
    ]);
}
//# sourceMappingURL=indexer.js.map