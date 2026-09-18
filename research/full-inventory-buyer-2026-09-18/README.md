# Full-inventory buyer follow-through

Start with [REPORT.md](REPORT.md). This is a separate four-cell directed cohort on the merged #810 source. No earlier acquisition is rescored or pooled here.

The plan, instrument identities, qualification, capture inventory, reviews and score are public. Exact raw responses and native traces are private; their retained manifest records hashes and local archive location. Reproduction needs those bytes, the frozen instrument and its dependencies from the recorded source revision. Copy that archive to a new working directory, leaving the preserved acquisition unchanged. In the copy, run `node cohort/instrument/buyer-cold-isolated.mjs --score cohort` after making the recorded repository dependencies available; it verifies referenced hashes and signatures and recomputes the score. The original acquisition-end score is preserved separately.

No payment, outside message or directory submission occurred. Publication and listings work remains tracked separately in issue #805.
