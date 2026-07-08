import crypto from 'crypto';

const ENCRYPTED_PREFIX = 'enc:v1:';
const JSON_MARKER = '__adoEncryptedJson';

function getRawKey(): string {
  return String(process.env.CHAT_ENCRYPTION_KEY || process.env.DATA_ENCRYPTION_KEY || '').trim();
}

function decodeKey(raw: string): Buffer {
  if (/^[a-f0-9]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');

  try {
    const decoded = Buffer.from(raw, 'base64');
    if (decoded.length === 32) return decoded;
  } catch {
    // Fall through to deterministic hash for passphrase-style secrets.
  }

  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

function getKey(): Buffer | null {
  const raw = getRawKey();
  if (!raw) return null;
  return decodeKey(raw);
}

export function isChatEncryptionEnabled(): boolean {
  return Boolean(getRawKey());
}

export function isEncryptedString(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(ENCRYPTED_PREFIX);
}

export function encryptChatString(value: string | null | undefined): string | null {
  if (value == null || value === '') return value ?? null;
  if (isEncryptedString(value)) return value;

  const key = getKey();
  if (!key) return value;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENCRYPTED_PREFIX}${Buffer.from(JSON.stringify({
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: ciphertext.toString('base64'),
  })).toString('base64')}`;
}

export function decryptChatString(value: string | null | undefined): string | null {
  if (value == null || value === '') return value ?? null;
  if (!isEncryptedString(value)) return value;

  const key = getKey();
  if (!key) return '[encrypted message unavailable]';

  try {
    const payload = JSON.parse(Buffer.from(value.slice(ENCRYPTED_PREFIX.length), 'base64').toString('utf8'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(payload.data, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return '[encrypted message unavailable]';
  }
}

export function encryptChatJson(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'object' && !Array.isArray(value) && (value as any)[JSON_MARKER]) return value;

  const encoded = encryptChatString(JSON.stringify(value));
  if (!isEncryptedString(encoded)) return value;
  return { [JSON_MARKER]: true, version: 1, payload: encoded };
}

export function decryptChatJson(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !(value as any)[JSON_MARKER]) return value;
  const decrypted = decryptChatString((value as any).payload);
  if (!decrypted || decrypted === '[encrypted message unavailable]') return null;
  try {
    return JSON.parse(decrypted);
  } catch {
    return null;
  }
}

export function decryptChatMessageRow<T extends { content?: string | null; attachment?: unknown; replyToMessage?: any; forwardedFrom?: any }>(row: T): T {
  const decrypted: any = {
    ...row,
    content: decryptChatString(row.content),
    attachment: decryptChatJson(row.attachment),
  };
  if (row.replyToMessage) decrypted.replyToMessage = decryptChatMessageRow(row.replyToMessage);
  if (row.forwardedFrom) decrypted.forwardedFrom = decryptChatMessageRow(row.forwardedFrom);
  return decrypted;
}
