import type { Pool, PoolClient } from 'pg';
import type { DocumentRecord, DocumentRepository, DocumentStatus, DocumentVersion } from './document-service.js';

type DocumentRow = Omit<DocumentRecord, 'versions' | 'createdAt' | 'updatedAt'> & { created_at: string; updated_at: string };
type VersionRow = {
  id: string;
  document_id: string;
  version: number;
  storage_key: string;
  checksum: string;
  size_bytes: string;
  mime_type: string;
  created_by: string;
  created_at: string;
};

export class PgDocumentRepository implements DocumentRepository {
  constructor(private readonly pool: Pool) {}

  async find(tenantKey: string, documentId: string): Promise<DocumentRecord | null> {
    const document = await this.pool.query<DocumentRow>(
      `SELECT id, tenant_key AS "tenantKey", title, owner_key AS "ownerKey", status,
              current_version AS "currentVersion", created_at, updated_at
         FROM ado_extension_documents WHERE tenant_key = $1 AND id = $2`, [tenantKey, documentId]);
    if (!document.rows[0]) return null;
    return this.load(document.rows[0], this.pool);
  }

  async create(document: DocumentRecord): Promise<DocumentRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO ado_extension_documents
          (id, tenant_key, title, owner_key, status, current_version, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [document.id, document.tenantKey, document.title, document.ownerKey, document.status, document.currentVersion, document.createdAt, document.updatedAt],
      );
      await this.insertVersion(client, document.versions[0]);
      await client.query('COMMIT');
      return document;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async addVersion(documentId: string, version: DocumentVersion): Promise<DocumentRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.insertVersion(client, version);
      const result = await client.query(
        `UPDATE ado_extension_documents SET current_version = $2, updated_at = $3
          WHERE id = $1 AND status <> 'ARCHIVED'
          RETURNING id, tenant_key AS "tenantKey", title, owner_key AS "ownerKey", status,
                    current_version AS "currentVersion", created_at, updated_at`,
        [documentId, version.version, version.createdAt]);
      if (!result.rows[0]) throw new Error('Document not found or archived.');
      const document = await this.load(result.rows[0] as DocumentRow, client);
      await client.query('COMMIT');
      return document;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async setStatus(tenantKey: string, documentId: string, status: DocumentStatus, updatedAt: string): Promise<DocumentRecord> {
    const result = await this.pool.query<DocumentRow>(
      `UPDATE ado_extension_documents SET status = $3, updated_at = $4
        WHERE tenant_key = $1 AND id = $2
        RETURNING id, tenant_key AS "tenantKey", title, owner_key AS "ownerKey", status,
                  current_version AS "currentVersion", created_at, updated_at`,
      [tenantKey, documentId, status, updatedAt]);
    if (!result.rows[0]) throw new Error('Document not found.');
    return this.load(result.rows[0], this.pool);
  }

  private async insertVersion(executor: Pick<PoolClient, 'query'>, version: DocumentVersion): Promise<void> {
    await executor.query(
      `INSERT INTO ado_extension_document_versions
        (id, document_id, version, storage_key, checksum, size_bytes, mime_type, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [version.id, version.documentId, version.version, version.storageKey, version.checksum, version.sizeBytes, version.mimeType, version.createdBy, version.createdAt],
    );
  }

  private async load(row: DocumentRow, executor: Pick<Pool, 'query'>): Promise<DocumentRecord> {
    const versions = await executor.query<VersionRow>(
      `SELECT id, document_id, version, storage_key, checksum, size_bytes, mime_type, created_by, created_at
         FROM ado_extension_document_versions WHERE document_id = $1 ORDER BY version`, [row.id]);
    return Object.freeze({
      id: row.id, tenantKey: row.tenantKey, title: row.title, ownerKey: row.ownerKey, status: row.status,
      currentVersion: row.currentVersion, createdAt: row.created_at, updatedAt: row.updated_at,
      versions: Object.freeze(versions.rows.map((version) => Object.freeze({
        id: version.id, documentId: version.document_id, version: version.version, storageKey: version.storage_key,
        checksum: version.checksum, sizeBytes: Number(version.size_bytes), mimeType: version.mime_type,
        createdBy: version.created_by, createdAt: version.created_at,
      }))),
    });
  }
}
