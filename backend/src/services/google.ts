import { google, type Auth } from 'googleapis';

interface SearchResult {
  id: string;
  source: 'gmail' | 'drive';
  type: string;
  title: string;
  snippet: string;
  url: string;
  timestamp: string;
  author?: string;
}

export async function searchGmail(
  auth: Auth.OAuth2Client,
  query: string
): Promise<SearchResult[]> {
  const gmail = google.gmail({ version: 'v1', auth });

  const response = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: 5,
  });

  if (!response.data.messages || response.data.messages.length === 0) {
    return [];
  }

  const results: SearchResult[] = [];

  for (const msg of response.data.messages.slice(0, 5)) {
    try {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
        format: 'metadata',
        metadataHeaders: ['Subject', 'From', 'Date'],
      });

      const headers = detail.data.payload?.headers || [];
      const subject = headers.find((h) => h.name === 'Subject')?.value || 'No subject';
      const from = headers.find((h) => h.name === 'From')?.value || 'Unknown';
      const date = headers.find((h) => h.name === 'Date')?.value || '';

      results.push({
        id: `gmail-${msg.id}`,
        source: 'gmail',
        type: 'email',
        title: subject,
        snippet: detail.data.snippet || '',
        url: `https://mail.google.com/mail/u/0/#inbox/${msg.id}`,
        timestamp: date ? new Date(date).toISOString() : new Date().toISOString(),
        author: from.replace(/<.*>/, '').trim(),
      });
    } catch (e) {
      console.error(`Failed to fetch Gmail message ${msg.id}:`, e);
    }
  }

  return results;
}

export async function searchDrive(
  auth: Auth.OAuth2Client,
  query: string
): Promise<SearchResult[]> {
  const drive = google.drive({ version: 'v3', auth });

  const response = await drive.files.list({
    q: `fullText contains '${query.replace(/'/g, "\\'")}'`,
    fields: 'files(id, name, mimeType, modifiedTime, owners, webViewLink, description)',
    pageSize: 5,
    orderBy: 'modifiedTime desc',
  });

  if (!response.data.files || response.data.files.length === 0) {
    return [];
  }

  return response.data.files.map((file) => {
    const mimeToType: Record<string, string> = {
      'application/vnd.google-apps.document': 'document',
      'application/vnd.google-apps.spreadsheet': 'spreadsheet',
      'application/vnd.google-apps.presentation': 'presentation',
      'application/pdf': 'file',
    };

    return {
      id: `drive-${file.id}`,
      source: 'drive' as const,
      type: mimeToType[file.mimeType || ''] || 'file',
      title: file.name || 'Untitled',
      snippet: file.description || `${file.name} — last modified ${new Date(file.modifiedTime || '').toLocaleDateString()}`,
      url: file.webViewLink || `https://drive.google.com/file/d/${file.id}`,
      timestamp: file.modifiedTime || new Date().toISOString(),
      author: file.owners?.[0]?.displayName ?? undefined,
    };
  });
}
