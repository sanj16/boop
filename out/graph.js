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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initGraph = initGraph;
exports.getGraph = getGraph;
exports.addFileNode = addFileNode;
exports.addSymbolNode = addSymbolNode;
exports.addImportEdge = addImportEdge;
exports.addReferenceEdge = addReferenceEdge;
exports.getDependencies = getDependencies;
exports.getDependents = getDependents;
exports.getSymbols = getSymbols;
exports.getTotalCallSites = getTotalCallSites;
exports.clearFileEdges = clearFileEdges;
exports.saveToDisk = saveToDisk;
const graphology_1 = __importDefault(require("graphology"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
let graph;
let storagePath;
function initGraph(context) {
    storagePath = path.join(context.globalStorageUri.fsPath, 'graph.json');
    graph = new graphology_1.default({ type: 'directed', allowSelfLoops: false, multi: false });
    loadFromDisk();
}
function getGraph() {
    return graph;
}
function addFileNode(filePath, language) {
    const key = fileKey(filePath);
    if (graph.hasNode(key)) {
        graph.setNodeAttribute(key, 'lastIndexed', Date.now());
    }
    else {
        graph.addNode(key, { type: 'file', filePath, language, lastIndexed: Date.now() });
    }
}
function addSymbolNode(filePath, symbolName, symbolType) {
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
function addImportEdge(fromFile, toFile) {
    const fromK = fileKey(fromFile);
    const toK = fileKey(toFile);
    if (!graph.hasNode(fromK))
        addFileNode(fromFile, '');
    if (!graph.hasNode(toK))
        addFileNode(toFile, '');
    const edgeKey = `${fromK}->imports->${toK}`;
    if (!graph.hasEdge(edgeKey)) {
        graph.addEdgeWithKey(edgeKey, fromK, toK, { type: 'imports' });
    }
}
function addReferenceEdge(fromFile, toFile, symbolName) {
    const fromK = fileKey(fromFile);
    const toK = fileKey(toFile);
    if (!graph.hasNode(fromK))
        addFileNode(fromFile, '');
    if (!graph.hasNode(toK))
        addFileNode(toFile, '');
    const edgeKey = `${fromK}->references->${toK}:${symbolName}`;
    if (graph.hasEdge(edgeKey)) {
        const count = graph.getEdgeAttribute(edgeKey, 'count') || 0;
        graph.setEdgeAttribute(edgeKey, 'count', count + 1);
    }
    else {
        graph.addEdgeWithKey(edgeKey, fromK, toK, { type: 'references', count: 1 });
    }
}
function getDependencies(filePath) {
    const key = fileKey(filePath);
    if (!graph.hasNode(key))
        return [];
    const deps = [];
    graph.forEachOutEdge(key, (_edge, attr, _src, target) => {
        if (attr.type === 'imports') {
            deps.push(path.basename(target));
        }
    });
    return deps;
}
function getDependents(filePath) {
    const key = fileKey(filePath);
    if (!graph.hasNode(key))
        return [];
    const dependentMap = new Map();
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
function getSymbols(filePath) {
    const key = fileKey(filePath);
    if (!graph.hasNode(key))
        return [];
    const symbols = [];
    graph.forEachOutEdge(key, (_edge, attr, _src, target) => {
        if (attr.type === 'contains') {
            const name = target.split(':').pop() || target;
            symbols.push(name);
        }
    });
    return symbols;
}
function getTotalCallSites(filePath) {
    const key = fileKey(filePath);
    if (!graph.hasNode(key))
        return 0;
    let total = 0;
    graph.forEachInEdge(key, (_edge, attr) => {
        if (attr.type === 'references') {
            total += attr.count || 1;
        }
    });
    return total;
}
function clearFileEdges(filePath) {
    const key = fileKey(filePath);
    if (!graph.hasNode(key))
        return;
    const edgesToDrop = [];
    graph.forEachOutEdge(key, (edge) => {
        edgesToDrop.push(edge);
    });
    edgesToDrop.forEach((e) => graph.dropEdge(e));
}
function saveToDisk() {
    try {
        const dir = path.dirname(storagePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const data = graph.export();
        fs.writeFileSync(storagePath, JSON.stringify(data));
    }
    catch {
        // Silent fail — graph persistence is best-effort
    }
}
function loadFromDisk() {
    try {
        if (fs.existsSync(storagePath)) {
            const raw = fs.readFileSync(storagePath, 'utf-8');
            const data = JSON.parse(raw);
            graph.import(data);
        }
    }
    catch {
        // Corrupted file — start fresh
        graph.clear();
    }
}
function fileKey(filePath) {
    return filePath.replace(/\\/g, '/');
}
function symbolKey(filePath, symbolName) {
    return `${fileKey(filePath)}:${symbolName}`;
}
//# sourceMappingURL=graph.js.map