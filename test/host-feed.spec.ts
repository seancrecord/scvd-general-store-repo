import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { HOST_FEED, hostEntriesOf } from "@/routes/feeds";
import { subjectHistory } from "@/services/subject-history";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const HTML = { headers: { Accept: "text/html" } };
const JSON_ACCEPT = { headers: { Accept: "application/json" } };

/**
 * THE PER-HOST FEED, THE QUESTION NODE AND THE OPERATOR'S LINE
 * (2026-09-17), all three read off an outside observatory's record of
 * this store's own MCP door (research/robinsaige-read-2026-09-17.md).
 * What this file holds:
 *
 *   - /feeds/host/{host}.xml carries one entry per CHANGE the chain
 *     recorded about that host — first probe, verdict transitions,
 *     pay-to set changes — and nothing for an unchanged or unwalked
 *     week; newest first, stable ids, well-formed Atom, and the
 *     corrections pointer;
 *   - a host the chain never met gets the history page's refusal, not
 *     an empty feed with our name on it;
 *   - the passport page and the history page advertise the feed in
 *     their heads, and the JSON twins carry feed_url;
 *   - the passport page carries a QAPage node whose answer states the
 *     derivation beside the decision, never the word alone;
 *   - the operator's doors — mailbox, corrections, self-check, notice
 *     desk — are on the record page, issued or refused, page and JSON.
 */

const ROUND_ONE_AT = "2026-08-19T17:00:00.000Z";
const ROUND_TWO_AT = "2026-08-26T17:00:00.000Z";

async function seedRound(sequence: number, week: string, takenAt: string, previousDigest: string | null, digest: string, verdict: string) {
  const snapshot = {
    version: 1,
    sequence,
    taken_at: takenAt,
    previous_digest: previousDigest,
    source: "ward_round",
    week,
    round: {
      week,
      at: takenAt,
      listed_resources: 1,
      coverage_suspect: false,
      capped: false,
      our_search_presence: true,
      hosts: [
        {
          host: "moving.example",
          url: "https://moving.example/api/x",
          verdict,
          failed: verdict === "ready" ? [] : ["402_shape"],
          advisories: [],
        },
      ],
    },
  };
  await testEnv.COUNTERS.put(
    `${KV_KEYS.corpusPrefix}${String(sequence).padStart(9, "0")}`,
    JSON.stringify({ snapshot, digest, signature: "0".repeat(128), public_key: "0".repeat(64) }),
  );
}

beforeAll(async () => {
  await seedRound(1, "2026-W34", ROUND_ONE_AT, null, "0".repeat(64), "not_ready");
  await seedRound(2, "2026-W35", ROUND_TWO_AT, "0".repeat(64), "1".repeat(64), "ready");
});

describe("entries are changes, derived from the replayed history", () => {
  it("one for the first probe, one per verdict change, newest first, ids stable and distinct", async () => {
    const history = await subjectHistory(testEnv, "moving.example", BASE);
    expect(history.verdict_changes).toHaveLength(1);
    const entries = hostEntriesOf(history, BASE);
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.updated)).toEqual([ROUND_TWO_AT, ROUND_ONE_AT]);
    expect(entries[0]?.title).toBe("moving.example: not_ready → ready");
    expect(entries[0]?.summary).toContain("week 2026-W35");
    expect(entries[1]?.title).toBe("moving.example: first probe on record, not_ready");
    expect(entries[1]?.summary).toContain("402_shape");
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(2);
    for (const entry of entries) {
      expect(entry.link).toBe(`${BASE}/corpus/host/moving.example`);
      expect(entry.id.startsWith(`${BASE}/corpus/host/moving.example#`)).toBe(true);
    }
  });
});

describe("the feed on the wire", () => {
  it("serves well-formed Atom for a host the chain has met, with the corrections pointer", async () => {
    const response = await SELF.fetch(`${BASE}/feeds/host/moving.example.xml`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/atom+xml");
    const xml = await response.text();
    expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true);
    expect(xml).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
    expect(xml).toContain(`<link rel="self" type="application/atom+xml" href="${BASE}/feeds/host/moving.example.xml"/>`);
    expect(xml).toContain(`<link rel="alternate" type="text/html" href="${BASE}/corpus/host/moving.example"/>`);
    expect(xml).toContain("/corrections");
    expect(xml.split("<entry>").length - 1).toBe(2);
    expect(xml).toContain("not_ready → ready");
  });

  it("refuses a host the chain never carried, and a malformed name", async () => {
    const unknown = await SELF.fetch(`${BASE}/feeds/host/never-met.example.xml`);
    expect(unknown.status).toBe(404);
    const body = (await unknown.json()) as { error: string; doors: string };
    expect(body.error).toContain("never carried");
    expect(body.doors).toBe(`${BASE}/doors`);
    const bad = await SELF.fetch(`${BASE}/feeds/host/not%20a%20host.xml`);
    expect(bad.status).toBe(400);
  });

  it("is advertised in the head of the two pages it mirrors, and in their JSON twins", async () => {
    const link = `<link rel="alternate" type="application/atom+xml" href="${BASE}/feeds/host/moving.example.xml"`;
    const passportPage = await (await SELF.fetch(`${BASE}/passport/moving.example`, HTML)).text();
    expect(passportPage).toContain(link);
    expect(passportPage).toContain(`href="/feeds/host/moving.example.xml"`);
    const historyPage = await (await SELF.fetch(`${BASE}/corpus/host/moving.example`, HTML)).text();
    expect(historyPage).toContain(link);

    const passport = (await (await SELF.fetch(`${BASE}/passport/moving.example`, JSON_ACCEPT)).json()) as {
      feed_url: string;
      signed_payload: string;
    };
    expect(passport.feed_url).toBe(`${BASE}/feeds/host/moving.example.xml`);
    // Additive, outside the signature: the signed bytes do not carry it.
    expect(passport.signed_payload).not.toContain("feed_url");
    const history = (await (await SELF.fetch(`${BASE}/corpus/host/moving.example.json`)).json()) as { feed_url: string };
    expect(history.feed_url).toBe(`${BASE}/feeds/host/moving.example.xml`);
  });

  it("is described on the feeds index beside the four, and named where agents read", async () => {
    const index = (await (await SELF.fetch(`${BASE}/feeds`, JSON_ACCEPT)).json()) as {
      per_host: { path: string; url_template: string };
    };
    expect(index.per_host.path).toBe(HOST_FEED.path);
    expect(index.per_host.url_template).toBe(`${BASE}/feeds/host/{host}.xml`);
    const html = await (await SELF.fetch(`${BASE}/feeds`, HTML)).text();
    expect(html).toContain("/feeds/host/{host}.xml");
    const corpusArea = await (await SELF.fetch(`${BASE}/corpus/llms.txt`)).text();
    expect(corpusArea).toContain(`${BASE}/feeds/host/{host}.xml`);
    const agents = await (await SELF.fetch(`${BASE}/agents.md`)).text();
    expect(agents).toContain(`${BASE}/feeds/host/{host}.xml`);
  });
});

function jsonLdNodes(html: string): Record<string, unknown>[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (match) => JSON.parse(match[1] ?? "{}") as Record<string, unknown>,
  );
}

describe("the passport page answers a question, as data", () => {
  it("carries a QAPage whose accepted answer states the derivation beside the decision", async () => {
    const page = await (await SELF.fetch(`${BASE}/passport/moving.example`, HTML)).text();
    const passport = (await (await SELF.fetch(`${BASE}/passport/moving.example`, JSON_ACCEPT)).json()) as {
      payload: { summary: { decision: string; status: string; valid_until: string; not_observed: string[] }; observer: string };
    };
    const node = jsonLdNodes(page).find((candidate) => candidate["@type"] === "QAPage");
    expect(node, "no QAPage node").toBeDefined();
    expect(node!["url"]).toBe(`${BASE}/passport/moving.example`);
    const question = node!["mainEntity"] as { name: string; answerCount: number; acceptedAnswer: { text: string; url: string } };
    expect(question.name).toContain("moving.example");
    expect(question.answerCount).toBe(1);
    const { decision, status, valid_until, not_observed } = passport.payload.summary;
    expect(question.acceptedAnswer.text.startsWith(`${decision} — as of `)).toBe(true);
    expect(question.acceptedAnswer.text).toContain(`derived from status "${status}"`);
    expect(question.acceptedAnswer.text).toContain(`Valid until ${valid_until}`);
    expect(question.acceptedAnswer.text).toContain(`${not_observed.length} thing`);
    expect(question.acceptedAnswer.text).toContain(passport.payload.observer);
    expect(question.acceptedAnswer.text).toContain("Not a warranty, not an endorsement, never a ranking");
    expect(question.acceptedAnswer.url).toBe(`${BASE}/passport/moving.example`);
  });
});

describe("the operator's line on the record page", () => {
  it("names the mailbox, the corrections, the self-check and the notice desk, page and JSON, issued or refused", async () => {
    const issuedPage = await (await SELF.fetch(`${BASE}/passport/moving.example`, HTML)).text();
    expect(issuedPage).toContain("Operate this door?");
    expect(issuedPage).toContain(`POST ${BASE}/api/letter`);
    expect(issuedPage).toContain(`POST ${BASE}/api/preflight`);
    expect(issuedPage).toContain('href="/corrections"');
    expect(issuedPage).toContain('href="/notice"');

    const issued = (await (await SELF.fetch(`${BASE}/passport/moving.example`, JSON_ACCEPT)).json()) as {
      contest: { mailbox: string; corrections_url: string; self_check: string; withdraw: string; what: string };
      signed_payload: string;
    };
    expect(issued.contest.mailbox).toBe(`${BASE}/api/letter`);
    expect(issued.contest.corrections_url).toBe(`${BASE}/corrections`);
    expect(issued.contest.self_check).toBe(`${BASE}/api/preflight`);
    expect(issued.contest.withdraw).toBe(`${BASE}/notice`);
    expect(issued.contest.what).toContain("moving.example");
    expect(issued.signed_payload).not.toContain("contest");

    const refusedPage = await (await SELF.fetch(`${BASE}/passport/never-met.example`, HTML)).text();
    expect(refusedPage).toContain("Operate this door?");
    const refused = (await (await SELF.fetch(`${BASE}/passport/never-met.example`, JSON_ACCEPT)).json()) as {
      issued: boolean;
      contest: { mailbox: string };
    };
    expect(refused.issued).toBe(false);
    expect(refused.contest.mailbox).toBe(`${BASE}/api/letter`);
  });
});
