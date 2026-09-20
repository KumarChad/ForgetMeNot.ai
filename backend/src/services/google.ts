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

const GMAIL_MAX = 8;
const DRIVE_FIELDS =
  'files(id, name, mimeType, modifiedTime, owners, webViewLink, description)';
const DRIVE_PAGE = 10;

export async function searchGmail(
  auth: Auth.OAuth2Client,
  query: string
): Promise<SearchResult[]> {
  const gmail = google.gmail({ version: 'v1', auth });

  const response = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: GMAIL_MAX,
  });

  if (!response.data.messages || response.data.messages.length === 0) {
    return [];
  }

  const results: SearchResult[] = [];

  // Fetch message details in parallel (was sequential — much faster now)
  const details = await Promise.all(
    response.data.messages.slice(0, GMAIL_MAX).map((msg) =>
      gmail.users.messages
        .get({
          userId: 'me',
          id: msg.id!,
          format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'Date'],
        })
        .then((d) => d)
        .catch((e) => {
          console.error(`Failed to fetch Gmail message ${msg.id}:`, e.message);
          return null;
        })
    )
  );

  for (const detail of details) {
    if (!detail) continue;
    const headers = detail.data.payload?.headers || [];
    const subject = headers.find((h) => h.name === 'Subject')?.value || 'No subject';
    const from = headers.find((h) => h.name === 'From')?.value || 'Unknown';
    const date = headers.find((h) => h.name === 'Date')?.value || '';

    results.push({
      id: `gmail-${detail.data.id}`,
      source: 'gmail',
      type: 'email',
      title: subject,
      snippet: detail.data.snippet || '',
      url: `https://mail.google.com/mail/u/0/#inbox/${detail.data.id}`,
      timestamp: date ? new Date(date).toISOString() : new Date().toISOString(),
      author: from.replace(/<.*>/, '').trim(),
    });
  }

  return results;
}

/** Escape a value for a Drive query string literal. */
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Search Google Drive with real multi-word support.
 *
 * The old version did `name contains 'budget doc'` — a literal substring match,
 * so "Q3 Budget Planning" never matched. Now we:
 *   - match the whole phrase in the file NAME, OR every term in the CONTENT
 *   - broaden to an OR-of-terms across name + content if that returns little
 * so partial and out-of-order matches are found.
 *
 * A query starting with "query:" is still passed through as a raw Drive API filter.
 */
export async function searchDrive(
  auth: Auth.OAuth2Client,
  query: string
): Promise<SearchResult[]> {
  const drive = google.drive({ version: 'v3', auth });
  const allFiles: any[] = [];
  const seenIds = new Set<string>();

  const collect = (files: any[] | undefined) => {
    for (const f of files || []) {
      if (f.id && !seenIds.has(f.id)) {
        seenIds.add(f.id);
        allFiles.push(f);
      }
    }
  };

  const runQuery = async (q: string) => {
    try {
      const r = await drive.files.list({
        q,
        fields: DRIVE_FIELDS,
        pageSize: DRIVE_PAGE,
        orderBy: 'modifiedTime desc',
        spaces: 'drive',
      });
      collect(r.data.files || undefined);
    } catch (e: any) {
      console.error(`Drive query error for "${q}":`, e.message);
    }
  };

  // Raw API query passthrough
  if (query.startsWith('query:')) {
    await runQuery(query.slice(6).trim());
    return filesToResults(allFiles);
  }

  const phrase = query.trim();
  const terms = phrase
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((t) => t.length > 1);

  if (terms.length <= 1) {
    const w = esc(terms[0] || phrase);
    await runQuery(`(name contains '${w}' or fullText contains '${w}') and trashed = false`);
  } else {
    // Precise pass: filename holds the phrase, OR the content holds every term
    const nameClause = `name contains '${esc(phrase)}'`;
    const contentAnd = terms.map((t) => `fullText contains '${esc(t)}'`).join(' and ');
    await runQuery(`(${nameClause} or (${contentAnd})) and trashed = false`);

    // Broaden if the precise pass found little: any term in name or content
    if (allFiles.length < 3) {
      const orClause = terms
        .map((t) => `name contains '${esc(t)}' or fullText contains '${esc(t)}'`)
        .join(' or ');
      await runQuery(`(${orClause}) and trashed = false`);
    }
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
    snippet:
      file.description ||
      `${file.name} — last modified ${new Date(file.modifiedTime || '').toLocaleDateString()}`,
    url: file.webViewLink || `https://drive.google.com/file/d/${file.id}`,
    timestamp: file.modifiedTime || new Date().toISOString(),
    author: file.owners?.[0]?.displayName ?? undefined,
  }));
}
