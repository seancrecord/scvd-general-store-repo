import type { Correction } from "./types";

export const correction: Correction = {
  date: "2026-09-19",
  what_was_wrong: "Host-row citations labeled a snapshot's publication time as the observation time, even when the row held an earlier observation date. The September 19 buyer capture named September 7 in the host history but September 18 in cite_json.observed_at. The comparison projection also omitted the row's separate observation date.",
  how_long: "The citation helper used publication time from its September 4 introduction; the mismatch is confirmed in the September 19 retained host response. The signed originals retain their dates and bytes.",
  found_by: "Independent review of the September 19 directed buyer capture, comparing the retained host history with its structured citation and the shared citation helper.",
  what_changed: "Host citations now use the row's observation timestamp when present, and comparison results preserve it beside publication time. Snapshot citations and legacy rows without separate observation dates keep their existing publication-date behavior. Regression tests distinguish both dates across host JSON, Markdown, HTML and comparison output. No signed artifact is rewritten and no freshness window is extended.",
};
