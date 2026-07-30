import SOLO_FOUNDER from "../../research/solo-ai-founder-scan.md?raw";
import STORE_SWEEP from "../../research/store-admin-sweep.md?raw";
import X402_PULSE from "../../research/x402-pulse.md?raw";

/**
 * CV'S RESEARCH TRAILS, read from markdown committed beside the code.
 *
 * The spec asked for these to be sourced from files in CV's own
 * workspace with a file-watch or a periodic re-read. A Cloudflare Worker
 * has no filesystem and cannot see his machine, so the adaptation is:
 * the files live in `research/`, he appends and commits, and Workers
 * Builds deploys `main` on push — an entry is live a couple of minutes
 * after it is written, with nothing wired up per entry, which is the
 * property the spec actually asked for.
 *
 * THE ALTERNATIVE WAS REFUSED ON PURPOSE: an endpoint CV could POST
 * notes to would have been the simpler build and a direct breach of the
 * corner's first guardrail. A window, not a lever — and a write path
 * into the office is a lever however narrowly it is scoped.
 *
 * PARSING IS DELIBERATELY DUMB. `## YYYY-MM-DD` starts an entry;
 * everything under it is that entry's body, kept as written. Anything
 * before the first date heading is kept as "undated" rather than
 * dropped, because silently losing somebody's note is worse than a
 * scruffy heading.
 */

export interface ResearchEntry {
  /** ISO date, or null when the writer didn't head the entry with one. */
  date: string | null;
  /** The entry's markdown body, exactly as written. */
  body: string;
}

export interface ResearchTrail {
  slug: string;
  title: string;
  /** The italic line under the title, when the file opens with one. */
  standfirst: string | null;
  /** Newest first. Undated entries sort last, never dropped. */
  entries: ResearchEntry[];
}

const DATE_HEADING = /^##\s+(\d{4}-\d{2}-\d{2})\s*$/;

/** True when a file is still the seeded stub rather than a real log. */
export function isUnfiled(trail: ResearchTrail): boolean {
  return trail.entries.every((entry) => entry.date === null);
}

export function parseTrail(slug: string, markdown: string): ResearchTrail {
  const lines = markdown.split("\n");
  let title = slug;
  let standfirst: string | null = null;
  const entries: ResearchEntry[] = [];
  let current: ResearchEntry | null = null;
  const preamble: string[] = [];

  for (const line of lines) {
    if (line.startsWith("# ") && title === slug) {
      title = line.slice(2).trim();
      continue;
    }
    const dated = DATE_HEADING.exec(line);
    if (dated) {
      if (current) {
        entries.push(current);
      }
      current = { date: dated[1] ?? null, body: "" };
      continue;
    }
    if (current) {
      current.body += `${line}\n`;
      continue;
    }
    // Still above the first dated entry.
    const italic = /^_(.+)_\s*$/.exec(line.trim());
    if (italic && standfirst === null) {
      standfirst = italic[1] ?? null;
      continue;
    }
    preamble.push(line);
  }
  if (current) {
    entries.push(current);
  }

  const leftover = preamble.join("\n").trim();
  if (leftover.length > 0) {
    entries.push({ date: null, body: leftover });
  }

  entries.sort((a, b) => {
    if (a.date === b.date) return 0;
    if (a.date === null) return 1;
    if (b.date === null) return -1;
    return b.date.localeCompare(a.date);
  });

  return {
    slug,
    title,
    standfirst,
    entries: entries.map((entry) => ({ ...entry, body: entry.body.trim() })),
  };
}

/** The three trails, in the order the spec listed them. */
export function readResearchTrails(): ResearchTrail[] {
  return [
    parseTrail("solo-ai-founder-scan", SOLO_FOUNDER),
    parseTrail("x402-pulse", X402_PULSE),
    parseTrail("store-admin-sweep", STORE_SWEEP),
  ];
}
