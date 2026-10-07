import type { Correction } from "./types";

export const correction: Correction = {
  date: "2026-10-01",
  what_was_wrong:
    "The welcome note called an unpaid challenge a payable 402 without stating the request method or separating challenge checks from paid settlement and successful delivery. The September 5 date repair stamped new probes correctly but still substituted the round or snapshot date for an older row's missing request timestamp. Agreement between derived dates did not make that substitution an observation. A passport with no cited modules could also publish an empty not_observed list despite the unpaid probe's limits.",
  how_long:
    "The welcome wording remained after the September 5 correction. Legacy timestamp fallbacks remained in outreach, host history, the tier index and routing exports. Original archived rows retain their bytes; a snapshot timestamp alone does not establish when an endpoint was requested.",
  found_by:
    "David Batista asked for the timestamped method, raw challenge, freshness policy, and separate scopes for DELX Commerce, DELX Protocol, paid settlement and image delivery. Reading the retained image-endpoint row exposed the missing request timestamp; its snapshot date cannot substantiate the September 5 probe date in the email.",
  what_changed:
    "Outreach states the recorded method and full request timestamp, or explicitly says they are unknown, and limits the finding to unpaid challenge checks at the exact endpoint. Derived history, host citations and routing rows no longer substitute publication dates for missing observation dates. An undated latest reading cannot issue a usable passport. The passport summary and its HTML carry the exact request, recorded method, original snapshot and available raw-challenge link, with paid settlement and successful delivery explicitly untested by the unpaid request even when no evidence modules are cited. Refreshes retain their recorded method and do not inherit an older census capture. The eight/sixteen-day freshness thresholds are unchanged. Archived signed snapshots are not rewritten.",
};
