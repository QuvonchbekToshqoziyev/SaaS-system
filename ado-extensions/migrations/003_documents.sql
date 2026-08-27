CREATE TABLE IF NOT EXISTS ado_extension_documents (
  id text PRIMARY KEY,
  tenant_key text NOT NULL,
  title text NOT NULL,
  owner_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED')),
  current_version integer NOT NULL CHECK (current_version > 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS ado_extension_document_versions (
  id text PRIMARY KEY,
  document_id text NOT NULL REFERENCES ado_extension_documents(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  storage_key text NOT NULL,
  checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  mime_type text NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (document_id, version)
);

CREATE INDEX IF NOT EXISTS ado_extension_documents_tenant_status_idx
  ON ado_extension_documents (tenant_key, status, updated_at DESC);
