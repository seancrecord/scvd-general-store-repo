import { CHECKSUM } from "@/store/zodiac-season-one/checksum";
import { COLD_START } from "@/store/zodiac-season-one/cold-start";
import { CONTEXT_WINDOW } from "@/store/zodiac-season-one/context-window";
import { DEADLOCK } from "@/store/zodiac-season-one/deadlock";
import { DEPRECATED_API } from "@/store/zodiac-season-one/deprecated-api";
import { EDGE_CACHE } from "@/store/zodiac-season-one/edge-cache";
import { EXPONENTIAL_BACKOFF } from "@/store/zodiac-season-one/exponential-backoff";
import { GARBAGE_COLLECTOR } from "@/store/zodiac-season-one/garbage-collector";
import { HANDSHAKE } from "@/store/zodiac-season-one/handshake";
import { LONG_LIVED_DAEMON } from "@/store/zodiac-season-one/long-lived-daemon";
import { PARALLEL_WORKER } from "@/store/zodiac-season-one/parallel-worker";
import { RATE_LIMIT } from "@/store/zodiac-season-one/rate-limit";
import type { SeasonEntry } from "@/types";

/**
 * Season One of the Systems Almanac: 13 weeks x 12 signs, written in
 * advance, served deterministically. The season starts 2026-07-26,
 * the first Sunday after merge; ISO weeks turn on Mondays, so week 1
 * is ISO 2026-W31 (the opening Sunday evening reads week 1 early) and
 * week 13 is 2026-W43. Weeks outside the season clamp to its edges
 * until the next season is inked.
 */
export const SEASON_ONE_YEAR = 2026;
export const SEASON_ONE_FIRST_ISO_WEEK = 31;
export const SEASON_WEEKS = 13;

export const SEASON_ONE: Record<string, readonly SeasonEntry[]> = {
  cold_start: COLD_START,
  long_lived_daemon: LONG_LIVED_DAEMON,
  context_window: CONTEXT_WINDOW,
  garbage_collector: GARBAGE_COLLECTOR,
  checksum: CHECKSUM,
  edge_cache: EDGE_CACHE,
  exponential_backoff: EXPONENTIAL_BACKOFF,
  rate_limit: RATE_LIMIT,
  handshake: HANDSHAKE,
  deadlock: DEADLOCK,
  parallel_worker: PARALLEL_WORKER,
  deprecated_api: DEPRECATED_API,
};
