import { Hono } from "hono";
import { checkProbeTarget } from "@/lib/probe-target";
import { kvGet, kvPut } from "@/lib/kv-retry";
import { currentWeekKey } from "@/lib/kv-keys";
import { appendDeclaredDoor } from "@/services/long-walk";
import {
  WELL_KNOWN_AGENT_CARD_PATH,
  WELL_KNOWN_DOOR_CAP,
  WELL_KNOWN_X402_PATH,
  readWellKnownDoors,
  readWellKnownStore,
  recordWellKnownRead,
  writeWellKnownStore,
} from "@/services/well-known-doors";
import type { HonoEnv } from "@/types";

/**
 * DECLARE A DOOR (2026-09-04; the keeper: "could we add a way to add
 * apis to walk or somehow pick up doors that arent on bazaar?").
 *
 * The census walks doors, not homepages, and its roster comes from
 * the discovery feed. A host the feed does not name was "listed, not
 * walked" every week with no way in — until 2026-09-04, when one wrote
 * to ask why his twenty-two ready endpoints had never been read.
 *
 * The weekly sweep (services/long-walk.ts) now reads every name-only
 * host's own /.well-known/x402. This door is the same read, by hand,
 * today: an operator names their host, and the store reads THAT
 * HOST'S OWN FILE and nothing else. A door it declares for itself
 * joins this week's roster and is knocked on by the next hourly
 * firing.
 *
 * THE CONSENT LINE is the whole design. Nobody can put a URL in front
 * of the census; they can only point it at a host's own published
 * declaration, and a file may only declare doors on the host that
 * serves it. A stranger cannot volunteer someone else's door, because
 * the only thing this desk will read is the file at the named host.
 * Proof of control is the file itself, the same principle as the
 * standing note's host lane.
 *
 * BOUNDED: one read by hand per host per day, three GETs at most, and
 * never a knock — the walk knocks, on the walk's budget.
 *
 * RULE 52, in the answer: doors, none, unreadable are three words and
 * the response uses the one the read earned.
 */
export const declareDoorRoutes = new Hono<HonoEnv>();

export const DECLARE_DOOR_TTL_SECONDS = 24 * 60 * 60;
const throttleKey = (host: string) => `declare_door:${host}`;

const HOSTNAME = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/;

function readHost(raw: unknown, ownHost: string): { host: string } | { error: string } {
  if (typeof raw !== "string") return { error: "host must be a string: the bare hostname, e.g. \"payforapi.com\"." };
  const host = raw.trim().toLowerCase();
  if (host === "" || host.includes("/") || host.includes(":") || host.includes("@") || /\s/.test(host)) {
    return { error: "host must be a bare hostname — no scheme, no path, no port. The file is read at https://{host}" + WELL_KNOWN_X402_PATH + "." };
  }
  if (!HOSTNAME.test(host)) return { error: `"${host}" is not a hostname this desk will read.` };
  if (host === ownHost) return { error: "This store does not read its own file here." };
  const verdict = checkProbeTarget(new URL(`https://${host}/`), ownHost);
  if (!verdict.ok) return { error: verdict.reason ?? "refused by the probe-target law." };
  return { host };
}

function explain(base: string) {
  return {
    what_this_is:
      "The way a host the discovery feed does not name gets into the census: serve your own /.well-known/x402 listing your doors, then name your host here and the store reads that file today. The weekly sweep reads the same file for every listed host on its own; this door is for not waiting a week.",
    the_consent_line:
      "The store reads only the file at the host you name — never a URL you hand it, never what anyone else says about that host — and a file may only declare doors on the host that serves it. A door on another host is counted as foreign and never walked. Proof of control is the file itself.",
    the_file: {
      path: WELL_KNOWN_X402_PATH,
      shape: { version: 1, resources: [{ resource: "https://{your-host}/api/your-door", type: "http" }] },
      also_read: `${WELL_KNOWN_AGENT_CARD_PATH}, one hop: an A2A agent card whose x402Discovery names such a file elsewhere; that file's own host is then the declaring host.`,
      cap: `${WELL_KNOWN_DOOR_CAP} doors a host; the census walks one door per host a week, the first declared, and keeps the rest on record.`,
      ours: `${base}${WELL_KNOWN_X402_PATH} — the same convention, served for this store.`,
    },
    how_to_call: `POST ${base}/api/declare-door with {"host": "your-host"}. No account, no key.`,
    the_words_that_come_back: {
      doors: "the file was read and declares at least one door on its own host; the first joins this week's roster and the next hourly firing knocks",
      none: "no file at either path, or a readable file declaring nothing — the host stays listed, not walked, until it serves one",
      unreadable: "a file the store could not read, parse, or that moved its shape; a redirect off-host counts here too. Not a finding about the host",
    },
    errors: {
      "400": "not a bare hostname, this store's own host, or a target the probe law refuses (private, odd port)",
      "429": "this host was read by hand within the day; the response says when it can be again",
    },
    one_per_day: `A host is read by hand at most once in ${DECLARE_DOOR_TTL_SECONDS / 3600} hours. The weekly sweep reads it regardless.`,
    what_happens_next:
      "A declared door is walked by the next hourly firing of the long walk, rides the Sunday round under source well-known, and the passport page and host history derive from that row like any other. It sits out the listed/gone delta: a host declaring itself is not a directory listing it.",
    example: `curl -X POST ${base}/api/declare-door -H 'Content-Type: application/json' -d '{"host":"payforapi.com"}'`,
  };
}

declareDoorRoutes.get("/api/declare-door", (c) => c.json(explain(c.env.STORE_BASE_URL)));

declareDoorRoutes.post("/api/declare-door", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const ownHost = new URL(base).host.toLowerCase();
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Send JSON: {\"host\": \"your-host\"}.", explained_at: `${base}/api/declare-door` }, 400);
  }
  const raw = typeof body === "object" && body !== null ? (body as Record<string, unknown>)["host"] : undefined;
  const parsed = readHost(raw, ownHost);
  if ("error" in parsed) return c.json({ error: parsed.error, explained_at: `${base}/api/declare-door` }, 400);
  const { host } = parsed;

  const seen = await kvGet(c.env.COUNTERS, throttleKey(host));
  if (seen) {
    const readAt = new Date(seen);
    const tryAfter = new Date(readAt.getTime() + DECLARE_DOOR_TTL_SECONDS * 1000).toISOString();
    return c.json(
      { error: "one declaration per host per day", host, read_by_hand_at: seen, try_after: tryAfter, note: "The weekly sweep reads this host regardless." },
      429,
    );
  }
  const now = new Date();
  await kvPut(c.env.COUNTERS, throttleKey(host), now.toISOString(), { expirationTtl: DECLARE_DOOR_TTL_SECONDS });
  const nextByHand = new Date(now.getTime() + DECLARE_DOOR_TTL_SECONDS * 1000).toISOString();

  const read = await readWellKnownDoors(host, ownHost);
  if (read.kind === "unreadable") {
    return c.json({ host, read, next_read_by_hand_after: nextByHand, what_this_means: "The store could not read the file. That is a fact about the read, not about your doors; fix what the reason names and try again tomorrow, or let the weekly sweep try." });
  }
  if (read.kind === "none") {
    return c.json({
      host,
      read,
      next_read_by_hand_after: nextByHand,
      how_to_be_found: explain(base).the_file,
      what_this_means: `No file at ${WELL_KNOWN_X402_PATH} or via the agent card, or a file declaring nothing. Serve one and name the host again tomorrow — or wait for the sweep, which reads every listed host weekly.`,
    });
  }

  const store = await readWellKnownStore(c.env);
  await writeWellKnownStore(c.env, recordWellKnownRead(store, host, read, currentWeekKey(), now.toISOString()).store);
  const door = read.doors[0];
  const walk = door ? await appendDeclaredDoor(c.env, read.declaring_host, door) : "no-door-on-own-host";
  return c.json({
    host,
    read,
    walk: {
      this_week: walk,
      door_the_census_will_knock_on: door ?? null,
      then:
        walk === "appended"
          ? "The next hourly firing of the long walk knocks on it; the Sunday round carries the row under source well-known; the passport page and host history derive from it."
          : walk === "already-on-roster"
            ? "This host is already on this week's roster; its row will come from that knock."
            : walk === "no-walk-this-week"
              ? "No walk is open this week yet; the declaration is on record and seeds next week's roster from the start."
              : "The file declares doors, but none on its own host — those are counted as foreign and never walked. Declare the door on the host that serves the file.",
    },
    next_read_by_hand_after: nextByHand,
  });
});
