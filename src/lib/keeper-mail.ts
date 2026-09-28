import { outboundHeaders } from "@/lib/identity";
import type { Env, MailOutcome } from "@/types";

/**
 * ONE WAY TO SEND A MAIL, for the desks that need one (2026-09-28).
 *
 * The alerts module has sent through Resend since the P1 conditions
 * existed — one fetch, one secret, no bindings — and the mailbox now
 * needs the same wire for two things the alarm line was never for: a
 * correspondent who left an address, and the keeper learning a letter
 * landed before Sunday. This is that wire and nothing else. It does
 * not decide who gets mail, it does not retry, and it never throws:
 * mail is decoration and decoration fails open (AT_SCALE rule 7), so
 * the caller gets a word it can write down and the thing it was
 * doing carries on.
 */
export type { MailOutcome };

export interface MailMessage {
  to: string;
  cc?: string[];
  /** The address a reply to this mail should reach. */
  replyTo?: string;
  subject: string;
  text: string;
}

/** The sending identity. Same verified domain the alarms use. */
export const MAIL_FROM = "The Store <letters@scvd.store>";

export async function sendMail(
  env: Env,
  message: MailMessage,
): Promise<MailOutcome> {
  if (!env.RESEND_API_KEY) {
    return "unconfigured";
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: outboundHeaders({
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        from: MAIL_FROM,
        to: [message.to],
        ...(message.cc?.length ? { cc: message.cc } : {}),
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        subject: message.subject,
        text: message.text,
      }),
    });
    return response.ok ? "sent" : "failed";
  } catch (error) {
    // The mail must never take down the desk that asked for it.
    console.error("Mail send failed:", error);
    return "failed";
  }
}

/**
 * THE SHAPE OF AN ADDRESS, and no more than the shape. One @, no
 * whitespace, a dot after it; the length RFC 5321 allows. Anything
 * stricter refuses real addresses, and nothing here needs to know
 * whether the mailbox exists — the send will say.
 */
export function readEmailAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}
