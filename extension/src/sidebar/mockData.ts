import type { SearchResponse } from './types';

const MOCK_RESPONSES: Record<string, SearchResponse> = {
  default: {
    answer:
      "I found several relevant items across your connected apps. Here's what matches your query:",
    results: [
      {
        id: '1',
        source: 'drive',
        type: 'spreadsheet',
        title: 'Q3 2024 Budget Planning',
        snippet:
          'Revenue projections and departmental budget allocations for Q3. Updated by Sarah Chen on Sept 12.',
        url: 'https://docs.google.com/spreadsheets/d/abc123',
        timestamp: '2024-09-12T14:30:00Z',
        author: 'Sarah Chen',
      },
      {
        id: '2',
        source: 'gmail',
        type: 'email',
        title: 'Re: Budget Review Meeting Notes',
        snippet:
          'Hi team, attached are the final numbers from our budget review. The Q3 projections look solid...',
        url: 'https://mail.google.com/mail/u/0/#inbox/abc123',
        timestamp: '2024-09-10T09:15:00Z',
        author: 'David Park',
      },
      {
        id: '3',
        source: 'slack',
        type: 'message',
        title: '#finance — Sarah Chen',
        snippet:
          "Just uploaded the updated budget doc to Drive. @david can you review the marketing allocation? It's higher than last quarter.",
        url: 'https://workspace.slack.com/archives/C123/p456',
        timestamp: '2024-09-11T16:42:00Z',
        author: 'Sarah Chen',
      },
      {
        id: '4',
        source: 'notion',
        type: 'page',
        title: 'Q3 Planning — Finance Team Wiki',
        snippet:
          'Strategic priorities for Q3 include cost optimization, new revenue streams, and the infrastructure migration budget...',
        url: 'https://notion.so/q3-planning-abc123',
        timestamp: '2024-09-08T11:20:00Z',
        author: 'Finance Team',
      },
    ],
    actions: [
      {
        id: 'a1',
        label: 'Open in Drive',
        icon: 'external-link',
        action: 'open_url',
        params: { url: 'https://docs.google.com/spreadsheets/d/abc123' },
      },
      {
        id: 'a2',
        label: 'Share to #finance',
        icon: 'share',
        action: 'slack_send',
        params: { channel: 'finance' },
      },
    ],
  },
};

export async function mockSearch(query: string): Promise<SearchResponse> {
  await new Promise((resolve) => setTimeout(resolve, 800 + Math.random() * 600));
  return MOCK_RESPONSES.default;
}
