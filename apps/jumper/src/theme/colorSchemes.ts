import type { Theme } from '@mui/material/styles';
import { alpha } from '@mui/material/styles';
import { baseColors } from './baseColors';
import type { createPaletteLight } from './paletteLight';

export const createColorSchemes = (
  themeBase: Theme,
  paletteLight: ReturnType<typeof createPaletteLight>,
) => ({
  light: {
    palette: {
      ...paletteLight,
      semanticPalette: paletteLight,
      mode: 'light' as const,
      background: {
        default: paletteLight.surface2,
        paper: paletteLight.surface1,
      },
      text: {
        primary: paletteLight.textPrimary,
        secondary: paletteLight.textSecondary,
        disabled: paletteLight.textDisabled,
      },
      grey: {
        100: paletteLight.alpha100.main,
        200: paletteLight.alpha200.main,
        300: paletteLight.alpha300.main,
        400: paletteLight.alpha400.main,
        500: paletteLight.alpha500.main,
        600: paletteLight.alpha600.main,
        700: paletteLight.alpha700.main,
        800: paletteLight.alpha800.main,
        900: paletteLight.alpha900.main,
      },
      bg: {
        main: paletteLight.bg,
      },
      bgSecondary: {
        main: alpha(baseColors.white.main, 0.48),
      },
      bgTertiary: {
        main: baseColors.white.main,
      },
      bgQuaternary: {
        hover: alpha(paletteLight.accent1, 0.12),
        main: alpha(paletteLight.accent1, 0.08),
      },
      primary: {
        light: paletteLight.accent1,
        main: paletteLight.accent1,
        dark: paletteLight.accent1,
      },
      secondary: {
        light: paletteLight.surface3,
        main: paletteLight.surface3,
        dark: paletteLight.surface3,
      },
      tertiary: {
        light: paletteLight.surface2,
        main: paletteLight.surface2,
        dark: paletteLight.surface2,
      },
      accent1: {
        light: paletteLight.accent1,
        main: paletteLight.accent1,
        dark: paletteLight.accent1,
      },
      accent1Alt: {
        light: paletteLight.accent1Alt,
        main: paletteLight.accent1Alt,
        dark: paletteLight.accent1Alt,
      },
      accent2: {
        light: paletteLight.accent2,
        main: paletteLight.accent2,
        dark: paletteLight.accent2,
      },
      surface1: {
        light: paletteLight.surface1,
        main: paletteLight.surface1,
        dark: paletteLight.surface1,
      },
      surface2: {
        light: paletteLight.surface2,
        main: paletteLight.surface2,
        dark: paletteLight.surface2,
      },
      surface3: {
        light: paletteLight.surface3,
        main: paletteLight.surface3,
        dark: paletteLight.surface3,
      },
      surface4: {
        light: paletteLight.surface4,
        main: paletteLight.surface4,
        dark: paletteLight.surface4,
      },
    },
    shadows: [
      'none',
      '0px 2px 4px rgba(0, 0, 0, 0.08), 0px 8px 16px rgba(0, 0, 0, 0.08)',
      '0px 2px 8px 0px rgba(0, 0, 0, 0.04)',
      '0px 4px 24px 0px rgba(0, 0, 0, 0.08)',
      ...themeBase.shadows.slice(3),
    ] as Theme['shadows'],
  },
});
