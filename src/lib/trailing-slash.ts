/**
 * ONE TRIM, LINEAR (2026-09-19). Five sites dropped trailing slashes
 * from a request path with /\/+$/, and CodeQL read the fifth as
 * polynomial on uncontrolled input: a pattern anchored after a repeat
 * re-scans the run of slashes from every start position, so a path
 * made of slashes costs the square of its length — and the edge runs
 * its trim on every request that arrives. A loop over char codes does
 * the same work in one pass. Returns the input without any trailing
 * "/" characters, which may be the empty string; a caller that wants
 * the root kept says so with `|| "/"`, as the edge does.
 */
export function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47 /* "/" */) end -= 1;
  return end === value.length ? value : value.slice(0, end);
}
