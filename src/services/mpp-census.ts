import { UNPAID_READ_NOTE } from "@/lib/mpp-challenge";
import type { MppBlock } from "@/services/mpp-battery";
import type { WardHostResult } from "@/services/ward-round";

/** Challenge bytes remain in evidence; no second recipient index. */
export type MppCensusReading = Omit<MppBlock, "challenges"> & {
  /** A truncated capture cannot establish whether the problem body is valid. */
  body_complete: boolean;
};

export interface MppCensus {
  probed: number;
  measured: number;
  /** Answered rows that predate the reader or lack its saved result. */
  unmeasured: number;
  unreachable: number;
  not_probed: number;
  speaking_mpp: number;
  mpp_only: number;
  both: number;
  x402_only: number;
  neither: number;
  batteries: string[];
}

export const MPP_CENSUS_NOTE = "MPP challenges read from the same unpaid response. measured counts answered rows carrying both the saved MPP battery and protocols_spoken; unmeasured counts answered rows without them. Unreachable and not-probed rows supply no protocol observation. The x402 verdict keeps its meaning; credentials, delivery and receipts were not observed. " + UNPAID_READ_NOTE;

/** Count stored readings only. A missing legacy field is never a negative. */
export function mppCensusOf(rows: readonly WardHostResult[]): MppCensus {
  const result: MppCensus = { probed: 0, measured: 0, unmeasured: 0, unreachable: 0, not_probed: 0, speaking_mpp: 0, mpp_only: 0, both: 0, x402_only: 0, neither: 0, batteries: [] };
  const batteries = new Set<string>();
  for (const row of rows) {
    if (row.verdict === "not_probed") { result.not_probed++; continue; }
    result.probed++;
    if (row.verdict === "unreachable") { result.unreachable++; continue; }
    if (!row.mpp || !row.protocols_spoken) { result.unmeasured++; continue; }
    result.measured++;
    batteries.add(row.mpp.battery);
    const x402 = row.protocols_spoken.includes("x402");
    const mpp = row.protocols_spoken.includes("mpp");
    if (mpp) result.speaking_mpp++;
    if (mpp && x402) result.both++;
    else if (mpp) result.mpp_only++;
    else if (x402) result.x402_only++;
    else result.neither++;
  }
  result.batteries = [...batteries].sort();
  return result;
}

export function mppCensusLine(reading: MppCensus): string {
  return `MPP challenges: ${reading.speaking_mpp} of ${reading.measured} measured responses, from ${reading.probed} probed doors; ${reading.mpp_only} MPP-only, ${reading.both} both protocols. ${reading.unmeasured} answered without a saved MPP reading, ${reading.unreachable} unreachable, ${reading.not_probed} not probed.`;
}
