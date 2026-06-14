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
exports.BoopPanel = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class BoopPanel {
    constructor(context) {
        this.panel = null;
        this.context = context;
    }
    get isVisible() {
        return this.panel !== null;
    }
    show() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Beside);
            return;
        }
        this.panel = vscode.window.createWebviewPanel('boopBrief', 'boop', { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(this.context.extensionPath, 'media'))
            ]
        });
        this.panel.webview.html = this.getHtml();
        this.panel.webview.onDidReceiveMessage((message) => {
            if (message.type === 'close') {
                this.dispose();
            }
        }, undefined, this.context.subscriptions);
        this.panel.onDidDispose(() => {
            this.panel = null;
        });
    }
    dispose() {
        if (this.panel) {
            this.panel.dispose();
            this.panel = null;
        }
    }
    toggle() {
        if (this.panel) {
            this.dispose();
        }
        else {
            this.show();
        }
    }
    sendMessage(message) {
        if (this.panel) {
            this.panel.webview.postMessage(message);
        }
    }
    startStream(fileName) {
        this.show();
        this.sendMessage({ type: 'startStream', fileName });
    }
    streamChunk(text) {
        this.sendMessage({ type: 'streamChunk', text });
    }
    endStream() {
        this.sendMessage({ type: 'endStream' });
    }
    showError(text) {
        this.show();
        this.sendMessage({ type: 'error', text });
    }
    showLoading(fileName, text) {
        this.show();
        this.sendMessage({ type: 'loading', fileName, text: text || 'Analyzing...' });
    }
    getHtml() {
        const htmlPath = path.join(this.context.extensionPath, 'media', 'panel.html');
        return fs.readFileSync(htmlPath, 'utf-8');
    }
}
exports.BoopPanel = BoopPanel;
//# sourceMappingURL=panel.js.map