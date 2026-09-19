import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import crypto from 'crypto';

// ─── Config ──────────────────────────────────────────────────────────
function getTableName(): string { return process.env.DYNAMODB_TABLE || 'ForgetMeNot-Tokens'; }

// Simple AES-256-GCM encryption for tokens at rest
function getEncryptionKeyString(): string { return process.env.TOKEN_ENCRYPTION_KEY || 'forgetmenot-default-key-change-me!'; }

function getEncryptionKey(): Buffer {
  // Derive a 32-byte key from whatever string is provided
  return crypto.createHash('sha256').update(getEncryptionKeyString()).digest();
}

function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decrypt(encryptedText: string): string {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ─── DynamoDB client ─────────────────────────────────────────────────
let docClient: DynamoDBDocumentClient | null = null;

function getDocClient(): DynamoDBDocumentClient {
  if (!docClient) {
    const region = process.env.AWS_REGION || 'us-east-1';
    const client = new DynamoDBClient({ region });
    docClient = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return docClient;
}

// ─── In-memory cache (avoids hitting DynamoDB on every request) ──────
const memoryCache: Record<string, Record<string, any>> = {};

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Save tokens for a user+provider combination.
 * Encrypted at rest in DynamoDB, cached in memory.
 */
export async function saveTokens(
  userId: string,
  provider: string,
  tokens: Record<string, any>
): Promise<void> {
  // Update memory cache
  if (!memoryCache[userId]) memoryCache[userId] = {};
  memoryCache[userId][provider] = tokens;

  // Persist to DynamoDB
  try {
    const doc = getDocClient();
    const encryptedTokens = encrypt(JSON.stringify(tokens));

    await doc.send(
      new PutCommand({
        TableName: getTableName(),
        Item: {
          PK: `user#${userId}`,
          SK: `provider#${provider}`,
          encryptedTokens,
          provider,
          updatedAt: new Date().toISOString(),
          ttl: Math.floor(Date.now() / 1000) + 90 * 86400, // 90 day TTL
        },
      })
    );

    console.log(`✅ Tokens saved to DynamoDB for ${userId}/${provider}`);
  } catch (err: any) {
    console.error(`⚠️  DynamoDB save failed (using memory cache): ${err.message}`);
    // Memory cache still has the tokens, so the app keeps working
  }
}

/**
 * Load tokens for a user+provider combination.
 * Checks memory cache first, falls back to DynamoDB.
 */
export async function loadTokens(
  userId: string,
  provider: string
): Promise<Record<string, any> | null> {
  // Check memory cache first
  if (memoryCache[userId]?.[provider]) {
    return memoryCache[userId][provider];
  }

  // Fall back to DynamoDB
  try {
    const doc = getDocClient();
    const result = await doc.send(
      new GetCommand({
        TableName: getTableName(),
        Key: {
          PK: `user#${userId}`,
          SK: `provider#${provider}`,
        },
      })
    );

    if (result.Item?.encryptedTokens) {
      const tokens = JSON.parse(decrypt(result.Item.encryptedTokens));
      // Populate memory cache
      if (!memoryCache[userId]) memoryCache[userId] = {};
      memoryCache[userId][provider] = tokens;
      console.log(`✅ Tokens loaded from DynamoDB for ${userId}/${provider}`);
      return tokens;
    }
  } catch (err: any) {
    console.error(`⚠️  DynamoDB load failed: ${err.message}`);
  }

  return null;
}

/**
 * Delete tokens for a user+provider combination.
 */
export async function deleteTokens(
  userId: string,
  provider: string
): Promise<void> {
  // Clear memory cache
  if (memoryCache[userId]) {
    delete memoryCache[userId][provider];
  }

  try {
    const doc = getDocClient();
    await doc.send(
      new DeleteCommand({
        TableName: getTableName(),
        Key: {
          PK: `user#${userId}`,
          SK: `provider#${provider}`,
        },
      })
    );
  } catch (err: any) {
    console.error(`⚠️  DynamoDB delete failed: ${err.message}`);
  }
}

/**
 * Check if tokens exist for a user+provider (cached check).
 */
export async function hasTokens(
  userId: string,
  provider: string
): Promise<boolean> {
  const tokens = await loadTokens(userId, provider);
  return tokens !== null;
}
