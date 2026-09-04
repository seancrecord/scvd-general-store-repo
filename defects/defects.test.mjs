import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { CHANGELOG, DEFECT_CLASSES, VOCABULARY_VERSION, byDetectability, defectClass, defectsBySignal, remediationFor } from "./defects.js";

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
