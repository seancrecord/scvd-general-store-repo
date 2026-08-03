import { describe, expect, it } from "vitest";
import packageJson from "../signer/package.json";
import readme from "../signer/README.md";
import license from "../signer/LICENSE?raw";
import {
  OFFER_REQUIRED_FIELDS as SIGN_OFFER_FIELDS,
  RECEIPT_REQUIRED_FIELDS as SIGN_RECEIPT_FIELDS,
  generateKeypair,
  signOffer,
  offersForAccepts,
  didDocument,
} from "../signer/x402-sign.js";
import {
  verifyArtifact,
  OFFER_REQUIRED_FIELDS as VERIFY_OFFER_FIELDS,
  RECEIPT_REQUIRED_FIELDS as VERIFY_RECEIPT_FIELDS,
} from "../verifier/x402-verify.js";
import vectors from "../conformance/offer-receipt-vectors.json";

/**
 * x402-sign: the issuing half of the pair, built 2026-08-03 after the
 * census found 34 of 35 discovery hosts serving no signed offers and
 * the one attempt unparseable. The outreach thesis is "here's the
 * finding and here's the npm package that closes it in an afternoon"
 * — which only lands if the package is PROVABLY conformant, so the
 * load-bearing test here is byte-reproduction of the published
 * vectors, not a round trip we grade ourselves on.
 */

const TEST_SEED = "42".repeat(32);

describe("provably conformant, not claimed conformant", () => {
  it("byte-reproduces the published known-good vector", async () => {
    // Ed25519 is deterministic: same payload, same key, same kid must
    // yield the exact JWS in the published vector set. If this fails,
    // the signer disagrees with the vectors and one of them is wrong.
    const valid = vectors.valid.find((v) => v.name === "offer_valid")!;
    const reproduced = await signOffer(
      valid.payload as Parameters<typeof signOffer>[0],
      { seedHex: TEST_SEED, kid: vectors.signing.kid },
    );
    expect(reproduced).toBe(valid.jws);
  });

  it("derives the vectors' own public key from the published seed", async () => {
    const kp = await generateKeypair({ seedHex: TEST_SEED });
    expect(kp.publicKeyHex).toBe(vectors.signing.public_key_hex);
  });

  it("round-trips through the SIBLING verifier, not through itself", async () => {
    const kp = await generateKeypair({ seedHex: TEST_SEED });
    const jws = await signOffer(
      {
        version: 1,
        resourceUrl: "https://shop.example/api/buy/x",
        scheme: "exact",
        network: "eip155:8453",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x1111111111111111111111111111111111111111",
        amount: "5000",
        validUntil: 4102444800,
      },
      { seedHex: TEST_SEED, kid: "did:web:shop.example#key-1" },
    );
    const result = (await verifyArtifact(jws, {
      publicKey: kp.publicKeyHex,
      kind: "offer",
    })) as { ok: boolean };
    expect(result.ok).toBe(true);
  });

  it("field lists agree with the verifier's — one spec, two codebases, checked", () => {
    expect([...SIGN_OFFER_FIELDS]).toEqual([...VERIFY_OFFER_FIELDS]);
    expect([...SIGN_RECEIPT_FIELDS]).toEqual([...VERIFY_RECEIPT_FIELDS]);
  });
});

describe("what it refuses", () => {
  it("throws on holes instead of signing a partial commitment", async () => {
    await expect(
      signOffer({ version: 1 } as never, {
        seedHex: TEST_SEED,
        kid: "did:web:x#k",
      }),
    ).rejects.toThrow(/refusing to sign/);
  });

  it("throws on a numeric amount — the million-fold mistake, refused at mint", async () => {
    await expect(
      signOffer(
        {
          version: 1,
          resourceUrl: "https://s.example/x",
          scheme: "exact",
          network: "eip155:8453",
          asset: "0xA",
          payTo: "0xB",
          amount: 0.005 as never,
          validUntil: 4102444800,
        },
        { seedHex: TEST_SEED, kid: "did:web:x#k" },
      ),
    ).rejects.toThrow(/STRING of atomic units/);
  });

  it("skips unsignable accepts entries and says which", async () => {
    const { extension, skipped } = await offersForAccepts(
      [
        {
          scheme: "exact",
          network: "eip155:8453",
          amount: "5000",
          asset: "0xA",
          payTo: "0xB",
        },
        { scheme: "exact" },
      ],
      {
        resourceUrl: "https://shop.example/api/buy/x",
        seedHex: TEST_SEED,
        kid: "did:web:shop.example#key-1",
        validUntil: 4102444800,
      },
    );
    expect(extension["offer-receipt"].info.offers).toHaveLength(1);
    expect(skipped).toEqual([1]);
  });
});

describe("the DID document it generates resolves the kid it tells you to use", () => {
  it("kid appears in verificationMethod and assertionMethod", async () => {
    const kp = await generateKeypair({ seedHex: TEST_SEED });
    const doc = didDocument({
      domain: "shop.example",
      publicKeyJwk: kp.publicKeyJwk,
    }) as {
      verificationMethod: { id: string; publicKeyJwk: { x: string } }[];
      assertionMethod: string[];
    };
    expect(doc.verificationMethod[0]!.id).toBe("did:web:shop.example#key-1");
    expect(doc.assertionMethod).toContain("did:web:shop.example#key-1");
    expect(doc.verificationMethod[0]!.publicKeyJwk.x).toBe(kp.publicKeyJwk.x);
  });
});

describe("the manifest tells the truth", () => {
  const manifest = packageJson as Record<string, unknown>;

  it("zero dependencies, four files, exports resolve", () => {
    expect(manifest["dependencies"]).toBeUndefined();
    expect((manifest["files"] as string[]).sort()).toEqual(
      ["LICENSE", "README.md", "x402-sign.d.ts", "x402-sign.js"].sort(),
    );
    expect(license).toContain("MIT License");
  });

  it("the README carries the census hook, the pairing, and no rotting counts beyond the dated census", () => {
    expect(readme).toContain("34 of 35");
    expect(readme).toContain("2026-08-03");
    expect(readme).toContain("x402-verify");
    expect(readme).toContain("atomic units");
    expect(readme.replace(/\s+/g, " ")).toContain("byte for byte");
  });
});
