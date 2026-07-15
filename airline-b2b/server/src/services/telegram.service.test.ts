import { describe, expect, it } from 'vitest';
import { telegramStartCode } from './telegram.service';

describe('Telegram account link command', () => {
  it('accepts only a start command containing a safe link code', () => {
    expect(telegramStartCode('/start Abc_123-xyz')).toBe('Abc_123-xyz');
    expect(telegramStartCode('/start')).toBeNull();
    expect(telegramStartCode('/start code with spaces')).toBeNull();
    expect(telegramStartCode('/stop Abc_123')).toBeNull();
  });
});
