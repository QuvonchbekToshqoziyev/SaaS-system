export const MIN_PASSWORD_LENGTH = 12;
export const PASSWORD_LENGTH_ERROR = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;

export function passwordMeetsPolicy(value: unknown): value is string {
  return typeof value === 'string' && value.length >= MIN_PASSWORD_LENGTH;
}
