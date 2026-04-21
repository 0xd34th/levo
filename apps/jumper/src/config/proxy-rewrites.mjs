const DEFAULT_BACKEND_REWRITE_TARGET =
  'https://api-develop.jumper.exchange/v1';
const DEFAULT_PIPELINE_REWRITE_TARGET =
  'https://api-develop.jumper.exchange/pipeline';

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

export function isAbsoluteHttpUrl(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function resolveRewriteTarget(configuredValue, defaultValue) {
  const candidate =
    typeof configuredValue === 'string' && configuredValue.trim().length > 0
      ? configuredValue.trim()
      : defaultValue;
  return isAbsoluteHttpUrl(candidate) ? stripTrailingSlash(candidate) : null;
}

export function resolveBackendRewriteTarget(env) {
  return resolveRewriteTarget(
    env?.NEXT_PUBLIC_BACKEND_URL,
    DEFAULT_BACKEND_REWRITE_TARGET,
  );
}

export function resolvePipelineRewriteTarget(env) {
  return resolveRewriteTarget(
    env?.NEXT_PUBLIC_LIFI_BACKEND_URL,
    DEFAULT_PIPELINE_REWRITE_TARGET,
  );
}
