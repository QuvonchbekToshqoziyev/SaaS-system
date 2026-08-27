ALTER TABLE ado_extension_journal_entries
  ADD COLUMN IF NOT EXISTS reversal_of_id text
  REFERENCES ado_extension_journal_entries(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS ado_extension_one_reversal_per_entry_idx
  ON ado_extension_journal_entries (tenant_key, reversal_of_id)
  WHERE reversal_of_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS ado_extension_accounting_periods (
  tenant_key text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_open boolean NOT NULL DEFAULT true,
  PRIMARY KEY (tenant_key, start_date),
  CHECK (start_date <= end_date)
);
