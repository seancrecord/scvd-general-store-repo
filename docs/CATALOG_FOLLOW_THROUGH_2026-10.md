# Discovery catalog follow-through — October 12, 2026

The live discovery catalogs exceeded their 500,000-byte budgets after Arc
checkout shipped: `/.well-known/x402` was 554,008 bytes and its `.json` alias
was 572,290 bytes. The fixture enabled production payment rails but omitted
the live publication inventory. Its green result did not cover production.

Both manifests now advertise `spec_url` on each menu resource instead of
embedding the full custom `spec` again. Fetch that existing `/menu/:id` URL
with `Accept: application/json` to read its unchanged `spec`. The full menu
catalog also retains inline specifications. Discovery keeps every resource,
all payment terms, input schemas, descriptions, purchase links, publication
checkout metadata and maker's marks. Clients consuming the former custom
inline field must follow `spec_url`; standard payment fields are unchanged.

The regression fixture adds eight stored almanac pages, four seller issues
and four Gazette issues, on top of compiled inventory, with all payment
rails enabled. Before the source change, both budget checks failed (the JSON
catalog measured 616,126 bytes), and the specification-link test failed.
After the change, all three pass, along with the discovery budget, manifest
shape, maker's mark and synthesis suites: 62 tests total. The tests verify
complete payment terms, all seeded publications, and every free specification
destination. Existing byte guards now count UTF-8 bytes rather than characters.

This is a finite growth guard, not a promise of unlimited catalog capacity.
The live site sweep and release readback are tracked with the release. No
funded transaction, outreach email, refund or counter correction is part of
this work. Outreach records and endpoint-level findings remain private;
missing original claims are not replaced with inferred history.
