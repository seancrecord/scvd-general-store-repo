import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  RECEIPT_COHERENCE_CLASS,
  listPriceUsdc,
  receiptRowVerdict,
} from "@/discovery/receipt-coherence";
import {
  hashSelectedSurface,
  selectedSurface,
} from "@/discovery/receipt-surface";
import { protocolFamily } from "@/evidence";
import {
  certificateSignatureForm,
  signCertificate,
} from "@/lib/signing";
import { mintCertificate } from "@/services/certificates";
import { getMenuItem } from "@/store";
import type { Certificate, Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * Landscape §11 #7 — dogfood first: our own receipts bind a hash of
 * the catalog surface the buyer selected, and the join names agree /
 * conflict / not_observed. No scores. No new SKU.
 */

describe("receipt_coherence is a protocol-registry row", () => {
  it("is a family, not a schema migration", () => {
    expect(protocolFamily("receipt_coherence")).toBeDefined();
    expect(RECEIPT_COHERENCE_CLASS).toBe("receipt_coherence");
  });
});

describe("the join of a receipt against the selected surface", () => {
  it("agrees when route, list price, and saw match hello's catalog", async () => {
    const item = getMenuItem("hello");
    expect(item).toBeDefined();
    const catalog = selectedSurface(item!);
    const catalogSaw = await hashSelectedSurface(catalog);
    const verdict = receiptRowVerdict({
      catalog,
      catalog_saw: catalogSaw,
      cert: {
        item: "hello",
        paid_usdc: item!.price_usdc,
        saw: catalogSaw,
      },
    });
    expect(verdict.derived).toBe("agree");
    expect(verdict.disagreements).toEqual([]);
    expect(verdict.not_observed).toEqual([]);
  });

  it("conflicts when a planted list price disagrees with the catalog", async () => {
    const item = getMenuItem("hello");
    expect(item).toBeDefined();
    const catalog = selectedSurface(item!);
    const catalogSaw = await hashSelectedSurface(catalog);
    const verdict = receiptRowVerdict({
      catalog,
      catalog_saw: catalogSaw,
      cert: {
        item: "hello",
        paid_usdc: item!.price_usdc + 1,
        saw: catalogSaw,
      },
    });
    expect(verdict.derived).toBe("conflict");
    expect(verdict.disagreements.map((row) => row.field)).toContain(
      "price_usdc",
    );
  });

  it("treats a missing saw as not_observed, not a conflict", async () => {
    const item = getMenuItem("hello");
    expect(item).toBeDefined();
    const catalog = selectedSurface(item!);
    const catalogSaw = await hashSelectedSurface(catalog);
    const verdict = receiptRowVerdict({
      catalog,
      catalog_saw: catalogSaw,
      cert: { item: "hello", paid_usdc: item!.price_usdc },
    });
    expect(verdict.derived).toBe("agree");
    expect(verdict.not_observed.map((row) => row.field)).toContain("saw");
    expect(verdict.disagreements).toEqual([]);
  });

  it("books list price as paid minus tip", () => {
    expect(listPriceUsdc({ item: "hello", paid_usdc: 0.75, tip_usdc: 0.25 })).toBe(
      0.5,
    );
  });
});

describe("a minted hello binds the surface it was sold from", () => {
  it("derives saw from the menu, never from the caller", async () => {
    const item = getMenuItem("hello");
    expect(item).toBeDefined();
    const expected = await hashSelectedSurface(selectedSurface(item!));
    const minted = await mintCertificate(testEnv, { itemId: "hello" });
    expect(minted.certificate.saw).toBe(expected);
  });

  it("leaves saw unset when the item is not on the menu", async () => {
    const minted = await mintCertificate(testEnv, {
      itemId: "stamp_test_free",
    });
    expect(minted.certificate.saw).toBeUndefined();
  });

  it("breaks both signature forms if saw is stapled on after signing", async () => {
    const bare: Certificate = {
      cert_id: "cert_saw_staple",
      item: "hello",
      patron_number: 1,
      date: "2026-08-25T00:00:00.000Z",
    };
    const { signature, publicKey } = await signCertificate(
      bare,
      testEnv.SIGNING_KEY,
    );
    expect(await certificateSignatureForm(bare, signature, publicKey)).toBe(
      "current",
    );
    const forged: Certificate = {
      ...bare,
      saw: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    };
    expect(await certificateSignatureForm(forged, signature, publicKey)).toBe(
      "invalid",
    );
  });

  it("breaks the signature if saw is altered after minting", async () => {
    const minted = await mintCertificate(testEnv, { itemId: "hello" });
    expect(minted.certificate.saw).toBeDefined();
    const tampered: Certificate = {
      ...minted.certificate,
      saw: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    };
    expect(
      await certificateSignatureForm(
        tampered,
        minted.signature,
        minted.publicKey,
      ),
    ).toBe("invalid");
  });
});
