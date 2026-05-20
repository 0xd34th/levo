import { IBM_Plex_Mono, IBM_Plex_Sans, Manrope, Sora } from 'next/font/google';
import localFont from 'next/font/local';

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-plex-sans',
  preload: true,
});

export const inter = plexSans;
export const urbanist = plexSans;

export const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
  variable: '--font-plex-mono',
  preload: false,
});

export const manrope = Manrope({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-manrope',
  preload: false,
});

export const sora = Sora({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sora',
  preload: false,
});

export const sequel65 = localFont({
  src: './customFonts/Sequel100Wide-65.woff2',
  variable: '--font-sequel-65',
  preload: false,
});

export const sequel85 = localFont({
  src: './customFonts/Sequel100Wide-85.woff2',
  variable: '--font-sequel-85',
  preload: false,
});

export const fonts = [plexSans, plexMono];
