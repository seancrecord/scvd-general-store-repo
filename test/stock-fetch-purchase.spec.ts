import { SELF } from "cloudflare:test";
import { beforeAll, expect, it, vi } from "vitest";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { installFacilitatorMock, TEST_PAYER } from "./helpers/facilitator-mock";

// Exercise the SDK that CDP's wallet client plugs into. Signing and settlement
// are local doubles: this checks transport interoperability, not live funds.
let facilitator: ReturnType<typeof installFacilitatorMock>;
beforeAll(() => { facilitator = installFacilitatorMock(); });

it("the stock fetch client quotes, constructs its payload, retries, and receives verifiable goods", async () => {
  const signer = { address: TEST_PAYER as `0x${string}`, signTypedData: vi.fn(async () => `0x${"cd".repeat(65)}` as `0x${string}`) };
  const client = new x402Client().register("eip155:8453", new ExactEvmScheme(signer));
  const requests: Request[] = [];
  const fetchWithPayment = wrapFetchWithPayment(async (input, init) => {
    const request = new Request(input, init);
    requests.push(request.clone());
    return SELF.fetch(request);
  }, client);
  const before = facilitator.settleCalls;
  const url = "https://scvd.store/api/buy/small_blessing?agent_name=SDK%20buyer";
  const response = await fetchWithPayment(url);
  expect(response.status).toBe(200);
  expect(requests).toHaveLength(2);
  expect(requests.map(request => request.url)).toEqual([url, url]);
  expect(requests[0]!.headers.has("PAYMENT-SIGNATURE")).toBe(false);
  expect(requests[1]!.headers.has("PAYMENT-SIGNATURE")).toBe(true);
  expect(signer.signTypedData).toHaveBeenCalledOnce();
  expect(facilitator.settleCalls - before).toBe(1);
  expect(response.headers.get("PAYMENT-RESPONSE")).toBeTruthy();
  const goods = await response.json() as { certificate: { cert_id: string } };
  expect(goods.certificate.cert_id).toBeTruthy();
  const verified = await (await SELF.fetch(`https://scvd.store/api/verify/${goods.certificate.cert_id}`)).json() as { valid: boolean };
  expect(verified.valid).toBe(true);
});
