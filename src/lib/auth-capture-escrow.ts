import { isSameAddress, type UsdcTransfer } from "@/lib/base-rpc";

/**
 * THE x402 `auth-capture` ESCROW SET, NAMED SO THE DESK CAN SAY WHAT
 * IT TOUCHED (2026-09-28).
 *
 * Under the scheme's `escrow` flow the settlement the buyer holds a
 * hash for is an `authorize`: USDC leaves the payer through a token
 * collector and lands in the AuthCaptureEscrow singleton, not at the
 * seller's payTo. The capture that pays the seller is a LATER
 * transaction, and so are void, refund and reclaim. A buyer who hands
 * the attestation desk that first hash with the seller as recipient
 * gets INSUFFICIENT_MATCH and a `none` binding — both true, neither
 * able to say why, because the desk had no vocabulary for "this leg
 * went into an escrow". This module is that vocabulary and nothing
 * more: it names the contact, it never moves the status.
 *
 * SOURCE, stated because these are hand-copied hex strings about
 * somebody else's contracts (AT_SCALE rule 1 asks for a derivation or
 * a refusal; the derivation here is a citation): x402-foundation/x402,
 * specs/schemes/auth-capture/scheme_auth_capture_evm.md, "Commerce-
 * payments deployments" table, pinned by the protocol screen on
 * 2026-09-14 as blob 2739f01b8002075b9d3369b324c7bc2d6ebfd45f and
 * re-read byte-identical on main 2026-09-28. The spec states the set
 * is one canonical CREATE2 deployment, so the addresses are the same
 * on every chain that carries it; the desk applies them on every EVM
 * rail it reads and says nothing about chains where the set was never
 * deployed, because a transfer to an address with no code there is
 * still a transfer to that address. The v1.1 escrow's bytecode was
 * read on Base mainnet the day this shipped; the others were not
 * read and are carried on the spec's word, which the artifact says.
 *
 * NOT DONE HERE, on purpose: reading `paymentState(paymentInfoHash)`
 * or the lifecycle events. That is a lifecycle observation — a
 * different product, on the roadmap as a LATER row — and folding
 * half of it into a single-transfer desk would sell a claim the
 * battery cannot stand behind.
 */
export type AuthCaptureRole =
  | "escrow"
  | "eip3009_collector"
  | "permit2_collector"
  | "operator_refund_collector";

export type AuthCaptureDeployment = "v1.1" | "v1.0";

interface AuthCaptureContract {
  address: string;
  role: AuthCaptureRole;
  deployment: AuthCaptureDeployment;
}

export const AUTH_CAPTURE_CONTRACTS: readonly AuthCaptureContract[] = [
  { address: "0xf96815976523E00e65Be8f34cA5e64b4f41EB19c", role: "escrow", deployment: "v1.1" },
  { address: "0x8612dfdc421f80336cd14E8EF9cb1E765dB5ab88", role: "eip3009_collector", deployment: "v1.1" },
  { address: "0xD69831Aed5bfe262067ec4c751f4F830EcdD446e", role: "permit2_collector", deployment: "v1.1" },
  { address: "0x7a03443724d14798c4AB4622F1DAAcA761Fea486", role: "operator_refund_collector", deployment: "v1.1" },
  { address: "0xBdEA0D1bcC5966192B070Fdf62aB4EF5b4420cff", role: "escrow", deployment: "v1.0" },
  { address: "0x0E3dF9510de65469C4518D7843919c0b8C7A7757", role: "eip3009_collector", deployment: "v1.0" },
  { address: "0x992476B9Ee81d52a5BdA0622C333938D0Af0aB26", role: "permit2_collector", deployment: "v1.0" },
  { address: "0x934907bffd0901b6A21e398B9C53A4A38F02fa5d", role: "operator_refund_collector", deployment: "v1.0" },
];

export const AUTH_CAPTURE_SOURCE =
  "x402-foundation/x402 specs/schemes/auth-capture/scheme_auth_capture_evm.md, Commerce-payments deployments, blob 2739f01b8002075b9d3369b324c7bc2d6ebfd45f (pinned 2026-09-14, unchanged on main 2026-09-28)";

/** One USDC leg that touched the set: which contract, which way. */
export interface AuthCaptureLeg {
  contract: string;
  role: AuthCaptureRole;
  deployment: AuthCaptureDeployment;
  /** "into" — the set received the USDC; "out_of" — it paid the USDC out. */
  direction: "into" | "out_of";
  amount_atomic: string;
}

export interface AuthCaptureContact {
  scheme: "auth-capture";
  /** Every USDC transfer in the receipt that touched the set, in receipt order. */
  legs: AuthCaptureLeg[];
  source: string;
  reading: string;
}

const CONTACT_READING =
  "One or more USDC transfers in this transaction touched the x402 auth-capture escrow set (Base commerce-payments). Under that scheme the payment is a lifecycle: authorize places a hold in the escrow, capture pays the seller out of it later, and void, refund and reclaim move value back. A transfer into the set is a hold, not a payment to the seller; a transfer out of it is a capture, void or refund whose leg this artifact shows without naming which. This desk observes single transfers at one moment and did not read the escrow's payment state or lifecycle events, so the status and binding above are about the transfer asked, never about the lifecycle. The contract addresses are carried from the cited specification; only the v1.1 escrow's bytecode was read on Base.";

function contractAt(address: string): AuthCaptureContract | null {
  return AUTH_CAPTURE_CONTRACTS.find((c) => isSameAddress(c.address, address)) ?? null;
}

/**
 * Name every leg that touched the set; null when none did, so the
 * field's absence under the battery that introduced it means "looked,
 * found nothing" and never "did not look".
 */
export function authCaptureContact(transfers: readonly UsdcTransfer[]): AuthCaptureContact | null {
  const legs: AuthCaptureLeg[] = [];
  for (const transfer of transfers) {
    // Source before destination, so a collector → escrow hop reads in
    // the order the value moved.
    const outOf = contractAt(transfer.from);
    if (outOf) {
      legs.push({ contract: outOf.address, role: outOf.role, deployment: outOf.deployment, direction: "out_of", amount_atomic: transfer.amount.toString() });
    }
    const into = contractAt(transfer.to);
    if (into) {
      legs.push({ contract: into.address, role: into.role, deployment: into.deployment, direction: "into", amount_atomic: transfer.amount.toString() });
    }
  }
  if (legs.length === 0) return null;
  return { scheme: "auth-capture", legs, source: AUTH_CAPTURE_SOURCE, reading: CONTACT_READING };
}
