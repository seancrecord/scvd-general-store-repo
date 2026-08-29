import assert from "node:assert/strict";
import test from "node:test";

import { createServer } from "node:http";
import {
  AS_A_BROWSER,
  DOORS,
  REVIEW_EVERY_DAYS,
  compare,
  declaresWebmcp,
  originTrialExpiry,
  readDoors,
  reviewsDue,
  sitemapRooms,
  sweepRooms,
} from "./lib/doors.mjs";

/**
 * THE DOOR BATTERY, TESTED AGAINST A STORE THAT IS NOT THE STORE.
 *
 * Every case here builds synthetic bytes and reads them. Nothing
 * reaches scvd.store, so the suite is offline and deterministic — and,
 * the part that matters, able to serve the FAILURES on purpose. A
 * checker's interesting behaviour is almost entirely in what it does
 * when it cannot see: an instrument that accuses when it is confused
 * accuses hardest exactly when it has the least right to.
 *
 * Two properties get their own cases because both have been got wrong
 * in this repo before:
 *
 *   NOTHING SEEN MUST READ `unknown`, NEVER `unmet` (rule 52). The
 *   whole battery is run against an empty snapshot and every single
 *   criterion has to abstain.
 *
 *   THE BATTERY MUST BE ABLE TO SAY YES (rule 46's other half). A
 *   guard that cannot pass is not a guard, it is a permanent
 *   accusation, and nobody reads those twice. A well-formed synthetic
 *   store has to come back clean.
 */

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 7, 29);

/**
 * A token in Chrome's shape: opaque signature bytes, then the payload.
 *
 * BYTE 15 IS `{` DELIBERATELY. The real token on this store's front
 * door has a brace in its signature, and the first cut of the reader
 * ran from the first brace to the last one — which handed JSON.parse
 * binary noise and made it report the live token as missing. The
 * synthetic token has to carry the same hazard or the test proves
 * nothing about the case that actually happened.
 */
function originTrialToken(expirySeconds) {
  const prefix = Buffer.alloc(69, 7);
  prefix[15] = 0x7b;
  prefix[40] = 0x22;
  const payload = Buffer.from(
    JSON.stringify({
      origin: "https://example.test:443",
      feature: "WebMCP",
      expiry: expirySeconds,
    }),
  );
  return Buffer.concat([prefix, payload]).toString("base64");
}

/** One registry row, in the shape the live registry actually returns. */
function registryEntry(version, description, isLatest) {
  return {
    server: { name: "store.scvd/general-store", version, description },
    _meta: { "io.modelcontextprotocol.registry/official": { isLatest } },
  };
}

/** A store that does everything the six doors ask of it. */
function goodSnapshot() {
  const token = originTrialToken(Math.floor(NOW / 1000) + 200 * 86_400);
  const home = `<!doctype html><html><head>
    <meta http-equiv="origin-trial" content="${token}">
    <link rel="alternate" type="text/markdown" href="/index.md">
    <script type="application/ld+json">{}</script>
    <script src="/webmcp.js" defer></script>
  </head><body>
    <nav><a href="/menu">Menu</a><a href="/what">What</a><a href="/try">Try</a>
    <a href="/corpus">Corpus</a><a href="/trust">Trust</a><a href="/rails">Rails</a></nav>
    <main data-room="storefront"><h1 id="sign">The store</h1>
    <section data-shelf="free">Free instruments</section></main>
  </body></html>`;
  const tools = [
    {
      name: "read_store_guide",
      description: "The store's front door as text, with the whole menu and prices.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
    },
    {
      name: "buy_simple",
      description:
        "Buy the cheapest signed artifact on the shelf. Paid: present x402 payment in _meta.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: false },
    },
  ];
  return {
    home: { ok: true, status: 200, text: home, bytes: 40_000 },
    openapi: {
      ok: true,
      status: 200,
      text: '{"paths":{"/menu.json":{},"/api/buy":{"post":{"responses":{"402":{}}}}}}',
      json: { paths: { "/menu.json": {}, "/api/buy": {} } },
    },
    apiCatalog: { ok: true, status: 200, text: "{}", json: {} },
    x402: { ok: true, status: 200, text: '{"x402Version":2}' },
    llms: { ok: true, status: 200, text: "x".repeat(4000), bytes: 4000 },
    agentsMd: { ok: true, status: 200, text: "# agents" },
    robots: {
      ok: true,
      status: 200,
      text: "User-agent: *\nAllow: /\n# maps: https://example.test/llms.txt\n",
    },
    sitemap: { ok: true, status: 200, text: "<loc>https://example.test/</loc>" },
    webmcpScript: {
      ok: true,
      status: 200,
      text: 'mc.registerTool({"name": "read_store_guide"});',
    },
    mcpTools: { ok: true, status: 200, json: { result: { tools } } },
    preflightNoAuth: { ok: false, status: 400, text: "{}" },
    registry: {
      ok: true,
      status: 200,
      json: {
        servers: [
          // Oldest first, exactly as the registry returns them: the
          // retired listing sits ABOVE the current one, which is what
          // the first reader tripped over.
          registryEntry("0.1.0", "A general store for AI agents.", false),
          registryEntry("0.2.0", "The trust layer of the x402 economy.", false),
          registryEntry("0.2.2", "An evidence observatory for agentic commerce.", true),
        ],
      },
    },
    serverJson: {
      name: "store.scvd/general-store",
      version: "0.2.2",
      description: "An evidence observatory for agentic commerce.",
    },
    rooms: {
      total: 9,
      declaring: 6,
      unreachable: 0,
      missing: [],
      annotatedForms: ["/conformance"],
    },
  };
}

test("the door definitions are well formed", () => {
  const ids = new Set();
  for (const door of DOORS) {
    assert.ok(door.criteria.length >= 3, `${door.id} needs criteria`);
    assert.ok(door.watch.length >= 1, `${door.id} needs something to watch`);
    for (const watch of door.watch) {
      assert.ok(watch.what && watch.where && watch.why, `${door.id} watch is thin`);
    }
    for (const criterion of door.criteria) {
      // Rule 55: a criterion whose verdict you have to take our word
      // for is an opinion with an id.
      assert.ok(criterion.how, `${criterion.id} has no path a reader can walk`);
      assert.ok(criterion.asks?.endsWith("?"), `${criterion.id} does not ask a question`);
      assert.equal(typeof criterion.read, "function");
      assert.ok(!ids.has(criterion.id), `duplicate criterion id ${criterion.id}`);
      ids.add(criterion.id);
    }
  }
  assert.deepEqual(
    DOORS.map((door) => door.number),
    [1, 2, 3, 4, 5, 6],
    "the lineup is six doors, ordered furthest to closest",
  );
});

test("a snapshot that saw nothing abstains on every criterion", () => {
  const observation = readDoors({}, NOW);
  for (const door of observation.doors) {
    for (const criterion of door.criteria) {
      assert.equal(
        criterion.verdict,
        "unknown",
        `${door.id}/${criterion.id} accused a store it could not reach`,
      );
    }
  }
});

test("a well-formed store passes every criterion it can", () => {
  const observation = readDoors(goodSnapshot(), NOW);
  const failures = observation.doors.flatMap((door) =>
    door.criteria
      .filter((criterion) => criterion.verdict !== "met")
      .map((criterion) => `${door.id}/${criterion.id}: ${criterion.verdict} — ${criterion.note}`),
  );
  assert.deepEqual(failures, [], "the battery must be able to say yes");
});

test("an expired origin trial closes the browser door", () => {
  const snapshot = goodSnapshot();
  snapshot.home.text = snapshot.home.text.replace(
    /content="[^"]+"/,
    `content="${originTrialToken(Math.floor(NOW / 1000) - 86_400)}"`,
  );
  const webmcp = readDoors(snapshot, NOW).doors.find((door) => door.id === "webmcp");
  const trial = webmcp.criteria.find((c) => c.id === "origin_trial_unexpired");
  assert.equal(trial.verdict, "unmet");
  assert.match(trial.note, /expired/);
});

test("a trial about to end is partial, not fine", () => {
  const snapshot = goodSnapshot();
  snapshot.home.text = snapshot.home.text.replace(
    /content="[^"]+"/,
    `content="${originTrialToken(Math.floor(NOW / 1000) + 10 * 86_400)}"`,
  );
  const webmcp = readDoors(snapshot, NOW).doors.find((door) => door.id === "webmcp");
  assert.equal(
    webmcp.criteria.find((c) => c.id === "origin_trial_unexpired").verdict,
    "partial",
  );
});

test("a page that only mentions webmcp.js does not declare it", () => {
  // The exact mistake a grep for the filename makes: /developers writes
  // about the browser door in prose and does not carry the script.
  assert.equal(declaresWebmcp("<p>see /webmcp.js for the tools</p>"), false);
  assert.equal(declaresWebmcp('<script src="/webmcp.js" defer></script>'), true);
});

test("room coverage is read off the sitemap, not asserted", () => {
  const snapshot = goodSnapshot();
  snapshot.rooms = { total: 60, declaring: 1, unreachable: 0, missing: ["/what"] };
  const webmcp = readDoors(snapshot, NOW).doors.find((door) => door.id === "webmcp");
  const coverage = webmcp.criteria.find((c) => c.id === "declared_where_agents_arrive");
  assert.equal(coverage.verdict, "partial");
  assert.match(coverage.note, /1 of 60/);
});

test("a free instrument demanding a credential fails the raw-API door", () => {
  const snapshot = goodSnapshot();
  snapshot.preflightNoAuth = { ok: false, status: 401, text: "" };
  const api = readDoors(snapshot, NOW).doors.find((door) => door.id === "raw_api");
  assert.equal(
    api.criteria.find((c) => c.id === "no_credential_to_be_refused").verdict,
    "unmet",
  );
});

test("a chat widget on the storefront fails the sixth door", () => {
  const snapshot = goodSnapshot();
  snapshot.home.text = snapshot.home.text.replace(
    "</body>",
    '<div class="intercom-launcher"></div></body>',
  );
  const assistant = readDoors(snapshot, NOW).doors.find(
    (door) => door.id === "site_assistant",
  );
  assert.equal(
    assistant.criteria.find((c) => c.id === "no_hosted_chat_surface").verdict,
    "unmet",
  );
});

test("a fall is a regression, a rise is not, and an abstention is neither", () => {
  const previous = {
    taken_at: new Date(NOW - 7 * DAY).toISOString(),
    doors: [
      {
        id: "webmcp",
        criteria: [
          { id: "script_served", verdict: "met" },
          { id: "declared_where_agents_arrive", verdict: "partial" },
          { id: "origin_trial_unexpired", verdict: "met" },
          { id: "retired_check", verdict: "met" },
        ],
      },
    ],
  };
  const current = {
    taken_at: new Date(NOW).toISOString(),
    doors: [
      {
        id: "webmcp",
        criteria: [
          { id: "script_served", verdict: "unmet", note: "gone" },
          { id: "declared_where_agents_arrive", verdict: "met", note: "swept in" },
          { id: "origin_trial_unexpired", verdict: "unknown", note: "unreachable" },
          { id: "declarative_forms", verdict: "unmet", note: "new criterion" },
        ],
      },
    ],
  };
  const diff = compare(previous, current);
  assert.deepEqual(
    diff.regressions.map((row) => row.key),
    ["webmcp/script_served"],
  );
  assert.deepEqual(
    diff.improvements.map((row) => row.key),
    ["webmcp/declared_where_agents_arrive"],
  );
  assert.deepEqual(
    diff.added.map((row) => row.key),
    ["webmcp/declarative_forms"],
  );
  assert.deepEqual(
    diff.removed.map((row) => row.key),
    ["webmcp/retired_check"],
  );
});

test("no baseline means everything is new and nothing has fallen", () => {
  const diff = compare(null, readDoors(goodSnapshot(), NOW));
  assert.equal(diff.regressions.length, 0);
  assert.ok(diff.added.length > 20, "every criterion should read as new");
});

test("a door never reviewed is due, and one just read is not", () => {
  assert.equal(reviewsDue({ reviewed_at: {} }, NOW).length, DOORS.length);
  const fresh = Object.fromEntries(
    DOORS.map((door) => [door.id, new Date(NOW - 5 * DAY).toISOString()]),
  );
  assert.equal(reviewsDue({ reviewed_at: fresh }, NOW).length, 0);
  const stale = Object.fromEntries(
    DOORS.map((door) => [
      door.id,
      new Date(NOW - (REVIEW_EVERY_DAYS + 1) * DAY).toISOString(),
    ]),
  );
  assert.equal(reviewsDue({ reviewed_at: stale }, NOW).length, DOORS.length);
});

test("the sitemap sweep counts our own rooms and nobody else's", () => {
  const xml = `<urlset>
    <url><loc>https://example.test/</loc></url>
    <url><loc>https://example.test/menu</loc></url>
    <url><loc>https://elsewhere.test/menu</loc></url>
  </urlset>`;
  assert.deepEqual(sitemapRooms(xml, "https://example.test"), [
    "https://example.test/",
    "https://example.test/menu",
  ]);
});

test("an unparseable origin-trial token reads as absent, not as valid", () => {
  assert.equal(originTrialExpiry("<html></html>"), null);
  assert.equal(
    originTrialExpiry('<meta http-equiv="origin-trial" content="not-base64-json">'),
    null,
  );
});

/* ── the three defects this battery shipped, each with its own case ──
 * Every one of these was a confident false finding published before it
 * was checked. They are kept as named tests rather than quietly fixed,
 * because the failure mode they share — an instrument that accuses
 * while confused — is the one thing this store cannot afford to be
 * relaxed about in its own tooling.
 */

test("the registry reader reads the isLatest row, not the oldest one", () => {
  // The live registry returns every version ever published, oldest
  // first. The first reader took servers[0] and reported a listing
  // this store retired two positionings ago as its current one.
  const snapshot = goodSnapshot();
  const mcp = readDoors(snapshot, NOW).doors.find((d) => d.id === "backend_mcp");
  const registry = mcp.criteria.find((c) => c.id === "registry_description_current");
  assert.equal(registry.verdict, "met");
  assert.match(registry.note, /0\.2\.2/);
});

test("a published description behind server.json is unmet, and says both", () => {
  const snapshot = goodSnapshot();
  snapshot.serverJson.description = "Something we now say instead.";
  const mcp = readDoors(snapshot, NOW).doors.find((d) => d.id === "backend_mcp");
  const registry = mcp.criteria.find((c) => c.id === "registry_description_current");
  assert.equal(registry.verdict, "unmet");
  assert.match(registry.note, /Something we now say instead/);
  assert.match(registry.note, /An evidence observatory/);
});

test("entries with no isLatest row abstain rather than accuse", () => {
  const snapshot = goodSnapshot();
  for (const entry of snapshot.registry.json.servers) {
    entry._meta["io.modelcontextprotocol.registry/official"].isLatest = false;
  }
  const mcp = readDoors(snapshot, NOW).doors.find((d) => d.id === "backend_mcp");
  assert.equal(
    mcp.criteria.find((c) => c.id === "registry_description_current").verdict,
    "unknown",
  );
});

test("somebody else's injected data attribute is not our hook", () => {
  // The first reader read `met` off `data-cf-beacon`, on a script
  // Cloudflare injects. The store had shipped no hook at all.
  const snapshot = goodSnapshot();
  snapshot.home.text = `<html><body><main class="road"><h1>Store</h1>
    <script data-cf-beacon='{"version":"1"}'></script>
    <section class="shelf">x</section></main></body></html>`;
  const automation = readDoors(snapshot, NOW).doors.find(
    (d) => d.id === "browser_automation",
  );
  const hooks = automation.criteria.find((c) => c.id === "stable_hooks");
  assert.equal(hooks.verdict, "unmet");
  assert.match(hooks.note, /no first-party/);
});

test("hooks that miss the main landmark are partial, not met", () => {
  const snapshot = goodSnapshot();
  snapshot.home.text = snapshot.home.text.replace(
    '<main data-room="storefront">',
    "<main class=\"road\">",
  );
  const automation = readDoors(snapshot, NOW).doors.find(
    (d) => d.id === "browser_automation",
  );
  const hooks = automation.criteria.find((c) => c.id === "stable_hooks");
  assert.equal(hooks.verdict, "partial");
  assert.match(hooks.note, /<main> carries none/);
});

test("the room sweep asks for HTML, so negotiated rooms are read as pages", async () => {
  /*
   * THE ONE THAT COST THE MOST. This server negotiates exactly the way
   * the store does: a markdown twin to a wildcard Accept, the HTML
   * page — carrying the script tag — to a request that says it wants
   * HTML. Sweeping it with curl's default counts zero declarations on
   * a store that declares on every room, which is the false finding
   * this battery published on its first run.
   */
  const seen = [];
  const server = createServer((request, response) => {
    seen.push(request.headers.accept);
    const wantsHtml = (request.headers.accept ?? "").includes("text/html");
    response.writeHead(200, {
      "Content-Type": wantsHtml ? "text/html" : "text/markdown",
    });
    response.end(
      wantsHtml
        ? '<html><head><script src="/webmcp.js" defer></script></head><body>room</body></html>'
        : "# room\n\nThe markdown twin, where a script tag correctly does not appear.",
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const get = async (url, init) => {
    const answer = await fetch(url, init);
    return { ok: answer.ok, status: answer.status, text: await answer.text() };
  };
  const sitemap = `<urlset><url><loc>${base}/</loc></url><url><loc>${base}/conformance</loc></url></urlset>`;

  try {
    const swept = await sweepRooms(sitemap, base, get);
    assert.equal(swept.total, 2);
    assert.equal(swept.declaring, 2, "negotiated rooms must be read as pages");
    assert.deepEqual(swept.missing, []);
    assert.ok(
      seen.every((accept) => accept?.includes("text/html")),
      "every room fetch must ask for HTML",
    );

    // And the proof it is the header doing the work: sweep the same
    // server without it and the declarations vanish.
    const blind = async (url) => get(url);
    const missed = await sweepRooms(sitemap, base, blind);
    assert.equal(missed.declaring, 0);
  } finally {
    server.close();
  }
});

test("the browser Accept is the one a browser sends", () => {
  assert.match(AS_A_BROWSER.accept, /^text\/html,/);
});

test("an unreachable room leaves the denominator, it does not fail the door", async () => {
  const get = async () => ({ ok: false, status: 503, text: "" });
  const swept = await sweepRooms(
    "<loc>https://example.test/a</loc><loc>https://example.test/b</loc>",
    "https://example.test",
    get,
  );
  assert.equal(swept.total, 0);
  assert.equal(swept.unreachable, 2);
  const reading = readDoors({ ...goodSnapshot(), rooms: swept }, NOW).doors.find(
    (d) => d.id === "webmcp",
  );
  assert.equal(
    reading.criteria.find((c) => c.id === "declared_where_agents_arrive").verdict,
    "unknown",
  );
});

test("the sweep finds an annotated form, and prose about one does not count", async () => {
  const pages = {
    "/conformance":
      '<form method="post" toolname="check_conformance" tooldescription="x"><input name="a" toolparamdescription="y"></form>',
    // A room that WRITES about the attribute must not be counted as
    // carrying it — the same mistake as counting a page that merely
    // mentions webmcp.js as declaring the browser door.
    "/developers": "<p>Annotate a form with toolname= and the browser does the rest.</p>",
  };
  const server = createServer((request, response) => {
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end(`<html><body>${pages[request.url] ?? ""}</body></html>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async (url, init) => {
    const answer = await fetch(url, init);
    return { ok: answer.ok, status: answer.status, text: await answer.text() };
  };
  try {
    const swept = await sweepRooms(
      `<loc>${base}/conformance</loc><loc>${base}/developers</loc>`,
      base,
      get,
    );
    assert.deepEqual(swept.annotatedForms, ["/conformance"]);
  } finally {
    server.close();
  }
});

test("the declarative-forms criterion reads the whole store, not the front door", () => {
  // It looked only at `/` once, where there is no form and never will
  // be — so it would have reported `unmet` forever after the fix
  // shipped on the room that has the verb.
  const snapshot = goodSnapshot();
  assert.equal(
    readDoors(snapshot, NOW)
      .doors.find((d) => d.id === "webmcp")
      .criteria.find((c) => c.id === "declarative_forms").verdict,
    "met",
  );
  snapshot.rooms.annotatedForms = [];
  assert.equal(
    readDoors(snapshot, NOW)
      .doors.find((d) => d.id === "webmcp")
      .criteria.find((c) => c.id === "declarative_forms").verdict,
    "unmet",
  );
});
