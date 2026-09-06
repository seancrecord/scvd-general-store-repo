import { expect, it } from "vitest";
import { installBuyerHarness, object, request, type Obj } from "./helpers/buyer-harness";

installBuyerHarness();
it("discovery reports a delivery failure as charged", async () => {
  const listing = object(await (await request("/menu/daily_fortune")).json());
  expect((listing.errors as Obj[]).find(error => error.code === "delivery_failed")).toMatchObject({ charged: true });
});
