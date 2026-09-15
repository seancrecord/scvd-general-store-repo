import assert from "node:assert/strict";
import { test } from "node:test";
import {
  QUIET_DAYS,
  buildReport,
  cadence,
  cadenceDiff,
  extractFlight,
  extractProtocols,
  flattenUpdates,
  isHousekeeping,
  matchSurfaces,
  renderMarkdown,
  scoreRow,
  tagRow,
  toSnapshot,
} from "./lib/protocol-screen.mjs";

/** A page shaped like scout's, small enough to reason about. */
function page(protocolData) {
  const flight = `3:I[123,[],""]\n6:["$","$L1a",null,{"protocolData":${JSON.stringify(protocolData)}}]\n`;
  const chunks = [flight.slice(0, 20), flight.slice(20)]
    .map((c) => `<script>self.__next_f.push([1,${JSON.stringify(c)}])</script>`)
    .join("\n");
  return `<html><body>${chunks}</body></html>`;
}

const update = (over = {}) => ({
  id: "u1",
  date: "2026-09-10",
  title: "Reject signatures with future created timestamps",
  description: "Adds fail-closed behavior for signatures whose created parameter is in the future.",
  impact: "Consumers must handle the new error variant.",
  breaking: true,
  level: "major",
  author: "someone",
  files: ["src/lib.rs"],
  prNumber: 127,
  prUrl: "https://example.test/pull/127",
  ...over,
});

const data = {
  WebBotAuth: {
    name: "WebBotAuth",
    maintainers: "Cloudflare + IETF",
    repo: "https://example.test/wba",
    launchDate: "2025-07-01",
    updates: [update()],
  },
  ACP: {
    name: "ACP",
    maintainers: "OpenAI",
    repo: "https://example.test/acp",
    launchDate: "2025-09-29",
    updates: [update({ id: "u2", date: "2026-06-01", breaking: false, level: "patch", prNumber: 9, title: "Add optional product url field to checkout item", description: "An optional url on the item schema." })],
  },
};

test("the flight payload survives being split across script chunks", () => {
  const protocols = extractProtocols(extractFlight(page(data)));
  assert.deepEqual(Object.keys(protocols).sort(), ["ACP", "WebBotAuth"]);
  assert.equal(protocols.WebBotAuth.updates.length, 1);
});

test("a page that changed shape throws rather than reading zero merges", () => {
  assert.throws(() => extractFlight("<html><body>nothing here</body></html>"), /no __next_f chunks/);
  assert.throws(() => extractProtocols('6:["$","$L1a",null,{"somethingElse":{}}]'), /no protocolData/);
  assert.throws(() => extractProtocols('"protocolData":{"UCP":{"name":"UCP"}}'), /carries no updates/);
});

test("a protocol scout carries with no updates is still reported, not dropped", () => {
  const withEmpty = { ...data, AP2: { name: "AP2", maintainers: "Google + FIDO Alliance", repo: "x", launchDate: "2025-09-16", updates: [] } };
  const report = buildReport({ protocolData: withEmpty, today: "2026-09-14" });
  const ap2 = report.cadence.find((c) => c.protocol === "AP2");
  assert.equal(ap2.observed, 0);
  assert.equal(ap2.lastMerge, null);
  assert.equal(ap2.quiet, true, "no observed merge is quiet, and quiet is not dead");
});

test("`key` in prose does not earn a signature tag", () => {
  const docs = { title: "Improve readability and wording in key-concepts docs", description: "Docs pass.", impact: "" };
  assert.ok(!tagRow(docs).includes("signature"));
  const real = { title: "Improve Key Resolution in Verifier", description: "Resolves keys by cryptographic thumbprint instead of the kid claim.", impact: "" };
  assert.ok(tagRow(real).includes("signature"));
});

test("housekeeping is demoted to log, but never when it breaks something", () => {
  const typo = { title: "Fix spelling of implementers in documentation", description: "", breaking: false, level: "patch" };
  assert.ok(isHousekeeping(typo));
  assert.equal(scoreRow({ ...typo, tags: ["signature"], surfaces: ["signature-verification"] }).band, "log");
  const breakingBump = { title: "Bump dependency", description: "", breaking: true, level: "major" };
  assert.ok(!isHousekeeping(breakingBump), "a breaking change keeps its own score whatever its title");
});

test("breaking on a shipped surface is ACT; breaking on a planned lane is READ", () => {
  const rows = flattenUpdates(data, "2026-09-14");
  const wba = rows.find((r) => r.protocol === "WebBotAuth");
  assert.equal(wba.band, "act");
  assert.ok(wba.surfaces.includes("signature-verification"));

  const planned = scoreRow({ breaking: true, tags: ["payment"], surfaces: ["commerce-observation"] });
  assert.equal(planned.band, "read");
});

test("a surface only matches protocols that can actually move it", () => {
  assert.deepEqual(matchSurfaces({ protocol: "WebMCP", tags: [] }), ["webmcp-channel"]);
  assert.ok(!matchSurfaces({ protocol: "ACP", tags: ["signature"] }).includes("signature-verification"));
});

test("cadence counts windows and calls a stale protocol quiet", () => {
  const rows = flattenUpdates(data, "2026-09-14");
  const cad = cadence(data, rows, "2026-09-14");
  const acp = cad.find((c) => c.protocol === "ACP");
  assert.equal(acp.quiet, true);
  assert.ok(acp.quietDays > QUIET_DAYS);
  const wba = cad.find((c) => c.protocol === "WebBotAuth");
  assert.equal(wba.last30, 1);
  assert.equal(wba.breaking90, 1);
  assert.equal(wba.quiet, false);
  assert.equal(cad[0].protocol, "WebBotAuth", "busiest protocol sorts first");
});

test("a first run is bounded, and the second run reports only what is new", () => {
  const first = buildReport({ protocolData: data, today: "2026-09-14", firstRunDays: 7 });
  assert.equal(first.diff.first, true);
  assert.equal(first.denominator, 2);
  assert.equal(first.window.length, 1, "the June merge is outside a 7-day first window");

  const snapshot = toSnapshot(first);
  assert.equal(snapshot.ids.length, 2, "the snapshot remembers every merge seen, not just the window");

  const second = buildReport({ protocolData: data, today: "2026-09-21", previous: snapshot });
  assert.equal(second.diff.first, false);
  assert.equal(second.window.length, 0, "nothing new merged, so nothing is reported");

  const grown = structuredClone(data);
  grown.WebBotAuth.updates.push(update({ id: "u3", date: "2026-09-18", prNumber: 150 }));
  const third = buildReport({ protocolData: grown, today: "2026-09-21", previous: snapshot });
  assert.equal(third.window.length, 1);
  assert.equal(third.window[0].pr, 150);
});

test("the window line does not credit one source for a two-source run", () => {
  const first = buildReport({ protocolData: data, today: "2026-09-14" });
  const second = renderMarkdown(buildReport({ protocolData: data, today: "2026-09-21", previous: toSnapshot(first) }));
  assert.match(second, /Window: everything the sources showed/);
  assert.doesNotMatch(second, /merges scout showed since/);
});

test("a protocol going quiet between runs is named", () => {
  const before = cadence(data, flattenUpdates(data, "2026-09-14"), "2026-09-14");
  const later = cadence(data, flattenUpdates(data, "2026-11-14"), "2026-11-14");
  const moved = cadenceDiff({ cadence: before }, later);
  assert.deepEqual(moved.goneQuiet.map((c) => c.protocol), ["WebBotAuth"]);
});

test("the rendered screen declares the limits of the sources it actually read", () => {
  const md = renderMarkdown(buildReport({ protocolData: data, today: "2026-09-14" }));
  assert.match(md, /What this screen did NOT see/);
  assert.match(md, /\*\*scout\*\* — Scout is somebody else's reading/);
  assert.doesNotMatch(md, /NOT DECLARED/, "a scout-only run must not claim git's limitations");
  assert.match(md, /Denominator: 2 merges/);

  const withGit = {
    ...data,
    x402: { name: "x402", maintainers: "x402 Foundation", repo: "https://example.test/x402", launchDate: "2026-04-02", source: "git", updates: [update({ id: "g1", breaking: false, level: "patch", derived: true, specChange: true, title: "Expand asset transfer methods" })] },
  };
  const both = renderMarkdown(buildReport({ protocolData: withGit, today: "2026-09-14" }));
  assert.match(both, /NOT DECLARED, never NOT BREAKING/);
  assert.match(both, /\*\*scout\*\* —/);
});

test("a source that could not be read is named, not silently dropped", () => {
  const report = buildReport({
    protocolData: data,
    today: "2026-09-14",
    failures: [{ source: "MPP", url: "https://example.test/mpp", error: "clone refused" }],
  });
  const md = renderMarkdown(report);
  assert.match(md, /\*\*unread\*\* — MPP .* could not be read this run: clone refused/);
});
