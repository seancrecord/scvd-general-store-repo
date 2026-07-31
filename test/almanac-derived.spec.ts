import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { saveAlmanacEntry } from "@/services/almanac-store";
import type { Env } from "@/types";

/**
 * THREE OF THE FOUR BOXES WERE TRANSCRIPTION.
 *
 * The keeper's complaint, and it had been true since the form was
 * built: four required fields to publish a journal entry, of which one
 * is the writing. The almanac is the only shelf a stranger has ever
 * bought from, so friction here is not cosmetic — it is friction on
 * the single highest-leverage thing this store does.
 */
describe("the page speaks for itself", () => {
  const BODY = [
    "# Notes from a Wednesday",
    "",
    "*From the Keeper's Almanac.*",
    "",
    "**2026-07-31, Oak City.**",
    "",
    "The heat broke about four and the whole street came outside at once.",
  ].join("\n");

  it("takes the title and slug from the first heading", async () => {
    const result = await saveAlmanacEntry(env as Env, { markdown: BODY });
    expect(result.refused).toBeUndefined();
    expect(result.saved?.title).toBe("Notes from a Wednesday");
    expect(result.saved?.slug).toBe("notes-from-a-wednesday");
  });

  it("takes the teaser from the first real sentence, not the furniture", async () => {
    // The house style opens with an italic standfirst and a bold
    // dateline. Both are furniture; selling the index line on
    // "From the Keeper's Almanac." would be selling nothing.
    const result = await saveAlmanacEntry(env as Env, { markdown: BODY });
    expect(result.saved?.teaser).toBe(
      "The heat broke about four and the whole street came outside at once.",
    );
  });

  it("defaults the date to today, and lets it be overridden", async () => {
    const today = await saveAlmanacEntry(env as Env, { markdown: BODY });
    expect(today.saved?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // The override matters more than the default: the date is the day
    // the entry is ABOUT, which is often not today, and that is
    // exactly the kind of thing a default must not silently decide.
    const about = await saveAlmanacEntry(env as Env, {
      markdown: BODY,
      date: "2026-07-07",
    });
    expect(about.saved?.date).toBe("2026-07-07");
  });

  it("prefers what the keeper typed over what it could derive", async () => {
    const result = await saveAlmanacEntry(env as Env, {
      markdown: BODY,
      title: "A Better Title",
      teaser: "A line he wrote on purpose.",
    });
    expect(result.saved?.title).toBe("A Better Title");
    expect(result.saved?.teaser).toBe("A line he wrote on purpose.");
  });

  it("refuses rather than inventing a title it cannot find", async () => {
    // A wrong title becomes a permanent URL. A derived value that
    // quietly guesses is worse than one that stops — the week's
    // lesson, applied to the one field that cannot be taken back.
    const result = await saveAlmanacEntry(env as Env, {
      markdown: "Just some prose with no heading at all.",
    });
    expect(result.saved).toBeUndefined();
    expect(result.refused).toMatch(/# heading/);
  });

  it("refuses when there is a heading but nothing to sell the index on", async () => {
    const result = await saveAlmanacEntry(env as Env, {
      markdown: "# A Title\n\n*From the Keeper's Almanac.*",
    });
    expect(result.saved).toBeUndefined();
    expect(result.refused).toMatch(/teaser/i);
  });
});
