import type { Correction } from "./types";

export const correction: Correction = {
  date: "2026-09-15",
  what_was_wrong:
    "This store published, in research/treaty-exchange-2026-09-11/README.md, that the claim binding on StillOS Notary receipt e851b71a…0329d799 was 'unreproducible by anyone, permanently'. That was not our observation to make. We had established only that we could not reproduce it from the claim text, and that the issuer told us the preimage was not stored and a field inside it had since changed. We turned an issuer's account of their own records into a permanent fact about the world, and put the word 'anyone' in it. On 2026-09-15 the issuer supplied the preimage: 827 bytes whose SHA-256 is 84310abb469fe44cbafe0710fafad24e204f94e262e48cb1df97bf961f4b60a6, exactly the claim_sha256 the receipt carries. It reproduces, by anyone, from bytes now published.",
  how_long:
    "Live from 2026-09-13, when the sentence merged in PR #666, to 2026-09-15. Two days on a public research record. No signed artifact carried the claim: it appeared in a research README and in the issue thread, not in any certificate, verdict or defect class.",
  found_by:
    "StillOS Notary (stillosdigitalholdings.com), by producing the preimage we had said could not exist. The reproduction was then checked here with Node's own crypto against the published claim_sha256.",
  what_changed:
    "The record now states what we actually observed and no more: that we could not reproduce the binding from the claim text, that the issuer reported the preimage unstored, and that it was later supplied and reproduces. The general rule this cost us is written beside it — an issuer's account of their own internals is evidence about their records, never a fact about what is possible, and 'permanently' and 'by anyone' are claims no observer earns from one failed reproduction. verify.mjs already refused to pass a binding it could not check, and it hashed the supplied bytes without change; the defect was in prose, which is where this store's unfalsifiable claims have always appeared.",
};
