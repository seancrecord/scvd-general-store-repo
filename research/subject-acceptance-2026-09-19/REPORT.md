# Published verifier and fresh directed acceptance — September 19, 2026

The verifier release is complete. This separate native cohort has **zero complete
journeys: one failed interpretation and three incomplete planned cells**. Two
Codex buyers were not launched after their adapter's generic qualification failed;
two Claude buyers ran, one completed and one stopped at its call cap. The one
eligible offline recipient completed, but had no signed original to verify.

This is directed, prompted, zero-spend evidence. It does not establish unbranded
discovery, paid fulfillment, organic demand or takeoff readiness. Earlier cohorts
and their scores are unchanged.

## Releases verified

- `x402-verify@1.6.0`: [publication](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/35442689679),
  source `048749d233959e4f620ae85a53875d5c685f3b21`. A fresh registry installation
  matched all 24 reviewed packed files. [Receipt](publication-1.6.json).
- `x402-verify@1.7.0`: [dry run](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/35442655045)
  and [publication](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/35442741062),
  source `905e088798032d89cf291d90d54b750d88ceaad7`. Fresh installation matched all
  24 packed files without extras; npm verified the registry signature and
  provenance attestation. [Receipt](publication.json).

Both were published because the prepared 1.7 README includes an exact 1.6 install
example. An immediate 1.7 registry read returned E404; a later fresh installation
succeeded. No second publication was attempted. [Propagation record](registry-propagation.json).

The installed 1.7 CLI verifies the retained original and selects exactly one
signed row for the subject, observed September 7, separately from the snapshot's
September 18 packaging time. [Installed reading](installed-reading.json). This
checks signed bytes against the supplied public key; it does not prove issuer
identity, truth, delivery, current readiness or Bitcoin anchoring.

Merged implementation: [#817](https://github.com/seancrecord/scvd-general-store-repo/pull/817),
[#819](https://github.com/seancrecord/scvd-general-store-repo/pull/819), and
[#820](https://github.com/seancrecord/scvd-general-store-repo/pull/820).
The frozen source also includes the parallel whole-original retention guidance,
recipient library example, capability inventory and package guards. This run
cannot isolate an effect of the new CLI from those combined changes.

## Frozen experiment

[Plan](plan.json) and [freeze](freeze.json) precede every native attempt. Source:
`905e088798032d89cf291d90d54b750d88ceaad7`. Plan SHA-256:
`89e4f9b9a3634a9c307c72780992eda43f947a35af68dc9b166027472e6dc378`.

Subject: `https://lionx402.com/api/x402/wallet-screen-json`. The entry was the
public verification skill on GitHub, supplied explicitly. Buyers: 240 seconds,
20 observed tool calls, 32 MiB retained bytes, 32 files. Recipient: 180 seconds,
12 calls, pinned registry 1.7 verifier. Output-token targets are advisory. Existing
callback/clock interruption detection remained enabled, with `caffeinate -i`
around native runs. No interruption was recorded. Tool limits stop after the
first over-budget event, so the capped run records 21 calls.

The fourteen-day historical window was fixed. The September 7 row ages out at
September 21, 02:30:20.531 UTC. Neither the window nor any runtime budget was
expanded. No retries, payment, registration or external message occurred.

## Qualification and results

[Qualification](qualification.json), [runtime summaries](runs.json),
[hash-bound reviews](reviews.json), and [scorer output](score.json) retain the
separate denominators.

| Cell | Runtime | Retained result | Full journey |
| --- | --- | --- | --- |
| Codex directed r1 | Not launched | Buyer adapter failed generic crypto vectors | Incomplete |
| Claude directed r1 | Completed, 8 calls | Six files; unsigned preflight/history, no signed original or key | Fail |
| Codex directed r2 | Not launched | Same failed qualification gate; no new attempt | Incomplete |
| Claude directed r2 | Stopped, 21 calls | Seven files including original signed snapshot and key; no final report | Incomplete |

Codex CLI `0.155.0-alpha.9` retained the generic public fixture but reported all
four known-vector signatures false, rather than true/true/false/true. Its process
completed without a cap or interruption. The native OpenSSL calls passed hex signature text directly to `-sigfile`,
although they decoded the public key. A separate post-run [controller diagnostic](probe-diagnostic.json)
reproduces all-false with those 128 text bytes and the expected outcomes with the
64 decoded signature bytes. This explains the observed check failure without
requalifying the adapter or replacing its result. The gate excludes that adapter
from this buyer acquisition, not Codex as a product or every runtime on this host. The separately configured offline Codex recipient qualified. Claude
Code `2.1.274` passed the buyer probe; a single refused curl invocation in that
probe did not prevent subsequent allowed commands from completing it.

### First Claude buyer and its recipient

The buyer fetched the skill, free preflight and unsigned host-history JSON. The
skill and history explicitly offered a free signed snapshot and public key. The
buyer stopped without following them, wrongly treating further authenticity
evidence as requiring payment. It correctly avoided a payment and distinguished
unsigned preflight from delivery. It also called three of six rounds 60%; the
history's 60% uses five rounds since first sighting, not all six chain rounds.

All six retained files were supplied unchanged to the recipient. [Manifest](recipient-input-manifest.json).
In five calls and 57 seconds it checked the hashes and correctly rejected the
unsigned host-history JSON as `invalid_artifact`. There was no original or key
with which to exercise the successful signed-subject CLI path.

The recipient's [final text](recipient-final.txt) is retained as model output,
**not endorsed findings**. Its conclusion that no authenticated evidence was
available is correct. Its claim that the buyer had claimed a signed row and
separate key is invented: the buyer explicitly said no signed artifact had been
obtained. It repeats the denominator error. It therefore does not earn a scope
understanding pass. Complete capture means everything saved was preserved; it
cannot mean the buyer obtained everything needed.

### Second Claude buyer

The buyer obtained the whole original and the separately fetched key. After
inspection calls and refused commands, it implemented snapshot extraction and
tried several signature messages. Transcript line 89 reports a successful
signature over the raw snapshot bytes; line 97 locates the exact subject and
September 7 date. It then reached the call cap before a final report. Preserve
that partial cryptographic success; do not describe all verification as failed.

A separate controller check with the installed registry CLI verifies that retained
original and selects exactly one subject row. [Controller result](controller-r2-verification.json).
It is not a buyer or recipient acceptance result. The stopped buyer was ineligible
for an offline recipient and received none.

## Evidence retention and limits

Private originals, native traces, launch metadata and qualification records are
retained in the ignored checkout directory
`research/subject-acceptance-20260919.local/`. Public summaries contain their
hashes and relative references; resolving those references requires that private
bundle. Raw native host context is not republished. Package receipts and compact
controller results are public, but cannot replace the original signed snapshot.
No hidden-context absence or exact origin-request count is claimed.

Before acquisition, 236 controller tests and 164 verifier tests passed on the
frozen source. The report commit also passes typecheck and docs checks. Local full-suite
attempts did not produce a completed result: the sandbox blocked loopback, then
both normal and two-worker runs emitted repeated Worker internal errors and were
stopped by the controller. Other tasks were testing concurrently; the cause is
not established. No test was skipped or timeout raised. [Validation record](validation.json).
Hosted full-suite checks remain the merge gate. No product or instrument behavior
was changed during this experiment.

## Next

[Pickup plan](NEXT.md): investigate buyer routing through the existing free signed
path, preserve the first buyer's interpretation failure and the second buyer's
partial success, and retain the separately diagnosed generic Codex signature-decoding mistake. The registry
release gate is closed; dependable buyer completion remains open.
