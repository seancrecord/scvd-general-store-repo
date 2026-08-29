# The guards that kept a typed list

**Written 2026-08-29, after fixing three of them.** House rule AT_SCALE
1 is *derive or refuse — never a hand-typed value beside the code it
describes.* It has been applied carefully to the store's surfaces and
almost not at all to the store's guards, which is the half nobody
looks at, because a guard that passes looks the same either way.

This file is the record of that pass: what each guard was actually
covering, what it missed, and what is still typed. Written down rather
than quietly fixed, per rule 56.

---

## The shape

A guard walks a list. Somebody wrote the list on the day the guard was
written. The store keeps shipping. The list does not.

Nothing fails. The guard is green every day, on a shrinking fraction
of what it claims to cover, and its own doc comment keeps promising
the coverage it had on day one. **A roster only a person widens covers
the past, and the past is the half that cannot change.**

The tell is a doc comment written in the present tense — "a new
surface added without X fails here, by name" — above an array of
string literals.

## What each one was covering

Measured 2026-08-29 against the router, which registers 145 static GET
doors, about 131 of which answer a stranger.

| Guard | Claimed | Actually walked | Missed |
|---|---|---|---|
| `derived-not-typed` | "every public surface" | 17 | ~113 |
| `cors-discovery` | "the discovery surface" | 34 with the header | 97 without |
| `corrections-forwarding` | "every evidence surface" | 6 | `/registry`, `/inflows`, `/doors.json`, `/coverage.json`, `/corpus` |

## What the widened guards found

**A false statement on `/doors`, hours old.** The page said two of its
five paid drill-downs cover a stated term of days. Three do. Filed on
/corrections; the fix derives the sentence from `term_days` on the
shelf, which is what the page's own JSON twin had been doing correctly
all along.

**`/corpus.json` was unreadable from a browser.** So were
`/doors.json`, `/defects.json`, `/coverage.json`, `/trust-list.json`,
`/house-ledger.json`, `/pulse.json`, `/stats`, every `/corpus/*.json`,
the published schemas and specs, and `/atlas.json` — which exists for
no other purpose than telling an arriving agent where things are. A
browser-based agent's fetch dies in the browser whatever we answer.
The split was not a judgement anybody had made; it was the order the
doors happened to be built in.

**Three evidence surfaces handed machines numbers with no hop to the
corrections desk.** `/registry` and `/inflows` carried the pointer in
their HTML and not in their JSON — the same inversion the dataset
envelope was built to fix one field over. `/coverage.json`, which is
evidence about the observer, carried it nowhere.

**`/doors.json` was absent from the dataset catalogue.** It shipped to
close "the census has hundreds of subjects and no index of them" and
was then missing from the store's own index of datasets.

## How each was fixed

Not by widening the lists. Each roster is derived now:

- **`derived-not-typed`** walks `app.routes`: every static GET door
  that answers 200 with a readable body. ~130 surfaces, 1.4 seconds.
- **`cors-discovery`** walks the same set and holds the rule; the
  ALLOWANCE derives too, from what the response is — a GET answered
  200 with a machine-readable body, outside `/admin`, setting no
  cookie. A document published tomorrow is readable from a browser the
  day it ships.
- **`corrections-forwarding`** derives from `PUBLISHED_DATASETS` plus
  the corpus route family, with a short named list of evidence
  surfaces that are deliberately not catalogued datasets, each
  carrying its reason. The pointer itself moved onto
  `datasetEnvelope`, so a surface cannot carry the envelope and miss
  the pointer.

**Every derived roster carries a floor.** A derived roster can come
back empty and both checks pass having read nothing — the failure mode
a typed list does not have. So the paths each guard held before this
pass stay in the file as a floor: if the derivation ever stops
reaching one of them, it fails by name.

## What is still typed, and why

- **`no-orphan-capability`'s `DELIBERATELY_QUIET`** — 22 paths, each
  with a written reason, plus staleness checks that fail if a reason
  stops describing a live route. This is the shape an exemption list
  should have and it is not the disease; the roster it walks is
  already the router.
- **`machine-readable-data`'s `DATA_SURFACES`** — two paths,
  `/registry` and `/inflows`, whose schema.org envelope is held field
  by field. The file says out loud that these are the two, not all of
  them. `/doors.json` carries a richer self-description of its own
  shape (rule 57's five answers) rather than the envelope, so the deep
  check does not extend to it as written. **Owed:** decide whether the
  two shapes converge or whether each gets its own field-level guard.
- **The regex in `derived-not-typed`** is a hand-written list of
  countable nouns. It cannot derive — the point is to name the things
  this store has actually got wrong. It gained a lookbehind this pass
  after matching the tail of "fifty-two entries a year"; a guard that
  cries on correct prose gets exemptions written for it, and an
  exemption list is how a guard dies.

## The sweep nobody has run

Other repositories of the same shape, unaudited: any test file holding
an array of string literals above a doc comment written in the present
tense. `grep -c '^\s*"/' test/*.spec.ts` finds the candidates by path;
identifier rosters need a different eye. Three were checked here and
three were rotten, which is not a sample anybody should extrapolate
from — but it is not encouraging either.
