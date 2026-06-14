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
exports.gatherFileContext = gatherFileContext;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const graph_1 = require("./graph");
function gatherFileContext(document) {
    const filePath = document.uri.fsPath;
    const fileName = path.basename(filePath);
    const fileContent = document.getText().split('\n').slice(0, 200).join('\n');
    const language = document.languageId;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const cwd = workspaceFolder?.uri.fsPath || path.dirname(filePath);
    const dependencies = (0, graph_1.getDependencies)(filePath);
    const dependents = (0, graph_1.getDependents)(filePath);
    const totalCallSites = (0, graph_1.getTotalCallSites)(filePath);
    const symbols = (0, graph_1.getSymbols)(filePath);
    const gitLog = getGitLog(filePath, cwd);
    const gitBlame = getRecentBlame(filePath, cwd);
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
function getGitLog(filePath, cwd) {
    try {
        return (0, child_process_1.execSync)(`git log --format="%ar | %s" -5 -- "${filePath}"`, { cwd, encoding: 'utf-8', timeout: 5000 }).trim();
    }
    catch {
        return '';
    }
}
function getRecentBlame(filePath, cwd) {
    try {
        const log = (0, child_process_1.execSync)(`git log --format="%h %ar %an" -1 -- "${filePath}"`, { cwd, encoding: 'utf-8', timeout: 5000 }).trim();
        return log;
    }
    catch {
        return '';
    }
}
//# sourceMappingURL=context.js.map