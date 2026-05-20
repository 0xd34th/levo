import type { NextRequest } from "next/server";
import { proxyRequest } from "@/app/api/jumper/proxyUtils";

const backendProxyConfig = {
  defaultTarget: "https://api.jumper.exchange/v1",
  internalEnvKey: "JUMPER_INTERNAL_BACKEND_URL",
  publicEnvKey: "NEXT_PUBLIC_BACKEND_URL",
  publicProxyPath: "/api/jumper/v1",
  invalidPathMessage: "Invalid backend proxy path.",
} as const;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function proxyBackendRequest(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, context, backendProxyConfig);
}

export const GET = proxyBackendRequest;
export const HEAD = proxyBackendRequest;
export const POST = proxyBackendRequest;
export const PUT = proxyBackendRequest;
export const PATCH = proxyBackendRequest;
export const DELETE = proxyBackendRequest;
export const OPTIONS = proxyBackendRequest;
