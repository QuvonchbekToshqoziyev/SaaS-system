import { afterEach, describe, expect, it } from 'vitest';
import {
  decryptChatJson,
  decryptChatMessageRow,
  decryptChatString,
  encryptChatJson,
  encryptChatString,
  isChatEncryptionEnabled,
  isEncryptedString,
} from './chat-crypto';

const originalKey = process.env.CHAT_ENCRYPTION_KEY;

afterEach(() => {
  if (originalKey === undefined) delete process.env.CHAT_ENCRYPTION_KEY;
  else process.env.CHAT_ENCRYPTION_KEY = originalKey;
});

describe('chat crypto', () => {
  it('keeps plaintext behavior when no key is configured', () => {
    delete process.env.CHAT_ENCRYPTION_KEY;
    expect(isChatEncryptionEnabled()).toBe(false);
    expect(encryptChatString('hello')).toBe('hello');
    expect(decryptChatString('hello')).toBe('hello');
  });

  it('encrypts and decrypts message text when a key is configured', () => {
    process.env.CHAT_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    const encrypted = encryptChatString('private money message');

    expect(isEncryptedString(encrypted)).toBe(true);
    expect(encrypted).not.toContain('private money message');
    expect(decryptChatString(encrypted)).toBe('private money message');
  });

  it('encrypts and decrypts attachment JSON', () => {
    process.env.CHAT_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const attachment = { fileName: 'invoice.pdf', amount: 500 };

    const encrypted = encryptChatJson(attachment) as any;

    expect(encrypted.__adoEncryptedJson).toBe(true);
    expect(JSON.stringify(encrypted)).not.toContain('invoice.pdf');
    expect(decryptChatJson(encrypted)).toEqual(attachment);
  });

  it('decrypts nested reply and forward rows for API responses', () => {
    process.env.CHAT_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    const row = decryptChatMessageRow({
      id: 'message-1',
      content: encryptChatString('outer'),
      attachment: encryptChatJson({ kind: 'pdf' }),
      replyToMessage: { id: 'message-2', content: encryptChatString('reply'), attachment: null },
      forwardedFrom: { id: 'message-3', content: encryptChatString('forward'), attachment: null },
    });

    expect(row.content).toBe('outer');
    expect(row.attachment).toEqual({ kind: 'pdf' });
    expect(row.replyToMessage.content).toBe('reply');
    expect(row.forwardedFrom.content).toBe('forward');
  });
});
