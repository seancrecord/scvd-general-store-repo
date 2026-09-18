import { fulfillPurchase } from "@/services/fulfillment";
import { purchaseInputFrom, queryArgs } from "@/lib/purchase-args";
import type { ObservationCheckpoint, PreparedObservation } from "@/services/purchase-observation";
import type { PendingPayment } from "@/lib/payments";
import type { Env, MenuItem } from "@/types";

/**
 * THE REAL PRODUCER, REACHED THROUGH THE DOOR THAT ALREADY OWNS IT.
 *
 * The injected preparer proved the ordering. This is what actually
 * makes the goods, and the point of this file is that it contains no
 * knowledge of WHAT any product is. There is no map from item id to
 * producer here and there must never be one: `fulfillPurchase` is
 * that map, it has been that map since before UCP existed, and a
 * second copy would be a second opinion about what a buyer receives.
 *
 * HOW IT STOPS BEFORE THE MONEY. `fulfillPurchase` is written around
 * one line — `pending.settle()` — with every observation, probe and
 * signature above it and the mint below it. That is rule 9, and the
 * comment above that line says exactly what a failure at it costs:
 * "the work above is simply thrown away, which is the cheap
 * direction".
 *
 * Except that for these products the work above is NOT thrown away,
 * and that is the whole purpose of the observation journal: the
 * prepared bytes are retained a handful of lines earlier, in the same
 * function, before settlement is attempted. So a `settle` that refuses
 * produces precisely what this increment needs — every real producer
 * run, the exact produced bytes durably checkpointed, and no
 * authorization ever presented.
 *
 * The refusal is a sentinel rather than an error to be logged. Nothing
 * went wrong; the caller asked for preparation and preparation is what
 * happened.
 */

export class PreparationOnly extends Error {
  constructor() {
    super("Preparation only: this pass never presents a payment");
    this.name = "PreparationOnly";
  }
}

/**
 * Build the fulfillment input from the checkout's OWN frozen inputs.
 *
 * Through `purchaseInputFrom`, the same mapper the 402 door and the
 * MCP door use — so a UCP buyer's `url` becomes the same
 * `FulfillmentInput` field, with the same validation, as everybody
 * else's. The inputs come from the checkout rather than from the
 * completion request: they were frozen at Create along with the price
 * and the tier, and a completion cannot introduce new ones.
 */
export function fulfillmentInputFor(item: MenuItem, inputs: Record<string, string>) {
  return purchaseInputFrom(item, queryArgs((name) => inputs[name]));
}

/**
 * Run the real production for one checkout line and leave the produced
 * bytes in the journal. Returns what the journal holds afterwards.
 *
 * NO MONEY IS PRESENTED. The `settle` handed in throws, which is the
 * mechanism, and the caller is expected to treat `PreparationOnly` as
 * success rather than failure.
 */
export async function prepareThroughFulfillment(
  env: Env,
  item: MenuItem,
  checkpoint: ObservationCheckpoint,
  args: {
    inputs: Record<string, string>;
    payer: string;
    network: string;
    paidUsdc: number;
    tipUsdc?: number;
  },
): Promise<PreparedObservation> {
  const pending: PendingPayment = {
    paidUsdc: args.paidUsdc,
    tipUsdc: args.tipUsdc ?? 0,
    payer: args.payer,
    network: args.network,
    observation: checkpoint,
    settle: async () => {
      throw new PreparationOnly();
    },
  };

  try {
    await fulfillPurchase(env, item, pending, fulfillmentInputFor(item, args.inputs));
  } catch (error) {
    /**
     * The sentinel is the expected exit. Anything else is a real
     * preparation failure and belongs to the caller, which will leave
     * the checkout payable and take no ownership.
     */
    if (!(error instanceof PreparationOnly)) throw error;
  }

  /**
   * Read the journal rather than trusting the return we never got.
   * If the goods are not durably there, preparation did not happen
   * whatever else may have run, and saying otherwise would let
   * ownership be taken on goods the store cannot prove it holds.
   */
  const retained = await checkpoint.read();
  if (!retained) {
    throw new Error("Preparation produced nothing the journal retained");
  }
  return retained;
}
