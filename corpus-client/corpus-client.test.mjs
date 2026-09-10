import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import * as client from "./corpus-client.js";
import { CorpusHttpError, DOORS, corpus, feeds, hostHistory, month, withDenominator } from "./corpus-client.js";

async function withStore(handler, fn) {
  const seen = [];
  const server = createServer((request, response) => {
    seen.push({ url: request.url, accept: request.headers.accept });
    const answer = handler(request.url);
    response.writeHead(answer.status ?? 200, { "content-type": "application/json" });
    response.end(JSON.stringify(answer.json));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`, seen);
  } finally {
    server.close();
  }
}

test("each reader is one GET to its stable address, asking for JSON, returning the body whole", async () => {
  await withStore((url) => ({ json: { served: url, signature: "sig" } }), async (base, seen) => {
    assert.deepEqual(await corpus({ base }), { served: "/corpus.json", signature: "sig" });
    assert.deepEqual(await hostHistory("Door.Example", { base }), { served: "/corpus/host/door.example.json", signature: "sig" });
    assert.deepEqual(await month("2026-08", { base }), { served: "/corpus/month/2026-08", signature: "sig" });
    assert.deepEqual(await month(undefined, { base }), { served: "/corpus/month", signature: "sig" });
    assert.deepEqual(await feeds({ base }), { served: "/feeds", signature: "sig" });
    for (const request of seen) assert.equal(request.accept, "application/json");
    assert.deepEqual(seen.map((r) => r.url), [DOORS.corpus, DOORS.host("door.example"), DOORS.month("2026-08"), DOORS.month(), DOORS.feeds]);
  });
});

test("a refusal is a typed error carrying the store's words; a bad month never leaves the process", async () => {
  await withStore(() => ({ status: 404, json: { error: "No month 2026-13 in the chain." } }), async (base) => {
    await assert.rejects(month("2026-13", { base }), (error) => error instanceof CorpusHttpError && error.status === 404 && /2026-13/.test(error.message));
  });
  assert.throws(() => month("august"), TypeError);
  assert.equal(withDenominator(3, 4, "rounds"), "3 of 4 rounds");
});


test("compact corpus returns one page whole and leaves the next request to the caller", async () => {
  const page = { entries: [{ sequence: 7, status: "unreadable" }], listed: 1, unreadable: 1, has_more: true, next: "https://do-not-follow.invalid/next", verification: "Not performed.", completeness: "A page is not an inventory.", corrections: { url: "/corrections" } };
  await withStore(() => ({ json: page }), async (base, seen) => {
    assert.deepEqual(await client.corpusIndex({ base }), page);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, "/corpus/index.json");
    assert.deepEqual(await client.corpusIndex({ base, limit: 1, cursor: "a+/=&? 雪" }), page);
    assert.equal(seen.length, 2);
    const url = new URL(seen[1].url, base);
    assert.deepEqual([...url.searchParams], [["limit", "1"], ["cursor", "a+/=&? 雪"]]);
    assert.equal(seen[1].accept, "application/json");
  });
});

test("compact corpus retains an incomplete page with no next link and exposes refusals", async () => {
  const page = { entries: [], has_more: true, next: null, unreadable: 0 };
  await withStore(() => ({ json: page }), async (base) => assert.deepEqual(await client.corpusIndex({ base }), page));
  await withStore(() => ({ status: 400, json: { error: "Use the server's page limit." } }), async (base) => {
    await assert.rejects(client.corpusIndex({ base, limit: 1000 }), (e) => e instanceof CorpusHttpError && e.status === 400 && e.body.error.includes("limit"));
  });
});

test("compact corpus validates caller options without a fetch", () => {
  for (const bad of [{ limit: 0 }, { limit: 1.5 }, { limit: Infinity }, { limit: "1" }, { limit: Number.MAX_SAFE_INTEGER + 1 }, { cursor: "" }, { cursor: 3 }]) {
    let calls = 0;
    assert.throws(() => client.corpusIndex({ ...bad, fetch: () => { calls++; } }), (error) => error instanceof TypeError && /^corpusIndex: (limit|cursor)/.test(error.message));
    assert.equal(calls, 0);
  }
});

test("compact corpus passes the timeout signal to fetch and rejects unreadable success bodies", async () => {
  const fetch = async (_url, init) => {
    assert.ok(init.signal instanceof AbortSignal);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(init.signal.aborted, true);
    throw init.signal.reason;
  };
  await assert.rejects(client.corpusIndex({ timeoutMs: 1, fetch }), { name: "TimeoutError" });
  for (const body of ["not JSON", "null", "[]", "false"]) {
    await assert.rejects(client.corpusIndex({ fetch: async () => new Response(body) }), /JSON object/);
  }
});
