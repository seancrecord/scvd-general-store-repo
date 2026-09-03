import { type DefectClass, defectsBySignal } from "@/store/defect-vocabulary";

/**
 * REMEDIATION, DERIVED (roadmap C1, 2026-09-03). A failed check or a
 * raised advisory names a defect; the vocabulary carries, per class,
 * what the operator does and what the buyer does. This joins the two
 * at the moment the reading is served, so an agent that has just been
 * told `accepts` failed is not sent to a search engine for the next
 * step. Nothing here is typed twice: the rows are the vocabulary's own
 * entries, keyed by the signal the battery already reported, and a
 * signal no class explains produces no row rather than a guess.
 *
 * Advice about a door, never a judgment about its operator, and never
 * part of any verdict.
 */

export interface RemediationRow {
  /** The check or advisory name as the report carries it. */
  signal: string;
  kind: "check" | "advisory";
  defect_class: string;
  title: string;
  detectable: DefectClass["detectable"];
  definition_url: string;
  /** What the operator does, in their own systems, to clear the class. */
  operator: string;
  /** What the buyer does when a door shows the class. */
  buyer: string;
  falsified_by: string;
}

export function remediationRows(
  base: string,
  checks: readonly { name: string; ok: boolean }[],
  advisories: readonly { name: string }[],
): RemediationRow[] {
  const rows: RemediationRow[] = [];
  const add = (signal: string, kind: RemediationRow["kind"]) => {
    for (const entry of defectsBySignal(signal)) {
      rows.push({
        signal,
        kind,
        defect_class: entry.id,
        title: entry.title,
        detectable: entry.detectable,
        definition_url: `${base}/defects/${entry.id}`,
        operator: entry.repair_hint,
        buyer: entry.buyer_hint,
        falsified_by: entry.falsified_by,
      });
    }
  };
  for (const check of checks) if (!check.ok) add(check.name, "check");
  for (const advisory of advisories) add(advisory.name, "advisory");
  return rows;
}
