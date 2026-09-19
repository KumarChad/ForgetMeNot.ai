import { Router, Request, Response } from 'express';
import { google } from 'googleapis';
import { saveTokens, loadTokens, hasTokens } from '../services/tokenStore';

export const authRouter = Router();

// In-memory cache for the OAuth client so sync callers still work
let cachedGoogleClient: ReturnType<typeof getGoogleOAuthClient> | null = null;

function getGoogleOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

/**
 * On startup, load tokens from DynamoDB into memory so getGoogleAuth() works immediately.
 */
export async function initTokens(): Promise<void> {
  const tokens = await loadTokens('default', 'google');
  if (tokens) {
    const client = getGoogleOAuthClient();
    client.setCredentials(tokens);

    // Auto-refresh: save new tokens back when they get refreshed
    client.on('tokens', async (newTokens) => {
      const existing = await loadTokens('default', 'google');
      const merged = { ...existing, ...newTokens };
      await saveTokens('default', 'google', merged);
      console.log('  🔄 Google tokens refreshed and saved');
    });

    cachedGoogleClient = client;
    console.log('  ✅ Google tokens loaded from DynamoDB');
  } else {
    console.log('  ℹ️  No saved Google tokens — connect via the extension');
  }
}

authRouter.get('/status', async (_req: Request, res: Response) => {
  const googleConnected = cachedGoogleClient !== null || await hasTokens('default', 'google');

  res.json({
    google: {
      connected: googleConnected,
      scopes: ['gmail.readonly', 'drive.readonly'],
    },
    slack: {
      connected: await hasTokens('default', 'slack'),
      scopes: ['search:read', 'channels:read'],
    },
  });
});

authRouter.get('/google/start', (_req: Request, res: Response) => {
  const oauth2Client = getGoogleOAuthClient();

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
  });

  res.json({ authUrl });
});

authRouter.get('/google/callback', async (req: Request, res: Response) => {
  try {
    const { code } = req.query;
    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'No authorization code' });
      return;
    }

    const oauth2Client = getGoogleOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Save to DynamoDB (encrypted at rest)
    await saveTokens('default', 'google', tokens);

    // Update in-memory client
    oauth2Client.on('tokens', async (newTokens) => {
      const existing = await loadTokens('default', 'google');
      const merged = { ...existing, ...newTokens };
      await saveTokens('default', 'google', merged);
      console.log('  🔄 Google tokens refreshed and saved');
    });
    cachedGoogleClient = oauth2Client;

    console.log('✅ Google OAuth connected — tokens saved to DynamoDB');

    res.send(`
      <html>
        <body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;">
          <div style="text-align:center">
            <h2>Connected!</h2>
            <p>Gmail and Google Drive are now connected to ForgetMeNot.</p>
            <p>You can close this tab.</p>
            <script>setTimeout(() => window.close(), 2000);</script>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Google OAuth error:', error);
    res.status(500).json({ error: 'OAuth failed' });
  }
});

/**
 * Get authenticated Google OAuth client (sync, from memory cache).
 * Call initTokens() on startup to populate from DynamoDB.
 */
export function getGoogleAuth(): ReturnType<typeof getGoogleOAuthClient> | null {
  return cachedGoogleClient;
}
