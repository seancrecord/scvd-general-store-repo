import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { signMessage } from "@/lib/signing";
import { jwkThumbprint } from "@/lib/web-bot-auth";
import type { Env } from "@/types";

const BASE = "https://scvd.store";
const context = env as unknown as Env;
const seed = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";
const b64 = (hex: string) => btoa(String.fromCharCode(...Uint8Array.from(hex.match(/../g)!, s => parseInt(s, 16))));
async function identity() {
  const { publicKey } = await signMessage("fixture", seed);
  const key = { kty: "OKP" as const, crv: "Ed25519" as const, x: b64(publicKey).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "") };
  return { key, kid: await jwkThumbprint(key) };
}
async function envelope(action: string, extra: Record<string, unknown> = {}) {
  const { key } = await identity();
  const payload = { schema: "scvd-calling-card-action/1", action, audience: BASE, created: Math.floor(Date.now()/1000), public_key: key, ...extra };
  return { payload, signature: (await signMessage(JSON.stringify(payload), seed)).signature };
}
async function publish() {
  const { kid } = await identity();
  const created = Math.floor(Date.now()/1000);
  const params = `("@authority";req);created=${created};expires=${created+86400};keyid="${kid}";alg="ed25519";nonce="fixture";tag="http-message-signatures-directory"`;
  const proof = await signMessage(`"@authority";req: scvd.store\n"@signature-params": ${params}`, seed);
  const body = await envelope("publish", { directory: { signature_input: `card=${params}`, signature: `card=:${b64(proof.signature)}:` } });
  return SELF.fetch(`${BASE}/bot-auth/keys`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
async function introduction(overrides: Record<string,string> = {}, age = 0) {
  const { kid } = await identity();
  const created = Math.floor(Date.now()/1000) - age;
  const agent = JSON.stringify(`${BASE}/bot-auth/keys/${kid}`);
  const params = `("@authority" "signature-agent");created=${created};expires=${created+60};keyid="${kid}";alg="ed25519";nonce="${crypto.randomUUID()}";tag="web-bot-auth"`;
  const signature = await signMessage(`"@authority": scvd.store\n"signature-agent": ${agent}\n"@signature-params": ${params}`, seed);
  return SELF.fetch(`${BASE}/bot-auth/observe`, { headers: { "Signature-Agent": agent, "Signature-Input": `card=${params}`, Signature: `card=:${b64(signature.signature)}:`, ...overrides } });
}

describe("calling-card live path", () => {
  beforeEach(async () => {
    for (const namespace of [context.COUNTERS, context.ORDERS]) {
      const rows = await namespace.list({prefix:"calling_card:"});
      await Promise.all(rows.keys.map(row=>namespace.delete(row.name)));
    }
  });
  it("publishes only a proved public key and verifies an actual introduction", async () => {
    const registered = await publish();
    expect(registered.status).toBe(200);
    const registration = await registered.json() as { directory_url: string };
    const directory = await SELF.fetch(registration.directory_url);
    expect(directory.headers.get("Content-Type")).toContain("http-message-signatures-directory");
    expect(JSON.stringify(await directory.json())).not.toContain('"d"');
    const observation = await introduction();
    expect(observation.status).toBe(200);
    expect(observation.headers.get("Calling-Card-Recognition")).toBe("signature_verified");
    const body = await observation.json() as { observation: Record<string,unknown>, signature:string };
    expect(body.observation.identity).toBe("signature_verified");
    expect(body.observation.payment).toBe("not_observed");
    expect(body.signature).toMatch(/^[a-f0-9]{128}$/);
  });
  it("refuses tampered, expired, and revoked introductions", async () => {
    await publish();
    expect((await introduction({Signature:"card=:AAAA:"})).status).toBe(401);
    expect((await introduction({},120)).status).toBe(401);
    const revoked = await SELF.fetch(`${BASE}/bot-auth/keys`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(await envelope("revoke"))});
    expect(revoked.status).toBe(200);
    expect((await introduction()).status).toBe(401);
    expect((await publish()).status).toBe(409);
  });
  it("binds registration changes to the action and refuses private or unknown fields", async () => {
    const signed = await envelope("revoke");
    signed.payload.action = "publish";
    for (const body of [signed, await envelope("revoke", { private_key: "fixture-only" })]) {
      expect((await SELF.fetch(`${BASE}/bot-auth/keys`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})).status).toBe(400);
    }
  });
  it("retains only authenticated, consented, bounded client reports behind admin authentication", async () => {
    await publish();
    const report = { event_id:crypto.randomUUID(), origin:"https://merchant.example", outcome:"payment_required", http_status:402, introduction:"signed", identity_acceptance:"not_observed", payment:"challenge_received", next_action:"existing_payment_client" };
    const post = (data:unknown)=>SELF.fetch(`${BASE}/bot-auth/reports`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
    const signed = await envelope("report", { consent:true, report });
    expect((await post(signed)).status).toBe(201);
    expect((await post(signed)).status).toBe(200);
    expect((await post(await envelope("report", {consent:false,report}))).status).toBe(400);
    expect((await post(await envelope("report", {consent:true,report:{...report,body:"private"}}))).status).toBe(400);
    expect((await post(await envelope("report", {consent:true,report:{...report,origin:"https://merchant.example/path?token=x"}}))).status).toBe(400);
    expect((await SELF.fetch(`${BASE}/admin/calling-card.json`)).status).toBe(401);
    const rows = await context.ORDERS.list({prefix:"calling_card:report:"});
    expect(rows.keys).toHaveLength(1);
    const saved = await context.ORDERS.get(rows.keys[0]!.name, "json") as Record<string,unknown>;
    expect(saved.evidence).toBe("client_report_unverified");
    expect(saved.public_key).toBeUndefined();
  });
  it("does not mistake an unsigned visit or unavailable directory for verified recognition", async () => {
    expect((await SELF.fetch(`${BASE}/bot-auth/observe`)).headers.get("Calling-Card-Recognition")).toBe("not_verified");
    expect((await introduction()).status).toBe(401);
  });
});
