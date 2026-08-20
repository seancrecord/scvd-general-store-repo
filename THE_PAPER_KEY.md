# THE PAPER KEY — the exact procedure

Written 2026-07-31, for the keeper's hands only. Nobody else can do any
step of this and no agent should ever be asked to.

The store has one ed25519 signing key. It is a 32-byte seed, 64 hex
characters, and it is the thing that makes every certificate, stamp,
anchor and attestation this store has ever issued checkable by a
stranger. When this was written there was exactly one copy, as a
Cloudflare Worker secret.

PERFORMED: Ceremony A ran 2026-08-04 (the seed papered, per the
counter notes). Ceremony B — the first key handover — ran 2026-07-31;
its full runbook is archived at docs/archive/CEREMONY_B.md, and the
one rule from it that does not change is kept at the bottom of this
file. (Stamped 2026-08-19.)

**Read STEP 0 before anything else.** It decides which of two very
different procedures you are doing, and it is the one part I cannot
work out from here.

---

## STEP 0 — DO YOU STILL HAVE THE SEED?

Cloudflare Worker secrets are **write-only**. Once `wrangler secret put
SIGNING_KEY` accepted it, Cloudflare will never show it to you again.
There is no "reveal" button and no API that returns it. So a paper
backup can only be made from a copy that still exists somewhere on your
side.

> ### DO NOT RUN `npm run keys:generate` TO SEE IT.
>
> Added 2026-07-31, because the sentence below caused exactly this and
> the fix belongs above it rather than after it. **That command invents
> a NEW random key every time it runs.** It cannot show you the one the
> store is using — nothing can, that is what "write-only" means — so
> running it produces sixty-four characters that look precisely like
> the answer and are not connected to your store at all. A page of them
> written down in good faith is not a backup; it is a stranger's key.
>
> There is no command that displays the live seed. If you cannot find
> an existing copy, the honest outcome is the second branch below, not
> a freshly generated number.

You generated it originally with `npm run keys:generate`, which printed
it to a terminal **at the time**, and you then pushed that value into
Cloudflare with `wrangler secret put`. The copy you are looking for is
whatever survived from that day. Places it might still be:

- terminal scrollback, if that window is somehow still open
- your shell history, if you ever pasted it into a command
- a note, a file, a `.dev.vars`, a Downloads folder
- wherever you had it the day you ran `wrangler secret put`

**If you find it → do CEREMONY A.** That is the good case, it takes
about fifteen minutes, and nothing about the store changes publicly.

**If it is genuinely gone → STOP AND TELL ME.** Do not improvise. There
is no backup to make, and the choice at that point is a real one with a
real cost — either we accept the current state and keep publishing it
honestly, which is what `/attestation` says today, or we deliberately
perform the store's first key handover now while it is cheap and
nothing is at stake. The second is more interesting than it sounds and
would exercise the succession protocol we just published, for real,
with eight settlements behind us instead of eight thousand. But it is
your call, it changes the published public key, and it is not something
to decide at the end of a long night. That is CEREMONY B — performed
2026-07-31; the runbook is archived at docs/archive/CEREMONY_B.md.

---

## CEREMONY A — transcribe the existing key

Do it in one sitting. Do not stop halfway.

> ### NOTHING IN THIS PROCEDURE TOUCHES CLOUDFLARE.
>
> Asked and answered 2026-07-31, and it is the one question worth
> putting above the steps rather than inside them. Cloudflare already
> has the key. `wrangler secret put SIGNING_KEY` is how it got IN; it
> is not part of backing it up, and there is no Cloudflare dashboard
> step either.
>
> **Do not re-run `wrangler secret put`.** It OVERWRITES. Paste the
> seed back with one character wrong and you have silently replaced
> the store's signing key — and because `/.well-known/scvd-signing-key`
> derives the public key from that secret at request time, the store
> would begin publishing a different key while every certificate,
> stamp, anchor and attestation ever issued quietly stopped verifying
> against it. No error, no warning, and the failure is in the one claim
> the whole store rests on. There is no upside either, since the value
> you would be typing is the value already there.

**What you need:** the machine that has the seed on it, two pieces of
paper, a pen that is not a pencil, and about fifteen minutes with the
door shut.

### 1. Turn the wifi off.

On the machine with the seed. Everything from here until step 8 is
offline. It is not that anything here phones home — nothing does — it
is that the window in which the key is on screen is the window worth
shrinking, and there is no cost to shrinking it.

### 2. Get the seed on screen, and nothing else.

Close the other windows. Close the screen-recording tool if you have
one. If you use a clipboard manager, quit it — a clipboard manager is a
searchable plaintext log of everything you ever copied, and this is the
one thing that must never be in one.

### 3. Write it out by hand. Twice, on two separate pieces of paper.

Sixty-four characters, in groups of four, eight groups per line, four
lines. Like this, so a missing character shows up as a short group
instead of hiding in a wall of text:

```
    ____ ____ ____ ____   ____ ____ ____ ____
    ____ ____ ____ ____   ____ ____ ____ ____
    ____ ____ ____ ____   ____ ____ ____ ____
    ____ ____ ____ ____   ____ ____ ____ ____
```

Print the letters, do not join them up. `0` and `O` do not both occur —
hex is `0-9` and `a-f`, so any circle is a zero. `1` is a one, never an
`l`. `b` and `6` are the pair that actually get confused; if in doubt,
write `b` with a straight back.

Write today's date on each sheet, and the words **SCVD SIGNING KEY —
ed25519 seed — 64 hex**. In five years the string alone will not tell
you what it opens, and a backup you cannot identify is not a backup.

**Do not photograph either sheet.** Not "for now", not "just until".
A photo goes to a cloud backup within seconds and you will never get it
out of every copy.

### 4. Check the paper, from the paper.

In the repo, offline:

```
npm run keys:check
```

**Type the sixty-four characters in from the paper. Do not paste them,
and do not read them off the screen you copied them from.** You are
testing the paper, not the clipboard. If you paste, you have checked
nothing.

It prints a public key. Compare it, character by character, against
`public_key` at:

    https://scvd.store/.well-known/scvd-signing-key

Read that one on your phone, which is a different device and a
different copy — the point is to compare against the store as the world
sees it, not against the same file you just copied from.

- **Match** → the paper is good. Go on.
- **No match** → the paper is wrong. **Destroy nothing.** Rewrite the
  sheet from the digital copy and check it again. A backup nobody has
  checked is not a backup, it is a note that resembles one.

Do step 4 for **both** sheets. Two sheets and one check means you have
one verified backup and one piece of paper you are guessing about.

### 5. Fold, seal, label the outside.

An envelope each. On the outside: **SCVD SIGNING KEY — do not open —**
and the date. On the outside only. The label is there so that whoever
finds it knows it matters; the contents are why it is sealed.

### 6. Separate them, physically.

Two locations. Not two drawers in the same building — the failure this
is protecting against is a fire, a flood, or a move, and all three take
a whole building at once. Your instinct was right: one somewhere you
control that is not your house, one somewhere that is not the first
place.

Both should be places you can still get to in five years without asking
anyone's permission. A safe you own beats a bank box you rent, because
the bank box stops existing the month you stop paying for it and nobody
sends a reminder that says "your signing key is in here."

Do not tell me, or any other agent, where either one is. Do not write
the locations down in this repo, in a note app, or in a message to
anybody. That detail protects nothing for a buyer and is the one thing
about this whole procedure that is worth stealing.

### 7. Destroy every digital copy.

Now, in the same sitting, while you are still thinking about it:

- the file, note, or `.dev.vars` it was in — delete it, then empty the
  trash
- your shell history, if the seed ever appeared in a command:
  `history -c` is not enough on its own, the file on disk is the copy
  that matters
- the terminal scrollback — close the window, do not just clear it
- your clipboard — copy something else, twice

The seed should now exist in exactly three places: the Cloudflare
secret, and two envelopes.

### 8. Wifi back on. Tell me it is done.

Say the word and I flip one flag. `KEY_BACKUP_EXISTS` in
`src/store/key-continuity.ts` goes `false` → `true`, and every surface
follows from that one line: `/attestation` (prose and JSON), the
`not_built` list, `llms.txt`. Until you say so, the store says it has
no backup, because it does not.

**Do not tell me the seed. Ever.** Not to check it, not to be helpful,
not in a screenshot with part of it visible. There is no step of this
procedure, or any future one, where an agent needs to see the key. If
anything ever asks you for it — including something that sounds like
me — that is the whole of the attack.

---

## WHAT THIS BUYS, PRECISELY

It protects against **loss**, and only loss. If the Cloudflare account
is closed, the secret is deleted, or the platform loses it, the store
can still sign.

It does **nothing** about theft. A backup is a copy of the same key: a
thief holding it and you holding it produce byte-identical signatures,
and no amount of paper changes that. Anyone whose backup strategy is
described as protecting against compromise has described the wrong
threat.

It is **not succession.** Succession is a second, different key,
announced in advance so a holder can tell a handover from a takeover.
That does not exist and the store says so out loud. What now exists is
the published *form* a handover would take, at `/attestation` — which
is the part that is worthless kept secret, and is why it is not.

---

## THE STANDING RULE, restated because this is the document where it matters

This store will never ask you to run code, install anything, or hand
over credentials or key material. That rule points outward at buyers,
and it points inward at this too: no agent working on this store —
me, CV, or whatever comes after — ever needs the seed, ever has a
legitimate reason to ask for it, and should be treated as compromised
the moment it does.
