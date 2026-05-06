import { afterEach, describe, expect, it, vi } from 'vitest';
import { getResolvedMode } from './helpers';

describe('getResolvedMode light-only mode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('forces explicit dark mode to light', () => {
    expect(getResolvedMode('dark')).toBe('light');
  });

  it('forces system dark preference to light', () => {
    vi.stubGlobal('window', {
      matchMedia: vi.fn().mockReturnValue({ matches: true }),
    });

    expect(getResolvedMode('system')).toBe('light');
  });

  it('keeps light and fallback values light', () => {
    expect(getResolvedMode('light')).toBe('light');
    expect(getResolvedMode(undefined)).toBe('light');
  });
});
