import { Router, Request, Response } from 'express';
import { google } from 'googleapis';

export const authRouter = Router();

const tokenStore: Record<string, Record<string, any>> = {};

function getGoogleOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

authRouter.get('/status', (_req: Request, res: Response) => {
  res.json({
    google: {
      connected: !!tokenStore['default']?.google,
      scopes: ['gmail.readonly', 'drive.readonly'],
    },
    slack: {
      connected: !!tokenStore['default']?.slack,
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

    if (!tokenStore['default']) tokenStore['default'] = {};
    tokenStore['default'].google = tokens;

    console.log('✅ Google OAuth connected successfully');

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

export function getTokens(userId: string = 'default') {
  return tokenStore[userId] || {};
}

export function getGoogleAuth(userId: string = 'default'): ReturnType<typeof getGoogleOAuthClient> | null {
  const tokens = tokenStore[userId]?.google;
  if (!tokens) return null;

  const client = getGoogleOAuthClient();
  client.setCredentials(tokens);
  return client;
}
