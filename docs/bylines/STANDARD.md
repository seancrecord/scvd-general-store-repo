# The byline standard — one target question per piece

Adopted 2026-09-03 from an outside reviewer's cut, because it matches
what the two pieces that exist already do. A byline is an external
retrieval asset: one query-shaped title, one original finding, one
source-of-truth page on the store. Not thought leadership.

| Component | Standard |
| --- | --- |
| Title | Query-shaped, specific, factual. The sentence a person types. |
| First paragraph | The conclusion, its scope and its date, in that order. |
| Evidence | A corpus number, a report, a test, or a reproducible artifact with its id. |
| Method | Enough that a reader knows what was measured and what was not. |
| Disclosure | "I run scvd.store", wherever the store is the instrument. |
| Canonical link | One: the corpus round, the defect page, the tool, or the verification page the finding came from. Never only the homepage. |
| Boundary | What the result does not prove, in one sentence. |
| Durable asset | A stable URL, dated; a byline that cites the DOI cites the concept DOI. |

Cadence: one a month. Each new piece links the earlier ones and the
store links back from `WRITTEN_ABOUT` (`src/store/copy/asked-for.ts`),
so the engines see one author, one store, one subject.

Published: the AURa piece (HackerNoon, 2026-08) and the census piece
(dev.to, 2026-09). Drafted: `2026-09_census_draft.md` (superseded by
the published dev.to piece). Next candidates, from the plan's A8: the
two-surfaces defect (links `/defects/{id}`), and the inflows reading
(links `/inflows`).
