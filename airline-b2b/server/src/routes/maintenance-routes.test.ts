import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (name: string) => readFileSync(join(__dirname, name), 'utf8');

describe('financial correction routes', () => {
  it('does not expose generic model maintenance or arbitrary financial patches', () => {
    const index = source('../index.ts');
    const routes = ['payments.ts', 'transactions.ts', 'tickets.ts', 'tour-packages.ts', 'currency-rates.ts']
      .map(source)
      .join('\n');
    const immutableRoutes = ['payments.ts', 'tickets.ts', 'tour-packages.ts', 'currency-rates.ts']
      .map(source)
      .join('\n');

    expect(index).not.toContain("app.use('/admin'");
    expect(routes).not.toContain('maintenance.controller');
    expect(routes).not.toMatch(/router\.patch\('\/:id'/);
    expect(immutableRoutes).not.toMatch(/router\.delete\('\/:id'/);
    expect(routes).toContain("router.patch('/:id/daily-cash'");
    expect(routes).toContain("router.post('/cancel-sale'");
  });
});
