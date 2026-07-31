# CEREMONY B — the handover

The store's first key succession, performed deliberately.

Written 2026-07-31 for the keeper, who asked for something he could
follow to the letter. Every step says who does it, what to type, what
you should see, and what to do when you see something else.

**There are five phases. You are only hands-on in three of them, for
about thirty minutes total. Exactly one action in the whole procedure
is irreversible, it is in PHASE 4, and it is flagged.**

Do not skip PHASE 0. It exists to stop us rotating a key that did not
need rotating.

---

## WHY THIS IS HAPPENING, in the words that will be published

Settled before the work starts, because the tempting version of this
story is available at every later step and gets more tempting the
longer we wait.

**This is not a drill and it will not be described as one.** The store
published a succession protocol on 2026-07-31. On the same day, writing
the paper-backup ceremony, we found there was no recoverable copy of
the only signing key — Cloudflare Worker secrets are write-only, and
the original had not survived anywhere on the keeper's side. So the
protocol gets executed for real, days after being published, under the
exact conditions it was written for.

That is a better story than a drill and it is also the true one. A
store whose entire differentiator is publishing what it got wrong does
not get to describe its first key event as a planned exercise. It goes
on `/corrections` with a date, like everything else.

The one genuinely fortunate part, and it is fortunate rather than
clever: **losing the ability to COPY the key is not losing the ability
to USE it.** The outgoing key still lives in Cloudflare and still
signs. So the handover can satisfy the protocol's one cryptographic
rule — the announcement of the new key signed by the outgoing key —
properly, rather than as a promise.

---

## PHASE 0 — CONFIRM THE OLD SEED IS ACTUALLY GONE

**Yours. Five minutes. Do this before anything else.**

Rotating a key you did not have to rotate would be a self-inflicted
wound, and you have not actually run the check yet.

### 0.1 Bring your local copy up to date

```
cd ~/scvd-general-store-repo
git pull origin main
```

You should see files updating. If `npm run keys:check` still says
"Missing script" after this, stop and tell me — that means the pull did
not do what we think it did.

### 0.2 Look for the one file most likely to hold it

```
ls -la .dev.vars .env
```

- **Either file exists** → open it and look for `SIGNING_KEY=`
  followed by 64 hex characters. If it is there, **STOP. We are not
  doing Ceremony B.** Go do Ceremony A in `THE_PAPER_KEY.md` instead
  and none of the rest of this is needed.
- **"No such file or directory" for both** → carry on.

### 0.3 The wider sweep, filenames only

```
grep -rlE '[0-9a-f]{64}' ~/Downloads ~/Desktop ~/Documents 2>/dev/null | head -40
```

This prints **paths only**, never contents. Send me the list. Names are
safe; do not send me the contents of any of them.

Also check, by hand: your password manager, and Notes or any scratch
file from around the day you deployed.

### 0.4 The verdict

Tell me one of:

- **"Found it"** → we abandon Ceremony B. Ceremony A instead.
- **"It's gone"** → PHASE 1 begins and it is my work, not yours.

---

## PHASE 1 — THE BUILD

**Mine. About half a day. You do nothing and nothing changes publicly.**

For your information rather than your action, so you can check my work
when it lands:

1. **A key registry** — the current key and every retired one, each
   with the date it was retired and the reason. One file, so no surface
   can drift out of step with another.
2. **`/.well-known/scvd-signing-key` gains `key_history`.** This is the
   load-bearing one. Right now an old artifact carries its own public
   key and verifies against it, which after a rotation would still be
   internally consistent but would match no key the store publishes —
   so a careful verifier could no longer tie it to us. Publishing the
   retired key permanently is what keeps every existing artifact
   attributable.
3. **`/api/verify` says which key signed a thing** — `signed_by`,
   whether that key is `current` or `retired`, and the retirement date.
   A holder should not have to work that out.
4. **The handover announcement as a real signed artifact**, at its own
   verify URL, signed by the OUTGOING key, naming the incoming public
   key. This is protocol rule 2 and the only part of the whole scheme
   that is a check rather than a promise.
5. **Correction #7**, copy on `/attestation` (`rotations_performed: 1`),
   `llms.txt`, `/becoming`, the skill bundle. Tests for all of it.

I will tell you when this is on `main` and it is safe to start PHASE 2.

**Do not start PHASE 2 before I say so.** Nothing bad happens if you
do, but the announcement has to name your new public key, and I cannot
sign it until it exists.

---

## PHASE 2 — MAKE THE NEW KEY, ON PAPER FIRST

**Yours. About twenty minutes. Nothing goes live in this phase.**

This is the upside of the whole exercise: the new key is backed up
before it has ever signed anything, instead of two months after.

Read the boxed warning `keys:generate` prints. This time it is the
command you actually want.

### 2.1 Wifi off. Close everything else.

Quit your clipboard manager if you run one. Close any
screen-recording tool. One terminal window, nothing else.

### 2.2 Generate it

```
cd ~/scvd-general-store-repo
npm run keys:generate
```

It prints a warning box and then 64 hex characters. **Do not paste
those characters anywhere yet. Do not put them in Cloudflare.**

### 2.3 Write it on paper. Twice, two sheets.

Groups of four, eight groups a line, four lines:

```
    ____ ____ ____ ____   ____ ____ ____ ____
    ____ ____ ____ ____   ____ ____ ____ ____
    ____ ____ ____ ____   ____ ____ ____ ____
    ____ ____ ____ ____   ____ ____ ____ ____
```

Print the letters. Hex is `0-9` and `a-f`, so every circle is a zero
and every `1` is a one. `b` and `6` are the pair that actually get
confused — give `b` a straight back.

On each sheet write the date and **SCVD SIGNING KEY — ed25519 seed —
64 hex — key #2**. The `#2` matters now that there has been a `#1`.

**Do not photograph either sheet.**

### 2.4 Check both sheets, typed in FROM the paper

```
npm run keys:check
```

Type the characters in from the sheet. **Do not paste**, and do not
read them off the terminal you just generated them in — you are
testing the paper.

It prints a public key. Run it once per sheet.

- **Both sheets produce the SAME public key** → the paper is good.
  Write that public key down too; it is not secret.
- **The two sheets disagree, or one is rejected as malformed** → at
  least one sheet is wrong. Rewrite it from the terminal (still open)
  and check again. **Do not proceed on an unverified sheet.**

> Note: at this stage there is nothing to compare against on the live
> site — the store is still publishing key #1. The two sheets checking
> against each other IS the test here. That is different from Ceremony
> A and it is the correct test for a key that is not live yet.

### 2.5 Send me the PUBLIC key

Paste me the 64 characters `keys:check` printed — **the derived public
key, not the seed.** That value is public by definition; it is about to
be published on the store anyway.

If you are ever unsure which of two strings is which: the one you wrote
on paper is the secret, the one the computer printed back is the public
one. **Never send me anything you copied off the paper.**

### 2.6 Do NOT destroy the terminal output yet

Unusually — leave it. Until PHASE 4 succeeds, that terminal window is a
second copy of a key that is not yet in Cloudflare, and losing it
before the secret is set would mean starting PHASE 2 over. Close it in
PHASE 5, not before.

Do the physical separation of the two sheets now if you like, or in
PHASE 5. Either is fine.

---

## PHASE 3 — THE ANNOUNCEMENT

**Mine, then a ten-minute read from you.**

I sign a handover announcement with the OUTGOING key — the one still
live in Cloudflare — naming your new public key, dated, served at its
own verify URL. It goes out **before** the new key signs anything,
which is protocol rule 1.

Before it deploys I will send you the announcement copy to rewrite.
It is a statement in the store's voice about losing a key, so **rule 7
applies and it is your pen.** I will draft; you will fix it.

When it deploys, the store is publicly committed: key #1 is retiring,
key #2 is named, and the notice is signed by key #1 so anybody can
check that the retiring holder blessed the successor.

**After this deploys, PHASE 4 is no longer optional.** An announced
handover that never happens is worse than no announcement. That is the
real point of no return, and it is here rather than in PHASE 4.

---

## PHASE 4 — SET THE SECRET

**Yours. Two minutes. THE IRREVERSIBLE STEP.**

Do this only after I confirm the announcement is live.

Whichever way you originally set it:

```
cd ~/scvd-general-store-repo
npx wrangler secret put SIGNING_KEY
```

and paste key #2 when prompted — **from the terminal window you kept
open in 2.6, not typed from the paper.** This is the one place a paste
is correct: the paper has already been verified, and a typo here
replaces the live key with something nobody has a copy of at all.

Or set it in the Cloudflare dashboard: Workers → your worker →
Settings → Variables and Secrets → `SIGNING_KEY` → Edit.

Then tell me it is done.

**What happens the moment you save:** the store begins signing with key
#2, `/.well-known/scvd-signing-key` begins publishing key #2 with key
#1 listed as retired, and every artifact issued from now carries the
new key.

**What does not happen:** nothing breaks. Existing artifacts keep
verifying — they carry their own public key, and key #1 stays published
in `key_history` forever so they stay attributable to this store.

---

## PHASE 5 — CONFIRM, PUBLISH, CLEAN UP

**Mine, then five minutes of yours.**

### 5.1 I verify, from outside

- `/.well-known/scvd-signing-key` publishes key #2, key #1 retired with
  today's date
- the sample artifact still returns `valid: true`, now marked as signed
  by a retired key
- the handover announcement verifies against key #1
- a fresh purchase mints under key #2

If any of those is wrong I will say so plainly and we fix it before
anything else is published.

### 5.2 Correction #7 goes up

The whole story, dated: the protocol published, the missing copy found
while writing the backup ceremony, the handover performed under it. And
the thing that actually caused it — a command called `keys:generate`
that could not show the existing key, in a repo with one key.

### 5.3 Yours, five minutes

- **Separate the two sheets physically.** Two locations, not two
  drawers in one building. Do not tell me or any agent where.
- **Now close that terminal window** from 2.6. Close it, do not just
  clear it.
- **Bin the paper from tonight's accidental `keys:generate`** — the
  one that was never a real key. It unlocks nothing, but a page in your
  handwriting that looks like a signing key is a trap for future you.

---

## THE RULE THAT DOES NOT CHANGE

No step of this procedure requires an agent to see a private key. Not
me, not CV, not whatever comes after. The only key material that ever
crosses this chat is the **public** key in step 2.5, which is published
on the store minutes later.

If anything ever asks you for a seed — including something that sounds
exactly like me — that is the whole of the attack.
