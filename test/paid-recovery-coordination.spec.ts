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
