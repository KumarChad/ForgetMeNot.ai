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

const STOP_WORDS = new Set([
  'find', 'my', 'the', 'a', 'an', 'me', 'show', 'get', 'where', 'is', 'are', 'was', 'were',
  'what', 'which', 'who', 'can', 'you', 'i', 'do', 'did', 'from', 'in', 'to', 'of', 'for',
  'with', 'about', 'that', 'this', 'and', 'or', 'on', 'at', 'by', 'it', 'any', 'all', 'some',
  'please', 'need', 'want', 'looking', 'search', 'give', 'tell', 'last', 'recent',
]);

/** Pull the meaningful keywords out of a natural-language query. */
function extractKeywords(query: string): string {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  return words.slice(0, 4).join(' ');
}

// ─── Step 1: AI generates targeted search queries ────────────────────
async function generateSearchStrategies(
  query: string,
  context?: PageContext
): Promise<{ strategies: SearchStrategies; latencyMs: number }> {
  const instructions = getAIInstructions();
  const start = Date.now();

  const prompt = `You are a search query generator. Convert natural language into Gmail and Google Drive search queries.

CRITICAL: Return ONLY valid JSON. No markdown, no backticks, no explanation text.

## Gmail operators:
- from:name, to:name, subject:word
- has:attachment, filename:pdf
- newer_than:7d, after:2024/01/01, before:2024/12/31
- is:starred, label:name, in:sent
- OR groups: "(resume OR cv OR curriculum)" matches ANY of the terms — use these to catch synonyms / alternate names for the same thing
- Combine: "from:john subject:budget has:attachment"
- IMPORTANT: bare keywords are matched with AND (every word must be present) and only match whole words. Keep keyword-only queries to 1-2 words, and expand synonyms with an OR group instead of stacking more words.

## Google Drive queries:
- Extract ONLY the core noun or key term — strip filler words (find, my, the, show, me, where, is)
- Use SINGLE WORDS or short 2-word phrases maximum
- The search checks both file names AND file content, so simple keywords work best
- Generate 1-3 queries: first = most specific term, second = a synonym or alternate spelling, third (optional) = a raw API query
- Raw API queries use prefix "query:" for advanced filters:
  - "query:mimeType='application/pdf'" — only PDFs
  - "query:mimeType='application/vnd.google-apps.spreadsheet'" — only spreadsheets
  - "query:sharedWithMe=true" — files shared with the user
  - "query:modifiedTime > '2024-01-01T00:00:00'" — recently modified

## Rules:
1. Generate 1-3 Gmail queries and 1-3 Drive queries
2. Gmail: use operators when the query implies them (person name → from:, time reference → newer_than:, file type → filename:) — but never stack more than TWO operators in one query
3. Gmail: ALWAYS include (a) one single-keyword query — the core noun alone, e.g. "resume" — and (b) one loose OR-group query expanding obvious synonyms, e.g. "(resume OR cv OR curriculum vitae)", so an over-specific operator query can't return nothing
7. Attachments: when the user wants something that usually arrives as a file (resume, invoice, report, deck), add a Gmail query combining has:attachment with the synonym OR-group, e.g. "has:attachment (resume OR cv)"
4. Drive: always have at least one single-word query that is the core noun the user wants
5. Drive: NEVER pass full sentences — only extracted keywords
6. Identify intent: "people", "documents", "time-based", "topic", or "general"

User query: "${query}"
${context ? `User is currently viewing: ${context.title} (${context.domain})` : ''}
Today's date: ${new Date().toISOString().split('T')[0]}

Return JSON: {"gmail_queries": [...], "drive_queries": [...], "intent": "..."}`;

  try {
    const response = await queryBedrock(prompt, {
      systemPrompt: instructions || undefined,
      temperature: 0.2,
      maxTokens: 512,
    });

    const latencyMs = Date.now() - start;

    // Robust JSON extraction — pull the first {...} block out even if the model
    // wraps it in prose or code fences.
    const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    const strategies = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned) as SearchStrategies;

    if (!Array.isArray(strategies.gmail_queries) || !Array.isArray(strategies.drive_queries)) {
      throw new Error('Invalid strategy format');
    }

    metrics.recordBedrockCall({ timestamp: Date.now(), latencyMs, purpose: 'query_gen', success: true });
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
    // Smart fallback: extract keywords instead of using the whole sentence
    const keywords = extractKeywords(query);
    const firstWord = keywords.split(' ')[0] || query;
    return {
      strategies: {
        gmail_queries: [keywords || query, firstWord],
        drive_queries: [keywords || query, firstWord],
        intent: 'general',
      },
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
  const queryWords = queryLower
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  const scored = results.map((result) => {
    // Baseline: it came back from a search, so it matched *something* (important
    // for Drive content matches that don't surface in the title/snippet).
    let score = 5;
    const titleLower = (result.title || '').toLowerCase();
    const snippetLower = (result.snippet || '').toLowerCase();
    const authorLower = (result.author || '').toLowerCase();

    if (queryLower.length > 2 && titleLower.includes(queryLower)) score += 50;

    let matched = 0;
    for (const word of queryWords) {
      let hit = false;
      if (titleLower.includes(word)) { score += 15; hit = true; }
      if (snippetLower.includes(word)) { score += 6; hit = true; }
      if (authorLower.includes(word)) { score += 20; hit = true; }
      if (hit) matched++;
    }
    // Reward covering more of the query's terms
    if (queryWords.length > 0) score += Math.round((matched / queryWords.length) * 20);

    // Recency — capped so it nudges but never overrides relevance
    const daysOld = (Date.now() - new Date(result.timestamp).getTime()) / 86400000;
    if (daysOld < 1) score += 12;
    else if (daysOld < 7) score += 8;
    else if (daysOld < 30) score += 4;

    if (intent === 'people' && result.source === 'gmail') score += 8;
    if (intent === 'documents' && result.source === 'drive') score += 8;

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
    metrics.recordBedrockCall({ timestamp: Date.now(), latencyMs, purpose: 'summarize', success: true });
    return { answer, latencyMs };
  } catch {
    const latencyMs = Date.now() - start;
    metrics.recordBedrockCall({ timestamp: Date.now(), latencyMs, purpose: 'summarize', success: false });
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

  // Always guarantee a loose keyword-only query on both platforms, so an
  // over-constrained operator query (e.g. from:x subject:y) can't zero out recall.
  const broad = extractKeywords(query);
  if (broad) {
    if (!strategies.gmail_queries.includes(broad)) strategies.gmail_queries.push(broad);
    if (!strategies.drive_queries.includes(broad)) strategies.drive_queries.push(broad);
    // Guarantee a single-keyword, high-recall Gmail query. Gmail matches whole
    // words with AND, so a multi-word bare query can still zero out — the lone
    // top keyword can't.
    const topKeyword = broad.split(' ')[0];
    if (topKeyword && !strategies.gmail_queries.includes(topKeyword)) {
      strategies.gmail_queries.push(topKeyword);
    }
  }
  // Cap the number of queries so we don't hammer the APIs.
  strategies.gmail_queries = strategies.gmail_queries.filter(Boolean).slice(0, 4);
  strategies.drive_queries = strategies.drive_queries.filter(Boolean).slice(0, 4);

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
    allResults = [];
    console.log('   ⚠️  No Google auth — returning no results');
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
