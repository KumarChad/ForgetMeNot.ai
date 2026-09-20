import fs from 'fs';
import path from 'path';
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';

// Load AI instructions from markdown file (cached after first read)
let _aiInstructions: string | null = null;

export function getAIInstructions(): string {
  if (_aiInstructions === null) {
    try {
      const instrPath = path.join(__dirname, '..', '..', 'ai-instructions.md');
      _aiInstructions = fs.readFileSync(instrPath, 'utf-8');
      console.log('   ✅ Loaded ai-instructions.md');
    } catch {
      console.log('   ⚠️  ai-instructions.md not found — using defaults');
      _aiInstructions = '';
    }
  }
  return _aiInstructions;
}

export function reloadAIInstructions(): void {
  _aiInstructions = null;
  getAIInstructions();
}

export interface BedrockOptions {
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
}

// One shared client. Credentials come from the default AWS provider chain —
// i.e. the same AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION in .env
// that DynamoDB already uses. No bearer token needed.
let _client: BedrockRuntimeClient | null = null;
function getClient(): BedrockRuntimeClient {
  if (!_client) {
    const region = process.env.AWS_REGION || 'us-east-1';
    _client = new BedrockRuntimeClient({ region });
  }
  return _client;
}

export async function queryBedrock(
  prompt: string,
  options: BedrockOptions = {}
): Promise<string> {
  const { systemPrompt, maxTokens = 1024, temperature = 0.3, topP = 0.9 } = options;

  // Local dev escape hatch — set BEDROCK_MOCK=1 to skip real calls.
  if (process.env.BEDROCK_MOCK === '1') {
    return mockBedrockResponse(prompt);
  }

  // Nova on-demand requires a cross-region inference profile ID
  // (e.g. "us.amazon.nova-lite-v1:0"), not the bare "amazon.nova-lite-v1:0".
  const modelId = process.env.BEDROCK_MODEL_ID || 'us.amazon.nova-lite-v1:0';

  const command = new ConverseCommand({
    modelId,
    messages: [{ role: 'user', content: [{ text: prompt }] }],
    ...(systemPrompt ? { system: [{ text: systemPrompt }] } : {}),
    inferenceConfig: { maxTokens, temperature, topP },
  });

  const response = await getClient().send(command);
  const text = response.output?.message?.content?.[0]?.text;

  if (!text) {
    throw new Error('Bedrock returned an empty response');
  }
  return text;
}

function mockBedrockResponse(prompt: string): string {
  if (
    prompt.includes('generate search queries') ||
    prompt.includes('search strategies') ||
    prompt.includes('search query generator')
  ) {
    const match = prompt.match(/User query: "(.+?)"/);
    const query = match ? match[1] : 'search';
    return JSON.stringify({
      gmail_queries: [query],
      drive_queries: [query],
      intent: 'general',
    });
  }

  if (prompt.includes('summarize') || prompt.includes('summary')) {
    return 'Here are the most relevant results for your search.';
  }

  return 'Mock AI response — set BEDROCK_MOCK=0 (or unset it) for real responses.';
}
