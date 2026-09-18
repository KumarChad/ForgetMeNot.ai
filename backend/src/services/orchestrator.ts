import { queryBedrock, getAIInstructions } from './bedrock';
import { searchGmail, searchDrive } from './google';
import { getGoogleAuth } from '../routes/auth';
import { metrics } from './metrics';

interface PageContext {
  url: string;
  title: string;
  domain: string;
}

interface SearchResult {
  id: string;
  source: 'gmail' | 'drive' | 'slack' | 'notion';
  type: string;
  title: string;
  snippet: string;
  url: string;
  timestamp: string;
  author?: string;
  relevanceScore?: number;
}

interface SearchResponse {
  answer: string;
  results: SearchResult[];
  actions?: any[];
}

interface SearchStrategies {
  gmail_queries: string[];
  drive_queries: string[];
  intent: string;
}

// ─── Mock results for when no Google auth is connected ───────────────
function getMockResults(query: string): SearchResult[] {
  return [
    {
      id: 'mock-1',
      source: 'drive',
      type: 'document',
      title: 'Q3 2024 Budget Planning',
      snippet: `Found a match for "${query}" — Revenue projections and departmental budget allocations for Q3.`,
      url: 'https://docs.google.com/document/d/example',
      timestamp: new Date(Date.now() - 2 * 86400000).toISOString(),
      author: 'Sarah Chen',
    },
    {
      id: 'mock-2',
      source: 'gmail',
      type: 'email',
      title: 'Re: Budget Review Meeting Notes',
      snippet: 'Hi team, attached are the final numbers from our budget review.',
      url: 'https://mail.google.com/mail/u/0/#inbox/example',
      timestamp: new Date(Date.now() - 3 * 86400000).toISOString(),
      author: 'David Park',
    },
  ];
}

// ─── Step 1: AI generates targeted search queries ────────────────────
async function generateSearchStrategies(
  query: string,
  context?: PageContext
): Promise<{ strategies: SearchStrategies; latencyMs: number }> {
  const instructions = getAIInstructions();
  const start = Date.now();

  const prompt = `You are a search query generator for Gmail and Google Drive APIs. Your job is to convert a natural language question into optimized API search queries.

IMPORTANT: You must return ONLY valid JSON, no markdown, no explanation.

Given the user's query, generate targeted search queries using the correct operators for each platform.

## Gmail Search Operators you can use:
- from:name — emails from a person
- to:name — emails to a person  
- subject:word — word in subject line
- has:attachment — emails with attachments
- filename:ext — attachments with specific extension (pdf, xlsx, docx, etc.)
- after:YYYY/MM/DD — emails after date
- before:YYYY/MM/DD — emails before date
- newer_than:Nd — emails from last N days (e.g. newer_than:7d, newer_than:30d)
- is:starred — starred emails
- label:name — emails with label
- in:sent — sent emails
- Combine multiple operators in one query: "from:john subject:budget has:attachment"

## Google Drive search:
- Use short specific phrases (the API does fullText search)
- Include file type words if relevant ("spreadsheet", "presentation", "report")
- Use the most distinctive words from the query

## Rules:
1. Generate 1-3 Gmail queries and 1-2 Drive queries
2. Use operators when the query implies them (person → from:, time → newer_than:, etc.)
3. Always include at least one broad keyword query per platform as a fallback
4. Identify the user's intent: "people", "documents", "time-based", "topic", or "general"

User query: "${query}"
${context ? `User is currently viewing: ${context.title} (${context.domain})` : ''}
Today's date: ${new Date().toISOString().split('T')[0]}

Return this exact JSON format:
{"gmail_queries": ["query1", "query2"], "drive_queries": ["query1"], "intent": "topic"}`;

  try {
    const response = await queryBedrock(prompt, {
      systemPrompt: instructions || undefined,
      temperature: 0.2,
      maxTokens: 512,
    });

    const latencyMs = Date.now() - start;
    metrics.recordBedrockCall({
      timestamp: Date.now(),
      latencyMs,
      purpose: 'query_gen',
      success: true,
    });

    const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const strategies = JSON.parse(cleaned) as SearchStrategies;

    if (!strategies.gmail_queries || !strategies.drive_queries) {
      throw new Error('Invalid strategy format');
    }

    return { strategies, latencyMs };
  } catch (e) {
    const latencyMs = Date.now() - start;
    metrics.recordBedrockCall({
      timestamp: Date.now(),
      latencyMs,
      purpose: 'query_gen',
      success: false,
      error: (e as Error).message,
    });
    console.error('Failed to generate search strategies, using fallback:', e);
    return {
      strategies: { gmail_queries: [query], drive_queries: [query], intent: 'general' },
      latencyMs,
    };
  }
}

// ─── Step 2: Execute searches in parallel ────────────────────────────
async function executeSearches(
  strategies: SearchStrategies,
  googleAuth: any
): Promise<SearchResult[]> {
  const allResults: SearchResult[] = [];

  const gmailPromises = strategies.gmail_queries.map((q) =>
    searchGmail(googleAuth, q).catch((e) => {
      console.error(`Gmail search error for "${q}":`, e.message);
      return [] as SearchResult[];
    })
  );

  const drivePromises = strategies.drive_queries.map((q) =>
    searchDrive(googleAuth, q).catch((e) => {
      console.error(`Drive search error for "${q}":`, e.message);
      return [] as SearchResult[];
    })
  );

  const results = await Promise.all([...gmailPromises, ...drivePromises]);
  allResults.push(...results.flat());

  return allResults;
}

// ─── Step 3: Score and rank results ──────────────────────────────────
function scoreAndRankResults(
  results: SearchResult[],
  query: string,
  intent: string
): SearchResult[] {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 2);

  const scored = results.map((result) => {
    let score = 0;
    const titleLower = (result.title || '').toLowerCase();
    const snippetLower = (result.snippet || '').toLowerCase();
    const authorLower = (result.author || '').toLowerCase();

    if (titleLower.includes(queryLower)) score += 50;

    for (const word of queryWords) {
      if (titleLower.includes(word)) score += 15;
      if (snippetLower.includes(word)) score += 5;
      if (authorLower.includes(word)) score += 20;
    }

    const age = Date.now() - new Date(result.timestamp).getTime();
    const daysOld = age / 86400000;
    if (daysOld < 1) score += 30;
    else if (daysOld < 3) score += 20;
    else if (daysOld < 7) score += 10;
    else if (daysOld < 30) score += 5;

    if (intent === 'people' && result.source === 'gmail') score += 10;
    if (intent === 'documents' && result.source === 'drive') score += 10;

    return { ...result, relevanceScore: score };
  });

  scored.sort((a, b) => {
    const scoreDiff = (b.relevanceScore || 0) - (a.relevanceScore || 0);
    if (scoreDiff !== 0) return scoreDiff;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  return scored;
}

// ─── Step 4: Deduplicate ─────────────────────────────────────────────
function deduplicateResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = r.id || `${r.source}:${r.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Step 5: AI summarizes the ranked results ────────────────────────
async function summarizeResults(
  query: string,
  results: SearchResult[],
  intent: string
): Promise<{ answer: string; latencyMs: number }> {
  const instructions = getAIInstructions();
  const start = Date.now();

  if (results.length === 0) {
    return {
      answer: `I couldn't find anything matching "${query}" in your connected apps. Try rephrasing or check that your accounts are connected.`,
      latencyMs: 0,
    };
  }

  const resultsSummary = results
    .slice(0, 8)
    .map((r, i) => {
      const age = Math.round((Date.now() - new Date(r.timestamp).getTime()) / 86400000);
      const ageStr = age === 0 ? 'today' : age === 1 ? 'yesterday' : `${age} days ago`;
      return `${i + 1}. [${r.source.toUpperCase()}] "${r.title}" by ${r.author || 'unknown'} (${ageStr}) — ${r.snippet?.slice(0, 120)}`;
    })
    .join('\n');

  const prompt = `The user searched for: "${query}"
Their intent seems to be: ${intent}

Here are the top results found across their Gmail and Google Drive, ranked by relevance:

${resultsSummary}

Write a helpful 2-3 sentence summary. Rules:
- Mention specific file names, people, and when things were sent/modified
- Highlight which result is the best match and why
- If the results don't seem to match well, be honest about it
- Be conversational, not robotic
- Do NOT use bullet points or numbered lists
- Do NOT start with "I found" — jump straight into what's relevant`;

  try {
    const answer = await queryBedrock(prompt, {
      systemPrompt: instructions || undefined,
      temperature: 0.5,
      maxTokens: 300,
    });

    const latencyMs = Date.now() - start;
    metrics.recordBedrockCall({
      timestamp: Date.now(),
      latencyMs,
      purpose: 'summarize',
      success: true,
    });

    return { answer, latencyMs };
  } catch {
    const latencyMs = Date.now() - start;
    metrics.recordBedrockCall({
      timestamp: Date.now(),
      latencyMs,
      purpose: 'summarize',
      success: false,
    });
    const topResult = results[0];
    return {
      answer: `Your top match is "${topResult.title}" from ${topResult.source === 'gmail' ? 'Gmail' : 'Google Drive'}${topResult.author ? ` by ${topResult.author}` : ''}. Found ${results.length} results total.`,
      latencyMs,
    };
  }
}

// ─── Main orchestrator ───────────────────────────────────────────────
export async function orchestrateSearch(
  query: string,
  context?: PageContext
): Promise<SearchResponse> {
  const searchStart = Date.now();
  const googleAuth = getGoogleAuth();

  // Step 1: Generate smart search strategies
  console.log(`\n🔍 ForgetMeNot search: "${query}"`);
  const { strategies, latencyMs: aiQueryGenMs } = await generateSearchStrategies(query, context);
  console.log(`   📧 Gmail queries: ${strategies.gmail_queries.join(' | ')}`);
  console.log(`   📁 Drive queries: ${strategies.drive_queries.join(' | ')}`);
  console.log(`   🎯 Intent: ${strategies.intent}`);

  let allResults: SearchResult[];
  let gmailCount = 0;
  let driveCount = 0;
  const apiSearchStart = Date.now();

  if (googleAuth) {
    const rawResults = await executeSearches(strategies, googleAuth);
    console.log(`   📊 Raw results: ${rawResults.length}`);

    const unique = deduplicateResults(rawResults);
    allResults = scoreAndRankResults(unique, query, strategies.intent);
    console.log(`   ✅ Ranked results: ${allResults.length}`);

    gmailCount = allResults.filter((r) => r.source === 'gmail').length;
    driveCount = allResults.filter((r) => r.source === 'drive').length;
  } else {
    allResults = getMockResults(query);
    gmailCount = allResults.filter((r) => r.source === 'gmail').length;
    driveCount = allResults.filter((r) => r.source === 'drive').length;
    console.log('   ⚠️  No Google auth — using mock results');
  }

  const apiSearchMs = Date.now() - apiSearchStart;

  // Step 5: AI summarizes
  const { answer, latencyMs: aiSummaryMs } = await summarizeResults(
    query,
    allResults,
    strategies.intent
  );

  const totalLatencyMs = Date.now() - searchStart;

  // Record metrics
  metrics.recordSearch({
    query,
    timestamp: Date.now(),
    totalLatencyMs,
    aiQueryGenMs,
    apiSearchMs,
    aiSummaryMs,
    resultCount: allResults.length,
    gmailResults: gmailCount,
    driveResults: driveCount,
    slackResults: 0,
    notionResults: 0,
    intent: strategies.intent,
    success: allResults.length > 0,
    queriesGenerated: strategies.gmail_queries.length + strategies.drive_queries.length,
  });

  const finalResults = allResults.slice(0, 10);

  return {
    answer,
    results: finalResults,
    actions: finalResults[0]
      ? [
          {
            id: 'a1',
            label: 'Open top result',
            icon: 'external-link',
            action: 'open_url',
            params: { url: finalResults[0].url },
          },
        ]
      : [],
  };
}
