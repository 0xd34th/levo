import { describe, expect, it } from 'vitest';
import type { PartnerThemesAttributes } from '@/types/strapi';
import { getAvailableThemeModes, isDarkOrLightThemeMode } from './formatTheme';

describe('formatTheme light-only mode', () => {
  it('exposes only light mode for the default theme', () => {
    expect(getAvailableThemeModes()).toEqual(['light']);
  });

  it('ignores dark-only partner theme modes', () => {
    const darkOnlyTheme = {
      darkConfig: { config: { appearance: 'dark' } },
    } as PartnerThemesAttributes;

    expect(getAvailableThemeModes(darkOnlyTheme)).toEqual([]);
    expect(isDarkOrLightThemeMode(darkOnlyTheme)).toBe('light');
  });

  it('keeps only the light mode when a partner theme has both modes', () => {
    const dualModeTheme = {
      lightConfig: { config: { appearance: 'light' } },
      darkConfig: { config: { appearance: 'dark' } },
    } as PartnerThemesAttributes;

    expect(getAvailableThemeModes(dualModeTheme)).toEqual(['light']);
    expect(isDarkOrLightThemeMode(dualModeTheme)).toBe('light');
  });
});
