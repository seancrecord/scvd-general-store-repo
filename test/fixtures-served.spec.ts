import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { FIXTURE_SETS, fixtureBytes } from "@/routes/fixtures";
import { citeLine } from "@/lib/cite";

const BASE = "https://scvd.store";

/**
 * THE FIXTURES, SERVED, AND THE CITE LINE (2026-09-04, roadmap C7).
 * What this file holds:
 *
 *   - the served sets are the three directories exactly: a fixture
 *     added to the tree without a URL, or a URL with no file behind it,
 *     fails here;
 *   - every entry's bytes hash to the sha256 the index prints beside
 *     it, and are the file's own JSON re-serialised the way the file
 *     is stored;
 *   - the index is a registered dataset (the machine-readability guard
 *     walks it) and says the material is unsigned;
 *   - the cite line is derived, names the observation and the bytes,
 *     and rides the signed documents and pages.
 */

const raw = {
  ...(import.meta.glob("./fixtures/doors/*.json", { query: "?raw", import: "default", eager: true }) as Record<string, string>),
  ...(import.meta.glob("./fixtures/mpp/*.json", { query: "?raw", import: "default", eager: true }) as Record<string, string>),
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
