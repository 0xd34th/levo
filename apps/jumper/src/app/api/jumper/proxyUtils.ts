import type { NextRequest } from "next/server";
import {
  resolveServerUpstreamTarget,
  stripTrailingSlashes,
  type ServerProxyTargetOptions,
} from "@/utils/serverProxyTargets";

const FORWARDED_REQUEST_HEADERS = new Set([
  "accept",
  "accept-language",
  "authorization",
  "cache-control",
  "cf-connecting-ip",
  "content-type",
  "if-modified-since",
  "if-none-match",
  "range",
  "referer",
  "true-client-ip",
  "user-agent",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-port",
  "x-forwarded-proto",
  "x-real-ip",
]);

export interface ProxyRouteConfig extends ServerProxyTargetOptions {
  invalidPathMessage: string;
}

export function buildProxyTargetUrl(
  request: NextRequest,
  path: string[],
  config: ProxyRouteConfig,
) {
  if (
    path.length === 0 ||
    path.some((segment) => segment === "." || segment === "..")
  ) {
    return null;
  }

  const baseUrl = new URL(resolveServerUpstreamTarget(process.env, config));
  const basePath = stripTrailingSlashes(baseUrl.pathname || "/");
  const suffix = path.map((segment) => encodeURIComponent(segment)).join("/");

  baseUrl.pathname = `${basePath}/${suffix}`;
  baseUrl.search = request.nextUrl.search;
  return baseUrl;
}

export function buildProxyForwardHeaders(request: NextRequest) {
  const headers = new Headers();

  for (const [name, value] of request.headers.entries()) {
    if (FORWARDED_REQUEST_HEADERS.has(name) || name.startsWith("x-lifi-")) {
      headers.set(name, value);
    }
  }

  return headers;
}

async function readProxyBody(request: NextRequest) {
  if (request.method === "GET" || request.method === "HEAD") {
    return undefined;
  }

  const body = await request.arrayBuffer();
  return body.byteLength > 0 ? body : undefined;
}

export async function proxyRequest(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
  config: ProxyRouteConfig,
) {
  const { path } = await params;
  const targetUrl = buildProxyTargetUrl(request, path, config);

  if (!targetUrl) {
    return Response.json({ error: config.invalidPathMessage }, { status: 400 });
  }

  const response = await fetch(targetUrl, {
    method: request.method,
    headers: buildProxyForwardHeaders(request),
    body: await readProxyBody(request),
    redirect: "follow",
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });
}
