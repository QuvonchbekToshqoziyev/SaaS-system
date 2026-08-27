import { describe, expect, it } from 'vitest';
import { APP_CAPABILITIES as C, resolveAppCapabilities, type AppCapability } from './app-capabilities';

describe('application capabilities', () => {
  it('keeps platform-only controls exclusive to superadmin', () => {
    const superadmin = resolveAppCapabilities({ role: 'SUPERADMIN' });
    const admin = resolveAppCapabilities({ role: 'ADMIN' });
    const platformOnly: AppCapability[] = [C.ADMINS_MANAGE, C.AUDIT_VIEW, C.MONITORING_VIEW, C.AIRLINES_VIEW];

    expect(superadmin).toEqual(expect.arrayContaining(platformOnly));
    expect(admin.filter((capability) => platformOnly.includes(capability))).toEqual([]);
    expect(admin).toEqual(expect.arrayContaining([C.ORGANIZATIONS_VIEW, C.FLIGHTS_VIEW, C.TRANSACTIONS_VIEW]));
  });

  it('preserves the existing firm role navigation contract', () => {
    const firmAdminOnly: AppCapability[] = [C.ORGANIZATIONS_VIEW, C.EMPLOYEES_VIEW];
    expect(resolveAppCapabilities({ role: 'FIRM', firmRole: 'FIRM_ADMIN' })).toEqual(expect.arrayContaining([
      C.ORGANIZATIONS_VIEW,
      C.EMPLOYEES_VIEW,
      C.FLIGHTS_VIEW,
      C.INVENTORY_VIEW,
      C.TRANSACTIONS_VIEW,
    ]));
    expect(resolveAppCapabilities({ role: 'FIRM', firmRole: 'MANAGER' }).filter(
      (capability) => firmAdminOnly.includes(capability),
    )).toEqual([]);
    expect(resolveAppCapabilities({ role: 'FIRM', firmRole: 'KASSIR' })).toEqual([
      C.KASSA_VIEW,
      C.CHAT_VIEW,
      C.SETTINGS_VIEW,
    ]);
    expect(resolveAppCapabilities({ role: 'FIRM', firmRole: 'OMBOR_MUDIRI' })).toEqual([C.INVENTORY_VIEW]);
  });

  it('defaults an unknown firm subrole to the existing manager contract', () => {
    expect(resolveAppCapabilities({ role: 'FIRM', firmRole: 'UNKNOWN' })).toEqual(
      resolveAppCapabilities({ role: 'FIRM', firmRole: 'MANAGER' }),
    );
    expect(resolveAppCapabilities({ role: 'UNKNOWN' })).toEqual([]);
  });
});
