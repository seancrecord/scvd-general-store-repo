import { env } from "cloudflare:test";
import { expect, it } from "vitest";
import type { Env } from "@/types";

const bindings = env as unknown as Env;
function coordinator() {
  const namespace = bindings.PAID_RECOVERIES!;
  return namespace.get(namespace.idFromName(`fixture-${crypto.randomUUID()}`));
}

it("only one concurrent recovery can acquire a given transaction", async () => {
  const stub = coordinator();
  const claims = await Promise.all(Array.from({ length: 8 }, () => stub.begin("input-digest")));
  expect(claims.filter(claim => claim.kind === "claimed")).toHaveLength(1);
  expect(claims.filter(claim => claim.kind === "unavailable")).toHaveLength(7);
});

it("persists a completed response and refuses a different input or writer", async () => {
  const stub = coordinator();
  const claim = await stub.begin("input-digest");
  expect(claim.kind).toBe("claimed");
  if (claim.kind !== "claimed") throw new Error("fixture claim unavailable");
  expect(await stub.complete("wrong-token", "wrong-good")).toBe(false);
  expect(await stub.complete(claim.token, '{"cert_id":"fixture-original"}')).toBe(true);
  expect(await stub.begin("input-digest")).toEqual({ kind: "replay", response: '{"cert_id":"fixture-original"}' });
  expect(await stub.begin("changed-input")).toEqual({ kind: "unavailable" });
  expect(await stub.complete(claim.token, "replacement")).toBe(false);
  expect(await stub.begin("input-digest")).toEqual({ kind: "replay", response: '{"cert_id":"fixture-original"}' });
});

it("an unfinished durable claim never expires into permission to mint twice", async () => {
  const stub = coordinator();
  expect((await stub.begin("input-digest")).kind).toBe("claimed");
  expect(await stub.begin("input-digest")).toEqual({ kind: "unavailable" });
  expect(await stub.begin("changed-input")).toEqual({ kind: "unavailable" });
});

it("reads a saved good only for its recorded owner, chain, transaction and product", async () => {
  const stub = coordinator();
  const identity = { path: "/api/buy/context_anchor", payer: "0xaBcD", network: "eip155:8453", transaction: "fixture-tx" };
  const payment = { paidUsdc: 0.001, tipUsdc: 0, payer: identity.payer, network: identity.network,
    transaction: identity.transaction, settleHeaders: {} };
  expect(await stub.readCompleted(identity)).toBeNull();
  const claim = await stub.begin("original-input", { path: identity.path, payment });
  expect(claim.kind).toBe("claimed");
  if (claim.kind !== "claimed") throw new Error("fixture claim unavailable");
  expect(await stub.readCompleted(identity)).toBeNull();
  await stub.complete(claim.token, '{"cert_id":"original"}');
  for (const changed of [{ payer: "0xother" }, { network: "eip155:137" },
    { transaction: "other-tx" }, { path: "/api/buy/other-item" }]) {
    expect(await stub.readCompleted({ ...identity, ...changed })).toBeNull();
  }
  expect(await stub.readCompleted({ ...identity, payer: identity.payer.toLowerCase() })).toEqual({
    digest: "original-input", response: '{"cert_id":"original"}', payment,
  });
});

it("does not infer an owner for older completed records without purchase metadata", async () => {
  const stub = coordinator();
  const claim = await stub.begin("original-input");
  if (claim.kind !== "claimed") throw new Error("fixture claim unavailable");
  await stub.complete(claim.token, '{"cert_id":"original"}');
  expect(await stub.readCompleted({ path: "/api/buy/context_anchor", payer: "0xaBcD",
    network: "eip155:8453", transaction: "fixture-tx" })).toBeNull();
});

function artifactPurchase(network = "eip155:8453", payer = "0xaBcD") {
  return { digest: "full-original-input", purchase: { path: "/api/buy/context_anchor", payment: {
    network, payer, transaction: "fixture-artifact-tx", paidUsdc: 0.001, tipUsdc: 0, settleHeaders: {},
  } } };
}

it("concurrent artifact publishers all receive the same committed bytes", async () => {
  const stub = coordinator(), record = artifactPurchase();
  expect(await stub.openArtifact(record)).toBe(true);
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) =>
    stub.artifactStage(record.digest, "anchor", JSON.stringify({ id: `anchor-${i}`, summary: "original" }))));
  expect(new Set(results).size).toBe(1);
  expect(await stub.artifactStage(record.digest, "anchor")).toBe(results[0]);
  expect(await stub.artifactStage("other-input", "anchor", '"different-good"')).toBeNull();
  expect(await stub.artifactStage(record.digest, "anchor")).toBe(results[0]);
  expect(await stub.openArtifact({ ...record, digest: "different-input" })).toBe(false);
});

it("legacy claims and artifact checkpoints cannot authorize each other's side effects", async () => {
  const legacy = coordinator(), modern = coordinator(), record = artifactPurchase();
  await legacy.begin(record.digest);
  expect(await legacy.openArtifact(record)).toBe(false);
  await modern.openArtifact(record);
  expect(await modern.begin(record.digest)).toEqual({ kind: "unavailable" });
});

it("artifact lookup binds product, rail, transaction and payer with chain-appropriate casing", async () => {
  for (const network of ["eip155:8453", "solana:fixture"]) {
    const stub = coordinator(), record = artifactPurchase(network, "AbCd");
    const payment = record.purchase.payment;
    const identity = { path: record.purchase.path, network, payer: payment.payer, transaction: payment.transaction };
    await stub.openArtifact(record);
    expect(await stub.readArtifact(identity)).toEqual(record);
    for (const change of [{ path: "/api/buy/other" }, { transaction: "other-tx" },
      { network: "other-chain" }, { payer: "another-wallet" }]) {
      expect(await stub.readArtifact({ ...identity, ...change })).toBeNull();
    }
    expect(await stub.readArtifact({ ...identity, payer: "abcd" })).toEqual(network.startsWith("eip155:") ? record : null);
  }
});

it("repeated and concurrent recovery can claim the optional rebate at most once", async () => {
  const stub = coordinator(), record = artifactPurchase();
  await stub.openArtifact(record);
  const claims = await Promise.all(Array.from({ length: 8 }, () => stub.claimArtifactCredit(record.digest)));
  expect(claims.filter(Boolean)).toHaveLength(1);
  expect(await stub.claimArtifactCredit(record.digest)).toBe(false);
});
