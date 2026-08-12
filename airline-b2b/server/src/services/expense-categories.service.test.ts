import { describe, expect, it } from 'vitest';
import { DEFAULT_EXPENSE_CATEGORIES } from './expense-categories.service';

describe('default expense categories', () => {
  it('keeps stable unique codes and excludes founder personal spending', () => {
    const codes = DEFAULT_EXPENSE_CATEGORIES.map(([code]) => code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toHaveLength(20);
    expect(codes).not.toContain('OWNER_WITHDRAWAL');
    expect(codes).not.toContain('DIVIDEND');
  });
});
