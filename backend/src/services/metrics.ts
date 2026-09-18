/**
 * ForgetMeNot — Metrics Tracking Service
 * 
 * Tracks real usage data for resume metrics (STAR method):
 * - Search performance (latency, throughput)
 * - Result quality (counts, source breakdown, success rates)
 * - AI performance (Bedrock call times, token efficiency)
 * - User engagement (queries over time, peak usage)
 */

interface SearchMetric {
  query: string;
  timestamp: number;
  totalLatencyMs: number;
  aiQueryGenMs: number;
  apiSearchMs: number;
  aiSummaryMs: number;
  resultCount: number;
  gmailResults: number;
  driveResults: number;
  slackResults: number;
  notionResults: number;
  intent: string;
  success: boolean;  // true if results were found
  queriesGenerated: number;  // how many sub-queries AI created
}

interface BedrockMetric {
  timestamp: number;
  latencyMs: number;
  purpose: 'query_gen' | 'summarize' | 'other';
  success: boolean;
  error?: string;
}

interface MetricsSummary {
  // Overall stats
  totalSearches: number;
  successfulSearches: number;
  successRate: number;           // percentage
  totalResultsReturned: number;
  avgResultsPerSearch: number;

  // Performance
  avgTotalLatencyMs: number;
  avgAiQueryGenMs: number;
  avgApiSearchMs: number;
  avgAiSummaryMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  fastestSearchMs: number;
  slowestSearchMs: number;

  // Source breakdown
  totalGmailResults: number;
  totalDriveResults: number;
  totalSlackResults: number;
  totalNotionResults: number;
  sourceBreakdown: Record<string, number>;  // percentages

  // AI stats
  totalBedrockCalls: number;
  bedrockSuccessRate: number;
  avgBedrockLatencyMs: number;
  totalAiQueriesGenerated: number;

  // Intent breakdown
  intentBreakdown: Record<string, number>;

  // Time-based
  searchesLast24h: number;
  searchesLast7d: number;
  peakHour: number | null;       // hour of day (0-23) with most searches
  firstSearchAt: string | null;
  lastSearchAt: string | null;
  uptimeHours: number;

  // Recent searches (last 20)
  recentSearches: Array<{
    query: string;
    timestamp: string;
    latencyMs: number;
    resultCount: number;
    success: boolean;
  }>;
}

class MetricsService {
  private searches: SearchMetric[] = [];
  private bedrockCalls: BedrockMetric[] = [];
  private startTime: number = Date.now();

  // ─── Record a completed search ─────────────────────────────────
  recordSearch(metric: SearchMetric): void {
    this.searches.push(metric);
    console.log(
      `   📈 Metrics: ${metric.totalLatencyMs}ms total | ` +
      `${metric.resultCount} results | ` +
      `AI: ${metric.aiQueryGenMs}ms gen + ${metric.aiSummaryMs}ms summary | ` +
      `API: ${metric.apiSearchMs}ms`
    );
  }

  // ─── Record a Bedrock API call ─────────────────────────────────
  recordBedrockCall(metric: BedrockMetric): void {
    this.bedrockCalls.push(metric);
  }

  // ─── Get full summary ──────────────────────────────────────────
  getSummary(): MetricsSummary {
    const now = Date.now();
    const totalSearches = this.searches.length;
    const successfulSearches = this.searches.filter((s) => s.success).length;

    // Latencies
    const latencies = this.searches.map((s) => s.totalLatencyMs).sort((a, b) => a - b);
    const aiGenLatencies = this.searches.map((s) => s.aiQueryGenMs);
    const apiLatencies = this.searches.map((s) => s.apiSearchMs);
    const aiSumLatencies = this.searches.map((s) => s.aiSummaryMs);

    // Source counts
    const totalGmail = this.searches.reduce((sum, s) => sum + s.gmailResults, 0);
    const totalDrive = this.searches.reduce((sum, s) => sum + s.driveResults, 0);
    const totalSlack = this.searches.reduce((sum, s) => sum + s.slackResults, 0);
    const totalNotion = this.searches.reduce((sum, s) => sum + s.notionResults, 0);
    const totalResults = totalGmail + totalDrive + totalSlack + totalNotion;

    // Source breakdown as percentages
    const sourceBreakdown: Record<string, number> = {};
    if (totalResults > 0) {
      sourceBreakdown.gmail = round((totalGmail / totalResults) * 100);
      sourceBreakdown.drive = round((totalDrive / totalResults) * 100);
      sourceBreakdown.slack = round((totalSlack / totalResults) * 100);
      sourceBreakdown.notion = round((totalNotion / totalResults) * 100);
    }

    // Intent breakdown
    const intentCounts: Record<string, number> = {};
    for (const s of this.searches) {
      intentCounts[s.intent] = (intentCounts[s.intent] || 0) + 1;
    }
    const intentBreakdown: Record<string, number> = {};
    for (const [intent, count] of Object.entries(intentCounts)) {
      intentBreakdown[intent] = round((count / Math.max(totalSearches, 1)) * 100);
    }

    // Time-based
    const last24h = this.searches.filter((s) => now - s.timestamp < 86400000).length;
    const last7d = this.searches.filter((s) => now - s.timestamp < 7 * 86400000).length;

    // Peak hour
    const hourCounts: Record<number, number> = {};
    for (const s of this.searches) {
      const hour = new Date(s.timestamp).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    }
    let peakHour: number | null = null;
    let peakCount = 0;
    for (const [hour, count] of Object.entries(hourCounts)) {
      if (count > peakCount) {
        peakCount = count;
        peakHour = parseInt(hour);
      }
    }

    // Bedrock stats
    const bedrockSuccess = this.bedrockCalls.filter((b) => b.success).length;
    const bedrockLatencies = this.bedrockCalls.map((b) => b.latencyMs);

    // AI queries generated
    const totalAiQueries = this.searches.reduce((sum, s) => sum + s.queriesGenerated, 0);

    // Recent searches
    const recentSearches = this.searches
      .slice(-20)
      .reverse()
      .map((s) => ({
        query: s.query,
        timestamp: new Date(s.timestamp).toISOString(),
        latencyMs: s.totalLatencyMs,
        resultCount: s.resultCount,
        success: s.success,
      }));

    return {
      totalSearches,
      successfulSearches,
      successRate: round(totalSearches > 0 ? (successfulSearches / totalSearches) * 100 : 0),
      totalResultsReturned: totalResults,
      avgResultsPerSearch: round(totalSearches > 0 ? totalResults / totalSearches : 0),

      avgTotalLatencyMs: round(avg(latencies)),
      avgAiQueryGenMs: round(avg(aiGenLatencies)),
      avgApiSearchMs: round(avg(apiLatencies)),
      avgAiSummaryMs: round(avg(aiSumLatencies)),
      p50LatencyMs: percentile(latencies, 50),
      p95LatencyMs: percentile(latencies, 95),
      fastestSearchMs: latencies[0] ?? 0,
      slowestSearchMs: latencies[latencies.length - 1] ?? 0,

      totalGmailResults: totalGmail,
      totalDriveResults: totalDrive,
      totalSlackResults: totalSlack,
      totalNotionResults: totalNotion,
      sourceBreakdown,

      totalBedrockCalls: this.bedrockCalls.length,
      bedrockSuccessRate: round(
        this.bedrockCalls.length > 0 ? (bedrockSuccess / this.bedrockCalls.length) * 100 : 0
      ),
      avgBedrockLatencyMs: round(avg(bedrockLatencies)),
      totalAiQueriesGenerated: totalAiQueries,

      intentBreakdown,

      searchesLast24h: last24h,
      searchesLast7d: last7d,
      peakHour,
      firstSearchAt: this.searches[0]
        ? new Date(this.searches[0].timestamp).toISOString()
        : null,
      lastSearchAt: this.searches.length > 0
        ? new Date(this.searches[this.searches.length - 1].timestamp).toISOString()
        : null,
      uptimeHours: round((now - this.startTime) / 3600000),

      recentSearches,
    };
  }

  // ─── Reset all metrics ─────────────────────────────────────────
  reset(): void {
    this.searches = [];
    this.bedrockCalls = [];
    this.startTime = Date.now();
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────
function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((sum, v) => sum + v, 0) / arr.length;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ─── Singleton export ────────────────────────────────────────────────
export const metrics = new MetricsService();
