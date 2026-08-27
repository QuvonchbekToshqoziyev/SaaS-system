CREATE TABLE IF NOT EXISTS ado_extension_journal_entries (
  id text PRIMARY KEY,
  tenant_key text NOT NULL,
  idempotency_key text NOT NULL,
  fingerprint text NOT NULL,
  standard_revision text NOT NULL,
  posting_date date NOT NULL,
  description text NOT NULL,
  status text NOT NULL CHECK (status = 'POSTED'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_key, idempotency_key)
);

CREATE TABLE IF NOT EXISTS ado_extension_journal_lines (
  journal_id text NOT NULL REFERENCES ado_extension_journal_entries(id) ON DELETE RESTRICT,
  line_no integer NOT NULL CHECK (line_no > 0),
  account_code text NOT NULL,
  account_class text NOT NULL CHECK (account_class IN ('A', 'P', 'KA', 'KP', 'T', 'BT')),
  debit_amount numeric(24, 4) NOT NULL CHECK (debit_amount >= 0),
  credit_amount numeric(24, 4) NOT NULL CHECK (credit_amount >= 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  PRIMARY KEY (journal_id, line_no),
  CHECK ((debit_amount > 0 AND credit_amount = 0) OR (debit_amount = 0 AND credit_amount > 0))
);

CREATE INDEX IF NOT EXISTS ado_extension_journal_entries_tenant_date_idx
  ON ado_extension_journal_entries (tenant_key, posting_date);
