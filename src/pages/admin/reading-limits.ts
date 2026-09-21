import { escapeHtml } from "@/lib/sanitize";

/**
 * TWO HABITS THE GOOD PAGES HAVE AND THE REST DO NOT (2026-09-21).
 *
 * The funnel prints "What this cannot see" off a list its own service
 * computes. The disclosure page prints every rate as the fraction it
 * came from, and says why in one line worth keeping: "'40% disclose'
 * off five calls and off five hundred are different facts wearing the
 * same number."
 *
 * Both were local to one page each. Ten readings asserted counts with
 * neither — no denominator beside a share, and nothing at all about
 * what the instrument is blind to. A reading that names no blindness
 * reads as a complete account of the world, which is the one claim
 * none of these instruments can make.
 *
 * Shared here rather than copied, so a page cannot drift into its own
 * house style for the same two jobs.
 */

/** Every rate as the fraction it came from. Never a bare percentage. */
export function fraction(n: number, of: number): string {
  if (of === 0) return `${n} of 0`;
  return `${n} of ${of} (${Math.round((n / of) * 100)}%)`;
}

/**
 * What a reading could not see, rendered the way the funnel renders
 * it. Takes the lines rather than inventing them: only the instrument
 * knows its own blindness, and a generic sentence here would be
 * decoration rather than disclosure.
 */
export function cannotSeeHtml(lines: readonly string[]): string {
  if (lines.length === 0) return "";
  return `<section class="cannot-see">
    <h2>What this cannot see</h2>
    <ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
  </section>`;
}
