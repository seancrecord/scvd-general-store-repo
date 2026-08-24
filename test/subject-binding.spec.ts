import { describe, expect, it } from "vitest";
import {
  bindClaims,
  compareClaims,
  normalizeIdentity,
  type IdentityClaim,
} from "@/discovery";

function claim(
  kind: IdentityClaim["kind"],
  value: string,
  extras: Partial<IdentityClaim> = {},
): IdentityClaim {
  return {
    kind,
    value,
    surface: extras.surface ?? "live_402",
    about: extras.about ?? "https://example.com",
    fetched_from: extras.fetched_from ?? "https://example.com",
  };
}

/**
 * JOINS THESIS STEP 2: the binding model, before any coherence
 * battery. same_subject may compare claims fetched from different
 * origins (directory vs live door). same_operator is the G2 refusal
 * — a test that got a strength other than not_compared on that
 * question would be minting the operator id the flag forbids.
 */
describe("normalizeIdentity", () => {
  it("folds EVM payTo case and leaves Solana payTo alone", () => {
    expect(
      normalizeIdentity(
        "payee_identity",
        "0x9453C2411FC45A8B86DF7F603E966D58ED34C651",
      ),
    ).toBe("0x9453c2411fc45a8b86df7f603e966d58ed34c651");
    expect(
      normalizeIdentity(
        "payee_identity",
        "HT1fgiGPdieMQCaV85U3bxpA4BaCsBBBPRXJXYtwNk2Z",
      ),
    ).toBe("HT1fgiGPdieMQCaV85U3bxpA4BaCsBBBPRXJXYtwNk2Z");
  });

  it("strips 0x and folds hex keys; drops a trailing slash on endpoints", () => {
    expect(
      normalizeIdentity(
        "signing_identity",
        "0x8C22F61ADD201ECEFA75C5D027371B64BED3C0FF739056A7B255F8322FFCB550",
      ),
    ).toBe("8c22f61add201ecefa75c5d027371b64bed3c0ff739056a7b255f8322ffcb550");
    expect(
      normalizeIdentity("endpoint_identity", "https://Example.com/api/buy/hello/"),
    ).toBe("https://example.com/api/buy/hello");
  });
});

describe("same_subject compares the join, not the fetch origin", () => {
  it("a directory payTo matching the live 402 is strong, even from another host", () => {
    const directory = claim(
      "payee_identity",
      "0x9453C2411FC45a8b86df7f603e966d58ed34C651",
      {
        surface: "x402_list",
        about: "https://scvd.store",
        fetched_from: "https://x402-list.com",
      },
    );
    const live = claim(
      "payee_identity",
      "0x9453c2411fc45a8b86df7f603e966d58ed34c651",
      {
        surface: "live_402",
        about: "https://scvd.store",
        fetched_from: "https://scvd.store",
      },
    );
    const binding = compareClaims(directory, live, "same_subject");
    expect(binding.strength).toBe("strong");
  });

  it("the same subject, two prices of payTo, is a conflict — the product", () => {
    const directory = claim("payee_identity", "0x1111111111111111111111111111111111111111", {
      surface: "x402_bazaar",
      about: "https://scvd.store",
      fetched_from: "https://api.cdp.coinbase.com",
    });
    const live = claim("payee_identity", "0x2222222222222222222222222222222222222222", {
      surface: "live_402",
      about: "https://scvd.store",
      fetched_from: "https://scvd.store",
    });
    const binding = compareClaims(directory, live, "same_subject");
    expect(binding.strength).toBe("conflict");
    expect(binding.reason).toContain("x402_bazaar");
    expect(binding.reason).toContain("live_402");
  });

  it("claims about different origins are not a same_subject join", () => {
    const binding = compareClaims(
      claim("service_identity", "scvd", { about: "https://scvd.store" }),
      claim("service_identity", "scvd", { about: "https://other.example" }),
      "same_subject",
    );
    expect(binding.strength).toBe("not_compared");
    expect(binding.reason).toContain("different subjects");
  });
});

describe("same_operator is refused, including the tempting case", () => {
  it("identical payTo is still not_compared — even about the same host", () => {
    // Same about, same value: same_subject would be strong. The
    // question is what forbids minting an operator id from that
    // match. If this test ever goes green without the G2 early
    // return, the flag has been implemented by accident.
    const binding = compareClaims(
      claim("payee_identity", "0x9453c2411fc45a8b86df7f603e966d58ed34c651", {
        about: "https://scvd.store",
        fetched_from: "https://x402-list.com",
      }),
      claim("payee_identity", "0x9453c2411fc45a8b86df7f603e966d58ed34c651", {
        about: "https://scvd.store",
        fetched_from: "https://scvd.store",
      }),
      "same_operator",
    );
    expect(binding.strength).toBe("not_compared");
    expect(binding.reason).toContain("G2");
  });
});

describe("bindClaims pairs kinds both sides stated", () => {
  it("skips a kind only one side has — that is not_observed, not a conflict", () => {
    const bindings = bindClaims(
      [claim("payee_identity", "0x9453c2411fc45a8b86df7f603e966d58ed34c651")],
      [claim("tool_identity", "buy_observation")],
      "same_subject",
    );
    expect(bindings).toEqual([]);
  });

  it("emits one binding per kind both sides stated", () => {
    const bindings = bindClaims(
      [
        claim("tool_identity", "buy_observation", { surface: "mcp_card" }),
        claim("route_identity", "settlement_attestation", { surface: "mcp_card" }),
      ],
      [
        claim("tool_identity", "buy_observation", { surface: "menu_json" }),
        claim("route_identity", "hello", { surface: "menu_json" }),
      ],
      "same_subject",
    );
    expect(bindings).toHaveLength(2);
    const byKind = Object.fromEntries(
      bindings.map((binding) => [binding.kind, binding.strength]),
    );
    expect(byKind["tool_identity"]).toBe("strong");
    expect(byKind["route_identity"]).toBe("conflict");
  });
});
