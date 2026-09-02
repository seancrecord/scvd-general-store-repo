# Prompt for CV — relate the attestation spec to the IETF x402 receipt drafts

Paste as written. Scope is a dated paragraph on the spec page, not a
format change.

```
Read these, in full, from the datatracker:

- draft-hopley-x402-canonicalisation-jcs-v1 (latest revision)
- draft-hopley-x402-compliance-receipt-00
- draft-vauban-x402-consolidated-00

Then read our own spec at https://scvd.store/spec/scvd-attestation/v1
and the signer/verifier READMEs (x402-sign, x402-verify).

Write one section for the spec page, titled "Relation to other x402
receipt work", dated today, in the store's register (state the fact,
one clause for a limit, no editorialising about our own honesty). For
each draft, three lines:

1. What it defines, in one sentence, with the draft name and the
   datatracker URL.
2. What our format shares with it (signature scheme, canonical form,
   what a receipt binds: payer, recipient, amount, resource, time).
3. Where ours differs and that we are NOT aligned to it: canonical
   form (we do not use JCS / RFC 8785 unless we do — check the
   signer), receipt fields, anchoring (we anchor to Bitcoin weekly;
   vauban anchors to Starknet), post-quantum discipline (we have
   none; say so).

Then two sentences at the end: our conformance desk does not parse
either draft's receipt format today, and whether it should is a
separate decision. Do not propose adopting either format; do not
change the signer, the verifier or any schema. If, while reading,
you find a claim on our spec page that either draft shows to be
wrong or overstated, list it separately under "Found while reading"
with the line and the draft section, and do not fix it in this pass.

Deliver: the section as markdown, the "Found while reading" list,
and the exact file in src/ where the spec page's text lives so the
keeper can place it. Every draft URL you cite must be one you fetched
and read; no draft enters from memory.
```

Why this and not alignment: ietf.org was the second most-cited
domain in the answer-engine export for settlement-attestation
questions. A dated paragraph that names the drafts and states the
relation puts our spec page beside the pages engines already cite.
Adopting a draft's canonical form is a signing-format decision with
its own tests and its own day.
