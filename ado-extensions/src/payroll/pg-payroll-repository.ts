import type { Pool, PoolClient } from 'pg';
import type { PayrollLine, PayrollRepository, PayrollRun, PayrollStatus } from './payroll-service.js';

type RunRow = {
  id: string; tenant_key: string; period: string; status: PayrollStatus; currency: string;
  total_gross: string; total_deductions: string; total_net: string; created_at: string; updated_at: string;
};
type LineRow = { employee_key: string; gross: string; deductions: string; net: string; currency: string };

export class PgPayrollRepository implements PayrollRepository {
  constructor(private readonly pool: Pool) {}

  async find(tenantKey: string, runId: string): Promise<PayrollRun | null> {
    const result = await this.pool.query<RunRow>(
      `SELECT id, tenant_key, period, status, currency, total_gross::text,
              total_deductions::text, total_net::text, created_at, updated_at
         FROM ado_extension_payroll_runs WHERE tenant_key = $1 AND id = $2`, [tenantKey, runId]);
    return result.rows[0] ? this.load(result.rows[0], this.pool) : null;
  }

  async create(run: PayrollRun): Promise<PayrollRun> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO ado_extension_payroll_runs
          (id, tenant_key, period, status, currency, total_gross, total_deductions, total_net, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [run.id, run.tenantKey, run.period, run.status, run.currency, run.totalGross, run.totalDeductions, run.totalNet, run.createdAt, run.updatedAt]);
      for (const line of run.lines) await this.insertLine(client, run.id, line);
      await client.query('COMMIT');
      return run;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async setStatus(tenantKey: string, runId: string, status: PayrollStatus, updatedAt: string): Promise<PayrollRun> {
    const result = await this.pool.query<RunRow>(
      `UPDATE ado_extension_payroll_runs SET status = $3, updated_at = $4
        WHERE tenant_key = $1 AND id = $2
        RETURNING id, tenant_key, period, status, currency, total_gross::text,
                  total_deductions::text, total_net::text, created_at, updated_at`, [tenantKey, runId, status, updatedAt]);
    if (!result.rows[0]) throw new Error('Payroll run not found.');
    return this.load(result.rows[0], this.pool);
  }

  private async insertLine(executor: Pick<PoolClient, 'query'>, runId: string, line: PayrollLine): Promise<void> {
    await executor.query(
      `INSERT INTO ado_extension_payroll_lines (run_id, employee_key, gross, deductions, net, currency)
       VALUES ($1, $2, $3, $4, $5, $6)`, [runId, line.employeeKey, line.gross, line.deductions, line.net, line.currency]);
  }

  private async load(row: RunRow, executor: Pick<Pool, 'query'>): Promise<PayrollRun> {
    const lines = await executor.query<LineRow>(
      `SELECT employee_key, gross::text, deductions::text, net::text, currency
         FROM ado_extension_payroll_lines WHERE run_id = $1 ORDER BY employee_key`, [row.id]);
    return Object.freeze({
      id: row.id, tenantKey: row.tenant_key, period: row.period, status: row.status, currency: row.currency,
      totalGross: row.total_gross, totalDeductions: row.total_deductions, totalNet: row.total_net,
      createdAt: row.created_at, updatedAt: row.updated_at,
      lines: Object.freeze(lines.rows.map((line) => Object.freeze({ employeeKey: line.employee_key, gross: line.gross, deductions: line.deductions, net: line.net, currency: line.currency }))),
    });
  }
}
