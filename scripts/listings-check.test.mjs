import assert from "node:assert/strict";
import test from "node:test";
import {
  classify,
  compare,
  currentProbe,
  sameAsFrom,
  sixtyWordsFrom,
  visibleText,
  walk,
} from "./lib/listings.mjs";

const SIXTY =
  "scvd.store is an evidence observatory for agentic commerce. Before an agent pays an x402 endpoint, we check that it can be paid. After it pays, we check the signed receipt.";

test("the current generation is the sixty words' second sentence, which truncating mirrors keep", () => {
  assert.equal(currentProbe(SIXTY), "before an agent pays an x402 endpoint, we check that it can be paid.");
  assert.equal(classify("Blah. Before an agent pays an x402 endpoint, we check that it can be paid. Blah", SIXTY), "current");
});

test("each older generation is recognised by its own nouns, newest marker winning", () => {
  assert.equal(classify("A quirky, human-run store selling signed hellos and a genuine phone call", SIXTY), "july");
  assert.equal(classify("The trust layer of the x402 economy — free conformance checking", SIXTY), "august");
  assert.equal(classify("An evidence observatory for agentic commerce", SIXTY), "september");
  assert.equal(classify("An evidence observatory; also luckies from the herd", SIXTY), "september");
  assert.equal(classify("A directory of MCP servers", SIXTY), "unknown");
  assert.equal(classify("", SIXTY), "unknown");
});

test("the homepage yields the sixty words and the sameAs list", () => {
  const html = `<meta property="og:description" content="${SIXTY.replace(/"/g, "&quot;")}">
    <script type="application/ld+json">{"@type":"WebSite","url":"https://scvd.store/"}</script>
    <script type="application/ld+json">{"@type":"Organization","sameAs":["https://a.example/x","https://b.example/y"]}</script>`;
  assert.equal(sixtyWordsFrom(html), SIXTY);
  assert.deepEqual(sameAsFrom(html), ["https://a.example/x", "https://b.example/y"]);
});

test("visible text drops scripts, styles and tags, and decodes entities exactly once", () => {
  assert.equal(visibleText("<style>x{}</style><p>Hello &amp; <b>there</b></p><script>1</script>"), " Hello & there ");
  // A sloppy end tag still ends the script; a double-encoded entity stays one level decoded.
  assert.equal(visibleText("<script type='x'>secret()</script ><p>a &amp;lt; b</p>"), " a &lt; b ");
});

test("a mirror that moved backwards is a regression; forwards is news; unreachable both times is silence", () => {
  const baseline = { mirrors: [
    { url: "https://a.example", generation: "current" },
    { url: "https://b.example", generation: "july" },
    { url: "https://c.example", generation: "unreachable" },
  ] };
  const fresh = { mirrors: [
    { url: "https://a.example", generation: "august" },
    { url: "https://b.example", generation: "september" },
    { url: "https://c.example", generation: "unreachable" },
    { url: "https://d.example", generation: "unknown" },
  ] };
  const result = compare(baseline, fresh);
  assert.deepEqual(result.regressions, [{ url: "https://a.example", was: "current", now: "august" }]);
  assert.deepEqual(result.advances, [{ url: "https://b.example", was: "july", now: "september" }]);
});

test("the walk reads every mirror once and never throws on a dead one", async () => {
  const pages = new Map([
    ["https://store.test/", `<meta property="og:description" content="${SIXTY}"><script type="application/ld+json">{"@type":"Organization","sameAs":["https://good.test/","https://old.test/","https://dead.test/"]}</script>`],
    ["https://good.test/", `<html><body>${SIXTY}</body></html>`],
    ["https://old.test/", "<html><body>The trust layer of the x402 economy</body></html>"],
  ]);
  const fetchImpl = async (url) => {
    if (url === "https://dead.test/") throw new Error("ECONNRESET");
    const body = pages.get(url);
    return new Response(body ?? "", { status: body ? 200 : 404 });
  };
  const observation = await walk("https://store.test", fetchImpl);
  assert.deepEqual(observation.mirrors.map((m) => [m.url, m.generation]), [
    ["https://good.test/", "current"],
    ["https://old.test/", "august"],
    ["https://dead.test/", "unreachable"],
  ]);
});
