import type { Pool } from 'pg';
import { JournalError, type AccountBalance, type JournalEntry, type JournalRepository } from './journal-engine.js';

type JournalRow = {
  id: string;
  tenant_key: string;
  idempotency_key: string;
  fingerprint: string;
  standard_revision: string;
  posting_date: string;
  description: string;
  status: 'POSTED';
  reversal_of_id: string | null;
};

type LineRow = {
  account_code: string;
  account_class: JournalEntry['lines'][number]['accountClass'];
  debit_amount: string;
  credit_amount: string;
  currency: string;
};

export class PgJournalRepository implements JournalRepository {
  constructor(private readonly pool: Pool) {}

  async findByIdempotency(tenantKey: string, idempotencyKey: string): Promise<JournalEntry | null> {
    const result = await this.pool.query<JournalRow>(
      `SELECT id, tenant_key, idempotency_key, fingerprint, standard_revision,
              posting_date::text, description, status, reversal_of_id
         FROM ado_extension_journal_entries
        WHERE tenant_key = $1 AND idempotency_key = $2`,
      [tenantKey, idempotencyKey],
    );
    if (!result.rows[0]) return null;
    return this.loadEntry(result.rows[0], this.pool);
  }

  async save(entry: JournalEntry): Promise<JournalEntry> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO ado_extension_journal_entries
          (id, tenant_key, idempotency_key, fingerprint, standard_revision,
           posting_date, description, status, reversal_of_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (tenant_key, idempotency_key) DO NOTHING
         RETURNING id`,
        [entry.id, entry.tenantKey, entry.idempotencyKey, entry.fingerprint, entry.standardRevision, entry.postingDate, entry.description, entry.status, entry.reversalOfId || null],
      );
      if (!inserted.rowCount) {
        const existing = await client.query<JournalRow>(
          `SELECT id, tenant_key, idempotency_key, fingerprint, standard_revision,
                  posting_date::text, description, status, reversal_of_id
             FROM ado_extension_journal_entries
            WHERE tenant_key = $1 AND idempotency_key = $2
            FOR UPDATE`,
          [entry.tenantKey, entry.idempotencyKey],
        );
        if (!existing.rows[0]) throw new JournalError('IDEMPOTENCY_RETRY', 'Idempotency conflict could not be resolved.');
        if (existing.rows[0].fingerprint !== entry.fingerprint) throw new JournalError('IDEMPOTENCY_CONFLICT', 'Idempotency key was already used with different journal data.');
        const persisted = await this.loadEntry(existing.rows[0], client);
        await client.query('COMMIT');
        return persisted;
      }
      for (let index = 0; index < entry.lines.length; index += 1) {
        const line = entry.lines[index];
        await client.query(
          `INSERT INTO ado_extension_journal_lines
            (journal_id, line_no, account_code, account_class, debit_amount,
             credit_amount, currency)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [entry.id, index + 1, line.accountCode, line.accountClass, line.debit, line.credit, line.currency],
        );
      }
      await client.query('COMMIT');
      return entry;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findById(tenantKey: string, id: string): Promise<JournalEntry | null> {
    const result = await this.pool.query<JournalRow>(
      `SELECT id, tenant_key, idempotency_key, fingerprint, standard_revision,
              posting_date::text, description, status, reversal_of_id
         FROM ado_extension_journal_entries WHERE tenant_key = $1 AND id = $2`,
      [tenantKey, id],
    );
    return result.rows[0] ? this.loadEntry(result.rows[0], this.pool) : null;
  }

  async findReversal(tenantKey: string, originalId: string): Promise<JournalEntry | null> {
    const result = await this.pool.query<JournalRow>(
      `SELECT id, tenant_key, idempotency_key, fingerprint, standard_revision,
              posting_date::text, description, status, reversal_of_id
         FROM ado_extension_journal_entries WHERE tenant_key = $1 AND reversal_of_id = $2`,
      [tenantKey, originalId],
    );
    return result.rows[0] ? this.loadEntry(result.rows[0], this.pool) : null;
  }

  async isPostingDateOpen(tenantKey: string, date: string): Promise<boolean> {
    const result = await this.pool.query<{ is_open: boolean }>(
      `SELECT COALESCE((SELECT is_open FROM ado_extension_accounting_periods
                        WHERE tenant_key = $1 AND start_date <= $2::date AND end_date >= $2::date), true) AS is_open`,
      [tenantKey, date],
    );
    return result.rows[0]?.is_open ?? true;
  }

  async getAccountBalances(tenantKey: string, asOfDate: string): Promise<readonly AccountBalance[]> {
    const result = await this.pool.query<AccountBalance>(
      `SELECT account_code AS "accountCode", currency,
              SUM(debit_amount)::numeric(24,4)::text AS debit,
              SUM(credit_amount)::numeric(24,4)::text AS credit,
              (SUM(debit_amount) - SUM(credit_amount))::numeric(24,4)::text AS net
         FROM ado_extension_journal_entries e
         JOIN ado_extension_journal_lines l ON l.journal_id = e.id
        WHERE e.tenant_key = $1 AND e.posting_date <= $2::date
        GROUP BY account_code, currency ORDER BY account_code, currency`,
      [tenantKey, asOfDate],
    );
    return Object.freeze(result.rows);
  }

  private async loadEntry(row: JournalRow, executor: Pick<Pool, 'query'>): Promise<JournalEntry> {
    const lines = await executor.query<LineRow>(
      `SELECT account_code, account_class, debit_amount::text,
              credit_amount::text, currency
         FROM ado_extension_journal_lines
        WHERE journal_id = $1 ORDER BY line_no`,
      [row.id],
    );
    return Object.freeze({
      id: row.id,
      tenantKey: row.tenant_key,
      idempotencyKey: row.idempotency_key,
      fingerprint: row.fingerprint,
      standardRevision: row.standard_revision,
      postingDate: row.posting_date,
      description: row.description,
      status: row.status,
      ...(row.reversal_of_id ? { reversalOfId: row.reversal_of_id } : {}),
      lines: Object.freeze(lines.rows.map((line) => Object.freeze({
        accountCode: line.account_code,
        accountClass: line.account_class,
        debit: line.debit_amount,
        credit: line.credit_amount,
        currency: line.currency,
      }))),
    });
  }
}
