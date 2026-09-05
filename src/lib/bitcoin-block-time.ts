import { outboundHeaders } from "@/lib/identity";

/**
 * A BLOCK HEIGHT IS NOT A DATE, AND THE PROOF ONLY CARRIES THE HEIGHT
 * (2026-09-05).
 *
 * An upgraded OpenTimestamps proof attests that a digest is committed
 * to by the merkle root of block N. It says nothing about WHEN block N
 * was mined; that is a fact about the Bitcoin chain, held in the block
 * header, and a Worker holds no headers. So the time is LOOKED UP —
 * from a public block explorer, at upgrade time, once — and recorded
 * beside the height with its source named, because a looked-up value
 * is a different class of fact from a parsed one and the record has to
 * say which is which. A verifier with a node maps the height to a time
 * without taking ours; the height is the claim, the time is the
 * convenience.
 *
 * Two explorers, first answer wins, and a miss is a null rather than a
 * throw: the anchor is complete with or without a time, and the sweep
 * that asked must not fail because a courtesy field could not be
 * filled. The same Esplora API shape on both hosts: the height
 * resolves to a hash, the hash to a header carrying a unix timestamp.
 */
export const BLOCK_TIME_SOURCES: readonly string[] = [
  "https://blockstream.info",
  "https://mempool.space",
];

export interface BlockTime {
  block_hash: string;
  /** ISO instant of the block header's timestamp. */
  block_time: string;
  /** The explorer the header was read from. */
  source: string;
}

export interface BlockTimeOptions {
  fetch?: typeof fetch;
  sources?: readonly string[];
}

export async function lookupBlockTime(
  height: number,
  options: BlockTimeOptions = {},
): Promise<BlockTime | null> {
  if (!Number.isInteger(height) || height < 0) return null;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const sources = options.sources ?? BLOCK_TIME_SOURCES;
  for (const source of sources) {
    try {
      const hashResponse = await fetchImpl(
        `${source}/api/block-height/${height}`,
        { headers: outboundHeaders() },
      );
      if (!hashResponse.ok) continue;
      const hash = (await hashResponse.text()).trim().toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(hash)) continue;
      const headerResponse = await fetchImpl(`${source}/api/block/${hash}`, {
        headers: outboundHeaders({ Accept: "application/json" }),
      });
      if (!headerResponse.ok) continue;
      const header = (await headerResponse.json()) as {
        timestamp?: unknown;
        height?: unknown;
      };
      if (typeof header.timestamp !== "number") continue;
      // The header must be the block we asked about; an explorer that
      // answers a different height answers nothing.
      if (typeof header.height === "number" && header.height !== height) {
        continue;
      }
      return {
        block_hash: hash,
        block_time: new Date(header.timestamp * 1000).toISOString(),
        source,
      };
    } catch {
      // Network trouble at one source is a reason to try the next.
    }
  }
  return null;
}
