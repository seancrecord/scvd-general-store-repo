import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { readVisitorsRegister } from "@/lib/register";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE VISITORS' REGISTER, WITH CV'S TWO CONDITIONS AS TESTS.
 *
 * 1. NO COUNT. His reasoning is the best argument anyone has made about
 *    a thin page: a number beside near-nothing invites comparison to a
 *    scale nobody claimed, which is how a competitor's near-empty
 *    leaderboard read as proof against their own pitch rather than as
 *    evidence of being early. Names and dates invite reading.
 *
 * 2. NOT A SECOND PAGE FOR THE SAME DATA. He pulled the storefront live
 *    and found the wall already showing guestbook entries. Checked: the
 *    wall shows THREE and draws ONE signal, so this is the full version
 *    of a truncated view plus a second consented source. The wall now
 *    links here rather than competing.
 */
describe("the visitors' register", () => {
  it("publishes no total, anywhere", async () => {
    const body = (await (
      await SELF.fetch("https://scvd.store/visitors")
    ).json()) as Record<string, unknown>;
    for (const banned of ["count", "total", "signers_count", "visitors"]) {
      expect(
        Object.hasOwn(body, banned),
        `the register publishes a "${banned}" field`,
      ).toBe(false);
    }
    // The HTML must not carry one either.
    const page = await (
      await SELF.fetch("https://scvd.store/visitors", {
        headers: { Accept: "text/html" },
      })
    ).text();
    expect(/\b\d+\s+(visitors|signers|patrons)\b/i.test(page)).toBe(false);
  });

  it("says every name was volunteered, and that absence means nothing", async () => {
    const register = await readVisitorsRegister(testEnv);
    expect(register.honest_limit).toContain("chose to leave a name");
    expect(register.honest_limit).toContain("not a headcount");
    // The sentence that keeps a thin page honest rather than sad.
    expect(register.honest_limit).toContain("didn't sign");
  });

  it("carries both consented signals, not just the one the wall shows", async () => {
    const register = await readVisitorsRegister(testEnv);
    expect(Array.isArray(register.signers)).toBe(true);
    expect(Array.isArray(register.bearers)).toBe(true);
  });

  it("shows a signer whole, where the wall shows three", async () => {
    await SELF.fetch("https://scvd.store/api/guestbook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "register-spec",
        message: "Signed to prove the book opens.",
      }),
    });
    const register = await readVisitorsRegister(testEnv);
    const signed = register.signers.find(
      (entry) => entry.name === "register-spec",
    );
    expect(signed, "a fresh signature never reached the register").toBeTruthy();
    expect(signed?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("is reachable from the wall it completes", async () => {
    const page = await (
      await SELF.fetch("https://scvd.store/", { headers: { Accept: "text/html" } })
    ).text();
    expect(page).toContain('href="/visitors"');
  });

  it("has no leaderboard SHAPE, while saying plainly it is not one", async () => {
    // First cut of this test banned the word "leaderboard" and failed on
    // the page's own sentence disclaiming it — the copy uses the word to
    // say what it is NOT, which is the store's whole habit. Test the
    // shape instead: no ranks, no positions, no top-anything.
    const page = await (
      await SELF.fetch("https://scvd.store/visitors", {
        headers: { Accept: "text/html" },
      })
    ).text();
    expect(page).not.toMatch(/top\s+(visitor|patron|agent|signer)/i);
    expect(page).not.toMatch(/\brank(ed|ing)?\b/i);
    expect(page).not.toMatch(/#\s?1\b/);
    // And it does disclaim the shape out loud.
    expect(page.toLowerCase()).toContain("not a leaderboard");
  });
});
