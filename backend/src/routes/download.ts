import { Router } from 'express';
import { google } from 'googleapis';
import { getGoogleAuth } from './auth';

export const downloadRouter = Router();

/**
 * GET /api/download/drive/:fileId
 * Proxies a Google Drive file download through the backend using stored OAuth tokens.
 * This enables drag-and-drop to desktop (DownloadURL needs a direct URL).
 */
downloadRouter.get('/drive/:fileId', async (req, res) => {
  try {
    const auth = getGoogleAuth();
    if (!auth) {
      res.status(401).json({ error: 'Google not connected' });
      return;
    }

    const fileId = String(req.params.fileId);
    const drive = google.drive({ version: 'v3', auth });

    // Get file metadata first (name, mimeType)
    const meta = await drive.files.get({
      fileId,
      fields: 'name, mimeType, size',
    });

    const fileName = meta.data.name || 'download';
    const mimeType = meta.data.mimeType || 'application/octet-stream';

    // Google Workspace files (Docs, Sheets, Slides) need export
    const exportMimeMap: Record<string, { mime: string; ext: string }> = {
      'application/vnd.google-apps.document': { mime: 'application/pdf', ext: '.pdf' },
      'application/vnd.google-apps.spreadsheet': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: '.xlsx' },
      'application/vnd.google-apps.presentation': { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: '.pptx' },
      'application/vnd.google-apps.drawing': { mime: 'application/pdf', ext: '.pdf' },
    };

    const exportInfo = exportMimeMap[mimeType];

    if (exportInfo) {
      // Export Google Workspace file
      const exported: any = await drive.files.export(
        { fileId, mimeType: exportInfo.mime },
        { responseType: 'stream' }
      );

      const exportName = fileName.endsWith(exportInfo.ext) ? fileName : `${fileName}${exportInfo.ext}`;
      res.setHeader('Content-Type', exportInfo.mime);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(exportName)}"`);
      exported.data.pipe(res);
    } else {
      // Download binary file directly
      const file: any = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'stream' }
      );

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
      file.data.pipe(res);
    }
  } catch (err: any) {
    console.error('Drive download error:', err?.message || err);
    res.status(500).json({ error: 'Download failed' });
  }
});

/**
 * GET /api/download/gmail/:messageId/attachments/:attachmentId
 * Proxies a Gmail attachment download.
 */
downloadRouter.get('/gmail/:messageId/attachments/:attachmentId', async (req, res) => {
  try {
    const auth = getGoogleAuth();
    if (!auth) {
      res.status(401).json({ error: 'Google not connected' });
      return;
    }

    const messageId = String(req.params.messageId);
    const attachmentId = String(req.params.attachmentId);
    const filename = String(req.query.name || 'attachment');

    const gmail = google.gmail({ version: 'v1', auth });

    const attachment = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId,
      id: attachmentId,
    });

    if (!attachment.data.data) {
      res.status(404).json({ error: 'Attachment not found' });
      return;
    }

    // Gmail returns base64url encoded data
    const buffer = Buffer.from(attachment.data.data, 'base64url');

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(buffer);
  } catch (err: any) {
    console.error('Gmail attachment download error:', err?.message || err);
    res.status(500).json({ error: 'Download failed' });
  }
});

/**
 * GET /api/download/info/:source/:id
 * Returns download metadata (URL, filename, mimeType) so the frontend
 * can set up the drag-and-drop DownloadURL correctly.
 */
downloadRouter.get('/info/:source/:id', async (req, res) => {
  try {
    const auth = getGoogleAuth();
    if (!auth) {
      res.status(401).json({ error: 'Google not connected' });
      return;
    }

    const source = String(req.params.source);
    const id = String(req.params.id);

    if (source === 'drive') {
      const drive = google.drive({ version: 'v3', auth });
      const meta = await drive.files.get({
        fileId: id,
        fields: 'name, mimeType',
      });

      const mimeType = meta.data.mimeType || 'application/octet-stream';
      const fileName = meta.data.name || 'download';

      // For Google Workspace types, the download proxy exports them
      const exportMimeMap: Record<string, string> = {
        'application/vnd.google-apps.document': 'application/pdf',
        'application/vnd.google-apps.spreadsheet': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.google-apps.presentation': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      };

      const downloadMime = exportMimeMap[mimeType] || mimeType;

      res.json({
        fileName,
        mimeType: downloadMime,
        downloadUrl: `http://localhost:3001/api/download/drive/${id}`,
      });
    } else {
      // Gmail — for emails we just return the view URL
      res.json({
        fileName: 'email.eml',
        mimeType: 'message/rfc822',
        downloadUrl: null, // Can't easily download entire emails as files
      });
    }
  } catch (err: any) {
    console.error('Download info error:', err?.message || err);
    res.status(500).json({ error: 'Could not get file info' });
  }
});
