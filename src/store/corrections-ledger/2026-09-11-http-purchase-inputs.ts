import type { Correction } from "./types";
export const correction: Correction = {
  date: "2026-09-11",
  what_was_wrong: "The HTTP purchase door returned usable payment terms for missing or malformed required inputs under an older price-probe policy. A payment client could sign those terms and only then learn that the purchase could not be fulfilled.",
  how_long: "The bare-probe policy dated to July and was reproduced in the September buyer audit. Fixture tests establish the route behavior, not a production buyer count.",
  found_by: "The keeper-requested BUY-002 audit and matching local requests through the store and doors Workers.",
  what_changed: "All HTTP purchase requests validate their inputs before usable payment terms. Price-only discovery stays free in the compact item contract and catalog, and field refusals point there. Valid buyer inputs receive the normal x402 quote; authenticated retained purchases still recover original goods. Client guidance now distinguishes free discovery from a purchase quote. Regression tests cover missing, whitespace-only and malformed inputs, signed-header aliases, free discovery and valid quotes through both Workers. No live payment or buyer message was sent.",
};
