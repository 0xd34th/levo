import { createHash } from "node:crypto";

type JwtLogHeaderSummary = {
  alg?: string;
  kid?: string;
  typ?: string;
};

type JwtLogClaimsSummary = {
  aud?: string | string[];
  exp?: number;
  iat?: number;
  iss?: string;
  nbf?: number;
  sid?: string;
  sub?: string;
};

export type JwtLogSummary = {
  claims: JwtLogClaimsSummary | null;
  expired: boolean | null;
  expiresInSec: number | null;
  fingerprint: string;
  header: JwtLogHeaderSummary | null;
  isJwtLike: boolean;
  segments: number;
};

function decodeBase64UrlJson(value: string): Record<string, unknown> | null {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

function readString(
  source: Record<string, unknown> | null,
  key: string,
): string | undefined {
  const value = source?.[key];
  return typeof value === "string" ? value : undefined;
}

function readNumber(
  source: Record<string, unknown> | null,
  key: string,
): number | undefined {
  const value = source?.[key];
  return typeof value === "number" ? value : undefined;
}

function readAudience(
  source: Record<string, unknown> | null,
): string | string[] | undefined {
  const value = source?.aud;
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value;
  }

  return undefined;
}

export function summarizeJwtForLogs(
  token: string,
  nowMs = Date.now(),
): JwtLogSummary {
  const segments = token.split(".");
  const header =
    segments.length >= 2 ? decodeBase64UrlJson(segments[0]) : null;
  const claims =
    segments.length >= 2 ? decodeBase64UrlJson(segments[1]) : null;
  const exp = readNumber(claims, "exp");
  const nowSec = Math.floor(nowMs / 1000);

  return {
    claims: claims
      ? {
          aud: readAudience(claims),
          exp,
          iat: readNumber(claims, "iat"),
          iss: readString(claims, "iss"),
          nbf: readNumber(claims, "nbf"),
          sid: readString(claims, "sid"),
          sub: readString(claims, "sub"),
        }
      : null,
    expired: exp === undefined ? null : exp <= nowSec,
    expiresInSec: exp === undefined ? null : exp - nowSec,
    fingerprint: createHash("sha256").update(token).digest("hex").slice(0, 16),
    header: header
      ? {
          alg: readString(header, "alg"),
          kid: readString(header, "kid"),
          typ: readString(header, "typ"),
        }
      : null,
    isJwtLike: segments.length === 3,
    segments: segments.length,
  };
}
