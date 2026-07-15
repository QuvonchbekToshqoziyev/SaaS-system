export function requireCorrectionReason(value: unknown): string {
  const reason = String(value || '').trim().slice(0, 500);
  if (!reason) throw new Error('Correction reason is required');
  return reason;
}
