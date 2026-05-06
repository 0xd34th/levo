export interface ServerProxyTargetOptions {
  defaultTarget: string;
  internalEnvKey: string;
  publicEnvKey: string;
  publicProxyPath: string;
}

type RuntimeEnv = Record<string, string | undefined>;

export function stripTrailingSlashes(url: string) {
  return url.replace(/\/+$/, "");
}

export function isAbsoluteHttpUrl(value: string | undefined) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function getSiteOriginFromEnv(env: RuntimeEnv) {
  const siteUrl = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!siteUrl) {
    return "";
  }

  try {
    return new URL(siteUrl).origin;
  } catch {
    return "";
  }
}

export function isPublicProxyLoopUrl(
  candidate: string,
  env: RuntimeEnv,
  publicProxyPath: string,
) {
  const siteOrigin = getSiteOriginFromEnv(env);
  if (!siteOrigin || !isAbsoluteHttpUrl(candidate)) {
    return false;
  }

  const url = new URL(candidate);
  return (
    url.origin === siteOrigin &&
    stripTrailingSlashes(url.pathname || "/") === publicProxyPath
  );
}

export function resolveServerUpstreamTarget(
  env: RuntimeEnv,
  {
    defaultTarget,
    internalEnvKey,
    publicEnvKey,
    publicProxyPath,
  }: ServerProxyTargetOptions,
) {
  for (const candidate of [
    env[internalEnvKey],
    env[publicEnvKey],
    defaultTarget,
  ]) {
    const trimmed = candidate?.trim();
    if (!trimmed || !isAbsoluteHttpUrl(trimmed)) {
      continue;
    }

    if (isPublicProxyLoopUrl(trimmed, env, publicProxyPath)) {
      continue;
    }

    return stripTrailingSlashes(trimmed);
  }

  return stripTrailingSlashes(defaultTarget);
}
