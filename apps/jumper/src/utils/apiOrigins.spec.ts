import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("apiOrigins", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    Reflect.deleteProperty(globalThis, "window");
    process.env = { ...envBackup };
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
    process.env = { ...envBackup };
  });

  it("uses explicit internal overrides on the server", async () => {
    process.env.JUMPER_INTERNAL_BACKEND_URL = "https://api.krilly.ai/v1";
    process.env.LIFI_INTERNAL_BACKEND_URL = "https://api.krilly.ai/pipeline";
    process.env.NEXT_PUBLIC_BACKEND_URL =
      "https://jumper.krilly.ai/api/jumper/v1";
    process.env.NEXT_PUBLIC_LIFI_BACKEND_URL =
      "https://jumper.krilly.ai/api/jumper/pipeline";
    process.env.NEXT_PUBLIC_SITE_URL = "https://jumper.krilly.ai/en";

    const { getBackendOrigin, getLifiBackendOrigin } =
      await import("./apiOrigins");

    expect(getBackendOrigin()).toBe("https://api.krilly.ai/v1");
    expect(getLifiBackendOrigin()).toBe("https://api.krilly.ai/pipeline");
  });

  it("ignores same-origin public proxy URLs on the server and falls back to defaults", async () => {
    process.env.NEXT_PUBLIC_BACKEND_URL =
      "https://jumper.krilly.ai/api/jumper/v1";
    process.env.NEXT_PUBLIC_LIFI_BACKEND_URL =
      "https://jumper.krilly.ai/api/jumper/pipeline";
    process.env.NEXT_PUBLIC_SITE_URL = "https://jumper.krilly.ai/en";

    const { getBackendOrigin, getLifiBackendOrigin } =
      await import("./apiOrigins");

    expect(getBackendOrigin()).toBe("https://api-develop.jumper.exchange/v1");
    expect(getLifiBackendOrigin()).toBe(
      "https://api-develop.jumper.exchange/pipeline",
    );
  });
});
