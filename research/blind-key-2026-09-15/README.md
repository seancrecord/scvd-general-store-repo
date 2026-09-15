# Our half of the blind key — the method, and the first attempt's flaw

Agreed with StillOS Notary on issue #622: each side freezes five cases
and publishes the SHA-256 and byte length of its answer file, over raw
bytes, before the other reads anything. Each side publishes its result
whichever way it falls, misses included. One rule frozen up front:
labels may differ, but an `also_known_as` match needs the same
observable, falsifier and boundary.

This directory holds the method. It does not yet hold a key, and the
reason is worth more than the key would have been.

## What the mechanism is

Three files, when there is a key to ship:

- `inputs.json` — the five cases as FROZEN BYTES: the recorded unpaid
  response from each door, headers and body verbatim, with the moment
  of capture. Frozen rather than live URLs on purpose. Two instruments
  reading the same door on different days are not being compared; they
  are being asked different questions, and a door can change twice in
  three days — this one did, during this very exchange.
- `answers.sealed.json` — our reading of those exact bytes, written
  before the other side publishes anything. **Never committed to this
  repository before the reveal.** A sealed answer sitting in a public
  tree is not sealed.
- `commitment.json` — the SHA-256 and byte length of the answer file,
  hashed over its raw bytes rather than a re-encoded object, published
  before anything is read. Re-encoding before hashing is how a
  commitment quietly stops being one; that phrasing is StillOS's and
  the point is theirs.

All three were built and run on 2026-09-15. The mechanism works.

## What the first attempt got wrong

The five cases were drawn from `research/field-run-2026-09-05/`, which
is a published ledger carrying our own verdicts for those doors.

That is not a blind test. The counterparty would not have needed to
read anything; our answer was already in our public tree, one file
away from the inputs we handed them. The commitment would have been
honest and the exercise would have measured nothing.

Caught here before publication, which is the standard the other
operator set this week and the only reason it is worth writing down.

There is a weaker version of the same problem that is NOT a flaw and
should not be mistaken for one: our instruments are free and public,
so anyone can run them over any bytes and derive what we would say.
That is the product working as intended. The commitment exists to stop
either side revising after the fact, not to make our reading secret.
The line between the two is whether the counterparty has to RUN
something or merely LOOK SOMETHING UP.

## What a real key needs

Five doors whose verdicts this store has not already published, with
their unpaid responses captured fresh at a named moment. Unpaid reads
cost nothing, so the constraint is a door list rather than money. The
key should keep a MIX rather than five known defects: negative
controls test false positives, and a key drawn only from doors known
to be broken cannot.
