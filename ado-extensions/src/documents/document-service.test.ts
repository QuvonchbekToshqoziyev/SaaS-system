import assert from 'node:assert/strict';
import test from 'node:test';
import { addDocumentVersion, checksumForContent, createDocument, DocumentError, MemoryDocumentRepository, transitionDocument } from './document-service.js';

const checksum = checksumForContent(new TextEncoder().encode('contract-v1'));

test('documents keep immutable versions and enforce approval workflow', async () => {
  const repository = new MemoryDocumentRepository();
  const document = await createDocument(repository, { tenantKey: 'tenant-a', title: 'Contract', ownerKey: 'firm-a', createdBy: 'user-a', storageKey: 'tenant-a/contract-v1', checksum, sizeBytes: 11, mimeType: 'text/plain' });
  const versioned = await addDocumentVersion(repository, { tenantKey: 'tenant-a', documentId: document.id, createdBy: 'user-a', storageKey: 'tenant-a/contract-v2', checksum: checksumForContent(new TextEncoder().encode('contract-v2')), sizeBytes: 11, mimeType: 'text/plain' });
  assert.equal(versioned.currentVersion, 2);
  assert.equal(versioned.versions.length, 2);
  await transitionDocument(repository, { tenantKey: 'tenant-a', documentId: document.id, status: 'IN_REVIEW' });
  const approved = await transitionDocument(repository, { tenantKey: 'tenant-a', documentId: document.id, status: 'APPROVED' });
  assert.equal(approved.status, 'APPROVED');
});

test('documents reject cross-tenant access and invalid transitions', async () => {
  const repository = new MemoryDocumentRepository();
  const document = await createDocument(repository, { tenantKey: 'tenant-a', title: 'Private', ownerKey: 'firm-a', createdBy: 'user-a', storageKey: 'tenant-a/private', checksum, sizeBytes: 1, mimeType: 'text/plain' });
  await assert.rejects(() => transitionDocument(repository, { tenantKey: 'tenant-b', documentId: document.id, status: 'IN_REVIEW' }), (error: unknown) => error instanceof DocumentError && error.code === 'NOT_FOUND');
  await assert.rejects(() => transitionDocument(repository, { tenantKey: 'tenant-a', documentId: document.id, status: 'APPROVED' }), (error: unknown) => error instanceof DocumentError && error.code === 'INVALID_TRANSITION');
});
