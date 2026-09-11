import type { Correction } from "./types";

export const correction: Correction = {
  date: "2026-09-11",
  what_was_wrong: "A malformed human-order callback could disappear after payment; a syntactically valid callback could name a private address, insecure scheme or the store itself. Completion POSTs followed redirects. Their outcomes were recorded on orders but omitted from buyer polling responses. Probe purchases also compared the store hostname without normalizing a DNS root dot, and HTTP catalogue/commission capacity refusals omitted machine-readable no-charge fields.",
  how_long: "Reproduced by the keeper-requested buyer audit on September 6. The earlier probe-target validator and callback outcome ledger already existed; their presence did not protect these purchase and polling paths. These local fixtures do not establish a production customer count.",
  found_by: "The buyer audit, followed by signed local payment fixtures through HTTP and both MCP payment profiles and independent callback transport controls.",
  what_changed: "Supplied human-order callbacks are validated before payment and rechecked at dispatch using the public https URL policy. Completion POSTs do not follow redirects or retry automatically; callback.result and its policy are visible through the order URL and check_order, alongside the completed goods. Probe purchases compare canonical own hostnames. HTTP catalogue and commission capacity refusals now return capacity_unavailable and charged:false with their counts. The URL policy does not resolve DNS or claim DNS-rebinding protection. This repair does not reserve concurrent capacity or change the broader HTTP quote policy; those remain separate audit findings. No live payment or buyer callback was sent.",
};
