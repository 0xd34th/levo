import { describe, expect, it, vi } from "vitest";
import { withCache, hashKey } from "@/lib/cache/store";

describe("withCache", () => {
  it("caches fresh values within TTL and avoids re-fetching", async () => {
    let calls = 0;
    const fetcher = vi.fn(async () => {
      calls++;
      return { v: calls };
    });
    const key = hashKey(["test", "fresh", Math.random().toString()]);
    const a = await withCache(key, fetcher, { ttl: 60, swr: 60 });
    const b = await withCache(key, fetcher, { ttl: 60, swr: 60 });
    expect(a.v).toBe(1);
    expect(b.v).toBe(1);
    expect(calls).toBe(1);
  });

  it("hashKey is stable & deterministic", () => {
    expect(hashKey(["a", 1, false])).toBe(hashKey(["a", 1, false]));
    expect(hashKey(["a", 1])).not.toBe(hashKey(["a", 2]));
  });
});
