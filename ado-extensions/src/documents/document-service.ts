import { createHash, randomUUID } from 'node:crypto';

export type DocumentStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'ARCHIVED';

export type DocumentVersion = Readonly<{
  id: string;
  documentId: string;
  version: number;
  storageKey: string;
  checksum: string;
  sizeBytes: number;
  mimeType: string;
  createdBy: string;
  createdAt: string;
}>;

export type DocumentRecord = Readonly<{
  id: string;
  tenantKey: string;
  title: string;
  ownerKey: string;
  status: DocumentStatus;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
  versions: readonly DocumentVersion[];
}>;

export interface DocumentRepository {
  find(tenantKey: string, documentId: string): Promise<DocumentRecord | null>;
  create(document: DocumentRecord): Promise<DocumentRecord>;
  addVersion(documentId: string, version: DocumentVersion): Promise<DocumentRecord>;
  setStatus(tenantKey: string, documentId: string, status: DocumentStatus, updatedAt: string): Promise<DocumentRecord>;
}

export class DocumentError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'DocumentError';
  }
}

const transitions: Readonly<Record<DocumentStatus, readonly DocumentStatus[]>> = Object.freeze({
  DRAFT: ['IN_REVIEW', 'ARCHIVED'],
  IN_REVIEW: ['APPROVED', 'REJECTED'],
  APPROVED: ['ARCHIVED'],
  REJECTED: ['DRAFT', 'ARCHIVED'],
  ARCHIVED: [],
});

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new DocumentError('INVALID_INPUT', `${field} is required.`);
  return normalized;
}

function now(): string { return new Date().toISOString(); }

export function checksumForContent(content: Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

export async function createDocument(
  repository: DocumentRepository,
  input: Readonly<{ tenantKey: string; title: string; ownerKey: string; createdBy: string; storageKey: string; checksum: string; sizeBytes: number; mimeType: string }>,
): Promise<DocumentRecord> {
  const tenantKey = required(input.tenantKey, 'Tenant');
  const title = required(input.title, 'Title');
  const ownerKey = required(input.ownerKey, 'Owner');
  const createdBy = required(input.createdBy, 'Creator');
  const storageKey = required(input.storageKey, 'Storage key');
  const checksum = required(input.checksum, 'Checksum');
  const mimeType = required(input.mimeType, 'MIME type');
  if (!/^[a-f0-9]{64}$/.test(checksum)) throw new DocumentError('INVALID_CHECKSUM', 'Checksum must be a SHA-256 hex digest.');
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0) throw new DocumentError('INVALID_SIZE', 'Document size must be a positive safe integer.');
  const timestamp = now();
  const id = randomUUID();
  const version: DocumentVersion = Object.freeze({ id: randomUUID(), documentId: id, version: 1, storageKey, checksum, sizeBytes: input.sizeBytes, mimeType, createdBy, createdAt: timestamp });
  return repository.create(Object.freeze({ id, tenantKey, title, ownerKey, status: 'DRAFT', currentVersion: 1, createdAt: timestamp, updatedAt: timestamp, versions: Object.freeze([version]) }));
}

export async function addDocumentVersion(
  repository: DocumentRepository,
  input: Readonly<{ tenantKey: string; documentId: string; createdBy: string; storageKey: string; checksum: string; sizeBytes: number; mimeType: string }>,
): Promise<DocumentRecord> {
  const document = await repository.find(required(input.tenantKey, 'Tenant'), required(input.documentId, 'Document ID'));
  if (!document) throw new DocumentError('NOT_FOUND', 'Document was not found.');
  if (document.status === 'ARCHIVED') throw new DocumentError('ARCHIVED', 'Archived documents cannot receive new versions.');
  const checksum = required(input.checksum, 'Checksum');
  if (!/^[a-f0-9]{64}$/.test(checksum)) throw new DocumentError('INVALID_CHECKSUM', 'Checksum must be a SHA-256 hex digest.');
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0) throw new DocumentError('INVALID_SIZE', 'Document size must be a positive safe integer.');
  const version: DocumentVersion = Object.freeze({ id: randomUUID(), documentId: document.id, version: document.currentVersion + 1, storageKey: required(input.storageKey, 'Storage key'), checksum, sizeBytes: input.sizeBytes, mimeType: required(input.mimeType, 'MIME type'), createdBy: required(input.createdBy, 'Creator'), createdAt: now() });
  return repository.addVersion(document.id, version);
}

export async function transitionDocument(
  repository: DocumentRepository,
  input: Readonly<{ tenantKey: string; documentId: string; status: DocumentStatus }>,
): Promise<DocumentRecord> {
  const tenantKey = required(input.tenantKey, 'Tenant');
  const document = await repository.find(tenantKey, required(input.documentId, 'Document ID'));
  if (!document) throw new DocumentError('NOT_FOUND', 'Document was not found.');
  if (!transitions[document.status].includes(input.status)) throw new DocumentError('INVALID_TRANSITION', `${document.status} cannot transition to ${input.status}.`);
  return repository.setStatus(tenantKey, document.id, input.status, now());
}

export class MemoryDocumentRepository implements DocumentRepository {
  private readonly documents = new Map<string, DocumentRecord>();

  async find(tenantKey: string, documentId: string): Promise<DocumentRecord | null> {
    const document = this.documents.get(documentId);
    return document?.tenantKey === tenantKey ? document : null;
  }

  async create(document: DocumentRecord): Promise<DocumentRecord> {
    this.documents.set(document.id, document);
    return document;
  }

  async addVersion(documentId: string, version: DocumentVersion): Promise<DocumentRecord> {
    const document = this.documents.get(documentId);
    if (!document) throw new DocumentError('NOT_FOUND', 'Document was not found.');
    const updated = Object.freeze({ ...document, currentVersion: version.version, updatedAt: version.createdAt, versions: Object.freeze([...document.versions, version]) });
    this.documents.set(documentId, updated);
    return updated;
  }

  async setStatus(tenantKey: string, documentId: string, status: DocumentStatus, updatedAt: string): Promise<DocumentRecord> {
    const document = await this.find(tenantKey, documentId);
    if (!document) throw new DocumentError('NOT_FOUND', 'Document was not found.');
    const updated = Object.freeze({ ...document, status, updatedAt });
    this.documents.set(documentId, updated);
    return updated;
  }
}
