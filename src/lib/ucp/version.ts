/**
 * THE PINNED PROTOCOL VERSION, AND WHY IT IS A CONSTANT RATHER THAN
 * "the latest".
 *
 * UCP publishes stable, dated specification indices and an actively
 * moving main branch. An implementation that tracks main is an
 * implementation whose wire format can change under a deployed
 * catalog without a commit in this repository — the
 * advertised-version-unpayable defect shape, applied to a catalog
 * instead of a till. So production speaks one dated version, named
 * here, and a move to the next one is a diff somebody reviews.
 *
 * The protocol screen (scripts/lib/protocol-screen.mjs) already
 * watches UCP; this is the pin it watches against.
 */
export const UCP_VERSION = "2026-08-25";

/**
 * SCVD's own extensions are versioned by the day they were written,
 * not by UCP's version: they are this store's documents, and pinning
 * them to UCP's calendar would imply UCP reviewed them.
 */
export const SCVD_EXTENSION_VERSION = "2026-09-16";

/** Reverse-domain namespace for everything this store defines itself. */
export const SCVD_NAMESPACE = "store.scvd";

/** UCP's own namespace, for the capabilities it defines. */
export const UCP_NAMESPACE = "dev.ucp";
