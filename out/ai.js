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
exports.resetClient = resetClient;
exports.streamCompletion = streamCompletion;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const vscode = __importStar(require("vscode"));
let client = null;
function getClient() {
    const config = vscode.workspace.getConfiguration('boop');
    const apiKey = config.get('anthropicApiKey') || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new Error('No API key found. Either:\n1. Set ANTHROPIC_API_KEY env variable, or\n2. Settings → search "boop" → paste key in boop.anthropicApiKey');
    }
    if (!client) {
        client = new sdk_1.default({ apiKey });
    }
    return client;
}
function resetClient() {
    client = null;
}
async function streamCompletion(systemPrompt, userPrompt, onChunk, onDone, onError) {
    try {
        const anthropic = getClient();
        const config = vscode.workspace.getConfiguration('boop');
        const model = config.get('model') || 'claude-sonnet-4-6';
        const stream = anthropic.messages.stream({
            model,
            max_tokens: 600,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
        });
        stream.on('text', (text) => {
            onChunk(text);
        });
        stream.on('end', () => {
            onDone();
        });
        stream.on('error', (error) => {
            onError(error.message || 'Stream error');
        });
        await stream.finalMessage();
    }
    catch (error) {
        onError(error.message || 'Failed to connect to Claude API');
    }
}
//# sourceMappingURL=ai.js.map