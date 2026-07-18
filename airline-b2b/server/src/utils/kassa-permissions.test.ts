import { describe, expect, it } from 'vitest';
import { canOperateKassa } from './kassa-permissions';

describe('kassa operation permissions', () => {
  it('keeps every kassa role exposed by the UI operable', async () => {
    await expect(canOperateKassa({ role: 'FIRM', firmRole: 'FIRM_ADMIN', firmId: 'firm-a' })).resolves.toBe(true);
    await expect(canOperateKassa({ role: 'FIRM', firmRole: 'MANAGER', firmId: 'firm-a' })).resolves.toBe(true);
    await expect(canOperateKassa({ role: 'FIRM', firmRole: 'KASSIR', firmId: 'firm-a' })).resolves.toBe(true);
    await expect(canOperateKassa({ role: 'ADMIN' })).resolves.toBe(true);
  });
});
