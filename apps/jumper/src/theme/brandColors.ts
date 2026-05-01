import { baseColors } from './baseColors';

export interface BrandColors {
  light: {
    // Surfaces
    surface1: string;
    surface2: string;
    surface3: string;
    surface4: string;
    surfaceActiveAccent: string;
    surfaceActive: { main: string };

    // Accents
    accent1: string;
    accent1Alt: string;
    accent2: string;
    accent2Alt: string;

    // Border
    borderAccent1: string;
    border: { main: string };

    // --------------------------------------------------
    // UI Component Colors (not directly mapped in Figma)
    // --------------------------------------------------

    // Buttons
    buttonPrimaryBg: string;
    buttonPrimaryAction: string;
    buttonSecondaryBg: string;
    buttonSecondaryAction: string;
    buttonLightBg: string;
    buttonLightAction: string;

    // Badge
    badgeAccent1Fg: string;
    badgeAccent1Bg: string;
    badgeAccent1MutedFg: string;
    badgeAccent1MutedBg: string;

    // Link
    linkPrimary: string;
    linkSecondary: string;

    // Logo
    logoPrimary: string;
    logoSecondary: string;

    // Border
    borderActive: string;

    // Surface Accent
    surfaceAccent1: string;
    surfaceAccent1Bg: string;
    surfaceAccent1Fg: string;
    surfaceAccent2: string;
    surfaceAccent2Bg: string;
    surfaceAccent2Fg: string;

    // Background
    bg: string;
    bgDarker: string;
    bgGlow1: string;
    bgGlow2: string;
    bgGlow3: string;
  };
  dark: {
    // Surfaces
    surface1: string;
    surface2: string;
    surface3: string;
    surface4: string;
    surfaceActiveAccent: string;
    surfaceActive: { main: string };

    // Accents
    accent1: string;
    accent1Alt: string;
    accent2: string;
    accent2Alt: string;

    // Border
    borderAccent1: string;
    border: { main: string };

    // --------------------------------------------------
    // UI Component Colors (not directly mapped in Figma)
    // --------------------------------------------------

    // Buttons
    buttonPrimaryBg: string;
    buttonPrimaryAction: string;
    buttonSecondaryBg: string;
    buttonSecondaryAction: string;
    buttonLightBg: string;
    buttonLightAction: string;

    // Badge
    badgeAccent1Fg: string;
    badgeAccent1Bg: string;
    badgeAccent1MutedFg: string;
    badgeAccent1MutedBg: string;

    // Link
    linkPrimary: string;
    linkSecondary: string;

    // Logo
    logoPrimary: string;
    logoSecondary: string;

    // Border
    borderActive: string;

    // Surface Accent
    surfaceAccent1: string;
    surfaceAccent1Bg: string;
    surfaceAccent1Fg: string;
    surfaceAccent2: string;
    surfaceAccent2Bg: string;
    surfaceAccent2Fg: string;

    // Background
    bg: string;
    bgDarker: string;
    bgGlow1: string;
    bgGlow2: string;
    bgGlow3: string;
  };
}

// Sourced from apps/web/app/globals.css — Levo institutional palette.
// accent1 = ink (primary CTA, matches web --primary)
// accent2 = forest green (semantic accent, matches web --accent / --up)
export const defaultBrandColors: BrandColors = {
  light: {
    // Surfaces — web --background / --surface / --raise / --sunk
    surface1: '#ffffff',
    surface2: '#f5f5f3',
    surface3: '#ecece8',
    surface4: '#fafaf8',
    surfaceActiveAccent: '#e6f0e8', // web --up-soft
    surfaceActive: baseColors.alphaDark200,

    // Accents — ink (primary CTA) + forest green (semantic accent)
    accent1: '#0e0e10',
    accent1Alt: '#f5f5f3',
    accent2: '#1f7a3e',
    accent2Alt: '#e6f0e8',

    // Border
    borderAccent1: 'rgba(31, 122, 62, 0.10)',
    border: baseColors.alphaDark200,

    // Buttons
    buttonPrimaryBg: '#0e0e10',
    buttonPrimaryAction: '#ffffff',
    buttonSecondaryBg: '#f5f5f3',
    buttonSecondaryAction: '#0e0e10',
    buttonLightBg: '#ffffff',
    buttonLightAction: '#0e0e10',

    // Badge — green for the brand-accent badge slot
    badgeAccent1Fg: '#ffffff',
    badgeAccent1Bg: '#1f7a3e',
    badgeAccent1MutedFg: '#1f7a3e',
    badgeAccent1MutedBg: '#e6f0e8',

    // Link
    linkPrimary: '#0e0e10',
    linkSecondary: '#55555a', // web --text-soft

    // Logo
    logoPrimary: '#0e0e10',
    logoSecondary: '#1f7a3e',

    // Border
    borderActive: '#0e0e10',

    // Surface Accent
    surfaceAccent1: '#f5f5f3',
    surfaceAccent1Bg: '#f5f5f3',
    surfaceAccent1Fg: '#0e0e10',
    surfaceAccent2: '#0e0e10',
    surfaceAccent2Bg: '#0e0e10',
    surfaceAccent2Fg: '#ffffff',

    // Background
    bg: '#ffffff',
    bgDarker: '#f5f5f3',
    bgGlow1: 'rgba(31, 122, 62, 0.06)',
    bgGlow2: 'rgba(31, 90, 168, 0.04)',
    bgGlow3: 'transparent',
  },
  dark: {
    // Surfaces — web dark --background / --surface / --raise / --sunk
    surface1: '#0e0e10',
    surface2: '#17171a',
    surface3: '#1f1f23',
    surface4: '#0a0a0c',
    surfaceActiveAccent: 'rgba(74, 167, 108, 0.15)',
    surfaceActive: baseColors.alphaLight200,

    // Accents — paper (primary CTA on dark) + green (semantic accent)
    accent1: '#f5f5f3',
    accent1Alt: '#17171a',
    accent2: '#4aa76c',
    accent2Alt: 'rgba(74, 167, 108, 0.15)',

    // Border
    borderAccent1: 'rgba(74, 167, 108, 0.16)',
    border: baseColors.alphaLight200,

    // Buttons
    buttonPrimaryBg: '#f5f5f3',
    buttonPrimaryAction: '#0e0e10',
    buttonSecondaryBg: '#17171a',
    buttonSecondaryAction: '#f5f5f3',
    buttonLightBg: '#17171a',
    buttonLightAction: '#f5f5f3',

    // Badge
    badgeAccent1Fg: '#0e0e10',
    badgeAccent1Bg: '#4aa76c',
    badgeAccent1MutedFg: '#4aa76c',
    badgeAccent1MutedBg: 'rgba(74, 167, 108, 0.15)',

    // Link
    linkPrimary: '#f5f5f3',
    linkSecondary: '#aaaab0', // web dark --text-soft

    // Logo
    logoPrimary: '#f5f5f3',
    logoSecondary: '#4aa76c',

    // Border
    borderActive: '#f5f5f3',

    // Surface Accent
    surfaceAccent1: '#17171a',
    surfaceAccent1Bg: '#17171a',
    surfaceAccent1Fg: '#f5f5f3',
    surfaceAccent2: '#f5f5f3',
    surfaceAccent2Bg: '#f5f5f3',
    surfaceAccent2Fg: '#0e0e10',

    // Background
    bg: '#0e0e10',
    bgDarker: '#0a0a0c',
    bgGlow1: 'rgba(74, 167, 108, 0.08)',
    bgGlow2: 'rgba(47, 109, 203, 0.06)',
    bgGlow3: 'transparent',
  },
};

export const brandColors = defaultBrandColors;
