/**
 * OKX OS / Web3 API request signing.
 *
 * Spec (matches OKX V5 + Web3 OS):
 *   prehash = timestamp + method + requestPath + body
 *   sign    = base64( hmac-sha256(prehash, secretKey) )
 *
 * - timestamp: ISO 8601 UTC milliseconds, e.g. "2020-12-08T09:08:57.715Z"
 * - method:    upper case ("GET" / "POST")
 * - requestPath: path WITH leading "/" and including query string for GET
 * - body:      empty string for GET, raw JSON string for POST (must match what
 *              we actually send on the wire)
 */
import { createHmac } from "node:crypto";

export interface OkxSignInput {
  method: "GET" | "POST";
  /** Path including leading slash. For GET, must include the encoded query string. */
  requestPath: string;
  /** Raw JSON body for POST; empty string for GET. */
  body?: string;
  /** ISO timestamp; if omitted, set to `now`. */
  timestamp?: string;
  secretKey: string;
}

export interface OkxSignResult {
  timestamp: string;
  signature: string;
}

export function nowIsoTimestamp(): string {
  return new Date().toISOString();
}

export function signOkxRequest(input: OkxSignInput): OkxSignResult {
  const timestamp = input.timestamp ?? nowIsoTimestamp();
  const body = input.body ?? "";
  const prehash = `${timestamp}${input.method}${input.requestPath}${body}`;
  const signature = createHmac("sha256", input.secretKey).update(prehash).digest("base64");
  return { timestamp, signature };
}

/**
 * Build a deterministic, sorted query string for OKX request paths.
 * Skips undefined / null / empty-string values so the signature matches the URL we send.
 */
export function buildQueryString(
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const entries = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => [k, String(v)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  if (entries.length === 0) return "";
  return (
    "?" +
    entries
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&")
  );
}
