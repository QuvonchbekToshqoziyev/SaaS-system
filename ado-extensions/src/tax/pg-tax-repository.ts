import type { Pool } from 'pg';
import type { TaxCalculation, TaxRepository, TaxRule } from './tax-service.js';

export class PgTaxRepository implements TaxRepository {
  constructor(private readonly pool: Pool) {}

  async findRule(tenantKey: string, code: string, date: string): Promise<TaxRule | null> {
    const result = await this.pool.query<TaxRule>(
      `SELECT code, name, rate_basis_points AS "rateBasisPoints",
              effective_from::text AS "effectiveFrom", effective_to::text AS "effectiveTo", source_ref AS "sourceRef"
         FROM ado_extension_tax_rules
        WHERE tenant_key = $1 AND code = $2 AND effective_from <= $3::date
          AND (effective_to IS NULL OR effective_to >= $3::date)`, [tenantKey, code, date]);
    return result.rows[0] || null;
  }

  async saveRule(tenantKey: string, rule: TaxRule): Promise<TaxRule> {
    await this.pool.query(
      `INSERT INTO ado_extension_tax_rules
        (tenant_key, code, name, rate_basis_points, effective_from, effective_to, source_ref)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (tenant_key, code) DO UPDATE SET name = EXCLUDED.name,
         rate_basis_points = EXCLUDED.rate_basis_points, effective_from = EXCLUDED.effective_from,
         effective_to = EXCLUDED.effective_to, source_ref = EXCLUDED.source_ref`,
      [tenantKey, rule.code, rule.name, rule.rateBasisPoints, rule.effectiveFrom, rule.effectiveTo || null, rule.sourceRef],
    );
    return rule;
  }

  async saveCalculation(calculation: TaxCalculation): Promise<TaxCalculation> {
    await this.pool.query(
      `INSERT INTO ado_extension_tax_calculations
        (id, tenant_key, rule_code, taxable_amount, tax_amount, total_amount, currency, calculated_at, input_fingerprint)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [calculation.id, calculation.tenantKey, calculation.ruleCode, calculation.taxableAmount, calculation.taxAmount, calculation.totalAmount, calculation.currency, calculation.calculatedAt, calculation.inputFingerprint],
    );
    return calculation;
  }
}
