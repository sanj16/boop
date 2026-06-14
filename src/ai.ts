import Anthropic from '@anthropic-ai/sdk';
import * as vscode from 'vscode';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  const config = vscode.workspace.getConfiguration('boop');
  const apiKey = config.get<string>('anthropicApiKey') || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error('No API key found. Either:\n1. Set ANTHROPIC_API_KEY env variable, or\n2. Settings → search "boop" → paste key in boop.anthropicApiKey');
  }

  if (!client) {
    client = new Anthropic({ apiKey });
  }

  return client;
}

export function resetClient(): void {
  client = null;
}

export async function streamCompletion(
  systemPrompt: string,
  userPrompt: string,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (error: string) => void
): Promise<void> {
  try {
    const anthropic = getClient();
    const config = vscode.workspace.getConfiguration('boop');
    const model = config.get<string>('model') || 'claude-sonnet-4-6';

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
  } catch (error: any) {
    onError(error.message || 'Failed to connect to Claude API');
  }
}
