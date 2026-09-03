import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createServer } from "node:http";
import test from "node:test";
import { DOES_NOT_ESTABLISH, DOORS, beforeYouPayWalk, decide, readChallenge } from "./decide.mjs";

/**
 * THE SHARED LOGIC, HELD TO THE EXPECTATIONS FILE. The readings are the
 * store's own answers, recorded; the decisions are derived from them
 * here with no network. decide.py runs the same file (test_decide.py),
 * which is what keeps the two languages honest with each other.
 */

const FIXTURES = new URL("../fixtures/", import.meta.url);
const read = (name) => JSON.parse(readFileSync(new URL(name, FIXTURES), "utf8"));
const expected = read("expected.json");

test("every recorded reading is named by at least one case, and every case names a real reading", () => {
  const files = readdirSync(FIXTURES).filter((f) => f.endsWith(".json") && f !== "expected.json");
  const named = new Set(expected.cases.map((c) => c.fixture));
  for (const file of files) assert.ok(named.has(file), `${file} is recorded but no case reads it`);
  for (const file of named) assert.ok(files.includes(file), `${file} is expected but not recorded`);
});

for (const item of expected.cases) {
  test(item.case, () => {
    const reading = read(item.fixture);
    const decision = decide({ door: reading.the_door, client: reading.your_client, accepts: item.accepts ?? null, policy: item.policy });
    assert.equal(decision.decision, item.decision, JSON.stringify(decision.because));
    for (const reason of item.reasons) {
      assert.ok(decision.because.some((line) => line.includes(reason)), `expected a reason containing "${reason}", got ${JSON.stringify(decision.because)}`);
    }
    assert.deepEqual(decision.does_not_establish, [...DOES_NOT_ESTABLISH]);
    assert.ok(decision.because.length > 0, "a decision always says why");
    assert.equal(decision.derived_from.preflight_version, reading.the_door.version);
  });
}

test("a decision is never a score: no field reads as one", () => {
  const reading = read("ready-would-sign.json");
  const decision = decide({ door: reading.the_door, client: reading.your_client });
  assert.doesNotMatch(JSON.stringify(decision), /\b(score|rating|rank|confidence)\b/i);
});

test("the whole walk, against a server that is not the store", async () => {
  const challenge = { x402Version: 2, accepts: [{ scheme: "exact", network: "eip155:8453", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", amount: "1000", payTo: "0x1111111111111111111111111111111111111111" }] };
  const reading = read("ready-would-sign.json");
  const seen = [];
  const server = createServer((request, response) => {
    seen.push(`${request.method} ${request.url}`);
    if (request.url === "/door") {
      response.writeHead(402, { "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(challenge)).toString("base64") });
      return response.end("{}");
    }
    if (request.url === DOORS.before_you_pay) {
      response.writeHead(200, { "content-type": "application/json" });
      return response.end(JSON.stringify(reading));
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const door = `${base}/door`;
    const seenTerms = await readChallenge(door);
    assert.equal(seenTerms.status, 402);
    assert.equal(seenTerms.accepts[0].payTo, challenge.accepts[0].payTo);
    const walk = await beforeYouPayWalk(door, { base, policy: { allowed_recipients: [challenge.accepts[0].payTo] } });
    assert.equal(walk.decision.decision, "pay");
    assert.equal(walk.decision.terms.pay_to, challenge.accepts[0].payTo);
    // One GET from readChallenge above, one from the walk, one POST: the walk never knocks twice on its own.
    assert.deepEqual(seen, ["GET /door", "GET /door", `POST ${DOORS.before_you_pay}`]);
  } finally {
    server.close();
  }
});
