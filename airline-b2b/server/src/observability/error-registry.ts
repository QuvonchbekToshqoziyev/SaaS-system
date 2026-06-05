import '../env';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { logger } from '../logger';

export type ErrorStatus = 'OPEN' | 'RESOLVED';
export type ErrorLevel = 'error' | 'warn';

export type ErrorContext = {
  method?: string;
  path?: string;
  statusCode?: number;
  userId?: string;
  role?: string;
  firmId?: string;
};

export type ErrorRegistryEntry = {
  id: string;
  fingerprint: string;
  level: ErrorLevel;
  status: ErrorStatus;
  message: string;
  stack?: string;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  lastContext?: ErrorContext;
  resolvedAt?: string;
  resolutionNote?: string;
  resolvedByUserId?: string;
  resolvedByRole?: string;
  reopenedAt?: string;
};

function toIsoNow(): string {
  return new Date().toISOString();
}

function hashId(fingerprint: string): string {
  return crypto.createHash('sha256').update(fingerprint).digest('hex').slice(0, 16);
}

function safeStack(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const stack = (err as any).stack;
  if (!stack || typeof stack !== 'string') return undefined;
  const trimmed = stack.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 8000);
}

function safeMessage(err: unknown): string {
  if (err instanceof Error) return err.message || err.name || 'Error';
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Unknown error';
  }
}

function stackTopLine(stack?: string): string {
  if (!stack) return '';
  const lines = stack.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines[0] || '';
}

type ResolveInput = {
  note?: string;
  resolvedByUserId?: string;
  resolvedByRole?: string;
};

export class ErrorRegistry {
  private readonly entriesById = new Map<string, ErrorRegistryEntry>();
  private readonly entriesByFingerprint = new Map<string, ErrorRegistryEntry>();

  private readonly filePath: string | undefined;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(filePathFromEnv?: string) {
    const configured = filePathFromEnv?.trim();
    this.filePath = configured ? path.resolve(configured) : undefined;
    this.loadFromDisk();
  }

  private loadFromDisk() {
    if (!this.filePath) return;
    try {
      if (!fs.existsSync(this.filePath)) return;
      const raw = fs.readFileSync(this.filePath, 'utf8');
      if (!raw.trim()) return;
      const parsed = JSON.parse(raw) as ErrorRegistryEntry[];
      if (!Array.isArray(parsed)) return;
      for (const entry of parsed) {
        if (!entry || typeof entry !== 'object') continue;
        if (!entry.id || !entry.fingerprint) continue;
        this.entriesById.set(entry.id, entry);
        this.entriesByFingerprint.set(entry.fingerprint, entry);
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to load error registry from disk');
    }
  }

  private scheduleSave() {
    if (!this.filePath) return;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveToDisk();
    }, 200);
  }

  private saveToDisk() {
    if (!this.filePath) return;
    try {
      const entries = Array.from(this.entriesById.values());
      const dir = path.dirname(this.filePath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(entries, null, 2) + '\n', 'utf8');
    } catch (err) {
      logger.warn({ err }, 'Failed to persist error registry to disk');
    }
  }

  private upsert(fingerprint: string, input: Omit<ErrorRegistryEntry, 'id' | 'fingerprint' | 'count' | 'firstSeenAt' | 'lastSeenAt'>) {
    const existing = this.entriesByFingerprint.get(fingerprint);
    const now = toIsoNow();

    if (existing) {
      existing.lastSeenAt = now;
      existing.count += 1;
      existing.level = input.level;
      existing.message = input.message;
      existing.stack = input.stack;
      existing.lastContext = input.lastContext;

      if (existing.status === 'RESOLVED') {
        existing.status = 'OPEN';
        existing.reopenedAt = now;
        existing.resolvedAt = undefined;
        existing.resolutionNote = undefined;
        existing.resolvedByUserId = undefined;
        existing.resolvedByRole = undefined;
      }

      this.scheduleSave();
      return existing;
    }

    const entry: ErrorRegistryEntry = {
      id: hashId(fingerprint),
      fingerprint,
      level: input.level,
      status: 'OPEN',
      message: input.message,
      stack: input.stack,
      count: 1,
      firstSeenAt: now,
      lastSeenAt: now,
      lastContext: input.lastContext,
    };
    this.entriesByFingerprint.set(fingerprint, entry);
    this.entriesById.set(entry.id, entry);
    this.scheduleSave();
    return entry;
  }

  recordException(err: unknown, context: ErrorContext = {}) {
    const message = safeMessage(err);
    const stack = safeStack(err);
    const fingerprint = [
      'EX',
      context.method || '',
      context.path || '',
      String(context.statusCode || ''),
      message,
      stackTopLine(stack),
    ].join('|');

    return this.upsert(fingerprint, {
      level: 'error',
      message,
      stack,
      lastContext: context,
      status: 'OPEN',
    });
  }

  recordHttpError(context: ErrorContext) {
    const message = `HTTP ${context.statusCode || 500}`;
    const fingerprint = [
      'HTTP',
      context.method || '',
      context.path || '',
      String(context.statusCode || 500),
    ].join('|');

    return this.upsert(fingerprint, {
      level: 'error',
      message,
      stack: undefined,
      lastContext: context,
      status: 'OPEN',
    });
  }

  list(status: 'OPEN' | 'RESOLVED' | 'ALL' = 'OPEN') {
    const all = Array.from(this.entriesById.values());
    const filtered =
      status === 'ALL' ? all : all.filter((e) => e.status === status);
    return filtered.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  }

  counts() {
    let open = 0;
    let resolved = 0;
    for (const e of this.entriesById.values()) {
      if (e.status === 'OPEN') open += 1;
      if (e.status === 'RESOLVED') resolved += 1;
    }
    return { open, resolved, total: open + resolved };
  }

  resolve(id: string, input: ResolveInput = {}) {
    const entry = this.entriesById.get(String(id));
    if (!entry) return null;
    if (entry.status === 'RESOLVED') return entry;
    entry.status = 'RESOLVED';
    entry.resolvedAt = toIsoNow();
    entry.resolutionNote = input.note?.trim() || undefined;
    entry.resolvedByUserId = input.resolvedByUserId;
    entry.resolvedByRole = input.resolvedByRole;
    this.scheduleSave();
    return entry;
  }
}

export const errorRegistry = new ErrorRegistry(process.env.ERROR_REGISTRY_PATH);
