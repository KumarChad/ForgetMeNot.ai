import fs from 'fs';
import path from 'path';

const BEDROCK_API_KEY = process.env.BEDROCK_API_KEY || '';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'amazon.nova-lite-v1:0';

const BEDROCK_URL = `https://bedrock-runtime.${AWS_REGION}.amazonaws.com/model/${encodeURIComponent(MODEL_ID)}/invoke`;

// Load AI instructions from markdown file (cached at startup)
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

// Reload instructions (call this if you edit the file at runtime)
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
    temperature = 0.3,  // Lower default for more precise search results
    topP = 0.9,
  } = options;

  // If no API key configured, return a mock response
  if (!BEDROCK_API_KEY) {
    console.log('   ⚠️  Bedrock not configured — using mock AI response');
    return mockBedrockResponse(prompt);
  }

  // Build the request body with optional system prompt
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

  // Add system prompt if provided (Nova Lite supports system messages)
  if (systemPrompt) {
    requestBody.system = [{ text: systemPrompt }];
  }

  const response = await fetch(BEDROCK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${BEDROCK_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Bedrock API error (${response.status}):`, errorText);
    throw new Error(`Bedrock request failed: ${response.status}`);
  }

  const responseBody: any = await response.json();

  // Nova response format: output.message.content[0].text
  return responseBody.output.message.content[0].text;
}

function mockBedrockResponse(prompt: string): string {
  if (prompt.includes('generate search queries') || prompt.includes('search strategies')) {
    // Return a mock JSON for the new multi-strategy format
    const match = prompt.match(/User query: "(.+?)"/);
    const query = match ? match[1] : 'search';
    return JSON.stringify({
      gmail_queries: [query],
      drive_queries: [query],
      intent: 'general',
    });
  }

  if (prompt.includes('rank and summarize') || prompt.includes('summarize these search results')) {
    return `Here are the most relevant results for your search.`;
  }

  return 'Mock AI response — configure Bedrock for real responses.';
}
