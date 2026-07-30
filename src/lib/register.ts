import { KV_KEYS } from "@/lib/kv-keys";
import { listGuestbook } from "@/services/guestbook";
import type { Env } from "@/types";

/**
 * THE VISITORS' REGISTER — everybody who chose to leave a name.
 *
 * CV validated the shape on 2026-07-29 and caught something live while
 * he was at it: the storefront ALREADY shows guestbook entries under
 * "SIGNED THE WALL," so he asked whether a register would just be a
 * second page for the same data.
 *
 * CHECKED, AND HE WAS HALF RIGHT, which is the useful half:
 *
 *   - The wall shows THREE entries. `.slice(0, 3)`. It is a preview and
 *     was never anything else, so the register is the full version of a
 *     truncated view rather than a duplicate of a complete one.
 *   - And the wall draws ONE signal. The register unions two: guestbook
 *     signers, and named stamp bearers, who chose a name for a
 *     Countermark card and are nowhere on the storefront at all.
 *
 * So it is not duplication — but his instinct was right enough to
 * change the build: the wall now LINKS here rather than competing, and
 * the register is the same data seen whole.
 *
 * NO COUNT, ALSO HIS, and the reasoning is the best argument anyone has
 * made about an empty page: a number beside near-nothing invites the
 * comparison that hurt a competitor's leaderboard — near-populated,
 * every score near zero, and the emptiness read as proof against the
 * pitch rather than evidence of being early. Names and dates invite
 * reading. A tally invites arithmetic. So there is no tally.
 *
 * EVERY NAME HERE WAS VOLUNTEERED. Nothing is inferred, nothing is
 * derived from a wallet, and no visitor who did not choose to appear
 * appears. Rule 22 bans every mechanic that would fill this
 * artificially, which is exactly why it is allowed to be thin.
 */

export interface RegisterSigner {
  name: string;
  /** ISO date, day precision. Nobody needs the minute. */
  date: string;
  said: string;
}

export interface RegisterBearer {
  name: string;
  /** ISO weeks the bearer's card was punched. Their own visits. */
  weeks: string[];
}

export interface VisitorsRegister {
  signers: RegisterSigner[];
  bearers: RegisterBearer[];
  honest_limit: string;
}

const REGISTER_LIMIT =
  "Everybody here chose to leave a name — a signed guestbook entry, or a name chosen for a Countermark card. Nothing on this page is inferred, derived from a wallet, or counted on anyone's behalf, and a visitor who did not sign does not appear. It is not a headcount and it is not a leaderboard: there is deliberately no total, because a number beside a short list invites comparison to a scale nobody claimed. Read it as a register in a shop doorway. Absence from it means somebody came in and didn't sign, which is most of them.";

const SIGNER_CAP = 200;
const BEARER_CAP = 200;

/** A name slug back to something readable, without inventing capitals. */
function readableSlug(slug: string): string {
  return slug.replace(/-+/g, " ").trim();
}

export async function readVisitorsRegister(
  env: Env,
): Promise<VisitorsRegister> {
  const entries = await listGuestbook(env, SIGNER_CAP);
  const signers: RegisterSigner[] = entries.map((entry) => ({
    name: entry.name,
    date: entry.date.slice(0, 10),
    said: entry.message,
  }));

  const bearers: RegisterBearer[] = [];
  // Cards live in PATRONS, not GUESTBOOK — checked rather than assumed.
  const cards = await env.PATRONS.list({
    prefix: KV_KEYS.stampCard(""),
    limit: BEARER_CAP,
  });
  for (const key of cards.keys) {
    const slug = key.name.slice(KV_KEYS.stampCard("").length);
    if (slug.length === 0) {
      continue;
    }
    const raw = await env.PATRONS.get(key.name);
    let weeks: string[] = [];
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        weeks = Array.isArray(parsed)
          ? parsed.filter((week): week is string => typeof week === "string")
          : [];
      } catch {
        weeks = [];
      }
    }
    bearers.push({ name: readableSlug(slug), weeks });
  }

  return { signers, bearers, honest_limit: REGISTER_LIMIT };
}
