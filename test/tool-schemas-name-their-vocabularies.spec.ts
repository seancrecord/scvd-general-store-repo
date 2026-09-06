import { describe, expect, it } from "vitest";
import { mcpToolCatalog } from "@/lib/mcp-tools";
import {
  CONFORMANCE_KINDS,
  CONFORMANCE_VERDICTS,
  KEY_RESOLUTIONS,
} from "@/services/conformance";
import { ORDER_STATUSES } from "@/types";
import { orderStatusBody } from "@/lib/order-status";

const BASE = "https://scvd.store";

/**
 * A VOCABULARY SPELLED INTO A DESCRIPTION VALIDATES AGAINST NOTHING.
 *
 * Several fields named their closed set in prose — "offer | receipt",
 * "queued | completed", "offline | did:web | not_attempted |
 * budget_exhausted" — which reads perfectly and gives a client no way
 * to check a value or an agent any way to enumerate one. A per-tool
 * WebMCP review (2026-09-06) named one of them, `check_conformance`'s
 * `kind`; the rest were the same defect on quieter fields, including
 * two on the OUTPUT side where nobody was looking.
 *
 * The point of these tests is not that an enum exists. It is that the
 * enum is the runtime constant the code branches on, so a word added
 * to the code cannot go missing from what callers are told.
 */
function schemaAt(tool: string, side: "inputSchema" | "outputSchema", field: string) {
  const found = mcpToolCatalog(BASE).find((entry) => entry.name === tool);
  const schema = found?.[side] as
    | { properties?: Record<string, Record<string, unknown>> }
    | undefined;
  return schema?.properties?.[field];
}

describe("closed sets are declared as closed sets", () => {
  it("check_conformance names its kinds, in and out", () => {
    expect(schemaAt("check_conformance", "inputSchema", "kind")?.enum).toEqual([
      ...CONFORMANCE_KINDS,
    ]);
    // Null is a real answer here — an artifact whose kind could not be
    // detected — so it belongs in the set rather than outside it.
    expect(schemaAt("check_conformance", "outputSchema", "kind")?.enum).toEqual([
      ...CONFORMANCE_KINDS,
      null,
    ]);
  });

  it("check_conformance names its verdicts and its key resolutions", () => {
    expect(schemaAt("check_conformance", "outputSchema", "verdict")?.enum).toEqual([
      ...CONFORMANCE_VERDICTS,
    ]);
    expect(
      schemaAt("check_conformance", "outputSchema", "key_resolution")?.enum,
    ).toEqual([...KEY_RESOLUTIONS]);
  });

  it("check_order names the statuses the store actually writes", () => {
    expect(schemaAt("check_order", "outputSchema", "status")?.enum).toEqual([
      ...ORDER_STATUSES,
    ]);
  });

  it("look_at_door gives `since` a format, not an example of one", () => {
    const since = schemaAt("look_at_door", "inputSchema", "since");
    expect(since?.pattern, "the week shape lived only in prose").toBeTruthy();
    const shape = new RegExp(String(since?.pattern));
    expect(shape.test("2026-W34")).toBe(true);
    expect(shape.test("last week")).toBe(false);
    expect(shape.test("2026-34")).toBe(false);
  });

  it("find_in_catalog says that item_id leaves search behind", () => {
    // One tool, two modes: the review called it overloaded, and the
    // honest fix is to say so in the field that does the switching.
    const itemId = schemaAt("find_in_catalog", "inputSchema", "item_id");
    expect(String(itemId?.description)).toContain("max_price_usdc");
  });
});

describe("a breached window is described, not just announced", () => {
  it("every field the store writes into window_breached is declared", () => {
    const overdue = orderStatusBody(
      BASE,
      {
        order_id: "ord_example",
        item_id: "human_errand",
        item_name: "Human Errand",
        status: "queued",
        created_at: new Date("2026-01-01T00:00:00Z").toISOString(),
        sla_hours: 24,
        paid_usdc: 0.05,
      } as Parameters<typeof orderStatusBody>[1],
      Date.parse("2026-02-01T00:00:00Z"),
    );
    const written = overdue["window_breached"] as Record<string, unknown>;
    expect(
      written,
      "the fixture did not breach, so this test proves nothing",
    ).toBeTruthy();

    const declared = schemaAt("check_order", "outputSchema", "window_breached") as {
      properties?: Record<string, unknown>;
    };
    const undeclared = Object.keys(written).filter(
      (field) => !(field in (declared.properties ?? {})),
    );
    expect(
      undeclared,
      `the store owes something it never described:\n${undeclared.join("\n")}`,
    ).toEqual([]);
  });
});
