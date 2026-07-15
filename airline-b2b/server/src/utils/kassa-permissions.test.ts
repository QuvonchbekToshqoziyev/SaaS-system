import { describe, expect, it } from 'vitest';
import { canOperateKassa } from './kassa-permissions';

describe('kassa operation permissions', () => {
  it('allows a firm admin without a separate cashier employee', async () => {
    await expect(canOperateKassa({ role: 'FIRM', firmRole: 'FIRM_ADMIN', firmId: 'firm-a' })).resolves.toBe(true);
  });
});
