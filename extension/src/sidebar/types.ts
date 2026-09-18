export interface SearchResult {
  id: string;
  source: 'gmail' | 'drive' | 'slack' | 'notion';
  type: 'email' | 'document' | 'spreadsheet' | 'message' | 'page' | 'file';
  title: string;
  snippet: string;
  url: string;
  timestamp: string;
  author?: string;
  metadata?: Record<string, string>;
}

export interface SearchResponse {
  answer: string;
  results: SearchResult[];
  actions?: SuggestedAction[];
}

export interface SuggestedAction {
  id: string;
  label: string;
  icon: string;
  action: string;
  params: Record<string, unknown>;
}

export interface ConnectedSource {
  id: string;
  name: string;
  icon: string;
  connected: boolean;
}

export interface PageContext {
  url: string;
  title: string;
  domain: string;
}
