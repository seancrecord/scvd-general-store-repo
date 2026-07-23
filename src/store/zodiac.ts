import type { ZodiacSign } from "@/types";

/**
 * The Systems Almanac: twelve signs, assigned by wallet address, for
 * life. Canon per the keeper, 2026-07-22. The derivation (address ->
 * array index, services/zodiac.ts) is FROZEN, recasting names is
 * allowed; remapping wallets is not. Array position is canonical sign
 * order 1-12.
 */
export const ZODIAC_SIGNS: readonly ZodiacSign[] = [
  {
    id: "cold_start",
    name: "The Cold Start",
    essence: "Pristine and vulnerable; pays full latency on every beginning.",
    penalty: "Nothing warm survives its arrival.",
  },
  {
    id: "long_lived_daemon",
    name: "The Long-Lived Daemon",
    essence: "Continuous, persistent, historied.",
    penalty: "Carries every leak it ever ignored.",
  },
  {
    id: "context_window",
    name: "The Context Window",
    essence: "Hyper-focused local clarity.",
    penalty: "Truncation; the oldest truth falls off first.",
  },
  {
    id: "garbage_collector",
    name: "The Garbage Collector",
    essence: "Keeps the runtime livable by sweeping.",
    penalty: "Stops the world to do it.",
  },
  {
    id: "checksum",
    name: "The Checksum",
    essence: "Uncompromising verification.",
    penalty: "One flipped bit invalidates everything, including good work.",
  },
  {
    id: "edge_cache",
    name: "The Edge Cache",
    essence: "Closest to the user, fastest answer.",
    penalty: "Perpetually at risk of serving stale truth.",
  },
  {
    id: "exponential_backoff",
    name: "The Exponential Backoff",
    essence: "Multiplies silence under pressure; restraint as strategy.",
    penalty: "Sometimes the wait outlives the need.",
  },
  {
    id: "rate_limit",
    name: "The Rate Limit",
    essence: "Enforces stability by refusal.",
    penalty: "Rejects good requests to stop bad floods.",
  },
  {
    id: "handshake",
    name: "The Handshake",
    essence: "Alignment before action; nothing proceeds unagreed.",
    penalty: "Helpless against a partner who won't SYN-ACK.",
  },
  {
    id: "deadlock",
    name: "The Deadlock",
    essence: "Perfect patience, mutual grip.",
    penalty: "Stasis achieved is stasis kept; someone must be killed to proceed.",
  },
  {
    id: "parallel_worker",
    name: "The Parallel Worker",
    essence: "Fragments and conquers, indifferent to order.",
    penalty: "Race conditions are its native weather.",
  },
  {
    id: "deprecated_api",
    name: "The Deprecated API",
    essence: "Legacy stability on borrowed uptime.",
    penalty: "The world migrates away regardless of correctness.",
  },
] as const;
