export function requireCorrectionReason(value: unknown): string {
  const reason = String(value || '').trim().slice(0, 500);
  if (reason.length < 5) throw new Error('Correction reason must be at least 5 characters');
  return reason;
}
