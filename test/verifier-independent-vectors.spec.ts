import { describe, expect, it } from 'vitest';
import matrix from '../verifier/fixtures/independent/matrix.json';
import { verifyArtifact, verifyOffer, verifyReceipt } from '../verifier/x402-verify.js';

// Native workerd Ed25519, no signing helper and no permissive crypto seam.
// The generator's separate implementation checks unsupported families; these
// assertions check that the production package refuses them in this runtime.
describe('independent verifier fixtures in workerd', () => {
  for (const vector of matrix.vectors) {
    it(vector.id, async () => {
      const jwk = 'publicJwk' in vector ? vector.publicJwk : undefined;
      const publicKey = jwk?.kty === 'OKP' && jwk.x
        ? Uint8Array.from(atob(jwk.x.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)) : undefined;
      const kind = vector.kind as 'offer' | 'receipt';
      const options = { kind, publicKey, nowSeconds: matrix.clock,
        fetch: async () => { throw new Error('fixtures never resolve a live issuer'); } };
      const result = await verifyArtifact(vector.artifact, options);
      expect(result.status).toBe(vector.expectedPackage.status);
      expect(result.ok).toBe(vector.expectedPackage.status === 'valid');
      for (const reason of vector.expectedPackage.reasons) expect(result.reasonCodes).toContain(reason);
      if ('signature' in vector.expectedPackage) expect(result.checks.find((c) => c.name === 'signature')?.status).toBe(vector.expectedPackage.signature);
      const bounded = kind === 'offer' ? await verifyOffer({ offer: vector.artifact, publicKey }, options)
        : await verifyReceipt({ receipt: vector.artifact, publicKey }, options);
      expect(bounded.status).toBe(result.status);
      if (vector.case === 'wrong-authority' || vector.case === 'authority-unavailable') {
        expect(bounded.doesNotEstablish.some((text) => text.includes('authorization'))).toBe(true);
      }
    });
  }
});

// Transport support must preserve the native runtime's verdict on hostile bytes.
describe('JWS envelopes in workerd', () => {
  for (const vector of matrix.vectors.filter(v => v.family === 'EdDSA' && v.oracle.encoding === 'jws')) {
    it(`wrapped ${vector.id}`, async () => {
      const jwk = 'publicJwk' in vector ? vector.publicJwk : undefined;
      const publicKey = Uint8Array.from(atob(jwk!.x.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
      const kind = vector.kind as 'offer' | 'receipt';
      const options = { kind, publicKey, nowSeconds: matrix.clock,
        fetch: async () => { throw new Error('no live issuer'); } };
      const envelope = { format: 'jws', signature: vector.artifact };
      const plain = await verifyArtifact(vector.artifact, options);
      const wrapped = await verifyArtifact(envelope, options);
      expect({ ...wrapped, scope: plain.scope }).toEqual(plain);
      expect(wrapped.scope).toContain('acceptIndex is unsigned');
    });
  }
  it('refuses ambiguous payloads and wrapper-selected keys before resolution', async () => {
    const vector = matrix.vectors.find(v => v.family === 'EdDSA' && v.kind === 'receipt' && v.case === 'positive')!;
    let calls = 0;
    for (const extra of [{ payload: {} }, { issuerKeyUrl: 'https://attacker.invalid/key' }, { acceptIndex: 0 }]) {
      const result = await verifyReceipt({ receipt: { format: 'jws', signature: vector.artifact, ...extra } }, {
        fetch: async () => { calls++; throw new Error('must not fetch'); },
      });
      expect(result.valid).toBe(false);
      expect(['invalid', 'unsupported']).toContain(result.status);
    }
    expect(calls).toBe(0);
  });
});
