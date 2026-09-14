/**
 * MARKDOWN CELLS FOR TEXT WE DID NOT WRITE.
 *
 * Every generated table in these scripts holds strings from somewhere
 * else: commit subjects from three git repositories, merge titles and
 * impact prose from scout, extension summaries from a specification,
 * tag names. None of it is ours and none of it is sanitised at source.
 *
 * THE BUG THIS EXISTS TO FIX (CodeQL, PR #685, 2026-09-14). The first
 * version escaped the delimiter and not the escape character:
 *
 *     title.replace(/\|/g, "\\|")
 *
 * Given a title containing `\|`, that produces `\\|` — a literal
 * backslash followed by an UNESCAPED delimiter, so the cell breaks and
 * the rest of the title lands in the next column. Escaping a delimiter
 * without escaping the character that escapes it is not escaping.
 *
 * Order is the whole fix: backslashes first, then pipes. Reverse them
 * and the escapes you just added get escaped again.
 *
 * Newlines collapse too. A row is a line, so a subject carrying one
 * ends the row early and silently drops everything after it.
 */
export function mdCell(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\s*\r?\n\s*/g, " ")
    .trim();
}

/** The same, bounded, for prose cells that would otherwise run long. */
export function mdCellTrunc(value, max) {
  const cell = mdCell(value);
  return cell.length > max ? `${cell.slice(0, max - 1)}…` : cell;
}
