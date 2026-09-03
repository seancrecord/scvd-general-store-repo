import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

/**
 * THE CLI, TESTED AGAINST A STORE THAT IS NOT THE STORE.
 *
 * Every test here stands up a local HTTP server and points the tool at
 * it with --base. Nothing reaches scvd.store, so the suite is offline,
 * deterministic, and — the part that matters — able to serve the
 * REFUSALS on purpose. A CLI's interesting behaviour is almost all in
 * what it does when the answer is no: the exit code a CI job branches
 * on, the budget line, the verdict it refuses to over-read.
 *
 * `unreachable` is the one worth reading twice. The store is explicit
 * that it describes the network path at one moment and says nothing
 * about the endpoint, so the tool must NOT exit non-zero on it — a
 * pipeline that failed a build on `unreachable` would be drawing a
 * conclusion the evidence refuses to support.
 */

const CLI = fileURLToPath(new URL("./scvd.mjs", import.meta.url));

/** Run the tool against a one-request server and collect everything. */
async function run(args, handler) {
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      const answer = handler({
        method: request.method,
        url: request.url,
        body: body ? JSON.parse(body) : undefined,
        headers: request.headers,
      });
      response.writeHead(answer.status ?? 200, {
        "Content-Type": "application/json",
        ...(answer.headers ?? {}),
      });
      response.end(JSON.stringify(answer.json));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await new Promise((resolve) => {
      execFile(
        process.execPath,
        [CLI, "--base", base, ...args],
        (error, stdout, stderr) => {
          resolve({ code: error?.code ?? 0, stdout, stderr });
        },
      );
    });
  } finally {
    server.close();
  }
}

test("prints its own version, read from the package rather than typed", async () => {
  const result = await run(["--version"], () => ({ json: {} }));
  assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+$/);
  assert.equal(result.code, 0);
});

test("names every command in the help, so nothing ships unfindable", async () => {
  const result = await run(["--help"], () => ({ json: {} }));
  for (const command of [
    "preflight",
    "conformance",
    "receipt",
    "verify",
    "onpage",
    "fresh-set",
    "corpus",
    "menu",
    "catalog",
    "versions",
  ]) {
    assert.ok(
      result.stdout.includes(`scvd ${command}`),
      `${command} is implemented and absent from --help`,
    );
  }
});

test("says plainly that it never asks for a credential", async () => {
  // The store's hardest standing rule, and a CLI is where it would be
  // easiest to break quietly. If this line ever goes, so has the rule.
  const result = await run(["--help"], () => ({ json: {} }));
  assert.match(result.stdout, /never asks\s*\n?for a credential|never asks for a credential/);
});

test("refuses an unknown command instead of guessing", async () => {
  const result = await run(["frobnicate"], () => ({ json: {} }));
  assert.equal(result.code, 2);
  assert.match(result.stderr, /No command "frobnicate"/);
});

test("sends the URL as a JSON body to the versioned preflight path", async () => {
  let seen;
  const result = await run(["preflight", "https://door.example/pay"], (request) => {
    seen = request;
    return {
      json: {
        verdict: "ready",
        checks: [{ name: "status-402", ok: true, detail: "" }],
        advisories: [],
      },
    };
  });
  assert.equal(seen.method, "POST");
  assert.match(seen.url, /^\/api\/preflight\/v\d+$/);
  assert.deepEqual(seen.body, { url: "https://door.example/pay" });
  assert.match(seen.headers["user-agent"], /^scvd-cli\//);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /verdict: ready/);
});

test("exits 1 on a not_ready verdict, so CI can branch on it", async () => {
  const result = await run(["preflight", "https://door.example"], () => ({
    json: {
      verdict: "not_ready",
      checks: [
        { name: "signable-accepts", ok: false, detail: "payTo is a name" },
      ],
    },
  }));
  assert.equal(result.code, 1);
  assert.match(result.stdout, /FAIL {2}signable-accepts/);
  // The detail is the whole value of a named check; printing the name
  // alone would make the tool a worse version of curl.
  assert.match(result.stdout, /payTo is a name/);
});

test("prints the store's remediation rows, both halves, and nothing when there are none", async () => {
  const withRows = await run(["preflight", "https://door.example"], () => ({
    json: {
      verdict: "not_ready",
      checks: [{ name: "accepts", ok: false, detail: "no asset" }],
      advisories: [],
      remediation: [
        {
          signal: "accepts",
          kind: "check",
          defect_class: "unsignable-offer",
          definition_url: "https://scvd.store/defects/unsignable-offer",
          operator: "Fill every accepts entry.",
          buyer: "Do not sign.",
        },
      ],
    },
  }));
  assert.match(withRows.stdout, /FIX {3}accepts → unsignable-offer \(https:\/\/scvd\.store\/defects\/unsignable-offer\)/);
  assert.match(withRows.stdout, /operator: Fill every accepts entry\./);
  assert.match(withRows.stdout, /buyer: {4}Do not sign\./);
  const without = await run(["preflight", "https://door.example"], () => ({
    json: { verdict: "ready", checks: [{ name: "status-402", ok: true, detail: "" }], advisories: [] },
  }));
  assert.doesNotMatch(without.stdout, /FIX/);
});

test("does NOT fail a build on unreachable, which says nothing about the door", async () => {
  const result = await run(["preflight", "https://door.example"], () => ({
    json: {
      verdict: "unreachable",
      checks: [{ name: "reachable", ok: false, detail: "timed out" }],
    },
  }));
  assert.equal(result.code, 0);
});

test("prints what the rate-limit headers say instead of swallowing them", async () => {
  const result = await run(["preflight", "https://door.example"], () => ({
    headers: {
      "RateLimit-Limit": "30",
      "RateLimit-Remaining": "7",
      "RateLimit-Reset": "24",
    },
    json: { verdict: "ready", checks: [] },
  }));
  assert.match(result.stdout, /7 probes left this minute/);
  assert.match(result.stdout, /rolls in 24s/);
});

test("treats a spent budget as a store-side refusal, not a verdict", async () => {
  const result = await run(["preflight", "https://door.example"], () => ({
    status: 429,
    headers: { "Retry-After": "60" },
    json: { error: "The probe budget for this minute is spent." },
  }));
  // Exit 3, not 1: nothing was learned about the endpoint at all, and
  // reporting "no" would be inventing a finding.
  assert.equal(result.code, 3);
});

test("hands --json the server's own body, byte for byte", async () => {
  const body = { verdict: "ready", checks: [], nonce: "abc123" };
  const result = await run(["preflight", "https://d.example", "--json"], () => ({
    json: body,
  }));
  assert.deepEqual(JSON.parse(result.stdout), body);
});

test("reads the deprecation table for `scvd versions`", async () => {
  let seen;
  const result = await run(["versions"], (request) => {
    seen = request;
    return {
      json: {
        versions: [
          {
            path: "/api/preflight/v1",
            status: "supported",
            since: "2026-08-03",
            sunset: null,
          },
        ],
      },
    };
  });
  assert.equal(seen.url, "/deprecation");
  assert.match(result.stdout, /\/api\/preflight\/v1/);
  // A null sunset prints as a sentence rather than as "null", because
  // "null" reads as a missing value and this one is a statement.
  assert.match(result.stdout, /none announced/);
});

test("walks the RFC 9727 linkset for `scvd catalog`", async () => {
  let seen;
  const result = await run(["catalog"], (request) => {
    seen = request;
    return {
      json: {
        linkset: [
          {
            anchor: "https://scvd.store/",
            title: "SCVD General Store — HTTP API",
            "service-desc": [{ href: "https://scvd.store/openapi.json" }],
          },
        ],
      },
    };
  });
  assert.equal(seen.url, "/.well-known/api-catalog");
  assert.match(result.stdout, /SCVD General Store — HTTP API/);
  assert.match(result.stdout, /openapi\.json/);
});

test("says the network failed in the store's own terms, not the endpoint's", async () => {
  // Nothing listening: the tool must be clear about whose side this is.
  const result = await new Promise((resolve) => {
    execFile(
      process.execPath,
      [CLI, "--base", "http://127.0.0.1:1", "menu"],
      (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stderr }),
    );
  });
  assert.equal(result.code, 3);
  assert.match(result.stderr, /Could not reach/);
  assert.match(result.stderr, /not about your endpoint/);
});

test("signs a sandbox order with the published secret it read off the contract, and never one it was told", async () => {
  const secret = "served-sandbox-secret";
  let seen;
  const result = await run(["trade", "check", "context_anchor"], (request) => {
    if (request.method === "GET" && request.url === "/api/trade/contract") {
      return {
        json: {
          accounts: [
            { account: "hal", mode: "test" },
            { account: "sandbox", published_secret: secret, published_provider_key: "served-key" },
          ],
        },
      };
    }
    seen = request;
    return {
      json: {
        would_pass: true,
        first_failure: null,
        checks: {
          headers: { missing: [] },
          provider_key: "ok",
          timestamp: { within_window: true, skew_seconds: 0 },
          nonce: { shape_ok: true },
          signature: { verified_with: "current" },
          replay: "fresh",
        },
      },
    };
  });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(seen.method, "POST");
  assert.equal(seen.url, "/api/trade/sandbox/check");
  assert.equal(seen.headers["x-trade-key"], "served-key");
  assert.match(seen.headers["x-trade-nonce"], /^[0-9a-f]{32}$/);
  // The signature is over timestamp.nonce.body with the SERVED secret.
  const { createHmac } = await import("node:crypto");
  const expected = createHmac("sha256", secret)
    .update(`${seen.headers["x-trade-timestamp"]}.${seen.headers["x-trade-nonce"]}.${JSON.stringify(seen.body)}`)
    .digest("hex");
  assert.equal(seen.headers["x-trade-signature"], `sha256=${expected}`);
  assert.match(result.stdout, /would pass: true/);
  assert.match(result.stdout, /PASS\s+signature \(current\)/);
});

test("exits 1 when the check desk says the signature would not pass", async () => {
  const result = await run(["trade", "check", "context_anchor"], (request) => {
    if (request.url === "/api/trade/contract") {
      return { json: { accounts: [{ account: "sandbox", published_secret: "s", published_provider_key: "k" }] } };
    }
    return { json: { would_pass: false, first_failure: "stale_timestamp", checks: {} } };
  });
  assert.equal(result.code, 1);
  assert.match(result.stdout, /first failure: stale_timestamp/);
});

test("looks at a door: both halves and the comparison, exit follows the live verdict", async () => {
  let seen;
  const result = await run(["look", "https://door.example/pay"], (request) => {
    seen = request;
    return {
      json: {
        url: "https://door.example/pay",
        headline: "Ready now; the chain holds 3 of 4 rounds.",
        now: { battery: "v2", verdict: "ready", failed: [], advisories: [], the_door: { remediation: [] } },
        held: { never_met: false, rounds_probed: 3, rounds_since_first_sighting: 4, last_probed_round: { verdict: "ready", week: "2026-W35" }, tier: { tier: "held", fraction: "3/4" } },
        now_against_held: { line: "same", detail: "the live verdict matches the last signed round" },
      },
    };
  });
  assert.equal(seen.method, "POST");
  assert.equal(seen.url, "/api/look/v1");
  assert.deepEqual(seen.body, { url: "https://door.example/pay" });
  assert.equal(result.code, 0);
  assert.match(result.stdout, /probed 3 of 4 rounds/);
  assert.match(result.stdout, /now against held: same/);
  const never = await run(["look", "https://door.example/pay"], () => ({
    json: { url: "https://door.example/pay", headline: "h", now: { battery: "v2", verdict: "not_ready", failed: ["accepts"], advisories: [] }, held: { never_met: true }, now_against_held: { line: "no_prior", detail: "no round" } },
  }));
  assert.equal(never.code, 1);
  assert.match(never.stdout, /never met/);
  assert.match(never.stdout, /failed: accepts/);
});

test("the dry run: --cap rides as the client profile, and would_throw exits 1", async () => {
  let seen;
  const result = await run(["before-you-pay", "https://door.example/pay", "--cap", "0.5"], (request) => {
    seen = request;
    return {
      json: {
        url: "https://door.example/pay",
        will_your_client_pay: "would_throw",
        your_client: { outcome: "would_throw", chosen: null, throws_with: "All payment requirements were filtered out by spendControls", dropped: [{ index: 0, network: "eip155:8453", stage: "amount-cap", why: "5 USD is above the cap" }], hazards: [], cap_applied: "$0.5" },
        the_door: { verdict: "ready", checks: [{ name: "status-402", ok: true }], remediation: [] },
      },
    };
  });
  assert.equal(seen.url, "/api/before-you-pay/v1");
  assert.deepEqual(seen.body, { url: "https://door.example/pay", client_profile: { max_amount_per_payment_usd: 0.5 } });
  assert.equal(result.code, 1);
  assert.match(result.stdout, /will your client pay: would_throw/);
  assert.match(result.stdout, /DROP {2}accept 0 \(eip155:8453\) at amount-cap/);
  const signs = await run(["before-you-pay", "https://door.example/pay"], (request) => {
    seen = request;
    return {
      json: {
        url: "https://door.example/pay",
        will_your_client_pay: "would_sign",
        your_client: { outcome: "would_sign", chosen: { index: 0, network: "eip155:8453", asset: "0xusdc", amount_atomic: "1000", amount_usd: 0.001, signing_window_seconds: 300 }, throws_with: null, dropped: [], hazards: [], cap_applied: "$1" },
        the_door: { verdict: "ready", checks: [], remediation: [] },
      },
    };
  });
  assert.deepEqual(seen.body, { url: "https://door.example/pay" });
  assert.equal(signs.code, 0);
  assert.match(signs.stdout, /would sign accept 0: eip155:8453 0xusdc 1000 atomic \(\$0\.001\), 300s to sign/);
  const bad = await run(["before-you-pay", "https://door.example/pay", "--cap", "nope"], () => ({ json: {} }));
  assert.equal(bad.code, 2);
});

test("a month and the feeds, from the store's own documents", async () => {
  let seen;
  const month = await run(["month", "2026-08"], (request) => {
    seen = request;
    return {
      json: {
        name: "The state of x402",
        month: "2026-08",
        weeks: [{ week: "2026-W33" }, { week: "2026-W34" }],
        closing: { week: "2026-W34", listed: 40, probed: 38, payable: 20, not_payable: 15, unreachable: 3, offers_seen: 9 },
        door_weeks: { rounds: 2, listed: 80, probed: 76, payable: 41, not_payable: 29, unreachable: 6, offers_seen: 18 },
        defects: [{ id: "no-402", title: "Listed, but serves no payment challenge", door_weeks: 12 }],
        months_held: ["2026-07", "2026-08"],
        what_this_is_not: "Not a ranking.",
      },
    };
  });
  assert.equal(seen.url, "/corpus/month/2026-08");
  assert.equal(seen.headers["accept"], "application/json");
  assert.equal(month.code, 0);
  assert.match(month.stdout, /closing 2026-W34 +listed 40 {2}probed 38/);
  assert.match(month.stdout, /door-weeks \(2 rounds\)/);
  assert.match(month.stdout, /DEFECT {2}no-402: 12 door-weeks/);
  const badMonth = await run(["month", "august"], () => ({ json: {} }));
  assert.equal(badMonth.code, 2);
  const feeds = await run(["feeds"], (request) => {
    seen = request;
    return { json: { feeds: [{ path: "/feeds/brief.xml", title: "The week's doors", url: "https://scvd.store/feeds/brief.xml", summary: "One entry per signed week." }] } };
  });
  assert.equal(seen.url, "/feeds");
  assert.match(feeds.stdout, /The week's doors +https:\/\/scvd\.store\/feeds\/brief\.xml/);
  assert.match(feeds.stdout, /One entry per signed week/);
});
