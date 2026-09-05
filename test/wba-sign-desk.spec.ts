import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import * as ed25519 from "@noble/ed25519";

/**
 * THE SIGNING DESK: the Worker signs the runner's egress so the seed
 * never leaves Cloudflare.
 *
 * The properties that matter, each as a test:
 *  - it is behind the keeper's password, like every other admin door;
 *  - what comes back VERIFIES against the key the store publishes, by
 *    an outside reader's method — otherwise this desk would hand the
 *    runner a proof that fails, which is worse than no proof;
 *  - it signs only the authority of an http(s) URL, and refuses
 *    anything that is not that;
 *  - it takes JSON only, so no browser form can ever reach it.
 */

const BASE = "https://scvd.store";
const adminAuth = {
  Authorization: `Basic ${btoa("keeper:test-admin-password")}`,
  "Content-Type": "application/json",
};

function b64urlToBytes(value: string): Uint8Array {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return Uint8Array.from(atob(pad), (ch) => ch.charCodeAt(0));
}
function b64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (ch) => ch.charCodeAt(0));
}

async function sign(body: unknown, headers: Record<string, string> = adminAuth) {
  return SELF.fetch(`${BASE}/admin/wba/sign`, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /admin/wba/sign", () => {
  it("is behind the keeper's password", async () => {
    const response = await sign(
      { url: "https://door.example/paid" },
      { "Content-Type": "application/json" },
    );
    expect(response.status).toBe(401);
  });

  it("returns a triplet that verifies against the published directory", async () => {
    const response = await sign({ url: "https://door.example/paid?x=1" });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      authority: string;
      headers: Record<string, string>;
    };
    expect(body.authority).toBe("door.example");
    const input = body.headers["Signature-Input"] ?? "";
    const sig = body.headers.Signature ?? "";
    const agent = body.headers["Signature-Agent"] ?? "";
    expect(input.startsWith("sig1=(")).toBe(true);
    expect(agent).toBe(`"${BASE}"`);

    // Reconstruct the RFC 9421 base exactly as a verifying origin would,
    // and check it against the key the directory lists — the whole point
    // of this desk is that an outside reader can do this.
    const params = input.slice("sig1=".length);
    expect(params).toContain('tag="web-bot-auth"');
    const keyid = /keyid="([^"]+)"/.exec(params)?.[1];
    expect(keyid).toBeTruthy();
    const base = [
      `"@authority": door.example`,
      `"signature-agent": ${agent}`,
      `"@signature-params": ${params}`,
    ].join("\n");
    const directory = (await (
      await SELF.fetch(`${BASE}/.well-known/http-message-signatures-directory`)
    ).json()) as { keys: { kid: string; x: string }[] };
    const key = directory.keys.find((k) => k.kid === keyid);
    expect(key, "the desk signed with a key the directory does not list").toBeTruthy();
    const signature = b64ToBytes(/^sig1=:(.+):$/.exec(sig)?.[1] ?? "");
    const ok = await ed25519.verifyAsync(
      signature,
      new TextEncoder().encode(base),
      b64urlToBytes(key!.x),
    );
    expect(ok).toBe(true);
  });

  it("signs the authority only, and refuses what is not an http(s) URL", async () => {
    for (const url of ["door.example", "ftp://door.example/x", "", 42, null]) {
      const response = await sign({ url });
      expect(response.status, String(url)).toBe(400);
    }
    const bad = await sign("{not json", adminAuth);
    expect(bad.status).toBe(400);
  });

  it("takes JSON only, so no form can be posted at it", async () => {
    const response = await sign("url=https%3A%2F%2Fdoor.example", {
      ...adminAuth,
      "Content-Type": "application/x-www-form-urlencoded",
    });
    expect(response.status).toBe(415);
  });
});
