import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WELL_KNOWN_BODY_CAP,
  WELL_KNOWN_DOOR_CAP,
  agentCardDiscoveryPointer,
  parseWellKnownDoors,
  readWellKnownDoors,
} from "@/services/well-known-doors";

/**
 * A HOST'S OWN DECLARATION OF ITS DOORS (2026-09-04). What this file
 * holds:
 *
 *   - the consent line: a file declares doors only for the host that
 *     serves it; a door elsewhere is counted as foreign and never
 *     walked, a redirect off-host is unreadable, our own host is
 *     refused;
 *   - rule 52 on every branch: no file is `none`, a file we could not
 *     read or whose shape moved is `unreadable`, and neither is ever
 *     "this host has no doors";
 *   - the caps say so: twenty doors a host, a bounded body;
 *   - the shapes in the wild parse: cloudpayx's, our own, a bare list.
 */

const OWN = "scvd.store";

afterEach(() => vi.unstubAllGlobals());

const CLOUDPAYX = {
  version: 1,
  x402Version: 2,
  name: "cloudpayX",
  resources: [
    { resource: "https://api.cloudpayxagent.xyz/agent/v3/stablecoin-route", accepts: [{ scheme: "exact", network: "xrpl:0" }] },
    { resource: "https://api.cloudpayxagent.xyz/agent/v3/arbitrage-check", accepts: [] },
  ],
};

describe("what a file declares, parsed", () => {
  it("reads cloudpayx's shape, our own shape, and a bare list of strings", () => {
    const theirs = parseWellKnownDoors(CLOUDPAYX, "api.cloudpayxagent.xyz", OWN);
    expect(theirs).toMatchObject({ foreign: 0, refused: 0, capped: false });
    expect((theirs as { doors: string[] }).doors).toEqual([
      "https://api.cloudpayxagent.xyz/agent/v3/stablecoin-route",
      "https://api.cloudpayxagent.xyz/agent/v3/arbitrage-check",
    ]);
    const ours = parseWellKnownDoors(
      { version: 1, resources: [{ resource: "https://door.example/api/buy/hello", resourceUrl: "https://door.example/api/buy/hello", type: "http" }] },
      "door.example",
      OWN,
    );
    expect((ours as { doors: string[] }).doors).toEqual(["https://door.example/api/buy/hello"]);
    const bare = parseWellKnownDoors({ resources: ["https://door.example/a", "https://door.example/a", "https://door.example/b"] }, "door.example", OWN);
    expect((bare as { doors: string[] }).doors).toEqual(["https://door.example/a", "https://door.example/b"]);
  });

  it("counts a door on another host as foreign and never returns it — one operator cannot volunteer another", () => {
    const parsed = parseWellKnownDoors(
      { resources: ["https://door.example/mine", "https://victim.example/theirs", "https://sub.door.example/not-mine-either"] },
      "door.example",
      OWN,
    );
    expect(parsed).toMatchObject({ doors: ["https://door.example/mine"], foreign: 2 });
  });

  it("refuses what the probe-target law refuses, and counts it", () => {
    const parsed = parseWellKnownDoors(
      { resources: ["https://door.example:8443/odd-port", "http://door.example/plain"] },
      "door.example",
      OWN,
    );
    // Plain http fails URL-host match on protocol only if host differs;
    // here the host matches, so the probe law is what refuses both.
    expect((parsed as { doors: string[] }).doors).toEqual([]);
    expect((parsed as { refused: number }).refused).toBeGreaterThanOrEqual(1);
  });

  it("caps at twenty doors a host and says it did", () => {
    const many = Array.from({ length: WELL_KNOWN_DOOR_CAP + 5 }, (_, i) => `https://door.example/d${i}`);
    const parsed = parseWellKnownDoors({ resources: many }, "door.example", OWN) as { doors: string[]; capped: boolean };
    expect(parsed.doors.length).toBe(WELL_KNOWN_DOOR_CAP);
    expect(parsed.capped).toBe(true);
  });

  it("a moved shape is unreadable, never no doors", () => {
    expect(parseWellKnownDoors({ version: 1, name: "x" }, "door.example", OWN)).toEqual({ unreadable: "the file carries no `resources` field" });
    expect(parseWellKnownDoors({ resources: "nope" }, "door.example", OWN)).toEqual({ unreadable: "`resources` is not an array" });
    expect(parseWellKnownDoors("just a string", "door.example", OWN)).toEqual({ unreadable: "the file is not a JSON object" });
    expect(parseWellKnownDoors([], "door.example", OWN)).toEqual({ unreadable: "the file is not a JSON object" });
  });

  it("finds an agent card's discovery pointer at the top or one level down, and nowhere deeper", () => {
    expect(agentCardDiscoveryPointer({ x402Discovery: "https://a.example/.well-known/x402" })).toBe("https://a.example/.well-known/x402");
    expect(agentCardDiscoveryPointer({ cloudpayx: { x402Discovery: "https://api.cloudpayxagent.xyz/.well-known/x402" } })).toBe("https://api.cloudpayxagent.xyz/.well-known/x402");
    expect(agentCardDiscoveryPointer({ a: { b: { x402Discovery: "https://deep.example/x" } } })).toBeNull();
    expect(agentCardDiscoveryPointer({ skills: [] })).toBeNull();
    expect(agentCardDiscoveryPointer("nope")).toBeNull();
  });
});

type Stub = Record<string, () => Response | { status: number; url: string; body: ReadableStream<Uint8Array> | null }>;
function stub(routes: Stub) {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const route = routes[url];
    if (!route) return new Response("", { status: 404 });
    return route();
  });
}
const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("the read, with the world stubbed", () => {
  it("a host with a file gets its doors, via x402", async () => {
    stub({ "https://door.example/.well-known/x402": json({ resources: ["https://door.example/a"] }) });
    expect(await readWellKnownDoors("door.example", OWN)).toMatchObject({ kind: "doors", declaring_host: "door.example", doors: ["https://door.example/a"], via: "x402" });
  });

  it("no file anywhere is none — and names that neither path answered", async () => {
    stub({});
    expect(await readWellKnownDoors("door.example", OWN)).toEqual({ kind: "none", via: "x402" });
  });

  it("an empty file is none; a broken file is unreadable; a huge file is unreadable — three different words", async () => {
    stub({ "https://door.example/.well-known/x402": json({ resources: [] }) });
    expect((await readWellKnownDoors("door.example", OWN)).kind).toBe("none");
    stub({ "https://door.example/.well-known/x402": () => new Response("<html>oops", { status: 500 }) });
    expect(await readWellKnownDoors("door.example", OWN)).toMatchObject({ kind: "unreadable", reason: "HTTP 500" });
    stub({ "https://door.example/.well-known/x402": () => new Response("{not json", { status: 200 }) });
    expect(await readWellKnownDoors("door.example", OWN)).toMatchObject({ kind: "unreadable", reason: "the file is not JSON" });
    stub({ "https://door.example/.well-known/x402": () => new Response("x".repeat(WELL_KNOWN_BODY_CAP + 1), { status: 200 }) });
    expect((await readWellKnownDoors("door.example", OWN)) as { reason: string }).toMatchObject({ kind: "unreadable" });
  });

  it("follows an agent card's pointer one hop, and the pointed-at host is the declaring host", async () => {
    stub({
      "https://cloudpayx.com/.well-known/agent.json": json({ name: "cloudpayX", cloudpayx: { x402Discovery: "https://api.cloudpayxagent.xyz/.well-known/x402" } }),
      "https://api.cloudpayxagent.xyz/.well-known/x402": json(CLOUDPAYX),
    });
    const read = await readWellKnownDoors("cloudpayx.com", OWN);
    expect(read).toMatchObject({ kind: "doors", declaring_host: "api.cloudpayxagent.xyz", via: "agent-card" });
    expect((read as { doors: string[] }).doors.length).toBe(2);
  });

  it("a card whose pointer file declares doors for a THIRD host yields none of them", async () => {
    stub({
      "https://a.example/.well-known/agent.json": json({ x402Discovery: "https://b.example/.well-known/x402" }),
      "https://b.example/.well-known/x402": json({ resources: ["https://victim.example/door"] }),
    });
    const read = await readWellKnownDoors("a.example", OWN);
    // The file is readable and declares something, but nothing for b.
    expect(read).toMatchObject({ kind: "doors", declaring_host: "b.example", doors: [], foreign: 1 });
  });

  it("a redirect off-host is unreadable, not followed into someone else's declaration", async () => {
    stub({
      "https://door.example/.well-known/x402": () => ({
        status: 200,
        url: "https://elsewhere.example/.well-known/x402",
        body: new Response(JSON.stringify({ resources: ["https://elsewhere.example/x"] })).body,
      }),
    });
    expect(await readWellKnownDoors("door.example", OWN)).toMatchObject({ kind: "unreadable", reason: "redirected off-host to elsewhere.example" });
  });

  it("refuses to read its own host", async () => {
    stub({});
    expect(await readWellKnownDoors(OWN, OWN)).toMatchObject({ kind: "unreadable" });
  });
});
