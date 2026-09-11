# HTTP purchase inputs and free price discovery

`GET /api/buy/{item_id}` validates required and supplied inputs before issuing usable x402 payment terms. Missing, empty, whitespace-only or malformed inputs receive the existing field refusal, with `charged:false`, `input_field` and `input_contract_url`. These refusals contain no `PAYMENT-REQUIRED`, `X-PAYMENT-REQUIRED` or `accepts` offer. Items whose contract requires no inputs can still be quoted without any.

For price-only discovery, read `/api/catalog/v1` or `/menu/{item_id}?view=compact`, both free. The compact item contract includes `price_usdc`, offered price tiers and `input_schema`. Its `checkout` contract declares `valid_inputs_required_before_quote:true`. Compose a purchase with the buyer's actual required inputs, request a fresh quote, then retry the same URL and inputs with the selected signed payment. Catalog prices are discovery data, not a signed authorization to spend; the fresh quote remains the payment authority.

This supersedes the July policy that returned 402 to bare probes of input-dependent products. Existing scanners should read the free contract to discover prices instead of treating a bare input refusal as a missing product. Clients must not substitute an example URL, invented transaction or synthetic brief merely to obtain payment terms.

Both the main store and the smaller doors Worker apply the same input rules. Requests requiring the store's private field-wallet capability reach the store through the existing service binding. Signed requests still reach the store directly. An authenticated retained purchase remains eligible for original-goods recovery; stricter rules for new purchases never authorize another charge to retrieve old goods.
