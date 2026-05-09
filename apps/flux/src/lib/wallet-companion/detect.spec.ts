import { describe, expect, it } from 'vitest';
import { detectCompanionProvider } from './detect';

describe('detectCompanionProvider', () => {
  it('returns null for missing or empty input', () => {
    expect(detectCompanionProvider(undefined)).toBeNull();
    expect(detectCompanionProvider(null)).toBeNull();
    expect(detectCompanionProvider('')).toBeNull();
  });

  it('matches Phantom by substring, case-insensitive', () => {
    expect(detectCompanionProvider('Phantom')).toBe('phantom');
    expect(detectCompanionProvider('PHANTOM')).toBe('phantom');
    expect(detectCompanionProvider('Phantom Wallet')).toBe('phantom');
  });

  it('matches OKX', () => {
    expect(detectCompanionProvider('OKX Wallet')).toBe('okx');
    expect(detectCompanionProvider('okx')).toBe('okx');
  });

  it('matches Backpack', () => {
    expect(detectCompanionProvider('Backpack')).toBe('backpack');
  });

  it('returns null for unknown wallets', () => {
    expect(detectCompanionProvider('Suiet')).toBeNull();
    expect(detectCompanionProvider('Sui Wallet')).toBeNull();
    expect(detectCompanionProvider('Slush')).toBeNull();
  });
});
