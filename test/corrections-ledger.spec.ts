import { describe, expect, it } from "vitest";
import { CORRECTIONS } from "@/store/corrections";

/**
 * THE LEDGER IS DERIVED FROM ITS DIRECTORY (2026-09-04). Two sessions
 * prepending to one array collided twice in an afternoon; now each
 * entry is a file and the array is generated. This holds the served
 * array to the files on disk so a forgotten `npm run corrections:index`
 * fails the build instead of quietly unpublishing a correction.
 */
const onDisk = import.meta.glob("../src/store/corrections-ledger/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("the corrections ledger, one file per entry", () => {
  const entryFiles = Object.keys(onDisk)
    .map((p) => p.split("/").pop() ?? "")
    .filter((n) => /^\d{4}-\d{2}-\d{2}-.+\.ts$/.test(n));

  it("serves exactly as many corrections as there are entry files", () => {
    expect(entryFiles.length).toBeGreaterThanOrEqual(30);
    expect(CORRECTIONS.length).toBe(entryFiles.length);
  });

  it("serves them newest first, matching the filenames' dates", () => {
    const dates = CORRECTIONS.map((c) => c.date);
    const sorted = [...dates].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
    expect(dates).toEqual(sorted);
    const fileDates = entryFiles.map((n) => n.slice(0, 10)).sort((a, b) => (a < b ? 1 : -1));
    expect(dates).toEqual(fileDates);
  });

  it("names every entry file in the generated index", () => {
    const index = onDisk[Object.keys(onDisk).find((p) => p.endsWith("/index.ts")) ?? ""] as string;
    for (const file of entryFiles) {
      expect(index, `${file} is not in index.ts — run npm run corrections:index`).toContain(`"./${file.replace(/\.ts$/, "")}"`);
    }
  });
});
