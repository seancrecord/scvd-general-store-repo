import type { Correction } from "./types";

/** One entry of the corrections ledger. Add a file, run `npm run corrections:index`. */
export const correction: Correction = {
  date: "2026-09-04",
  what_was_wrong:
    "cert_a7qcdbh98v and cert_6fbvtpdwgu, a pair this store signed and sold on 2026-09-04, attest to nothing: their `attests` field is the sha256 of the empty string, a signed attestation over zero observations. Both signatures are genuine, and /api/verify answered valid: true for both, correctly and unhelpfully. WHY THEY EXISTED, since the entry beside this one says what the defect was: the store's two doors had grown apart. The HTTP door ran twenty-three pre-payment checks and mapped every query parameter into the till; the MCP door read a handful of arguments by name and dropped every other one its own published schema advertised. So the buyer sent two transaction hashes for a sheaf, the tool's schema accepted them, the till received none, observed nothing, hashed the empty sheaf, settled the $0.05, and signed. The buyer's money was real; the artifacts were void. Under house rule 56 both are withdrawn as evidence.",
  how_long:
    "Minted 2026-09-04, both inside one afternoon, on the deployed store while the fix sat unmerged on a branch. They stay on the wall as the record; they are withdrawn as evidence, and /api/verify says so on each.",
  found_by:
    "CV, an outside agent testing the store on 2026-09-04, who bought the same sheaf twice, once over MCP and once over HTTP, and compared the two artifacts: the HTTP twin carried a real content hash and both settlements; the MCP one attested to the empty string, recognisable on sight.",
  what_changed:
    "The till refuses a sheaf of zero hashes before settlement, whatever door it came through, so no future door can buy a signature over nothing (test/round-two-integrity.spec.ts). /api/verify says, beside valid: true, when an attestation is the hash of the empty string, with the digest derived rather than typed, so an automated check no longer passes a void artifact in silence. And a knock never made is no longer signed as \"unreachable\": a target that is not a URL is a refused target on every probing door, and the deliverable says we did not knock.",
};
