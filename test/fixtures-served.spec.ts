import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { FIXTURE_SETS, FIXTURE_SOURCES, fixtureBytes, fixturesIndex, provenanceOf } from "@/routes/fixtures";
import { citeLine } from "@/lib/cite";

const BASE = "https://scvd.store";

/**
 * THE FIXTURES, SERVED, AND THE CITE LINE (2026-09-04, roadmap C7).
 * What this file holds:
 *
 *   - the served sets are the directories exactly: a fixture
 *     added to the tree without a URL, or a URL with no file behind it,
 *     fails here;
 *   - every entry's bytes hash to the sha256 the index prints beside
 *     it, and are the file's own JSON re-serialised the way the file
 *     is stored;
 *   - the index is a registered dataset (the machine-readability guard
 *     walks it) and says the material is unsigned;
 *   - the cite line is derived, names the observation and the bytes,
 *     and rides the signed documents and pages;
 *   - (2026-09-12) every row carries the conformance-corpus vocabulary
 *     from x402#3396 — proves, source, captured_at, last_verified_at —
 *     each derived from the file, its sibling, its set, or the deploy,
 *     never typed into the index.
 */

const raw = {
  ...(import.meta.glob("./fixtures/doors/*.json", { query: "?raw", import: "default", eager: true }) as Record<string, string>),
  ...(import.meta.glob("./fixtures/mpp/*.json", { query: "?raw", import: "default", eager: true }) as Record<string, string>),
  ...(import.meta.glob("./fixtures/settlement-responses/*.json", { query: "?raw", import: "default", eager: true }) as Record<string, string>),
  ...(import.meta.glob("../verifier/fixtures/*.json", { query: "?raw", import: "default", eager: true }) as Record<string, string>),
  ...(import.meta.glob("./fixtures/402index/*.json", { query: "?raw", import: "default", eager: true }) as Record<string, string>),
  ...(import.meta.glob("./fixtures/x402scan/*.json", { query: "?raw", import: "default", eager: true }) as Record<string, string>),
};
const names = (directory: string) =>
  Object.keys(raw)
    .filter((path) => path.includes(`/${directory}/`))
    .map((path) => path.split("/").at(-1)!.replace(/\.json$/, ""))
    .sort();
const tree: Record<string, string[]> = {
  doors: names("doors"),
  mpp: names("mpp"),
  "settlement-responses": names("settlement-responses"),
  verifier: names("verifier/fixtures"),
  "402index": names("402index"),
  x402scan: names("x402scan"),
};

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("the served sets are the directories", () => {
  it("names every file in each directory and nothing else", () => {
    expect(FIXTURE_SETS.map((set) => set.set).sort()).toEqual(Object.keys(tree).sort());
    for (const set of FIXTURE_SETS) {
      expect(set.entries.map((entry) => entry.name).sort(), set.set).toEqual(tree[set.set]);
    }
  });

  it("serves each file's own JSON, byte for byte as stored, with the sha256 the index prints", async () => {
    const index = (await (await SELF.fetch(`${BASE}/fixtures.json`)).json()) as { sets: { set: string; entries: { name: string; url: string; sha256: string }[] }[]; fixture_count: number };
    expect(index.fixture_count).toBe(FIXTURE_SETS.reduce((n, set) => n + set.entries.length, 0));
    for (const set of index.sets) {
      for (const entry of set.entries) {
        const response = await SELF.fetch(entry.url);
        expect(response.status, entry.url).toBe(200);
        const text = await response.text();
        expect(await sha256(text), `${entry.url} sha256`).toBe(entry.sha256);
        const stored = Object.entries(raw).find(([path]) => path.endsWith(`/${set.set === "verifier" ? "fixtures" : set.set}/${entry.name}.json`))![1];
        // The served bytes are the file's JSON in the canonical two-space
        // form; a file stored with other whitespace serves the same
        // values, and the sha256 is over what is served.
        expect(text, `${entry.url} bytes`).toBe(fixtureBytes(JSON.parse(stored)));
        expect(response.headers.get("x-fixture-cite")).toContain("unsigned");
      }
    }
    const missing = await SELF.fetch(`${BASE}/fixtures/doors/no-such-door.json`);
    expect(missing.status).toBe(404);
  });
});

describe("the cite line", () => {
  it("is derived from the artifact's fields and names the observation, the key and the bytes", () => {
    const line = citeLine({ base: BASE, what: "corpus snapshot", which: "12 (2026-W35)", observed_at: "2026-08-31T00:00:00Z", url: `${BASE}/corpus/12.json` });
    expect(line).toBe("scvd.store, corpus snapshot 12 (2026-W35), observed 2026-08-31T00:00:00Z; ed25519-signed, key at https://scvd.store/.well-known/scvd-signing-key; bytes at https://scvd.store/corpus/12.json.");
    expect(citeLine({ base: BASE, what: "fixture index", which: "(x)", observed_at: null, url: `${BASE}/fixtures.json`, signed: false })).toContain("unsigned recorded material");
    expect(line).not.toMatch(/\b(score|rating|rank)\b/i);
  });

  it("rides the fixture index, and the passport landing's example carries it on the page", async () => {
    const index = (await (await SELF.fetch(`${BASE}/fixtures.json`)).json()) as Record<string, unknown>;
    expect(String(index["cite"])).toMatch(/^scvd\.store, fixture index/);
    expect(String(index["what_this_is_not"]).toLowerCase()).toContain("not signed");
    const self = new URL(BASE).host;
    const page = await (await SELF.fetch(`${BASE}/passport/${self}`, { headers: { Accept: "text/html" } })).text();
    expect(page).toMatch(/<strong>Cite:<\/strong> <code>scvd\.store, endpoint passport /);
    const json = (await (await SELF.fetch(`${BASE}/passport/${self}`, { headers: { Accept: "application/json" } })).json()) as Record<string, unknown>;
    expect(String(json["cite"])).toContain(`bytes at ${BASE}/passport/${self}`);
  });
});

/**
 * PROVENANCE IS DECLARED, NOT NARRATED (2026-09-12). The corpus forming
 * on x402#3396 reads rows by four fields; this store's fixtures carried
 * the same facts as prose. Now each wrapped file declares its source and
 * capture time, the raw captures inherit from their set or sibling, and
 * the index emits the pair beside the deploy that last replayed them.
 */
/*
 * The set of spec files a `verified_by` may name. A raw eager glob is
 * what this pool's typings allow; the patterns are kept narrow so the
 * test bundle does not inline every spec in the tree. A renamed spec
 * drops out of the set and the guard fires.
 */
const specFiles = new Set(
  Object.keys({
    ...import.meta.glob("./*fixtures*.spec.ts", { query: "?raw", import: "default", eager: true }),
    ...import.meta.glob("./*-battery.spec.ts", { query: "?raw", import: "default", eager: true }),
    ...import.meta.glob("./directory-walk.spec.ts", { query: "?raw", import: "default", eager: true }),
    ...import.meta.glob("./verifier-package.spec.ts", { query: "?raw", import: "default", eager: true }),
  }).map((path) => path.replace(/^\.\//, "test/")),
);

describe("every fixture carries the corpus vocabulary", () => {
  it("wrapped files declare source and captured_at inside themselves, consistent with each other", () => {
    for (const set of ["doors", "mpp", "settlement-responses"]) {
      for (const path of Object.keys(raw).filter((candidate) => candidate.includes(`/${set}/`))) {
        const body = JSON.parse(raw[path]!) as Record<string, unknown>;
        expect(FIXTURE_SOURCES as readonly string[], `${path} source`).toContain(body["source"]);
        expect("captured_at" in body, `${path} declares captured_at`).toBe(true);
        if (body["source"] === "simulated") expect(body["captured_at"], `${path}: a constructed shape has no capture time`).toBeNull();
        else expect(body["captured_at"], `${path}: an observed or derived shape names when`).toMatch(/^\d{4}-\d{2}-\d{2}/);
      }
    }
  });

  it("every set names the spec that replays it, and that spec exists", () => {
    for (const set of FIXTURE_SETS) {
      expect(specFiles.has(set.verified_by), `${set.set}: ${set.verified_by}`).toBe(true);
    }
  });

  it("the x402scan bodies read their capture time off the terms captured beside them", () => {
    const set = FIXTURE_SETS.find((candidate) => candidate.set === "x402scan")!;
    for (const entry of set.entries.filter((candidate) => !candidate.name.endsWith(".terms"))) {
      const terms = set.entries.find((candidate) => candidate.name === `${entry.name}.terms`)!;
      expect(provenanceOf(set, entry)).toEqual({ ...set.provenance, captured_at: terms.body["captured"] });
      expect(provenanceOf(set, entry).source).toBe("observed");
    }
  });

  it("the index emits the pair on every row, and the freshness half is the deploy or null, never a typed date", async () => {
    const stamped = await fixturesIndex(BASE, { id: "deploy-test", timestamp: "2026-09-12T20:00:00.000Z" });
    const unstamped = await fixturesIndex(BASE, null);
    for (const index of [stamped, unstamped]) {
      const sets = index["sets"] as { set: string; verified_by: string; entries: Record<string, unknown>[] }[];
      for (const set of sets) {
        expect(set.verified_by).toBeTruthy();
        for (const entry of set.entries) {
          expect(FIXTURE_SOURCES as readonly string[], `${set.set}/${entry["name"]}`).toContain(entry["source"]);
          expect(String(entry["proves"]).length, `${set.set}/${entry["name"]} proves`).toBeGreaterThan(0);
          expect(entry["captured_at_precision"]).toBe(entry["captured_at"] === null ? null : String(entry["captured_at"]).includes("T") ? "minute" : "date");
          expect(entry["verified_by"]).toBe(set.verified_by);
        }
      }
    }
    const rows = (index: Record<string, unknown>) => (index["sets"] as { entries: Record<string, unknown>[] }[]).flatMap((set) => set.entries);
    expect(new Set(rows(stamped).map((row) => row["last_verified_at"]))).toEqual(new Set(["2026-09-12T20:00:00.000Z"]));
    expect(new Set(rows(unstamped).map((row) => row["last_verified_at"]))).toEqual(new Set([null]));
    const freshness = unstamped["freshness"] as Record<string, unknown>;
    expect(freshness["last_verified_at"]).toBeNull();
    expect(String(freshness["not_verified_here"])).toContain("no version metadata");
    expect((stamped["freshness"] as Record<string, unknown>)["deploy_id"]).toBe("deploy-test");
    // Observed rows outnumber none: the raw captures and the derived door say where they came from.
    expect(rows(stamped).filter((row) => row["source"] === "observed").length).toBeGreaterThan(0);
    expect(rows(stamped).filter((row) => row["source"] === "derived").map((row) => row["name"])).toContain("clean-402");
  });

  it("the served index carries the freshness block the Worker's version metadata feeds", async () => {
    const index = (await (await SELF.fetch(`${BASE}/fixtures.json`)).json()) as Record<string, unknown>;
    const freshness = index["freshness"] as Record<string, unknown>;
    expect(freshness).toBeTruthy();
    expect(String(freshness["vocabulary"])).toContain("x402#3396");
    expect("last_verified_at" in freshness).toBe(true);
  });
});
