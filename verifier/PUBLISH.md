# Publishing x402-verify to npm — keeper's hands only

Rule 30: nothing publishes without a hand. This file is the hand's
checklist. It is not shipped in the package (`files` in package.json
excludes it).

## Why this package exists (so the listing is honest)

The recognition research (2026-08-03) ranked "code that imports the
service" as the most agent-native compounding channel: every operator
who installs this puts `x402-verify` in a package.json that agents
parse at runtime, and download counts are externally observable. The
package is the existing MIT verifier, unchanged — distribution, not a
new dependency taken on. It runs entirely offline; nothing about it
depends on scvd.store being up, which is what keeps it inside the
"this stays a shop" ruling.

## One-time setup

1. Create an npm account (npmjs.com) if none exists. The account name
   is public; use the store identity, not a personal one, per the
   keeper-identity decision in PROBLEMS.md.
2. Enable 2FA on the account before the first publish (npm supports
   TOTP; use the same hygiene as the other credentials — nothing in
   chat, nothing in the repo).

## Every publish

From the repo root:

```bash
cd verifier
npm pack --dry-run     # lists exactly what ships; read it every time
npm publish            # first time may need: npm publish --access public
```

The dry run should list exactly four files: x402-verify.js,
x402-verify.d.ts, README.md, LICENSE. If anything else appears, stop
and ask why before publishing.

## After the first publish

- Check https://www.npmjs.com/package/x402-verify renders the README.
- Record the publish in TASKS.md the same way the ClawHub publish was
  recorded.
- The observable number for this channel is weekly downloads on that
  page; it belongs in the monthly ledger review beside the other
  channel instruments, with the caveat that npm inflates download
  counts with mirror/CI traffic — treat trends as real, absolutes as
  soft.

## Versioning

The JWS format and vector set are frozen (v1 contract); expect
versions to move rarely. Patch for README/typo, minor for new checks
that change no existing behavior, major only if the x402 extension
itself breaks compatibility — at which point the conformance desk
grows /v2 as well, and the two should move together.
