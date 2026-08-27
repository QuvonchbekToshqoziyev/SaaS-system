CREATE TABLE IF NOT EXISTS ado_extension_tax_rules (
  tenant_key text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  rate_basis_points integer NOT NULL CHECK (rate_basis_points >= 0 AND rate_basis_points <= 100000),
  effective_from date NOT NULL,
  effective_to date,
  source_ref text NOT NULL,
  PRIMARY KEY (tenant_key, code),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE TABLE IF NOT EXISTS ado_extension_tax_calculations (
  id text PRIMARY KEY,
  tenant_key text NOT NULL,
  rule_code text NOT NULL,
  taxable_amount numeric(24,4) NOT NULL CHECK (taxable_amount >= 0),
  tax_amount numeric(24,4) NOT NULL CHECK (tax_amount >= 0),
  total_amount numeric(24,4) NOT NULL CHECK (total_amount >= 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  calculated_at timestamptz NOT NULL,
  input_fingerprint text NOT NULL
);

CREATE INDEX IF NOT EXISTS ado_extension_tax_rules_effective_idx
  ON ado_extension_tax_rules (tenant_key, code, effective_from, effective_to);
