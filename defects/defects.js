/**
 * scvd-defects — the x402 defect vocabulary as data.
 *
 * `defects.json` is a snapshot of https://scvd.store/defects.json cut
 * from the store's own source at the version in this package's name
 * (0.10.x is vocabulary v10). The live document is the authority and
 * `fetchLatest()` reads it; `isStale()` says whether the snapshot is
 * behind. Definitions are never edited in place — a changed assertion
 * is a new version with the old text still in the changelog — so a
 * snapshot is never wrong about its own version, only possibly behind.
 *
 * The names are CC BY 4.0; take them, that is the point of publishing
 * them. The fixtures are recorded 402 doors (status, headers, body)
 * with the checks each one is bad in, for testing a client offline.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
/** @type {{ version: string, classes: any[], evidence_labels: any[], changelog: any[], url: string }} */
const SNAPSHOT = require("./defects.json");

export const VOCABULARY_VERSION = SNAPSHOT.version;
export const VOCABULARY_URL = SNAPSHOT.url;
export const DEFECT_CLASSES = Object.freeze(SNAPSHOT.classes);
export const EVIDENCE_LABELS = Object.freeze(SNAPSHOT.evidence_labels);
export const CHANGELOG = Object.freeze(SNAPSHOT.changelog);

/** One class by id, or undefined — never a guess. */
export function defectClass(id) {
  return DEFECT_CLASSES.find((entry) => entry.id === id);
}

/** Every class a raw signal (a check or advisory name) explains, in either spelling. */
export function defectsBySignal(signal) {
  return DEFECT_CLASSES.filter((entry) => entry.our_signal === signal || entry.our_signal === `${signal} (advisory)`);
}

/** Both halves of the remediation for one class: what the operator does, what the buyer does. */
export function remediationFor(id) {
  const entry = defectClass(id);
  return entry ? { operator: entry.repair_hint, buyer: entry.buyer_hint, definition_url: `${VOCABULARY_URL}/${entry.id}` } : undefined;
}

/** The classes an unpaid probe can see, and the ones only money reveals. */
export function byDetectability() {
  return {
    unpaid: DEFECT_CLASSES.filter((entry) => entry.detectable === "unpaid"),
    paid: DEFECT_CLASSES.filter((entry) => entry.detectable === "paid"),
  };
}

/** The live vocabulary. */
export async function fetchLatest({ base = "https://scvd.store", fetch: fetchImpl = fetch, timeoutMs = 30_000 } = {}) {
  const response = await fetchImpl(`${base.replace(/\/+$/, "")}/defects.json`, { headers: { accept: "application/json", "user-agent": "scvd-defects (+https://scvd.store/defects)" }, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`/defects.json answered ${response.status}`);
  return response.json();
}

/** Whether this snapshot is behind the live vocabulary, with both versions named. */
export async function isStale(options) {
  const live = await fetchLatest(options);
  return { stale: Number(live.version) > Number(VOCABULARY_VERSION), snapshot: VOCABULARY_VERSION, live: String(live.version) };
}
