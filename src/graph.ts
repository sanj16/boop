import Graph from 'graphology';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export type NodeType = 'file' | 'function' | 'class' | 'method';
export type EdgeType = 'imports' | 'contains' | 'called_by' | 'references';

interface NodeAttributes {
  type: NodeType;
  filePath?: string;
  language?: string;
  lastIndexed?: number;
}

interface EdgeAttributes {
  type: EdgeType;
  count?: number;
}

let graph: Graph<NodeAttributes, EdgeAttributes>;
let storagePath: string;

export function initGraph(context: vscode.ExtensionContext): void {
  storagePath = path.join(context.globalStorageUri.fsPath, 'graph.json');
  graph = new Graph({ type: 'directed', allowSelfLoops: false, multi: false });
  loadFromDisk();
}

export function getGraph(): Graph<NodeAttributes, EdgeAttributes> {
  return graph;
}

export function addFileNode(filePath: string, language: string): void {
  const key = fileKey(filePath);
  if (graph.hasNode(key)) {
    graph.setNodeAttribute(key, 'lastIndexed', Date.now());
  } else {
    graph.addNode(key, { type: 'file', filePath, language, lastIndexed: Date.now() });
  }
}

export function addSymbolNode(filePath: string, symbolName: string, symbolType: NodeType): void {
  const fileK = fileKey(filePath);
  const symbolK = symbolKey(filePath, symbolName);

  if (!graph.hasNode(fileK)) {
    addFileNode(filePath, '');
  }

  if (!graph.hasNode(symbolK)) {
    graph.addNode(symbolK, { type: symbolType, filePath });
  }

  const edgeKey = `${fileK}->contains->${symbolK}`;
  if (!graph.hasEdge(edgeKey)) {
    graph.addEdgeWithKey(edgeKey, fileK, symbolK, { type: 'contains' });
  }
}

export function addImportEdge(fromFile: string, toFile: string): void {
  const fromK = fileKey(fromFile);
  const toK = fileKey(toFile);

  if (!graph.hasNode(fromK)) addFileNode(fromFile, '');
  if (!graph.hasNode(toK)) addFileNode(toFile, '');

  const edgeKey = `${fromK}->imports->${toK}`;
  if (!graph.hasEdge(edgeKey)) {
    graph.addEdgeWithKey(edgeKey, fromK, toK, { type: 'imports' });
  }
}

export function addReferenceEdge(fromFile: string, toFile: string, symbolName: string): void {
  const fromK = fileKey(fromFile);
  const toK = fileKey(toFile);

  if (!graph.hasNode(fromK)) addFileNode(fromFile, '');
  if (!graph.hasNode(toK)) addFileNode(toFile, '');

  const edgeKey = `${fromK}->references->${toK}:${symbolName}`;
  if (graph.hasEdge(edgeKey)) {
    const count = graph.getEdgeAttribute(edgeKey, 'count') || 0;
    graph.setEdgeAttribute(edgeKey, 'count', count + 1);
  } else {
    graph.addEdgeWithKey(edgeKey, fromK, toK, { type: 'references', count: 1 });
  }
}

export function getDependencies(filePath: string): string[] {
  const key = fileKey(filePath);
  if (!graph.hasNode(key)) return [];

  const deps: string[] = [];
  graph.forEachOutEdge(key, (_edge, attr, _src, target) => {
    if (attr.type === 'imports') {
      deps.push(path.basename(target));
    }
  });
  return deps;
}

export function getDependents(filePath: string): { file: string; count: number }[] {
  const key = fileKey(filePath);
  if (!graph.hasNode(key)) return [];

  const dependentMap = new Map<string, number>();

  graph.forEachInEdge(key, (_edge, attr, source) => {
    if (attr.type === 'imports' || attr.type === 'references') {
      const existing = dependentMap.get(source) || 0;
      dependentMap.set(source, existing + (attr.count || 1));
    }
  });

  return Array.from(dependentMap.entries())
    .map(([file, count]) => ({ file: path.basename(file), count }))
    .sort((a, b) => b.count - a.count);
}

export function getSymbols(filePath: string): string[] {
  const key = fileKey(filePath);
  if (!graph.hasNode(key)) return [];

  const symbols: string[] = [];
  graph.forEachOutEdge(key, (_edge, attr, _src, target) => {
    if (attr.type === 'contains') {
      const name = target.split(':').pop() || target;
      symbols.push(name);
    }
  });
  return symbols;
}

export function getTotalCallSites(filePath: string): number {
  const key = fileKey(filePath);
  if (!graph.hasNode(key)) return 0;

  let total = 0;
  graph.forEachInEdge(key, (_edge, attr) => {
    if (attr.type === 'references') {
      total += attr.count || 1;
    }
  });
  return total;
}

export function clearFileEdges(filePath: string): void {
  const key = fileKey(filePath);
  if (!graph.hasNode(key)) return;

  const edgesToDrop: string[] = [];
  graph.forEachOutEdge(key, (edge) => {
    edgesToDrop.push(edge);
  });
  edgesToDrop.forEach((e) => graph.dropEdge(e));
}

export function saveToDisk(): void {
  try {
    const dir = path.dirname(storagePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const data = graph.export();
    fs.writeFileSync(storagePath, JSON.stringify(data));
  } catch {
    // Silent fail — graph persistence is best-effort
  }
}

function loadFromDisk(): void {
  try {
    if (fs.existsSync(storagePath)) {
      const raw = fs.readFileSync(storagePath, 'utf-8');
      const data = JSON.parse(raw);
      graph.import(data);
    }
  } catch {
    // Corrupted file — start fresh
    graph.clear();
  }
}

function fileKey(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function symbolKey(filePath: string, symbolName: string): string {
  return `${fileKey(filePath)}:${symbolName}`;
}
