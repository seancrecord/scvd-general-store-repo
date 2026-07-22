/**
 * Signature-seeded rendering. Every signed artifact (stamp, badge,
 * certificate label) takes its tiny physical imperfections from its
 * own signature bytes: how the stamp landed, how much ink was on it,
 * where the hairline sat. Deterministic — same signature, same
 * rendering, forever. No randomness, no fake texture, no rarity.
 */

export interface InkParams {
  /** Rotation nudge in degrees, within ±2. */
  rotationDeg: number;
  /** Ink density as opacity, 0.84–1.0. */
  inkOpacity: number;
  /** Hairline offset in px, within ±1.5. */
  hairlineOffset: number;
}

const NEUTRAL: InkParams = { rotationDeg: 0, inkOpacity: 1, hairlineOffset: 0 };

export function inkParamsFromSignature(signatureHex?: string): InkParams {
  if (!signatureHex || signatureHex.length < 6) {
    return NEUTRAL;
  }
  const byteAt = (index: number): number => {
    const parsed = parseInt(signatureHex.slice(index * 2, index * 2 + 2), 16);
    return Number.isNaN(parsed) ? 0 : parsed;
  };
  return {
    rotationDeg: round2((byteAt(0) / 255) * 4 - 2),
    inkOpacity: round2(0.84 + (byteAt(1) / 255) * 0.16),
    hairlineOffset: round2((byteAt(2) / 255) * 3 - 1.5),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
