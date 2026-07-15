export function canManageFlight(role: unknown, ownsFlight: boolean, canManageFirmWork: boolean): boolean {
  const normalizedRole = String(role || '').toUpperCase();
  if (normalizedRole === 'SUPERADMIN') return true;
  if (normalizedRole === 'ADMIN') return ownsFlight;
  return normalizedRole === 'FIRM' && ownsFlight && canManageFirmWork;
}
