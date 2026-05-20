import type { NextRequest } from 'next/server';
import {
  getOptionalServerStrapiApiAccessToken,
  getServerStrapiBaseUrl,
  isStrapiConfigured,
} from '@/utils/strapi/strapiServer';

const FORWARDED_HEADERS = [
  'accept',
  'accept-language',
  'cache-control',
  'content-type',
  'if-modified-since',
  'if-none-match',
  'range',
  'user-agent',
] as const;

const ALLOWED_ROOT_SEGMENTS = new Set(['api', 'uploads']);

// Explicit allowlist of Strapi Content API collections reachable through the
// public proxy. Keep this in sync with the collections consumed by client-side
// code (`StrapiApi`, `useStrapi`, `useMemelist`, `usePersonalizedFeatureCardsQuery`,
// `getAnnouncements`, and the lib/get*.ts readers). Server-only collections such
// as `base-mini-app-settings` MUST NOT be added here — they are fetched directly
// from server code with `getServerStrapiHeaders()` and exposing them via the
// proxy would leak the server bearer to the public internet.
const ALLOWED_STRAPI_COLLECTIONS = new Set([
  'announcements',
  'blog-articles',
  'campaigns',
  'faq-items',
  'feature-cards',
  'merkl-rewards',
  'partner-themes',
  'perks',
  'quests',
  'tags',
  'token-lists',
  'wallet-access-controls',
]);

export const dynamic = 'force-dynamic';

function buildProxyPath(path: string[]) {
  if (
    path.length === 0 ||
    path.some((segment) => segment === '.' || segment === '..')
  ) {
    return null;
  }

  const [root, ...rest] = path;
  if (!ALLOWED_ROOT_SEGMENTS.has(root)) {
    return null;
  }

  if (root === 'api') {
    const [collection] = rest;
    if (!collection || !ALLOWED_STRAPI_COLLECTIONS.has(collection)) {
      return null;
    }
  }

  return {
    includeAuthorization: root === 'api',
    pathname: `/${root}${rest.length ? `/${rest.map((segment) => encodeURIComponent(segment)).join('/')}` : ''}`,
  };
}

function buildTargetUrl(request: NextRequest, path: string[]) {
  const baseUrl = new URL(`${getServerStrapiBaseUrl()}/`);
  const proxyPath = buildProxyPath(path);

  if (!proxyPath) {
    return null;
  }

  baseUrl.pathname = proxyPath.pathname;
  baseUrl.search = request.nextUrl.search;

  return {
    includeAuthorization: proxyPath.includeAuthorization,
    targetUrl: baseUrl,
  };
}

function buildForwardHeaders(
  request: NextRequest,
  includeAuthorization: boolean,
) {
  const headers = new Headers();

  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }

  const token =
    includeAuthorization && getOptionalServerStrapiApiAccessToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return headers;
}

async function proxyRequest(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  if (!isStrapiConfigured()) {
    // Strapi is optional — return an empty Strapi-shaped payload so client-side
    // queries (feature cards, partner themes, etc.) treat the absence as "no
    // content" instead of erroring out.
    return Response.json({ data: [], meta: {} }, { status: 200 });
  }

  const { path } = await params;
  const target = buildTargetUrl(request, path);
  if (!target) {
    return Response.json(
      { error: 'Invalid Strapi proxy path.' },
      { status: 400 },
    );
  }

  const response = await fetch(target.targetUrl, {
    method: request.method,
    headers: buildForwardHeaders(request, target.includeAuthorization),
    redirect: 'follow',
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });
}

export function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, context);
}

export function HEAD(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, context);
}
