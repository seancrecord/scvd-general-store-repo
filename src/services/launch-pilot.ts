import { checkProbeTarget } from "@/lib/probe-target";
import { snapshotLaunchCheckRequest, type LaunchCheckRequest } from "@/services/launch-check";
import type { Env } from "@/types";

export interface LaunchPilotInput {
  /** Keeper-assigned once per agreed attempt. Reuse it on every recovery call. */
  id: string;
  url: string;
  request: LaunchCheckRequest;
}

/** Internal binding invocation only. No HTTP route, timer or CLI calls this.
 * Calling it CAN spend the field wallet, subject to the existing walk's rules. */
export async function runLaunchPilot(env: Env, input: LaunchPilotInput) {
  const pilot = snapshotLaunchPilot(env, input);
  if (!env.PAID_RECOVERIES) throw new Error("Launch pilot storage unavailable");
  // Identity is the agreed run, not a digest of inputs. Changing an input must
  // reach the same journal and be refused, rather than create a fresh purchase.
  return env.PAID_RECOVERIES.getByName(`launch-pilot:${pilot.id}`).prepareLaunchPilot(pilot);
}

export function snapshotLaunchPilot(env: Env, input: LaunchPilotInput): LaunchPilotInput {
  if (!input || Object.keys(input).some(key => !["id", "url", "request"].includes(key))
    || typeof input.id !== "string" || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(input.id)) {
    throw new Error("Launch pilot requires a fixed lowercase run id");
  }
  if (typeof input.url !== "string" || input.url.length > 2048 || /[\u0000-\u0020\u007f#]/.test(input.url)) {
    throw new Error("Launch pilot requires a public HTTPS URL without whitespace or fragments");
  }
  let url: URL;
  try { url = new URL(input.url); } catch { throw new Error("Launch pilot requires a public HTTPS URL"); }
  const target = checkProbeTarget(url, new URL(env.STORE_BASE_URL).host);
  if (!target.ok) throw new Error("Launch pilot target refused by the public-endpoint policy");
  const request = snapshotLaunchCheckRequest(input.request);
  if (!request) throw new Error("Launch pilot requires an explicit POST request");
  return { id: input.id, url: input.url, request };
}
