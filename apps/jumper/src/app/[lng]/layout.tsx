import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import i18nConfig from 'i18n-config';
import type { Metadata } from 'next';
import Script from 'next/script';
import type { Viewport } from 'next/types';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { Suspense, type ReactNode } from 'react';
import { ReferrerCapture } from 'src/components/ReferrerCapture/ReferrerCapture';
import NavbarWrapper from 'src/components/Navbar/NavbarWrapper';
import { defaultNS, fallbackLng, namespaces } from 'src/i18n';
import { IntercomProvider } from 'src/providers/IntercomProvider';
import { SettingsStoreProvider } from 'src/stores/settings';
import initTranslations from '@/app/i18n';
import { getPartnerThemes } from '@/app/lib/getPartnerThemes';
import config, { getPublicEnvVars } from '@/config/env-config';
import envConfig from '@/config/env-config';
import { getTrackingScriptConfig } from '@/config/trackingScripts';
import { getSiteUrl } from '@/const/urls';
import { fonts } from '@/fonts/fonts';
import { ReactQueryProvider } from '@/providers/ReactQueryProvider';
import {
  DefaultThemeProvider,
  MUIThemeProvider,
} from '@/providers/ThemeProvider';
import TranslationsProvider from '@/providers/TranslationProvider';
import { WalletProvider } from '@/providers/WalletProvider';
import { getMiniAppSettings } from '../lib/getMiniAppSettings';
import {
  baseMiniApp,
  pageMetadataFields,
  pageOpenGraph,
  pageTwitter,
} from '../lib/metadata';
import {
  THEME_COLOR_SCHEME_STORAGE_KEY,
  THEME_MODE_STORAGE_KEY,
} from '@/providers/ThemeProvider/constants';

const PUBLIC_URL = envConfig.NEXT_PUBLIC_SITE_URL as string;
export const metadata: Metadata = {
  title: pageMetadataFields.default.title,
  description: pageMetadataFields.default.description,
  alternates: {
    canonical: `${getSiteUrl()}`,
  },
  openGraph: {
    ...pageOpenGraph.default,
    url: `${getSiteUrl()}`,
  },
  twitter: {
    ...pageTwitter.default,
  },
  icons: {
    // Icons metadata
    icon: [
      {
        url: '/favicon.svg',
        sizes: 'any',
      },
      { url: '/favicon.png' },
      { url: '/favicon.ico' },
    ],
    shortcut: [
      {
        url: '/apple-touch-icon-57x57.png',
        sizes: '57x57',
      },
      {
        url: '/apple-touch-icon-180x180.png',
        sizes: '180x180',
      },
    ],
  },
  other: {
    'fc:miniapp': JSON.stringify({
      version: 'next',
      imageUrl: baseMiniApp.iconUrl,
      button: {
        title: `Launch Levo`,
        action: {
          type: 'launch_miniapp',
          name: 'Levo',
          url: PUBLIC_URL,
          splashImageUrl: baseMiniApp.splashImageUrl,
          splashBackgroundColor: baseMiniApp.splashBackgroundColor,
        },
      },
    }),
  },
};

export const viewport: Viewport = {
  initialScale: 1,
  width: 'device-width',
};

type Params = Promise<{ lng: string }>;

export default async function RootLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Params;
}) {
  const { lng } = await params;

  const [partnerThemes, { appId }, { resources }] = await Promise.all([
    getPartnerThemes().catch(() => ({ data: [] })),
    getMiniAppSettings().catch((e) => {
      console.error(
        'Failed to fetch mini app settings, using default values.',
        e,
      );
      return { appId: '' };
    }),
    initTranslations(lng || fallbackLng, namespaces),
  ]);
  const { googleAnalyticsTrackingId, addressableTrackingId } =
    getTrackingScriptConfig(config);

  return (
    <html
      lang={lng || fallbackLng}
      suppressHydrationWarning
      className={fonts.map((f) => f.variable).join(' ')}
      style={{ scrollBehavior: 'smooth' }}
    >
      <head>
        <script
          id="theme-bootstrap"
          data-cfasync="false"
          dangerouslySetInnerHTML={{
            __html: `
            (function() {
              try {
                localStorage.setItem('${THEME_MODE_STORAGE_KEY}', 'light');
                localStorage.setItem('${THEME_COLOR_SCHEME_STORAGE_KEY}-light', 'light');
                localStorage.setItem('${THEME_COLOR_SCHEME_STORAGE_KEY}-dark', 'light');
                var d = document.documentElement;
                d.classList.remove('dark');
                d.classList.add('light');
                d.setAttribute('data-mui-color-scheme', 'light');
                d.style.colorScheme = 'light';
              } catch (e) {}
            })();
          `,
          }}
        />
        <meta name="base:app_id" content={appId} />
        <style>
          {`
          /* Loading background: MUI vars with fallbacks to avoid flicker before ThemeProvider mounts */
          body,
          :root.light body {
            background-color: var(--jumper-palette-bg-main, #ffffff);
          }
`}
        </style>
        <Script
          id="env-config"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `window._env_ = ${JSON.stringify(getPublicEnvVars())};`,
          }}
        />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        {googleAnalyticsTrackingId ? (
          <>
            <Script
              strategy="lazyOnload"
              src={`https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsTrackingId}`}
            />
            <Script id="google-analytics">
              {`
              window.dataLayer = window.dataLayer || [];
              function gtag() { dataLayer.push(arguments); }
              gtag('js', new Date());
              gtag('config', '${googleAnalyticsTrackingId}');
          `}
            </Script>
          </>
        ) : null}
        {addressableTrackingId ? (
          <Script strategy="lazyOnload" id="addressable-tracker">
            {`
            !function(w, d){
              w.__adrsbl = {
                  queue: [],
                  run: function(){
                      this.queue.push(arguments);
                  }
              };
              var s = d.createElement('script');
              s.async = true;
              s.src = 'https://tag.adrsbl.io/p.js?tid=${addressableTrackingId}';
              var b = d.getElementsByTagName('script')[0];
              b.parentNode.insertBefore(s, b);
            }(window, document);
          `}
          </Script>
        ) : null}
      </head>

      <body suppressHydrationWarning>
        <AppRouterCacheProvider options={{ enableCssLayer: true }}>
          <ReactQueryProvider>
            <TranslationsProvider
              namespaces={[defaultNS]}
              locale={lng}
              resources={resources}
            >
              <DefaultThemeProvider
                themes={partnerThemes.data ?? []}
                activeTheme={'default'}
              >
                <MUIThemeProvider>
                  <WalletProvider>
                    <SettingsStoreProvider>
                      <NuqsAdapter>
                        <Suspense>
                          <ReferrerCapture />
                        </Suspense>
                        <NavbarWrapper />
                        <IntercomProvider />
                        <main>{children}</main>
                      </NuqsAdapter>
                    </SettingsStoreProvider>
                  </WalletProvider>
                </MUIThemeProvider>
              </DefaultThemeProvider>
            </TranslationsProvider>
          </ReactQueryProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}

export function generateStaticParams() {
  return i18nConfig.locales.map((lng) => ({ lng }));
}
