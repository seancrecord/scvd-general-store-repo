import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { checkDirectory } from "@/services/bot-auth-card";
import { signMessage } from "@/lib/signing";
import type { Env } from "@/types";

describe("the calling-card directory response profile", () => {
  it("verifies a request-bound authority even when the tag precedes timestamps", async () => {
    const params = '("@authority";req);tag="http-message-signatures-directory";created=1800000000;expires=1800000060';
    const base = `"@authority";req: agent.example\n"@signature-params": ${params}`;
    const signed = await signMessage(base, (env as unknown as Env).WBA_SIGNING_KEY!);
    const bytes = (hex: string) => Uint8Array.from(hex.match(/../g)!, part => parseInt(part, 16));
    const b64 = (hex: string) => btoa(String.fromCharCode(...bytes(hex)));
    const x = b64(signed.publicKey).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const read = (host: string) => checkDirectory(env as unknown as Env, `https://${host}/.well-known/http-message-signatures-directory`, async () => new Response(JSON.stringify({ keys: [{ kty: "OKP", crv: "Ed25519", x }] }), { headers: {
      "Content-Type": "application/http-message-signatures-directory+json",
      "Signature-Input": `card=${params}`,
      Signature: `card=:${b64(signed.signature)}:`,
    } }));
    expect((await read("agent.example")).checks.find(check => check.name === "proof-of-possession")?.ok).toBe(true);
    expect((await read("different.example")).checks.find(check => check.name === "proof-of-possession")?.ok).toBe(false);
  });
});
