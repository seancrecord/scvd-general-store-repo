import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { CHANGELOG, DEFECT_CLASSES, VOCABULARY_VERSION, byDetectability, defectClass, defectsBySignal, remediationFor } from "./defects.js";
import { SETTLEMENT_OUTCOMES, SETTLEMENT_RESPONSE_CHECKS, decodeSettlementResponse, readSettlementResponse } from "./settlement-response.js";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

test("the package's minor version is the vocabulary version it carries, and the changelog's newest entry is that version", () => {
  assert.equal(pkg.version.split(".")[1], VOCABULARY_VERSION);
  assert.equal(CHANGELOG[CHANGELOG.length - 1].version, VOCABULARY_VERSION);
});

test("every class carries the fields the vocabulary promises, both halves of the remediation included", () => {
  assert.ok(DEFECT_CLASSES.length >= 17);
  for (const entry of DEFECT_CLASSES) {
    for (const field of ["id", "title", "asserts", "costs", "detectable", "falsified_by", "repair_hint", "buyer_hint"]) assert.ok(entry[field], `${entry.id} lacks ${field}`);
    assert.ok(["unpaid", "paid"].includes(entry.detectable));
  }
  assert.equal(new Set(DEFECT_CLASSES.map((entry) => entry.id)).size, DEFECT_CLASSES.length);
  assert.doesNotMatch(JSON.stringify(DEFECT_CLASSES), /\b0x[0-9a-fA-F]{40}\b/);
});

test("lookups: by id, by signal in either spelling, remediation with the definition URL, and detectability split", () => {
  assert.equal(defectClass("no-402").detectable, "unpaid");
  assert.equal(defectClass("nope"), undefined);
  assert.deepEqual(defectsBySignal("accepts").map((entry) => entry.id).sort(), ["unpayable-payto", "unsignable-offer"]);
  assert.equal(defectsBySignal("discovery-info-fails-schema")[0].id, "discovery-info-invalid");
  const fix = remediationFor("wrong-network");
  assert.ok(fix.operator && fix.buyer);
  assert.equal(fix.definition_url, "https://scvd.store/defects/wrong-network");
  const split = byDetectability();
  assert.equal(split.unpaid.length + split.paid.length, DEFECT_CLASSES.length);
  assert.ok(split.paid.some((entry) => entry.id === "replay-accepted"));
});

test("every recorded door names what it is and which checks it fails", () => {
  const dir = new URL("./fixtures/doors/", import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  assert.ok(files.length >= 6);
  for (const file of files) {
    const door = JSON.parse(readFileSync(new URL(file, dir), "utf8"));
    for (const field of ["name", "recorded", "why", "expect_failed", "status", "headers", "body"]) assert.ok(field in door, `${file} lacks ${field}`);
    assert.ok(Array.isArray(door.expect_failed));
  }
});

test("every recorded settlement response names what it is, fails exactly the checks it names, and reads the outcome it names", () => {
  const dir = new URL("./fixtures/settlement-responses/", import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  assert.ok(files.length >= 10);
  for (const file of files) {
    const fixture = JSON.parse(readFileSync(new URL(file, dir), "utf8"));
    for (const field of ["name", "recorded", "why", "expect_failed", "expect_outcome", "must_not_conclude", "payment_response", "decoded"]) assert.ok(field in fixture, `${file} lacks ${field}`);
    for (const check of fixture.expect_failed) assert.ok(SETTLEMENT_RESPONSE_CHECKS.includes(check), `${file} expects unknown check ${check}`);
    assert.ok(SETTLEMENT_OUTCOMES.includes(fixture.expect_outcome));
    assert.deepEqual(decodeSettlementResponse(fixture.payment_response), fixture.decoded, `${file}: decoded drifts from the bytes`);
    const reading = readSettlementResponse(fixture.payment_response);
    assert.deepEqual([...reading.failed].sort(), [...fixture.expect_failed].sort(), file);
    assert.equal(reading.outcome, fixture.expect_outcome, file);
    assert.ok(!fixture.must_not_conclude.includes(reading.outcome), file);
  }
});

test("the negative control: the naive reader (success → settled, else failed) fails the pending shapes", () => {
  const dir = new URL("./fixtures/settlement-responses/", import.meta.url);
  const caught = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const fixture = JSON.parse(readFileSync(new URL(file, dir), "utf8"));
    const naive = decodeSettlementResponse(fixture.payment_response)?.success === true ? "settled" : "failed";
    if (fixture.must_not_conclude.includes(naive)) caught.push(fixture.name);
  }
  assert.ok(caught.length >= 3, `the fixtures must be able to fail a reader; caught ${caught.join(", ") || "nothing"}`);
  assert.ok(caught.includes("pending-with-hash"));
});

test("the new class and the amended one carry the receiver-side reading", () => {
  const rechallenge = defectClass("re-challenges-spent-authorization");
  assert.equal(rechallenge.detectable, "paid");
  assert.match(rechallenge.sourced_by, /x402#3325/);
  assert.match(defectClass("replay-accepted").asserts, /original purchase/);
});
