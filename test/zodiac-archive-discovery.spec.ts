import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import bundledSkill from "../registry/clawhub/SKILL.md?raw";
import installedSkill from "../skills/scvd-general-store/SKILL.md?raw";
const BASE = "https://scvd.store";
const record = (value: unknown) => value as Record<string, unknown>;
async function read(path: string) { const response = await SELF.fetch(BASE + path); expect(response.status).toBe(200); return response; }

describe("Zodiac stays an archive on every retained discovery surface", () => {
  it("does not promote the weekly Zodiac on the short index or active free shelf", async () => {
    expect(await (await read("/llms.txt")).text()).not.toContain("zodiac");
    const skill = await (await read("/skill.md")).text();
    const free = skill.split("### The free shelf")[1]!.split("### ")[0]!;
    expect(free).not.toContain("Zodiac");
    expect(skill).toContain("Archived Systems Almanac");
    for (const copy of [bundledSkill, installedSkill]) {
      expect(copy).toContain("Archived Systems Almanac");
      expect(copy).not.toContain("this week's horoscope, free");
    }
  });
  it("marks retained OpenAPI readers deprecated and describes the archive honestly", async () => {
    const paths = record(record(await (await read("/openapi.json")).json()).paths);
    for (const path of ["/zodiac", "/zodiac/{address}", "/zodiac/archive"]) {
      const op = record(record(paths[path]).get);
      expect(op.deprecated, path).toBe(true);
      expect(String(op.description).toLowerCase(), path).toContain("archiv");
      expect(op.description).not.toContain("grows every week");
    }
  });
  it("labels retained live readers as archived without breaking their links", async () => {
    for (const path of ["/zodiac", "/zodiac/archive?view=compact", `/zodiac/0x${"1".repeat(40)}`]) {
      const body = record(await (await read(path)).json());
      expect(body.status, path).toBe("archived");
    }
    const menu = record(await (await read("/menu.json")).json());
    const docs = record(menu.store);
    expect(docs.zodiac).toBe(`${BASE}/zodiac`);
    expect(docs.zodiac_archive).toBe(`${BASE}/zodiac/archive`);
  });
});
