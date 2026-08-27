import { describe, expect, it } from "vitest";
import { captureWatchEvidence } from "@/services/watch-evidence";
import { signerKidsFromChallenge } from "@/services/watch-evidence";

/**
 * ROADMAP 3.1 — WHAT IS FREE NOW AND UNCOLLECTABLE LATER (ledger G3/G4).
 *
 * Three facts exist only while the probe is standing at the door, and
 * the round has been walking past all three:
 *
 *   G3, key identity. Signed offers carry a `kid`. The round recorded
 *   only THAT offers exist, so the ecosystem's only possible
 *   key-rotation history — who signed for this host, and since when —
 *   was thrown away once per week, permanently. It cannot be
 *   reconstructed from any later probe: a key that rotated on Tuesday
 *   leaves no trace on Sunday.
 *
 *   G4, the infrastructure dimension. The server headers the response
 *   already carried are free (zero extra contact, same consent
 *   posture); an infra migration or a shared-infra cluster has no tape
 *   without them.
 *
 *   Latency. The probe times itself anyway; not writing the number
 *   down is the one loss that is pure carelessness.
 *
 * WHAT WE DO NOT PRETEND TO CAPTURE: the TLS certificate fingerprint.
 * A Workers `fetch` hands back a Response with no certificate detail,
 * so the honest record says the dimension is unavailable from this
 * vantage rather than leaving a reader to assume we looked.
 */

function response(headers: Record<string, string>): Response {
  return new Response("{}", { status: 402, headers });
}

const withOffers = (kids: string[]) => {
  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return btoa(
    JSON.stringify({
      x402Version: 2,
      accepts: [],
      extensions: {
        "offer-receipt": {
          info: {
            offers: kids.map((kid) => ({
              signature: `${b64({ alg: "EdDSA", kid })}.${b64({ v: 1 })}.c2ln`,
            })),
          },
        },
      },
    }),
  );
};

describe("key identity, captured at observation time (G3)", () => {
  it("reads every signer kid the challenge carried, in order, deduplicated", () => {
    const kids = signerKidsFromChallenge(
      withOffers([
        "did:web:shop.example#key-1",
        "did:web:shop.example#key-1",
        "did:web:facilitator.example#key-9",
      ]),
    );
    expect(kids).toEqual([
      "did:web:shop.example#key-1",
      "did:web:facilitator.example#key-9",
    ]);
  });

  it("no offers, no kids — an empty list, never a guess", () => {
    expect(signerKidsFromChallenge(btoa(JSON.stringify({ x402Version: 2 })))).toEqual([]);
    expect(signerKidsFromChallenge(null)).toEqual([]);
    expect(signerKidsFromChallenge("not-base64-!!")).toEqual([]);
  });

  it("a malformed signature among good ones loses only itself", () => {
    const kids = signerKidsFromChallenge(withOffers(["did:web:shop.example#key-1"]));
    expect(kids).toContain("did:web:shop.example#key-1");
  });
});

describe("the infrastructure dimension, from what the probe already touched (G4)", () => {
  it("retains the server-identifying headers the response carried", async () => {
    const evidence = await captureWatchEvidence(
      response({
        "content-type": "application/json",
        server: "cloudflare",
        via: "1.1 vegur",
        "x-powered-by": "Express",
      }),
    );
    expect(evidence.headers["server"]).toBe("cloudflare");
    expect(evidence.headers["via"]).toBe("1.1 vegur");
    expect(evidence.headers["x-powered-by"]).toBe("Express");
  });

  it("a header the door did not send is absent, not empty-stringed", async () => {
    const evidence = await captureWatchEvidence(response({ "content-type": "application/json" }));
    expect("server" in evidence.headers).toBe(false);
  });

  it("states the dimension this vantage cannot reach at all", async () => {
    const evidence = await captureWatchEvidence(response({}));
    expect(evidence.tls).toBe("unavailable-from-this-vantage");
  });
});

describe("the round writes down what only it can see", () => {
  it("a ward row carries the signer kids, the latency, and the tls statement", async () => {
    const b64 = (o: unknown) =>
      btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const challenge = btoa(
      JSON.stringify({
        x402Version: 2,
        accepts: [
          {
            scheme: "exact",
            network: "eip155:8453",
            payTo: "0x4444444444444444444444444444444444444444",
            asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            amount: "5000",
            maxTimeoutSeconds: 300,
          },
        ],
        extensions: {
          "offer-receipt": {
            info: {
              offers: [{ signature: `${b64({ alg: "EdDSA", kid: "did:web:door.example#key-1" })}.${b64({ v: 1 })}.c2ln` }],
            },
          },
        },
      }),
    );
    const { vi } = await import("vitest");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("{}", {
            status: 402,
            headers: { "PAYMENT-REQUIRED": challenge, server: "cloudflare" },
          }),
      ),
    );
    const { probeHost } = await import("@/services/ward-round");
    const { env } = await import("cloudflare:test");
    const row = await probeHost(env as never, "https://door.example/api/buy/thing");
    expect(row.signer_kids).toEqual(["did:web:door.example#key-1"]);
    expect(typeof row.latency_ms).toBe("number");
    expect(row.latency_ms).toBeGreaterThanOrEqual(0);
    expect(row.evidence?.headers["server"]).toBe("cloudflare");
    expect(row.evidence?.tls).toBe("unavailable-from-this-vantage");
    vi.unstubAllGlobals();
  }, 30_000);

  it("a door with no signed offers records an empty list, not an absent field", async () => {
    const { vi } = await import("vitest");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("{}", {
            status: 402,
            headers: {
              "PAYMENT-REQUIRED": btoa(JSON.stringify({ x402Version: 2, accepts: [] })),
            },
          }),
      ),
    );
    const { probeHost } = await import("@/services/ward-round");
    const { env } = await import("cloudflare:test");
    const row = await probeHost(env as never, "https://bare.example/api/buy/thing");
    expect(row.signer_kids).toEqual([]);
    vi.unstubAllGlobals();
  }, 30_000);
});

describe("the preimage law holds across the 3.1 capture", () => {
  it("a legacy row carrying no tls canonicalizes without one", async () => {
    const { canonicalizeProbe } = await import("@/services/standing-watch");
    const legacy = {
      at: "2026-08-20T00:00:00.000Z",
      verdict: "ready" as const,
      failed: [],
      evidence: {
        challenge_bytes: "abc",
        headers: { "content-type": "application/json" },
        body_sha256: null,
        body_bytes: 2,
        body_truncated: false,
      },
    };
    const preimage = canonicalizeProbe("w1", "https://door.example/x", legacy as never);
    expect(preimage).not.toContain("tls");
    // And a row captured today carries it, so new rows differ from
    // old ones by addition only — never by rewriting what was signed.
    const fresh = {
      ...legacy,
      evidence: { ...legacy.evidence, tls: "unavailable-from-this-vantage" },
    };
    expect(canonicalizeProbe("w1", "https://door.example/x", fresh as never)).toContain("tls");
  });
});
