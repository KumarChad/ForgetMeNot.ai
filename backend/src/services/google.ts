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

/**
 * Search Google Drive using BOTH name and fullText queries.
 * The query string can be:
 * - A plain keyword search (searches name + content)
 * - A raw Drive API query starting with "query:" (passed directly)
 */
export async function searchDrive(
  auth: Auth.OAuth2Client,
  query: string
): Promise<SearchResult[]> {
  const drive = google.drive({ version: 'v3', auth });
  const allFiles: any[] = [];
  const seenIds = new Set<string>();

  // Check if it's a raw API query
  if (query.startsWith('query:')) {
    const rawQuery = query.slice(6).trim();
    try {
      const response = await drive.files.list({
        q: rawQuery,
        fields: 'files(id, name, mimeType, modifiedTime, owners, webViewLink, description)',
        pageSize: 5,
        orderBy: 'modifiedTime desc',
      });
      if (response.data.files) {
        for (const f of response.data.files) {
          if (f.id && !seenIds.has(f.id)) {
            seenIds.add(f.id);
            allFiles.push(f);
          }
        }
      }
    } catch (e: any) {
      console.error(`Drive raw query error for "${rawQuery}":`, e.message);
    }
    return filesToResults(allFiles);
  }

  // Escape single quotes for the Drive API
  const escaped = query.replace(/'/g, "\\'");

  // Strategy 1: Search by file name (catches files named "resume", "budget", etc.)
  try {
    const nameResponse = await drive.files.list({
      q: `name contains '${escaped}' and trashed = false`,
      fields: 'files(id, name, mimeType, modifiedTime, owners, webViewLink, description)',
      pageSize: 5,
      orderBy: 'modifiedTime desc',
    });
    if (nameResponse.data.files) {
      for (const f of nameResponse.data.files) {
        if (f.id && !seenIds.has(f.id)) {
          seenIds.add(f.id);
          allFiles.push(f);
        }
      }
    }
  } catch (e: any) {
    console.error(`Drive name search error for "${query}":`, e.message);
  }

  // Strategy 2: Search by full text content (catches content inside docs)
  try {
    const contentResponse = await drive.files.list({
      q: `fullText contains '${escaped}' and trashed = false`,
      fields: 'files(id, name, mimeType, modifiedTime, owners, webViewLink, description)',
      pageSize: 5,
      orderBy: 'modifiedTime desc',
    });
    if (contentResponse.data.files) {
      for (const f of contentResponse.data.files) {
        if (f.id && !seenIds.has(f.id)) {
          seenIds.add(f.id);
          allFiles.push(f);
        }
      }
    }
  } catch (e: any) {
    console.error(`Drive fullText search error for "${query}":`, e.message);
  }

  return filesToResults(allFiles);
}

function filesToResults(files: any[]): SearchResult[] {
  const mimeToType: Record<string, string> = {
    'application/vnd.google-apps.document': 'document',
    'application/vnd.google-apps.spreadsheet': 'spreadsheet',
    'application/vnd.google-apps.presentation': 'presentation',
    'application/vnd.google-apps.folder': 'folder',
    'application/pdf': 'file',
    'image/png': 'file',
    'image/jpeg': 'file',
    'application/zip': 'file',
  };

  return files.map((file) => ({
    id: `drive-${file.id}`,
    source: 'drive' as const,
    type: mimeToType[file.mimeType || ''] || 'file',
    title: file.name || 'Untitled',
    snippet: file.description || `${file.name} — last modified ${new Date(file.modifiedTime || '').toLocaleDateString()}`,
    url: file.webViewLink || `https://drive.google.com/file/d/${file.id}`,
    timestamp: file.modifiedTime || new Date().toISOString(),
    author: file.owners?.[0]?.displayName ?? undefined,
  }));
}
