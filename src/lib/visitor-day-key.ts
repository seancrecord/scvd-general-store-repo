import { sha256Hex } from "@/lib/idempotency";

/**
 * ONE TURN A DAY WITHOUT KEEPING THE ADDRESS (2026-09-21).
 *
 * The bell and the letterbox each allow one turn per visitor per day,
 * keyed on the name the visitor gave. A visitor who gave none was
 * keyed on the connecting IP — written, raw, into a KV key that lived
 * a day — while the trust page said IPs are not stored. The page was
 * wrong about two doors, so the doors change to match the page.
 *
 * The key is a truncated digest of the day and the address. It holds
 * the same one-a-day line the address held, it expires with the day's
 * key, and it cannot be read back into an address by anybody who
 * does not already hold the address and the day. The IPv4 space is
 * small enough that a holder of the digest and a list of candidate
 * addresses could confirm one; this is why the trust page says
 * "digest" and not "anonymous", and why the digest is never published
 * or joined to anything else.
 */

const DIGEST_CHARS = 16;

/** The address as the edge saw it, or null off-platform and behind nothing. */
export function connectingAddress(header: (name: string) => string | undefined): string | null {
  const edge = header("CF-Connecting-IP");
  if (edge) return edge;
  const forwarded = header("X-Forwarded-For")?.split(",")[0]?.trim();
  return forwarded || null;
}

/** `v:<16 hex>` — a day's handle for one address, and nothing else. */
export async function visitorDayKey(address: string, day: string): Promise<string> {
  return `v:${(await sha256Hex(`visitor:${day}:${address}`)).slice(0, DIGEST_CHARS)}`;
}

/**
 * The name a nameless visitor is keyed under today. Null when the
 * edge named no address either, so the caller falls back to its
 * shared bucket the way it always has.
 */
export async function namelessVisitorKey(
  header: (name: string) => string | undefined,
  day: string,
): Promise<string | null> {
  const address = connectingAddress(header);
  return address ? visitorDayKey(address, day) : null;
}
