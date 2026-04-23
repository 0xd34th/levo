import { describe, expect, it } from "vitest";
import { summarizeJwtForLogs } from "./jwt";

describe("summarizeJwtForLogs", () => {
  it("extracts a safe JWT summary for logging", () => {
    const summary = summarizeJwtForLogs(
      "eyJhbGciOiJFUzI1NiIsImtpZCI6ImtpZC0xIn0.eyJpc3MiOiJwcml2eS5pbyIsImF1ZCI6InByaXZ5LWFwcC1pZCIsInN1YiI6ImRpZDpwcml2eTp1c2VyLTEiLCJzaWQiOiJzZXNzaW9uLTEiLCJpYXQiOjEwMCwiZXhwIjoyMDB9.signature",
      150_000,
    );

    expect(summary).toEqual({
      claims: {
        aud: "privy-app-id",
        exp: 200,
        iat: 100,
        iss: "privy.io",
        nbf: undefined,
        sid: "session-1",
        sub: "did:privy:user-1",
      },
      expired: false,
      expiresInSec: 50,
      fingerprint: expect.any(String),
      header: {
        alg: "ES256",
        kid: "kid-1",
        typ: undefined,
      },
      isJwtLike: true,
      segments: 3,
    });
  });
});
