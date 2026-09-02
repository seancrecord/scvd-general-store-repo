import type { WardHostResult } from "@/services/ward-round";

/**
 * THE CATALOG AGAINST THE DOOR (roadmap S8, Tier C, 2026-09-02).
 *
 * The census pulls the whole CDP discovery index every round to learn
 * which doors exist, and until today kept only the URLs. The index
 * also carries each door's terms as the catalog last ingested them —
 * a THIRD-PARTY COPY of the 402, which the seller cannot edit. This
 * module compares that copy against the live challenge the same probe
 * read, and writes one derived column per host onto the signed round:
 *
 *   agrees          every catalog entry has a live accepts entry on the
 *                   same rail carrying the same payTo and amount
 *   differs         at least one does not; `fields` names which, by rail
 *   not_listed      no catalog entry named this host this round
 *   not_comparable  a catalog entry with no terms to compare (most v2
 *                   entries, per the foundation's own tracker), or a
 *                   door that served no parseable challenge; `reason`
 *                   says which
 *
 * ATTRIBUTED TO THE CATALOG, on its face. A seller cannot edit the
 * copy, so drift here is the catalog's staleness or the door's move
 * since ingestion — never a defect of the door on its own, and the
 * catalog's own `lastUpdated` rides beside every reading so a reader
 * can see how old the copy was.
 *
 * THE LEGITIMATE DIFFERENCES the design names are built in, not
 * bolted on: entries are matched by rail (network + asset) and never
 * across rails; a door offering several tiers on one rail agrees when
 * ANY of them carries the catalog's amount and payTo (pay what it
 * deserves); amounts are compared as the atomic strings both surfaces
 * carry, with the catalog's older `maxAmountRequired` spelling read as
 * `amount`; and silence (no terms) is not disagreement.
 *
 * ZERO NEW READS. Every byte compared here was already fetched.
 */

export interface CatalogAccept {
  network: string;
  asset: string;
  pay_to: string;
  amount: string;
}

/** The catalog's copy of one door's terms, as read from its index row. */
export interface CatalogTerms {
  accepts: CatalogAccept[];
  /** The catalog's own timestamp for the copy, verbatim, when it gives one. */
  last_updated: string | null;
}

export type CatalogState = "agrees" | "differs" | "not_listed" | "not_comparable";

export interface CatalogReading {
  state: CatalogState;
  /** Present when differs: which field, on which rail, catalog against door. */
  fields?: string[];
  /** The catalog's timestamp for the copy compared, when it gave one. */
  last_updated?: string | null;
  /** Present when not_comparable: why no comparison could be made. */
  reason?: string;
}

/** Counts over one round's probed hosts, with their denominator. */
export interface CatalogAgreement {
  /** Hosts the catalog listed with comparable terms and the door answered: agrees + differs. */
  compared: number;
  agrees: number;
  differs: number;
  not_listed: number;
  not_comparable: number;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Read a catalog row's terms. Null when the row carries no accepts to
 * compare — which is a fact about the catalog's copy, kept distinct
 * from "listed with terms that differ".
 */
export function catalogTermsFromRow(row: Record<string, unknown>): CatalogTerms | null {
  const raw = row["accepts"];
  if (!Array.isArray(raw)) return null;
  const accepts: CatalogAccept[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const network = str(record["network"]);
    const asset = str(record["asset"]).toLowerCase();
    const payTo = str(record["payTo"] ?? record["pay_to"]).toLowerCase();
    const amount = str(record["amount"] ?? record["maxAmountRequired"] ?? record["max_amount_required"]);
    if (!network || !asset || !payTo || !amount) continue;
    accepts.push({ network, asset, pay_to: payTo, amount });
  }
  if (accepts.length === 0) return null;
  const lastUpdated = str(row["lastUpdated"] ?? row["last_updated"]);
  return { accepts, last_updated: lastUpdated || null };
}

/**
 * Compare the catalog's copy against the accepts the probe read from
 * the live door. `listed` false means no catalog row named the host
 * this round; `terms` null means the row carried nothing comparable;
 * `liveAccepts` null means the door served no parseable challenge.
 */
export function compareCatalogToDoor(
  terms: CatalogTerms | null | undefined,
  liveAccepts: Record<string, unknown>[] | null | undefined,
  listed: boolean,
): CatalogReading {
  if (!listed) return { state: "not_listed" };
  if (!terms) {
    return {
      state: "not_comparable",
      reason: "the catalog's row carries no accepts to compare (listed bare)",
    };
  }
  if (!liveAccepts || liveAccepts.length === 0) {
    return {
      state: "not_comparable",
      last_updated: terms.last_updated,
      reason: "the door served no parseable challenge to compare against",
    };
  }
  const live = liveAccepts
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .map((entry) => ({
      network: str(entry["network"]),
      asset: str(entry["asset"]).toLowerCase(),
      pay_to: str(entry["payTo"]).toLowerCase(),
      amount: str(entry["amount"] ?? entry["maxAmountRequired"]),
    }));
  const fields: string[] = [];
  for (const wanted of terms.accepts) {
    const onRail = live.filter(
      (entry) => entry.network === wanted.network && entry.asset === wanted.asset,
    );
    if (onRail.length === 0) {
      fields.push(`rail ${wanted.network}: the catalog lists it, the door does not offer it`);
      continue;
    }
    if (onRail.some((entry) => entry.pay_to === wanted.pay_to && entry.amount === wanted.amount)) {
      continue;
    }
    const samePayTo = onRail.filter((entry) => entry.pay_to === wanted.pay_to);
    if (samePayTo.length > 0) {
      const offered = [...new Set(samePayTo.map((entry) => entry.amount))].join(", ");
      fields.push(`amount on ${wanted.network}: catalog ${wanted.amount}, door ${offered}`);
      continue;
    }
    const sameAmount = onRail.filter((entry) => entry.amount === wanted.amount);
    if (sameAmount.length > 0) {
      fields.push(`payTo on ${wanted.network}: catalog ${wanted.pay_to}, door ${sameAmount[0]!.pay_to}`);
      continue;
    }
    fields.push(
      `payTo and amount on ${wanted.network}: catalog ${wanted.pay_to} at ${wanted.amount}, door ${[...new Set(onRail.map((entry) => `${entry.pay_to} at ${entry.amount}`))].join("; ")}`,
    );
  }
  return fields.length === 0
    ? { state: "agrees", last_updated: terms.last_updated }
    : { state: "differs", fields, last_updated: terms.last_updated };
}

/** The round's counts, derived from its own rows; anyone can recount. */
export function catalogAgreementOf(hosts: readonly WardHostResult[]): CatalogAgreement {
  const out: CatalogAgreement = { compared: 0, agrees: 0, differs: 0, not_listed: 0, not_comparable: 0 };
  for (const host of hosts) {
    const reading = host.catalog;
    if (!reading) continue;
    if (reading.state === "agrees") {
      out.agrees += 1;
      out.compared += 1;
    } else if (reading.state === "differs") {
      out.differs += 1;
      out.compared += 1;
    } else if (reading.state === "not_listed") {
      out.not_listed += 1;
    } else {
      out.not_comparable += 1;
    }
  }
  return out;
}

/** True when any row on the round carries a reading — weeks before the column have none. */
export function catalogMeasured(hosts: readonly WardHostResult[]): boolean {
  return hosts.some((host) => host.catalog !== undefined);
}

/** The hosts whose copy differs, for the keeper's alert; never for a public count. */
export function differingHosts(hosts: readonly WardHostResult[]): string[] {
  return hosts
    .filter((host) => host.catalog?.state === "differs")
    .map((host) => host.host)
    .sort();
}

export const CATALOG_COLUMN_WHAT_THIS_IS =
  "Per probed host, whether the discovery catalog's copy of the door's terms (payTo and amount, matched by rail) agrees with the challenge the same probe read; the catalog's lastUpdated beside it. Attributed to the catalog: a seller cannot edit the copy, so a difference is the copy's age or the door's move since ingestion, never a defect of the door alone. Counts carry their denominator (compared = agrees + differs); listed-bare rows and doors that served no challenge are counted as not comparable, not as disagreement.";
