export function isAbsoluteHttpUrl(value: unknown): boolean;

export function resolveBackendRewriteTarget(
  env: Record<string, string | undefined> | null | undefined,
): string | null;

export function resolvePipelineRewriteTarget(
  env: Record<string, string | undefined> | null | undefined,
): string | null;
