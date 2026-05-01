import { useMemo } from 'react';
import { useThemeStore } from 'src/stores/theme';
import { useThemeConditionsMet } from './useThemeConditionsMet';
import type { WidgetThemeConfig } from 'src/types/theme';

/**
 * Returns the appropriate pre-computed widget theme based on:
 * - Light-only app mode
 * - Partner theme conditions (active, expiration)
 *
 * This hook is a pure selector - no computation needed at runtime.
 */
export const useWidgetTheme = (): WidgetThemeConfig => {
  const widgetTheme = useThemeStore((state) => state.widgetTheme);
  const { shouldShowForTheme } = useThemeConditionsMet();

  return useMemo(() => {
    if (shouldShowForTheme) {
      return widgetTheme.partnerLight;
    }

    return widgetTheme.light;
  }, [shouldShowForTheme, widgetTheme]);
};
