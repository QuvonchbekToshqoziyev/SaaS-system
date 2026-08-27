CREATE TABLE IF NOT EXISTS ado_extension_notifications (
  id text PRIMARY KEY,
  tenant_key text NOT NULL,
  recipient_key text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('IN_APP', 'TELEGRAM', 'EMAIL')),
  template text NOT NULL,
  payload jsonb NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING', 'SENDING', 'DELIVERED', 'FAILED')),
  attempts integer NOT NULL CHECK (attempts >= 0 AND attempts <= 3),
  last_error text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (tenant_key, idempotency_key)
);

CREATE INDEX IF NOT EXISTS ado_extension_notifications_delivery_idx
  ON ado_extension_notifications (tenant_key, status, updated_at);
