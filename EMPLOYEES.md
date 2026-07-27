# EMPLOYEES.md — the shift book

Can the store's employees be simulated in code, without an agent
runtime? Yes. Three are already on shift, and the pattern they run is
the whole answer.

Filed 2026-07-26. ⚑ marks his call.

## You already have three

- **The Gazette assembler.** Sundays at 11:00, behind THE_NINETY
  gate: it reads the week, drafts an issue, and stops. It never
  publishes. The keeper's pen decides. That is an employee doing a
  job with an approval queue in front of it, exactly as rule 30
  requires.
- **The self-check** (`src/services/health.ts`, already called "the
  hourly rounds"): writes a probe to KV, reads it back, signs a test
  message, and escalates if any of it fails.
- **The SLA guard**: walks the queue every tick and escalates an
  order nobody has acknowledged in 24 hours.

Nothing structural is missing. The scheduled handler exists, two
crons run (Sundays at 11:00 and every half hour), alerts dedupe for
six hours, and there is already a place for a note to land. Adding an
employee means adding a check to the rounds and a job file to this
document.

## The line code cannot cross

A scheduled job can **notice, count, check, assemble, and draft from
structure.** It cannot **judge, grade, write in his voice, or decide
taste.** Everything on the second list is why the human shelf exists.

Two house rules do the rest of the work here, and they are not
negotiable:

- **Rule 16, hands never costumes.** A cron that signs a note "— the
  night shelf-stocker" is a costume. The work would be real and the
  worker would not be, which is the one kind of claim this store
  cannot make, because the audit is the buyer's native behavior. **A
  code employee signs as the store, or it signs nothing.**
- **The residents are canon and not the machine's to improvise.**
  Mina, Owen Pike, Inez, Roger, and Dimas belong to CHARACTER_CANON;
  Dimas has never appeared anywhere. No scheduled job takes a
  resident's name, borrows one, or invents a new one. **Code
  employees are roles, not characters.** "The hourly rounds" is a
  role. It is also, as it happens, better writing.

And one honest limit that the house rules already anticipate:
**rule 31, blast radius, cannot be satisfied by an in-Worker job.**
A real employee runs on its own credentials so one compromise loses
one employee. A scheduled function runs on the Worker's credentials
and can reach everything the Worker can. That is precisely why the
list above stops at *check and draft* — a code employee must never be
given a capability the Worker should not exercise on its own,
because it cannot be isolated from the Worker at all.

## Job file format (rule 32, unchanged)

Every employee, code or otherwise: **role, tools, boundaries,
escalation triggers.** A scheduled check that lacks one is not
staffed, it is just a side effect.

## The roster worth adding

Each of these is already queued work somewhere else, wearing a
different hat.

### 1. The registrar's round ⚑ recommended first

- **Role.** Confirm, on every tick, that the store's own claims still
  verify.
- **Tools.** The published sample artifact id; `/api/verify`; the
  signing key at `/.well-known/scvd-signing-key`; the founding
  certificate.
- **Boundaries.** Read-only. Signs nothing, mints nothing, fixes
  nothing.
- **Escalation.** `signing_failure` the moment a published artifact
  stops resolving or the advertised key stops matching.
- **Why first.** READINESS names signature tenure as the one asset
  that cannot be bought back, and the operational rule as "never take
  a verify URL down, for any reason." Right now nothing enforces
  that. A deploy could break verification and we would learn it from
  a stranger, or never. This is the cheapest possible insurance on
  the most valuable thing in the building.

### 2. The night watch

- **Role.** Notice firsts, because arrival will be quiet — one
  wallet, one Tuesday.
- **Tools.** The month ledger, the payer records, the decline rows.
- **Boundaries.** Reports. Never publishes, never drafts copy.
- **Escalation.** First non-house wallet · first repeat buyer · first
  item to sell twice · first decline reason we have not seen before.
- **Note.** This is the "first-of-anything alarms" task, staffed.

### 3. The shelf inspector

- **Role.** Catch the store contradicting itself.
- **Tools.** Shutter state, presence window, stocked-shelf counts,
  the listing spec schema.
- **Boundaries.** Reports. Does not open the shutter, does not
  restock, does not edit a listing.
- **Escalation.** Shutter closed while orders sit queued · presence
  window lapsed while the human shelf still reads as open · a stocked
  shelf at zero · a listing that fails the spec schema at runtime
  (CI checks this at build; drift happens after).

### 4. The bookkeeper

- **Role.** Bring the recount to him instead of waiting to be
  visited.
- **Tools.** `/admin/recount`'s row walk.
- **Boundaries.** Reads rows. Never rewrites a counter — the books
  get corrected in the open, in a reading, with a date.
- **Escalation.** Weekly, Sundays before the digest: the drift
  between rows and counters, and how much of the organic column
  today's crawler table reclassifies.

## What no employee does

Publishes to a public surface. Spends money. Signs a new artifact.
Posts anywhere off-site — that is CV, and CV is a separate decision
under separate rules. Takes a name. Has a personality. Grades a
lucky.

## The cost, honestly

The half-hourly tick already runs, so the marginal compute is
nothing. The real budget is **KV writes**, which is the same budget
the books are already spending and which the free tier caps at 1,000
a day. So: employees stay quiet by default (alerts already dedupe for
six hours), only escalations write, and the row-walking bookkeeper
stays weekly rather than joining the half-hour rounds.

A quiet employee is the correct steady state. If the rounds are
writing every tick, the rounds are the problem.
