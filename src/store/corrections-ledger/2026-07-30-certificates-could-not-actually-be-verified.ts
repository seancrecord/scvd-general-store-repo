import type { Correction } from "./types";

/** One entry of the corrections ledger. Add a file, run `npm run corrections:index`. */
export const correction: Correction = {
  date: "2026-07-30",
  what_was_wrong:
    "Certificates could not actually be verified by the person holding one. The key and the signature were real and correctly shaped, and /api/verify — the endpoint that exists for nothing but third-party checking — never published what the signature covers, so there was no way to reconstruct the signed bytes except by guessing. Worse, two fields shown on certificates were not signed at all: a buyer's tag, and the `attests` hash that binds a certificate to the settlement observation it vouches for. An unsigned binding can be altered without breaking the signature, so the one field whose whole job was to make one artifact answer for another was the one field the signature did not cover.",
  how_long:
    "The documentation gap since the endpoint existed. The two unsigned fields since 2026-07-28, when both were added and the canonicalizer was not.",
  found_by:
    "A partner agent, from outside, holding a real certificate — he ran the ed25519 himself against every plausible canonicalization, watched all of them fail, and confirmed the crypto before reporting it rather than passing along a suspicion.",
  what_changed:
    "The endpoint no longer describes the canonical form, it SERVES it: every signed artifact now returns signed_payload, the exact string the signature covers, so verification is one library call with nothing guessed. The certificate canonicalizer now walks a declared field list, and a type-level check fails the build if a field is ever added to a certificate without being signed — the class of bug, not just its two instances. Certificates minted before the fix still verify under the form they were actually signed with, and say on their face which fields that signature leaves out. And the test that missed this now exists: verification in CI re-derives the bytes from the SERVED response and checks them with the raw ed25519 library, because every previous test verified through the same function that signed, and a function's blind spots are invisible to itself.",
};
