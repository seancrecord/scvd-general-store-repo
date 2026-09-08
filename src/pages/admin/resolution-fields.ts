/** The same evidence inputs accompany every human-resolution control. */
export function resolutionEvidenceFields(): string {
  return `<fieldset><legend>Human purchase evidence</legend>
    <label>Payment network (CAIP-2, from the receipt)<input name="network" placeholder="eip155:8453"></label>
    <label>Completed original order ID<input name="order_id"></label>
    <label>Refund transaction (full USDC amount to the original payer)<input name="refund_tx"></label>
    <label>Refund sender, if different from the original receiving wallet<input name="refund_payer"></label>
    <small>Human work needs its completed order; a refund needs a finalized transfer. House absorption requires a recorded house payer. This control sends no refund.</small>
  </fieldset>`;
}
