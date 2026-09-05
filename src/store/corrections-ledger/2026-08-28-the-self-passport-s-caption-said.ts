import type { Correction } from "./types";

/** One entry of the corrections ledger. Add a file, run `npm run corrections:index`. */
export const correction: Correction = {
  date: "2026-08-28",
  what_was_wrong:
    "The self-passport's caption said every summary value is 'DERIVED from the same locals' and 'derived while this page rendered.' The verdict, freshness, and empty failed list were literals — stamped ready/fresh whatever the live modules two fields down had concluded, including 'conflict.' The one passport whose subject the census can never probe was the one passport that could not go dark, and its chip — green by construction, dated today by construction — rendered pixel-identical to chips that earn their color the census way.",
  how_long: "Since the self-passport shipped.",
  found_by: "The instrument audit, in-house.",
  what_changed:
    "The modules are the verdict: every module agreeing is the only way the artifact says ready/fresh; any conflict names the disagreeing modules in failed and renders indeterminate, which the chip route refuses to draw — our chip goes dark the same way anyone's does, and wears SELF on its face either way. A test plants a catalog conflict and requires the fields to turn (test/self-passport-derives.spec.ts).",
};
