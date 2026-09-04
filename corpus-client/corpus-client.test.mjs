import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
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
