import fs from 'fs';
import path from 'path';

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

export async function queryBedrock(
  prompt: string,
  options: BedrockOptions = {}
): Promise<string> {
  const {
    systemPrompt,
    maxTokens = 1024,
    temperature = 0.3,
    topP = 0.9,
  } = options;

  // Read env vars HERE (not at module load) so dotenv.config() has already run
  const apiKey = process.env.BEDROCK_API_KEY || '';
  const region = process.env.AWS_REGION || 'us-east-1';
  const modelId = process.env.BEDROCK_MODEL_ID || 'amazon.nova-lite-v1:0';
  const bedrockUrl = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/invoke`;

  if (!apiKey) {
    console.log('   ⚠️  Bedrock not configured — using mock AI response');
    return mockBedrockResponse(prompt);
  }

  const requestBody: any = {
    messages: [
      {
        role: 'user',
        content: [{ text: prompt }],
      },
    ],
    inferenceConfig: {
      maxTokens,
      temperature,
      topP,
    },
  };

  if (systemPrompt) {
    requestBody.system = [{ text: systemPrompt }];
  }

  const response = await fetch(bedrockUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Bedrock API error (${response.status}):`, errorText);
    throw new Error(`Bedrock request failed: ${response.status}`);
  }

  const responseBody: any = await response.json();
  return responseBody.output.message.content[0].text;
}

function mockBedrockResponse(prompt: string): string {
  if (prompt.includes('generate search queries') || prompt.includes('search strategies') || prompt.includes('search query generator')) {
    const match = prompt.match(/User query: "(.+?)"/);
    const query = match ? match[1] : 'search';
    return JSON.stringify({
      gmail_queries: [query],
      drive_queries: [query],
      intent: 'general',
    });
  }

  if (prompt.includes('rank and summarize') || prompt.includes('summarize') || prompt.includes('summary')) {
    return 'Here are the most relevant results for your search.';
  }

  return 'Mock AI response — configure Bedrock for real responses.';
}
