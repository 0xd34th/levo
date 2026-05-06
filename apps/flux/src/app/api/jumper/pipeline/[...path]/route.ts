import type { NextRequest } from "next/server";
import {
  buildProxyForwardHeaders,
  buildProxyTargetUrl,
} from "@/app/api/jumper/proxyUtils";

const pipelineProxyConfig = {
  defaultTarget: "https://api.jumper.exchange/pipeline",
  internalEnvKey: "LIFI_INTERNAL_BACKEND_URL",
  publicEnvKey: "NEXT_PUBLIC_LIFI_BACKEND_URL",
  publicProxyPath: "/api/jumper/pipeline",
  invalidPathMessage: "Invalid pipeline proxy path.",
} as const;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SUI_CHAIN_ID = 9270000000000000;
const AFTERMATH_EXCHANGE_KEY = "aftermath";

function isJsonRequest(request: NextRequest) {
  return request.headers.get("content-type")?.includes("application/json");
}

function isSuiChainId(chainId: unknown) {
  return Number(chainId) === SUI_CHAIN_ID;
}

function isAdvancedRoutesPath(path: string[]) {
  return path.join("/") === "v1/advanced/routes";
}

function isStepTransactionPath(path: string[]) {
  return path.join("/") === "v1/advanced/stepTransaction";
}

function applySuiAftermathRouteGuard(payload: Record<string, any>) {
  if (
    !isSuiChainId(payload.fromChainId) &&
    !isSuiChainId(payload.toChainId)
  ) {
    return payload;
  }

  const exchanges =
    payload.options &&
    typeof payload.options === "object" &&
    payload.options.exchanges &&
    typeof payload.options.exchanges === "object"
      ? payload.options.exchanges
      : undefined;

  const allow = Array.isArray(exchanges?.allow)
    ? exchanges.allow.filter(
        (exchange: string) => exchange !== AFTERMATH_EXCHANGE_KEY,
      )
    : undefined;
  const deny = Array.from(
    new Set([
      ...(Array.isArray(exchanges?.deny) ? exchanges.deny : []),
      AFTERMATH_EXCHANGE_KEY,
    ]),
  );

  return {
    ...payload,
    options: {
      ...(payload.options ?? {}),
      exchanges: {
        ...(allow?.length ? { allow } : {}),
        ...(deny.length ? { deny } : {}),
      },
    },
  };
}

function isSuiAftermathStep(payload: Record<string, any>) {
  return (
    payload.tool === AFTERMATH_EXCHANGE_KEY &&
    (isSuiChainId(payload.action?.fromToken?.chainId) ||
      isSuiChainId(payload.action?.toToken?.chainId))
  );
}

async function readGuardedProxyBody(
  request: NextRequest,
  path: string[],
) {
  if (request.method === "GET" || request.method === "HEAD") {
    return {};
  }

  const rawBody = await request.arrayBuffer();

  if (!rawBody.byteLength || !isJsonRequest(request)) {
    return { body: rawBody.byteLength ? rawBody : undefined };
  }

  const payload = JSON.parse(new TextDecoder().decode(rawBody));

  if (isAdvancedRoutesPath(path)) {
    return {
      body: JSON.stringify(
        applySuiAftermathRouteGuard(payload as Record<string, any>),
      ),
    };
  }

  if (isStepTransactionPath(path) && isSuiAftermathStep(payload)) {
    return {
      response: Response.json(
        {
          message:
            "[sui] Aftermath routes are temporarily disabled on Jumper because transaction generation is failing upstream",
          code: 1001,
        },
        { status: 422 },
      ),
    };
  }

  return { body: JSON.stringify(payload) };
}

async function proxyPipelineRequest(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const targetUrl = buildProxyTargetUrl(request, path, pipelineProxyConfig);

  if (!targetUrl) {
    return Response.json(
      { error: pipelineProxyConfig.invalidPathMessage },
      { status: 400 },
    );
  }

  const guardedRequest = await readGuardedProxyBody(request, path);
  if (guardedRequest.response) {
    return guardedRequest.response;
  }

  const response = await fetch(targetUrl, {
    method: request.method,
    headers: buildProxyForwardHeaders(request),
    body: guardedRequest.body,
    redirect: "follow",
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });
}

export const GET = proxyPipelineRequest;
export const HEAD = proxyPipelineRequest;
export const POST = proxyPipelineRequest;
export const PUT = proxyPipelineRequest;
export const PATCH = proxyPipelineRequest;
export const DELETE = proxyPipelineRequest;
export const OPTIONS = proxyPipelineRequest;
