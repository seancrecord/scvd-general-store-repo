import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("seller declarations and their next step", () => {
  it("offers free declarations and a scoped paid next step from a readable room", async () => {
    const response = await SELF.fetch("https://scvd.store/seller-declarations", { headers: { Accept: "text/html" } });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('/api/seller-declaration');
    expect(html).toContain('/evidence-pilot');
    expect(html).toContain('Free');
  });
});

import { env } from "cloudflare:test";
import { afterEach, beforeEach, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { attachDeclaration, declarationProof, parseDeclaration, compareDeclaration, declarationAt, declarationsFor, declarationWeekChanges, DECLARATION_PREFIX, type SellerDeclaration } from "@/services/seller-declaration";
import { payToDigest } from "@/lib/pay-to-digest";
import { KV_KEYS } from "@/lib/kv-keys";
import { takeCorpusSnapshot, listCorpus, type CorpusRecord } from "@/services/corpus";
import { subjectHistory } from "@/services/subject-history";
import { heldHalfOf } from "@/services/look";
import { readAskedFor } from "@/services/asked-queue";
import { DECLARATION_MONEY } from "@/store/seller-declarations";
import type { Env } from "@/types";
const testEnv = env as unknown as Env;
const NOW = new Date("2026-10-09T12:00:00.000Z");
const SIGNER = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const address = SIGNER.address.toLowerCase();
const other = "0x2222222222222222222222222222222222222222";
const makeInput = (host = "declaration.example", at = NOW.toISOString(), pay_to = [address]) => parseDeclaration({ artifact: "seller_declaration", version: 1, host, declares: { pay_to, networks: ["eip155:8453"], valid_from: at } }, "scvd.store");
async function hostAttach(host = "declaration.example", at = NOW, pay_to = [address]) {
  const declaration = makeInput(host, at.toISOString(), pay_to);
  const proof = await declarationProof(declaration);
  const fetchImpl = vi.fn(async () => new Response(proof.sha256));
  const row = await attachDeclaration(testEnv, { evidence: "well_known", declaration }, at, fetchImpl);
  return { row, fetchImpl, declaration };
}
async function fixture(at: string, payTo?: string[], verdict = "ready", sequence = 1): Promise<CorpusRecord> {
  // Shape mirrors the signed corpus; crypto is exercised separately through seed().
  return { digest: `snapshot-${sequence}`, snapshot: { sequence, week: sequence === 1 ? "2026-W41" : "2026-W42", taken_at: at,
    round: { hosts: [{ host: "declaration.example", observed_at: at, verdict, ...(payTo ? { offer: { pay_to_digest: await Promise.all(payTo.map(payToDigest)) } } : {}) }] } } } as CorpusRecord;
}
async function seed() {
  await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify({ week: "2026-W41", started_at: "2026-10-09T10:00:00.000Z", finished_at: "2026-10-09T10:01:00.000Z", listed_resources: 1,
    hosts: [{ host: "declaration.example", url: "https://declaration.example/api/pay", verdict: "ready", observed_at: "2026-10-09T10:00:00.000Z", failed: [], advisories: [], offer: { networks: ["eip155:8453"], schemes: ["exact"], min_usdc: 0.01, pay_to: [address] } }] }));
  await takeCorpusSnapshot(testEnv, { calendars: ["https://calendar.test"], fetch: async () => new Response(new Uint8Array([1, 2, 3])) });
}
beforeEach(async () => {
  for (const prefix of [DECLARATION_PREFIX, "seller_declaration_attempt:", KV_KEYS.corpusPrefix, "look:"]) {
    const keys = await testEnv.COUNTERS.list({ prefix });
    await Promise.all(keys.keys.map(key => testEnv.COUNTERS.delete(key.name)));
  }
  await testEnv.COUNTERS.delete(KV_KEYS.askedFor);
  await testEnv.COUNTERS.delete(KV_KEYS.wardRoundLatest);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("proof, storage and replay boundaries", () => {
  it("accepts host proof for an unseen host, queues an ask, and never retains a literal address", async () => {
    const { row, fetchImpl } = await hostAttach();
    expect(row.evidence).toBe("well_known");
    expect(JSON.stringify(row)).not.toContain(address);
    expect(fetchImpl).toHaveBeenCalledWith("https://declaration.example/.well-known/scvd-note.txt", expect.objectContaining({ redirect: "manual" }));
    expect((await readAskedFor(testEnv)).hosts["declaration.example"]?.surfaces).toContain("seller_declaration");
    const history = await subjectHistory(testEnv, row.host, "https://scvd.store", NOW);
    expect(history.declared_vs_observed?.state).toBe("not_probed");
    expect((await heldHalfOf(testEnv, row.host, NOW)).declared_vs_observed?.declaration?.id).toBe(row.id);
    expect(JSON.stringify(await declarationsFor(testEnv, row.host))).not.toContain(address);
  });
  it("refuses a wrong hash, redirects and oversized proof bodies", async () => {
    const declaration = makeInput();
    const proof = await declarationProof(declaration);
    for (const response of [new Response("wrong"), new Response(null, { status: 302, headers: { Location: "https://elsewhere.example" } }), new Response("x".repeat(4097) + proof.sha256)]) {
      await expect(attachDeclaration(testEnv, { evidence: "well_known", declaration }, NOW, async () => response)).rejects.toMatchObject({ code: "proof_failed" });
    }
    expect(await declarationsFor(testEnv, declaration.host)).toEqual([]);
  });
  it("refuses private and malformed hosts before fetching", async () => {
    for (const host of ["127.0.0.1", "metadata.google.internal", "x.home.arpa", "scvd.store", "user@example.com", "host.example/path"]) expect(() => makeInput(host)).toThrow();
  });
  it("accepts an observed wallet signature but rejects a signature transplanted to different terms", async () => {
    await seed();
    const declaration = makeInput();
    const signature = await SIGNER.signMessage({ message: (await declarationProof(declaration)).statement });
    const changed = { ...declaration, declares: { ...declaration.declares, networks: ["eip155:1"] } };
    await expect(attachDeclaration(testEnv, { evidence: "wallet_signature", declaration: changed, signatures: { [address]: signature } }, NOW)).rejects.toMatchObject({ code: "proof_failed" });
    const row = await attachDeclaration(testEnv, { evidence: "wallet_signature", declaration, signatures: { [address]: signature } }, NOW);
    expect(row.proof_scope).toContain("not control of the host");
  });
  it("does not let a wallet claim an unobserved host or add an unproved address", async () => {
    const declaration = makeInput();
    const signature = await SIGNER.signMessage({ message: (await declarationProof(declaration)).statement });
    await expect(attachDeclaration(testEnv, { evidence: "wallet_signature", declaration, signatures: { [address]: signature } }, NOW)).rejects.toMatchObject({ code: "host_proof_required" });
    await seed();
    const two = makeInput(undefined, undefined, [address, other]);
    const bothSignature = await SIGNER.signMessage({ message: (await declarationProof(two)).statement });
    await expect(attachDeclaration(testEnv, { evidence: "wallet_signature", declaration: two, signatures: { [address]: bothSignature } }, NOW)).rejects.toMatchObject({ code: "invalid_signatures" });
  });
  it("replay preserves the original date and cannot displace a newer declaration", async () => {
    const first = await hostAttach();
    const nextDate = new Date(NOW.getTime() + 60_000);
    const second = await hostAttach(undefined, nextDate, [other]);
    const noFetch = vi.fn(async () => { throw new Error("must not fetch"); });
    const replay = await attachDeclaration(testEnv, { evidence: "well_known", declaration: first.declaration }, new Date(NOW.getTime() + 86_400_000), noFetch);
    expect(replay.attached_at).toBe(NOW.toISOString());
    expect(noFetch).not.toHaveBeenCalled();
    expect(declarationAt(await declarationsFor(testEnv, first.row.host), nextDate.toISOString())?.id).toBe(second.row.id);
    expect(declarationAt(await declarationsFor(testEnv, first.row.host), NOW.toISOString())?.id).toBe(first.row.id);
  });
  it("keeps a host statement above a wallet statement and refuses stale submissions", async () => {
    await hostAttach();
    const later = new Date(NOW.getTime() + 60_000);
    await expect(attachDeclaration(testEnv, { evidence: "wallet_signature", declaration: makeInput(undefined, later.toISOString()), signatures: {} }, later)).rejects.toMatchObject({ code: "host_proof_required" });
    await expect(attachDeclaration(testEnv, { evidence: "well_known", declaration: makeInput("other.example") }, new Date(NOW.getTime() + 3600_000))).rejects.toMatchObject({ code: "stale_statement" });
  });
});

describe("dated comparison", () => {
  it("distinguishes all five states and never falls back past a missing capture", async () => {
    const { row } = await hostAttach();
    const at = "2026-10-10T12:00:00.000Z";
    const match = await fixture(at, [address]);
    expect((await compareDeclaration([match], row.host, null, at)).state).toBe("no_declaration");
    expect((await compareDeclaration([], row.host, row, at)).state).toBe("not_probed");
    expect((await compareDeclaration([match], row.host, row, at)).state).toBe("match");
    expect((await compareDeclaration([await fixture(at, [other])], row.host, row, at)).state).toBe("mismatch");
    const missing = await fixture("2026-10-11T12:00:00.000Z", undefined, "unreachable", 2);
    expect((await compareDeclaration([match, missing], row.host, row, missing.snapshot.taken_at)).state).toBe("not_captured");
    const old = await fixture("2026-10-08T12:00:00.000Z", [address]);
    expect((await compareDeclaration([old], row.host, row, at)).state).toBe("not_probed");
  });
  it("uses the actual probe timestamp, not the later sealing time", async () => {
    const { row } = await hostAttach();
    const record = await fixture("2026-10-08T12:00:00.000Z", [address]);
    record.snapshot.taken_at = "2026-10-10T12:00:00.000Z";
    expect((await compareDeclaration([record], row.host, row, record.snapshot.taken_at)).state).toBe("not_probed");
  });
  it("does not invent a post-declaration probe time when a legacy row has only its seal", async () => {
    const { row } = await hostAttach();
    const record = await fixture("2026-10-10T12:00:00.000Z", [address]);
    delete (record.snapshot.round.hosts as { observed_at?: string }[])[0]!.observed_at;
    expect((await compareDeclaration([record], row.host, row, record.snapshot.taken_at)).state).toBe("not_probed");
  });
  it("refuses an ambiguous equal-time restatement instead of choosing a favorable answer", async () => {
    const { row } = await hostAttach();
    expect(() => declarationAt([row, { ...row, id: "different", pay_to_digests: ["different"] }], NOW.toISOString())).toThrow(/Conflicting/);
  });
  it("reports newly mismatching hosts with a denominator and keeps old weeks stable after restatement", async () => {
    await hostAttach();
    const records = [await fixture("2026-10-10T12:00:00.000Z", [address]), await fixture("2026-10-17T12:00:00.000Z", [other], "ready", 2)];
    const changes = await declarationWeekChanges(testEnv, records, "2026-W42");
    expect(changes.declarations_compared).toBe(1);
    expect(changes.declaration_mismatches.map(row => row.host)).toEqual(["declaration.example"]);
    expect(changes.declaration_mismatches[0]?.before.state).toBe("match");
    await hostAttach(undefined, new Date("2026-10-18T12:00:00.000Z"), [other]);
    expect(await declarationWeekChanges(testEnv, records, "2026-W42")).toEqual(changes);
    const missing = await fixture("2026-10-17T12:00:00.000Z", undefined, "unreachable", 2);
    expect((await declarationWeekChanges(testEnv, [records[0]!, missing], "2026-W42")).declarations_compared).toBe(0);
  });
  it("keeps literal addresses out of public comparison responses", async () => {
    await hostAttach(undefined, new Date());
    const response = await SELF.fetch("https://scvd.store/api/seller-declaration?host=declaration.example");
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).not.toContain(address);
    expect(body).toContain("not_probed");
    expect(body).toContain("/evidence-pilot");
  });
  it("attaches through HTTP and serves a readable result with the free next step", async () => {
    const declaration = makeInput(undefined, new Date().toISOString());
    const proof = await declarationProof(declaration);
    vi.stubGlobal("fetch", async () => new Response(proof.sha256));
    const response = await SELF.fetch("https://scvd.store/api/seller-declaration", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "attach", evidence: "well_known", declaration }) });
    expect(response.status).toBe(200);
    const result = await response.text();
    expect(result).not.toContain(address);
    const reading = await SELF.fetch("https://scvd.store/api/seller-declaration?host=declaration.example", { headers: { Accept: "text/html" } });
    expect(await reading.text()).toContain("Declare receiving addresses free");
    const replay = await SELF.fetch("https://scvd.store/api/seller-declaration", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "attach", evidence: "well_known", declaration }) });
    expect(replay.status).toBe(429);
    expect(replay.headers.get("Retry-After")).toBe("60");
  });
  it("preparation publishes nothing and returns the exact statement an agent can sign", async () => {
    const declaration = makeInput();
    const response = await SELF.fetch("https://scvd.store/api/seller-declaration", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare", declaration }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject(await declarationProof(declaration));
    expect(await declarationsFor(testEnv, declaration.host)).toEqual([]);
  });
  it("offers the same pilot price from relevant pages and keeps the free path visible", async () => {
    for (const path of ["/seller-declarations", "/operators", "/corpus", "/evidence-pilot"]) {
      const response = await SELF.fetch(`https://scvd.store${path}`, { headers: { Accept: "text/html" } });
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('/seller-declarations');
      if (path === "/seller-declarations") expect(html).toContain(DECLARATION_MONEY);
    }
  });
});
