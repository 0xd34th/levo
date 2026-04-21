// middleware.ts
import acceptLanguage from 'accept-language';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import i18nConfig from 'i18n-config';
import { cookieName } from '@/i18n/i18next-settings';
import { lookupI18nLocaleDetector } from './i18n/lookupI18nLocaleDetector';
import { locales } from './i18n/i18next-locales';

acceptLanguage.languages(locales);

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const hasLocalePrefix = i18nConfig.locales.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );

  const response = hasLocalePrefix
    ? NextResponse.next()
    : (() => {
        const locale = lookupI18nLocaleDetector(request, i18nConfig);
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname =
          pathname === '/' ? `/${locale}` : `/${locale}${pathname}`;

        return NextResponse.redirect(redirectUrl);
      })();

  const storedLocale = request.cookies.get(cookieName)?.value;
  if (storedLocale && !i18nConfig.locales.includes(storedLocale)) {
    response.cookies.set(cookieName, '', {
      path: '/',
      maxAge: 0,
      sameSite: 'lax',
    });
  }

  // Set a cookie with the pathname that was used on the first page load
  response.cookies.set('pathname', pathname, { path: '/', sameSite: 'strict' });

  return response;
}

// Applies this middleware only to specific paths
export const config = {
  matcher:
    '/((?!api|static|_next|favicon\\.ico|.*\\.(?:png|jp?eg|gif|webp|svg|ico|xml|txt|zip|riv|json)).*)',
};
