CREATE TABLE IF NOT EXISTS ado_extension_payroll_runs (
  id text PRIMARY KEY,
  tenant_key text NOT NULL,
  period char(7) NOT NULL CHECK (period ~ '^\d{4}-\d{2}$'),
  status text NOT NULL CHECK (status IN ('CALCULATED', 'APPROVED', 'POSTED')),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  total_gross numeric(24,4) NOT NULL CHECK (total_gross >= 0),
  total_deductions numeric(24,4) NOT NULL CHECK (total_deductions >= 0),
  total_net numeric(24,4) NOT NULL CHECK (total_net >= 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (tenant_key, period)
);

CREATE TABLE IF NOT EXISTS ado_extension_payroll_lines (
  run_id text NOT NULL REFERENCES ado_extension_payroll_runs(id) ON DELETE RESTRICT,
  employee_key text NOT NULL,
  gross numeric(24,4) NOT NULL CHECK (gross >= 0),
  deductions numeric(24,4) NOT NULL CHECK (deductions >= 0),
  net numeric(24,4) NOT NULL CHECK (net >= 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  PRIMARY KEY (run_id, employee_key),
  CHECK (deductions <= gross)
);

CREATE INDEX IF NOT EXISTS ado_extension_payroll_tenant_period_idx
  ON ado_extension_payroll_runs (tenant_key, period DESC);
