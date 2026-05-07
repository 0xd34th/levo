import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { buildQueryString, signOkxRequest } from "@/lib/okx/auth";
import { env, okxConfigured } from "@/lib/env";

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("OKX auth", () => {
  describe("signOkxRequest", () => {
    it("produces deterministic base64 hmac signatures matching the spec", () => {
      const fixture = {
        method: "GET" as const,
        requestPath: "/api/v5/dex/aggregator/quote?amount=100&chainId=784",
        body: "",
        timestamp: "2024-01-01T00:00:00.000Z",
        secretKey: "secret-test-key-abcd",
      };
      const prehash = `${fixture.timestamp}${fixture.method}${fixture.requestPath}${fixture.body}`;
      const expected = createHmac("sha256", fixture.secretKey).update(prehash).digest("base64");

      const result = signOkxRequest(fixture);
      expect(result.timestamp).toBe(fixture.timestamp);
      expect(result.signature).toBe(expected);
    });

    it("includes the request body in the prehash for POST", () => {
      const baseInput = {
        method: "POST" as const,
        requestPath: "/api/v5/wallet/asset/all-token-balances-by-address",
        timestamp: "2024-01-02T05:06:07.890Z",
        secretKey: "secret-test-key-abcd",
      };
      const a = signOkxRequest({ ...baseInput, body: '{"address":"0xabc"}' });
      const b = signOkxRequest({ ...baseInput, body: '{"address":"0xdef"}' });
      expect(a.signature).not.toBe(b.signature);
    });

    it("changes signature when method or path changes", () => {
      const ts = "2024-01-03T10:00:00.000Z";
      const get = signOkxRequest({
        method: "GET",
        requestPath: "/x?a=1",
        timestamp: ts,
        secretKey: "k",
      });
      const post = signOkxRequest({
        method: "POST",
        requestPath: "/x?a=1",
        body: "",
        timestamp: ts,
        secretKey: "k",
      });
      expect(get.signature).not.toBe(post.signature);

      const path1 = signOkxRequest({
        method: "GET",
        requestPath: "/x?a=1",
        timestamp: ts,
        secretKey: "k",
      });
      const path2 = signOkxRequest({
        method: "GET",
        requestPath: "/x?a=2",
        timestamp: ts,
        secretKey: "k",
      });
      expect(path1.signature).not.toBe(path2.signature);
    });

    it("defaults timestamp to now when not provided", () => {
      const before = Date.now();
      const out = signOkxRequest({
        method: "GET",
        requestPath: "/x",
        secretKey: "k",
      });
      const ts = Date.parse(out.timestamp);
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(Date.now() + 100);
    });
  });

  describe("env passphrase compatibility", () => {
    it("reads OKX_API_PASSPHRASE when set", () => {
      process.env.OKX_API_PASSPHRASE = "long-name";
      delete process.env.OKX_PASSPHRASE;
      expect(env.okxPassphrase()).toBe("long-name");
    });

    it("falls back to OKX_PASSPHRASE when only the short form is set", () => {
      delete process.env.OKX_API_PASSPHRASE;
      process.env.OKX_PASSPHRASE = "short-name";
      expect(env.okxPassphrase()).toBe("short-name");
    });

    it("okxConfigured() reports true only when all four credentials are present", () => {
      delete process.env.OKX_API_PASSPHRASE;
      process.env.OKX_API_KEY = "k";
      process.env.OKX_SECRET_KEY = "s";
      process.env.OKX_PASSPHRASE = "p"; // alias
      process.env.OKX_PROJECT_ID = "pj";
      expect(okxConfigured()).toBe(true);

      delete process.env.OKX_PROJECT_ID;
      expect(okxConfigured()).toBe(false);
    });
  });

  describe("buildQueryString", () => {
    it("returns an empty string when there are no entries", () => {
      expect(buildQueryString({})).toBe("");
    });

    it("sorts keys alphabetically and url-encodes values", () => {
      const qs = buildQueryString({
        zeta: "value with space",
        alpha: 1,
        beta: true,
      });
      expect(qs).toBe("?alpha=1&beta=true&zeta=value%20with%20space");
    });

    it("skips undefined / null / empty values", () => {
      const qs = buildQueryString({
        keep: "yes",
        skipUndef: undefined,
        skipNull: null,
        skipEmpty: "",
      });
      expect(qs).toBe("?keep=yes");
    });
  });
});
