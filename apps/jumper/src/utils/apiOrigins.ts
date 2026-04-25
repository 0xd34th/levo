import config from "@/config/env-config";
import {
  resolveServerUpstreamTarget,
  stripTrailingSlashes,
} from "@/utils/serverProxyTargets";
const DEFAULT_BACKEND_ORIGIN = "https://api.jumper.exchange/v1";
const DEFAULT_LIFI_BACKEND_ORIGIN =
  "https://api.jumper.exchange/pipeline";

export const getBackendOrigin = (): string => {
  const url =
    typeof window === "undefined"
      ? resolveServerUpstreamTarget(process.env, {
          defaultTarget: DEFAULT_BACKEND_ORIGIN,
          internalEnvKey: "JUMPER_INTERNAL_BACKEND_URL",
          publicEnvKey: "NEXT_PUBLIC_BACKEND_URL",
          publicProxyPath: "/api/jumper/v1",
        })
      : config.NEXT_PUBLIC_BACKEND_URL || "/api/jumper/v1";

  return stripTrailingSlashes(url);
};

export const getLifiBackendOrigin = (): string => {
  const url =
    typeof window === "undefined"
      ? resolveServerUpstreamTarget(process.env, {
          defaultTarget: DEFAULT_LIFI_BACKEND_ORIGIN,
          internalEnvKey: "LIFI_INTERNAL_BACKEND_URL",
          publicEnvKey: "NEXT_PUBLIC_LIFI_BACKEND_URL",
          publicProxyPath: "/api/jumper/pipeline",
        })
      : config.NEXT_PUBLIC_LIFI_BACKEND_URL || "/api/jumper/pipeline";

  return stripTrailingSlashes(url);
};
