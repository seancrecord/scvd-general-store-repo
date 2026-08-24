import { BASE_EVM, POLYGON_EVM } from "@/lib/base-rpc";
import {
  BASE_NETWORK,
  POLYGON_NETWORK,
  SOLANA_NETWORK,
} from "@/lib/payments";
import { SOLANA_CHAIN } from "@/lib/solana-rpc";
import {
  KNOWN_CHAINS,
  SANDBOX_CHAIN,
  type EvidenceSubject,
} from "@/evidence/subject";
import type { CoverageDepth, EvidenceCoverage } from "@/evidence/types";

/**
 * THE COVERAGE MATRIX (M1 / roadmap 1.4).
 *
 * "We observe three chains" is true of ONE class (settlement
 * attestation) and a lie about the rest. B12's law applies to chain
 * coverage the way it applies to checks: absence is stated, never
 * implied. This file is the one derived table (class × chain ×
 * depth). Every known chain is present on every row — `none` is a
 * value, not a missing key.
 *
 * DERIVED FROM THE MODULES THAT ALREADY KNOW, not from a typed
 * brochure. Attestation reads the RPC chain constants; the till
 * reads the payment-rail constants; the field walk is the till's
 * Base rail (launch-check.ts filters accepts to that network — this
 * file does not import that service, so the two chats do not collide).
 * A new class is a new registration; a new chain is a KNOWN_CHAINS
 * row, and every class picks it up as `none` until registered.
 */

export const COVERAGE_DEPTHS: readonly CoverageDepth[] = [
  "none",
  "challenge",
  "read",
  "till",
  "walk",
] as const;

export const DEPTH_MEANS: Readonly<Record<CoverageDepth, string>> = {
  none: "This class does not operate on this chain.",
  challenge:
    "We will read a 402 that offers this chain. We do not settle, walk, or read the chain.",
  read: "We read public chain state (a claimed tx, a wallet window, an oracle).",
  till: "We accept payment on this rail.",
  walk: "We pay someone else's door on this rail from the field wallet.",
};

export interface ClassCoverageRegistration {
  class_id: string;
  /** What this class does — the sentence a partner reads. */
  does: string;
  /**
   * Depths for chains this class actually touches. Every other
   * KNOWN_CHAIN is filled as `none` by `rowFor` — do not list them.
   */
  depths: Readonly<Partial<Record<string, CoverageDepth>>>;
}

const CHALLENGE_MAINNETS: Readonly<Partial<Record<string, CoverageDepth>>> = {
  [BASE_NETWORK]: "challenge",
  [POLYGON_NETWORK]: "challenge",
  [SOLANA_NETWORK]: "challenge",
};

/**
 * The classes that produce signed observations, registered against
 * the chain ids the implementing modules already export. Adding a
 * class here is the coverage claim; the matrix test refuses a row
 * whose chain id is not in KNOWN_CHAINS.
 */
export const COVERAGE_REGISTRATIONS: readonly ClassCoverageRegistration[] = [
  {
    class_id: "settlement_attestation",
    does: "Independent on-chain read of a claimed settlement. Identifier shape picks the chain.",
    depths: {
      [BASE_EVM.caip2]: "read",
      [POLYGON_EVM.caip2]: "read",
      [SOLANA_CHAIN]: "read",
    },
  },
  {
    class_id: "the_statement",
    does: "Wallet-window USDC in/out, observed from the chain walks, signed by neither party.",
    depths: {
      [BASE_EVM.caip2]: "read",
      [POLYGON_EVM.caip2]: "read",
      [SOLANA_CHAIN]: "read",
    },
  },
  {
    class_id: "till",
    does: "We accept USDC on these rails. Polygon and Solana are flag-gated; the code can offer them.",
    depths: {
      [BASE_NETWORK]: "till",
      [POLYGON_NETWORK]: "till",
      [SOLANA_NETWORK]: "till",
    },
  },
  {
    class_id: "launch_check",
    does: "One real purchase attempt from the field wallet. The wallet pays Base USDC only.",
    depths: { [BASE_NETWORK]: "walk" },
  },
  {
    class_id: "sanctions_screen",
    does: "Chainalysis on-chain oracle, Base USDC addresses. Not a Solana screen.",
    depths: { [BASE_NETWORK]: "read" },
  },
  {
    class_id: "service_audit",
    does: "Point-in-time unpaid (and paid-where-offered) look at a door's 402.",
    depths: CHALLENGE_MAINNETS,
  },
  {
    class_id: "standing_watch",
    does: "Repeated unpaid looks at one door across a window.",
    depths: CHALLENGE_MAINNETS,
  },
  {
    class_id: "conformance_watch",
    does: "The conformance battery, daily, for a week.",
    depths: CHALLENGE_MAINNETS,
  },
  {
    class_id: "ward_round",
    does: "Weekly census walk of listed doors.",
    depths: CHALLENGE_MAINNETS,
  },
  {
    class_id: "preflight",
    does: "Free unpaid read of a 402 challenge. Flags testnet; does not walk.",
    depths: CHALLENGE_MAINNETS,
  },
] as const;

export function coverageClassIds(): string[] {
  return COVERAGE_REGISTRATIONS.map((entry) => entry.class_id);
}

export function registrationFor(
  classId: string,
): ClassCoverageRegistration | undefined {
  return COVERAGE_REGISTRATIONS.find((entry) => entry.class_id === classId);
}

/** Every KNOWN_CHAIN stated. Sandbox stays `none` unless registered. */
export function rowFor(
  registration: ClassCoverageRegistration,
): Record<string, CoverageDepth> {
  const row: Record<string, CoverageDepth> = {};
  for (const chain of KNOWN_CHAINS) {
    row[chain] = registration.depths[chain] ?? "none";
  }
  return row;
}

export interface CoverageMatrixRow {
  class_id: string;
  does: string;
  chains: Record<string, CoverageDepth>;
}

export function coverageMatrix(): CoverageMatrixRow[] {
  return COVERAGE_REGISTRATIONS.map((entry) => ({
    class_id: entry.class_id,
    does: entry.does,
    chains: rowFor(entry),
  }));
}

/** The envelope block: this observation's depth plus the class row. */
export function envelopeCoverage(
  classId: string,
  subject: Pick<EvidenceSubject, "chain">,
): EvidenceCoverage | null {
  const registration = registrationFor(classId);
  if (!registration) return null;
  const chains = rowFor(registration);
  const chain = subject.chain;
  const depth =
    chain === "none" ? "none" : (chains[chain] ?? "none");
  return { class_id: classId, depth, class_row: chains };
}

export function isCoverageDepth(value: unknown): value is CoverageDepth {
  return (
    typeof value === "string" &&
    (COVERAGE_DEPTHS as readonly string[]).includes(value)
  );
}

export function publicCoverageDocument(base: string): Record<string, unknown> {
  return {
    what: "Stated coverage: observation class × chain × depth. Absence is `none`, never implied. Derived from the modules that already know the chain ids — not a brochure.",
    schema: "scvd-coverage/v1",
    matrix_url: `${base}/.well-known/coverage.json`,
    depths: DEPTH_MEANS,
    chains: [...KNOWN_CHAINS],
    sandbox_chain: SANDBOX_CHAIN,
    sandbox_note:
      "Listed so a subject on it is valid. No production class claims depth there.",
    matrix: coverageMatrix(),
    does_not_prove:
      "That a given door on a covered chain will be observed, or that a till rail is lit on this deployment (Polygon and Solana are flag-gated).",
  };
}
