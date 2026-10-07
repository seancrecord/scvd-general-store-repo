# Setup-guidance qualification — September 30, 2026

Both online package qualifications and the offline recipient capability passed. Frozen source: `fc00e713`; explicit condition: `capability.setup_guidance = standalone-node-v1`. This is a separate acquisition with the merged literal-command matcher repair and new setup guidance. Previous attempts were neither retried nor rescored. The change cannot establish a causal improvement from a single qualification.

| Session | Wall time | Tool calls | Output tokens (advisory target) | Result |
| --- | --- | --- | --- | --- |
| Codex | 128.193 s | 10 / 20 | 5,650 (2,500) | generic and installed report pass |
| Claude | 187.334 s | 16 / 20 | 15,284 (2,500) | generic and installed report pass |
| Offline recipient | 80.924 s | 8 / 12 | 3,637 (1,800) | generic offline capability pass |

All sessions completed without hard budget stops or timing interruptions. All 80 condition samples showed battery power and zero Vitest/workerd processes. Sampling does not prove continuous host state. Battery operation was explicitly allowed by the keeper. No controller software tests ran during native timing.

Both online agents recorded their own proceed decisions, completed source inspection before installation, installed the exact pinned public package and generated the requested report. The controller checked every retained source/runtime hash and independently reproduced each generated report. Neither inspection events nor model assessments establish full source comprehension, package safety or independently verified issuer identity. Both report source-display truncation and partial review.

Setup errors remain visible. Claude attempted inspection before fetching source, then tried a redirection/compound form that the host refused; the later exact standalone invocation completed. Its final report drops one digit from the displayed fetched SHA-256 even though its computed retained capability.json has the correct full value. It also says equal installed-file byte sizes confirm identity; equal length alone does not establish equal bytes. The controller's separate hash comparisons establish that identity. The original Markdown report is preserved with both errors. Its early commands_denied array is empty despite the later denial, which the final prose and controller trace capture. These are reporting limitations, not rewritten native results.

Codex completed after one failed local command; no host denial was observed. Requested Codex model remains gpt-5.6-luna without a resolved revision in its trace. Claude reports claude-sonnet-5. Native reports, generated reports, decisions, all traces and original byte inventories are retained. Qualification establishes bounded tool use, not a buyer journey, discovery, spending or paid delivery.
