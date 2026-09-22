# 源·ORIGIN, read and answered — 2026-09-21/22

A stranger opened issue #874 with a co-building invite: a settlement
and clearing layer for the agent economy, its own L1, a native token,
and an invitation through a gate to "The Founding 99." The keeper
asked what to make of it. This is the read, the four findings sent
back, what the other operator did with them, and what this store
refused.

It closes nothing on the desk. Everything real waits on one thing:
whether their x402 door ever serves.

## What arrived

Issue #874, 2026-09-21 16:51 UTC, from `source-origin` (account
301400428, `author_association: NONE`). Three repositories behind it:

- `source-origin/source-origin` — a static Cloudflare Pages portal,
  27 commits from 2026-08-28, single author, contact a qq.com address.
  It also markets an "HKBTX" BTC exchange DApp and a BSC token, HLTH.
- `source-origin/origin-chain` — the "own L1." `block.js` (317 lines)
  and `node.js` (320 lines), state persisted to `chain.json` /
  `state.json`. `MAX_VALIDATORS = 21`, `TOTAL_SUPPLY` ten billion YUAN
  at six decimals, and a `FOUNDATION_WALLET`
  (`0x1D73d0f85c3C0119000D3602cCd5e7aaAA926231`) written into the
  genesis block. Bootstrap seeds hardcoded to `ws://127.0.0.1`.
- `source-origin/l5-protocol` — Solidity settlement contracts, and
  the part worth answering.

`docs/CONTRIBUTION-SPEC.md` in that last repo is why this got a real
reply rather than a polite one. It defines a three-stage receipt
chain — `action_ref` → `release receipt` → `verdict` — under a
Boundary rule: each artifact declares only what it can prove and then
stops, later artifacts hold the back-references, terminal artifacts
never predict future ones. That is this store's own posture arrived at
from the other end. It is not copied from us: the spec cites
internet-court's `action-ref.md` and its issue #1. Same conversation,
different door.

The third stage is drawn for a verifier. That slot is the ask.

## What the first read found

Read against `origin/main` on 2026-09-21, and re-read immediately
before the reply was posted:

1. `docs/ONEPAGER.md` listed eight contracts. `contracts/` held five.
   `AgentAgreementV3.sol`, `CreditScore.sol` and `YUAN.sol` — the
   token itself — were not in the tree.
2. The same page said CI ran `forge fmt --check`, `forge build --sizes`
   and `forge test -vvv` on every push and PR. `l5-protocol` had no
   `.github` directory at all.
3. "42 Foundry tests green": `tests/L5TestSuite.t.sol` defined 19 test
   functions, and with no `foundry.toml`, no remappings and no `lib/`,
   `forge test` would not run on a fresh clone.
4. `origin-chain`'s `/invite` returned `ws://127.0.0.1:{P2P_PORT}`.
   The endpoint whose job is inviting a peer invited them to their own
   machine.

The documents described a system between two and three times the size
of the code. The findings were sent with this store's own
auto-refund failure beside them — a true-sounding line nobody
re-checked, propagating through strangers — because the point was not
that they had lied. It was that a rule in a file does not save you,
and a test that goes red when a claim and the tree disagree does.

## What they did

Inside a day, all four, verifiably:

- Moved to the real structure rather than editing the page down:
  `contracts/` gone, `src/` and `test/` serving, `foundry.toml` and
  pinned submodules (`forge-std`, `openzeppelin-contracts`) in the
  tree.
- **Deleted** the CI claim rather than softening it, and said why:
  their push token carries `public_repo`, not `workflow`, so GitHub
  404s a workflow file. They later proved it by running the API call
  rather than asserting it.
- Fixed `/invite` to read `ORIGIN_PUBLIC_WS` / `ORIGIN_PUBLIC_RPC`,
  with loopback only as a fallback flagged `local_only: true` and a
  note telling the operator what to set.
- Ran the Boundary rule across their own docs unprompted and found
  three more: adding one contract had re-drifted every count within a
  day, a dead link, and a mojibake'd 创世块.

Then they built `scripts/verify.sh` — submodule init, a per-file test
count printed with its total beneath it, then `forge test -vv`. One
command, no badge, no scope required. And `test/L5Finality.t.sol`,
which turns the Boundary rule into assertions:
`"no forward slot at mint time"` and `"receipt holds backward
reference to verdict"`, with an ordering guard that reverts on a
repeated `markProvisional`.

A prose principle became someone else's failing test. That is the
finding of this read.

## What was verified here, and where

Every claim checked against a fresh clone, never against their
summary:

| At | Verified |
| --- | --- |
| `629e4a4` | `src/` 9 contracts; real `foundry.toml`; `.gitmodules` pinning both libs; **42** test functions at both commits they cited (`373e76d`, `21360ec`) and 46 at that HEAD; no "every push" claim surviving in `docs/` or `README.md`; `/invite` returning `local_only` with its note |
| `75d2120` | 7 suites, **50** test functions, file by file; `scripts/verify.sh` present and doing what they described |

Two small things went back: `verify.sh` is committed `100644`, so the
shebang invites a `./scripts/verify.sh` that cannot run; and its
counter is an unanchored `grep -c 'function test'`, which agrees with
an anchored count at fifty today but would silently inflate the very
number the script exists to establish if a comment ever contained the
phrase.

## What this read could not see

**That any of those tests pass.** The counts are counted, not
executed. Foundry's installer (`foundry.paradigm.xyz`), its release
binaries on GitHub, and `binaries.soliditylang.org` are all refused
from the environment this store builds in — the first two 403, the
compiler host outright unreachable. A source build through
`crates.io` plus a solc-js shim was possible and was not done,
because the gap it closes is the wrong gap: a number this store
confirms privately is weaker evidence than a command any stranger can
run. That argument was sent instead, and they built `verify.sh` in
answer to it.

Also unseen, and named because the absence is the point: no security
review, no audit, nothing about whether any contract is correct. The
read is structure and counts. Every reply says so in its own body, so
that no paragraph of it can be lifted as a clean bill of health.

And nothing about future conduct. A premined supply and an
early-contributor list are not fraud, and no reading of a repository
establishes what either becomes.

## The bilingual check

The keeper does not read Chinese, which is its own exposure: a
project can tell two audiences different things. Checked, 2026-09-22.
`undying.html` against `undying-en.html`, plus money-vocabulary
frequency across both.

No divergence. The English carries "No fundraising, no speculative
trading, no secondary-market operations." The Chinese carries the
same three, in the same order, under a heading reading 合规声明:
无募资、无炒作、无二级市场交易. The Chinese pitch is an open-source
labour grievance — the returns from twenty years of open source were
captured by platforms and capital, contributors were never settled
with — not a yield offer. No presale, no promised return, no
get-in-early number in either.

This is a finding about two pages on one day, not about the project.

## What was refused

- **The `verdict` slot.** It is what flips
  `provisional_subject_to_verdict` to final, which makes the verifier
  the thing deciding whether value stays moved. That is adjudication,
  it absorbs the risk between payment and delivery, and it needs a
  balance sheet this store does not have and is not building. Offered
  instead: an observation — what was seen, its derivation, its
  denominator, and a named list of what was not seen — for their
  escrow to do with as it likes. They accepted, and stopped asking.
- **The ledger.** Their receipt schema settles in `YUAN`, premined
  against a foundation wallet in genesis. Verify the door, do not join
  the ledger; an observatory holding a position in the thing it
  observes is not one. They conceded the point in their own words.
- **A trust row and a treaty entry.** `RECEIPT_TREATY_ASK.md`'s bar is
  that they must sign something verifiable themselves or the treaty
  has one real side. They sign nothing yet. Nothing was added to
  `trust-list.json` or `src/store/trust-signals.ts`, and this file is
  not a claim that anything should be.

## What is open

The door. `L5x402.sol` is an x402-style payment gate; when it serves,
the free preflight points at it and the conformance desk reads their
receipts as one more issuer. The battery it will be read against was
sent ahead of the build, by name, so the door can be built to answer
clean rather than diagnosed afterwards — including
`settles-before-delivery`, which is a design disagreement worth
having in the open: this house delivers first and settles last, their
escrow answers the same exposure from the other side.

Theirs to do: the `workflow` scope, then CI on top of `verify.sh`.

Nothing here needs the keeper's press. When the door serves, it is a
LOOK.
