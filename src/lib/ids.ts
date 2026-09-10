/**
 * Short, human-copyable ids. An order number should fit on a paper receipt.
 */

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/**
 * Rejection sampling, not `byte % 31`. A byte has 256 values and the
 * alphabet 31, so the plain modulo hands the first eight letters nine
 * chances each and the rest eight — a bias of about one part in
 * thirty per character. Invisible on an order number; not the
 * property a bearer token should have, and the fix is free. Bytes
 * above the largest whole multiple of the alphabet are thrown away.
 */
const UNBIASED_LIMIT = 256 - (256 % ALPHABET.length);

function randomToken(length: number): string {
  let token = "";
  while (token.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length - token.length));
    for (const byte of bytes) {
      if (byte >= UNBIASED_LIMIT) continue;
      token += ALPHABET[byte % ALPHABET.length];
      if (token.length === length) break;
    }
  }
  return token;
}

export function newOrderId(): string {
  return `ord_${randomToken(10)}`;
}

export function newCertId(): string {
  return `cert_${randomToken(10)}`;
}

export function newEntryId(): string {
  return randomToken(8);
}

export function newRequestId(): string {
  return `req_${randomToken(10)}`;
}

export function newStampId(): string {
  return `stamp_${randomToken(10)}`;
}

export function newTipId(): string {
  return `tip_${randomToken(10)}`;
}

export function newAnchorId(): string {
  return `anchor_${randomToken(10)}`;
}

const PASS_PREFIX = "pass_";
const PASS_TOKEN_LENGTH = 10;

export function newPassId(): string {
  return `${PASS_PREFIX}${randomToken(PASS_TOKEN_LENGTH)}`;
}

export function isPassId(value: string): boolean {
  return value.startsWith(PASS_PREFIX)
    && value.length === PASS_PREFIX.length + PASS_TOKEN_LENGTH
    && [...value.slice(PASS_PREFIX.length)].every(character => ALPHABET.includes(character));
}

export function newCheckId(): string {
  return `check_${randomToken(10)}`;
}

export function newLetterId(): string {
  return `letter_${randomToken(12)}`;
}

export function newConfessionId(): string {
  return `conf_${randomToken(10)}`;
}

export function newTagId(): string {
  return `tag_${randomToken(10)}`;
}

export function newRefundId(): string {
  return `refund_${randomToken(10)}`;
}

export function newLuckyId(): string {
  return `lucky_${randomToken(10)}`;
}

export function newLuckyStockId(): string {
  return `stock_${randomToken(8)}`;
}
