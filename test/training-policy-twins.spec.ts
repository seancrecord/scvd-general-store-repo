import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { CONTENT_SIGNAL, aiTrainingAllowed, aiTxtDocument, tdmrepDocument } from "@/routes/site-meta";

/**
 * ONE POSITION, THREE GRAMMARS (2026-09-11). robots.txt's Content-Signal,
 * /.well-known/tdmrep.json and /ai.txt all say whether this store may be
 * trained on. What this file holds: the two new files derive from the
 * one constant, both flip when it flips, and both are served.
 */
const BASE = "https://scvd.store";

describe("the training position derives from Content-Signal everywhere", () => {
  it("reads ai-train from the signal and nothing else", () => {
    expect(aiTrainingAllowed("search=yes, ai-train=yes, ai-input=yes")).toBe(true);
    expect(aiTrainingAllowed("search=yes, ai-train=no, ai-input=yes")).toBe(false);
    expect(aiTrainingAllowed("search=yes")).toBe(false);
  });

  it("tdmrep reserves nothing while the store asks to be trained on, and reserves everything the day it stops", () => {
    expect(tdmrepDocument(CONTENT_SIGNAL)).toEqual([{ location: "/", "tdm-reservation": 0 }]);
    expect(tdmrepDocument("ai-train=no")).toEqual([{ location: "/", "tdm-reservation": 1 }]);
  });

  it("ai.txt allows every media type while the store asks to be trained on, and disallows every one otherwise", () => {
    const yes = aiTxtDocument(CONTENT_SIGNAL, BASE);
    expect(yes).toContain("User-Agent: *\nAllow: /");
    expect(yes).toContain("Allow: *.json");
    expect(yes).not.toContain("Disallow");
    expect(yes).toContain(CONTENT_SIGNAL);
    const no = aiTxtDocument("ai-train=no", BASE);
    expect(no).toContain("Disallow: /");
    expect(no).not.toMatch(/^Allow/m);
  });
});

describe("both files are served", () => {
  it("/.well-known/tdmrep.json is JSON in the protocol's shape", async () => {
    const res = await SELF.fetch(`${BASE}/.well-known/tdmrep.json`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual(tdmrepDocument(CONTENT_SIGNAL));
  });

  it("/ai.txt is plain text that quotes the robots.txt line it derives from", async () => {
    const res = await SELF.fetch(`${BASE}/ai.txt`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const body = await res.text();
    expect(body).toContain(`Content-Signal line in ${BASE}/robots.txt (${CONTENT_SIGNAL})`);
    const robots = await (await SELF.fetch(`${BASE}/robots.txt`)).text();
    expect(robots).toContain(`Content-Signal: ${CONTENT_SIGNAL}`);
  });
});
