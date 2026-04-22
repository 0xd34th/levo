import type { NextRequest } from "next/server";
import { proxyRequest } from "@/app/api/jumper/proxyUtils";

const pipelineProxyConfig = {
  defaultTarget: "https://api-develop.jumper.exchange/pipeline",
  internalEnvKey: "LIFI_INTERNAL_BACKEND_URL",
  publicEnvKey: "NEXT_PUBLIC_LIFI_BACKEND_URL",
  publicProxyPath: "/api/jumper/pipeline",
  invalidPathMessage: "Invalid pipeline proxy path.",
} as const;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function proxyPipelineRequest(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, context, pipelineProxyConfig);
}

export const GET = proxyPipelineRequest;
export const HEAD = proxyPipelineRequest;
export const POST = proxyPipelineRequest;
export const PUT = proxyPipelineRequest;
export const PATCH = proxyPipelineRequest;
export const DELETE = proxyPipelineRequest;
export const OPTIONS = proxyPipelineRequest;
