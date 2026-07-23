/**
 * Short, human-copyable ids. An order number should fit on a paper receipt.
 */

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function randomToken(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let token = "";
  for (const byte of bytes) {
    token += ALPHABET[byte % ALPHABET.length];
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

export function newPassId(): string {
  return `pass_${randomToken(10)}`;
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

export function newRefundId(): string {
  return `refund_${randomToken(10)}`;
}
