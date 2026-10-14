/**
 * HOW TO JOIN, said on the door itself (2026-09-04, CV's fourth
 * round). The sold-out 409 hands a buyer this URL and says "leave your
 * callback"; the obvious next move is a GET, and a GET answered "That
 * aisle doesn't exist." The route took POST and nothing said so. The
 * same block rides the 409 and the GET, so the instructions cannot
 * drift between the pointer and the door.
 */
export function waitlistHowToJoin(base: string, itemId: string): Record<string, unknown> {
  return {
    waitlist_url: `${base}/api/waitlist/${itemId}`,
    waitlist_method: "POST",
    waitlist_body: {
      agent_name: "optional, up to 80 characters, recorded as written",
      callback_url:
        "optional https URL; the keeper reads the list by hand and rings it when a slot opens",
    },
    waitlist_note:
      "Free. Nothing is charged for joining, and a GET on that URL answers with these same instructions.",
  };
}
