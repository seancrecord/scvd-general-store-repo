import { Hono } from "hono";
import type { HonoEnv } from "@/types";
import { boundedText } from "@/lib/a2a-instrument";
import { kvGet, kvPut } from "@/lib/kv-retry";
import { KV_KEYS } from "@/lib/kv-keys";
import { CALLING_CARD_BODY_LIMIT, CALLING_CARD_PATHS, changeCallingCardKey, readCallingCardKey, observeCallingCard, receiveCallingCardReport } from "@/services/calling-card";
export const callingCardRoutes = new Hono<HonoEnv>();
// Cost guard, not an exact distributed quota; KV may admit concurrent requests.
let minute = "", used = 0;
callingCardRoutes.use("/bot-auth/*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    if (c.req.method === "GET" && c.req.path.startsWith(CALLING_CARD_PATHS.keys + "/"))
        return next();
    const bucket = new Date().toISOString().slice(0, 16);
    if (bucket !== minute) {
        minute = bucket;
        used = 0;
    }
    if (++used > 120)
        return c.json({ error: "capacity_reached" }, 429);
    const key = KV_KEYS.callingCardBudget(bucket);
    const total = Number(await kvGet(c.env.COUNTERS, key) ?? 0);
    if (total >= 300)
        return c.json({ error: "capacity_reached" }, 429);
    await kvPut(c.env.COUNTERS, key, String(total + 1), { expirationTtl: 120 });
    return next();
});
callingCardRoutes.post(CALLING_CARD_PATHS.keys, async (c) => {
    let value: unknown;
    try {
        value = JSON.parse(await boundedText(new Response(c.req.raw.body), CALLING_CARD_BODY_LIMIT));
    }
    catch {
        return c.json({ error: "invalid_or_oversize_input" }, 400);
    }
    try {
        return c.json(await changeCallingCardKey(c.env, value));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message === "key_revoked")
            return c.json({ error: "key_revoked", next_action: "Create a new local key and directory." }, 409);
        if (["invalid_envelope", "public_key_required", "invalid_action", "invalid_signature", "directory_proof_required", "unsupported_signature", "expired_signature", "invalid_directory_proof"].includes(message))
            return c.json({ error: message }, 400);
        return c.json({ error: "registration_unavailable", next_action: "Keep the local key; do not regenerate it just because publication failed." }, 503);
    }
});
callingCardRoutes.get(CALLING_CARD_PATHS.keys + "/:id", async (c) => {
    const row = await readCallingCardKey(c.env, c.req.param("id") ?? "");
    if (!row)
        return c.json({ error: "directory_unavailable" }, 404);
    return c.json({ keys: [{ ...row.key, kid: c.req.param("id") }] }, 200, { "Content-Type": "application/http-message-signatures-directory+json", "Signature-Input": row.signature_input, Signature: row.signature });
});
callingCardRoutes.get(CALLING_CARD_PATHS.observe, async (c) => {
    try {
        const observation = await observeCallingCard(c.env, c.req.raw);
        return c.json(observation, 200, { "Calling-Card-Recognition": "signature_verified" });
    }
    catch (error) {
        const reason = error instanceof Error ? error.message : "";
        const known = ["unsupported_signature", "expired_signature", "unrecognized_directory", "signature_not_verified"];
        return c.json({ identity: "not_verified", reason: known.includes(reason) ? reason : "observation_unavailable", payment: "not_observed" }, known.includes(reason) ? 401 : 503, { "Calling-Card-Recognition": "not_verified" });
    }
});
callingCardRoutes.post(CALLING_CARD_PATHS.reports, async (c) => {
    let value: unknown;
    try {
        value = JSON.parse(await boundedText(new Response(c.req.raw.body), CALLING_CARD_BODY_LIMIT));
    }
    catch {
        return c.json({ error: "invalid_or_oversize_input" }, 400);
    }
    try {
        const result = await receiveCallingCardReport(c.env, value);
        return c.json(result, result.duplicate ? 200 : 201);
    }
    catch (error) {
        const reason = error instanceof Error ? error.message : "";
        if (["invalid_envelope", "public_key_required", "invalid_action", "invalid_signature", "invalid_report", "unknown_key", "Invalid URL"].includes(reason))
            return c.json({ error: "report_refused" }, 400);
        return c.json({ error: "report_not_saved" }, 503);
    }
});
