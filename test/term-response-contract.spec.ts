import { SELF, env } from "cloudflare:test";
import { beforeAll, expect, it } from "vitest";
import { Ajv } from "ajv";
import { createOrRenewPass } from "@/services/patronage";
import { startOperatorStatement } from "@/services/operator-statement";
import { BASE_RAIL } from "@/lib/statement-rails";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import type { Env } from "@/types";

const e = env as unknown as Env, base = "https://scvd.store";
beforeAll(installFacilitatorMock);
it("the served patronage response matches its published schema, including the signed monthly note", async () => {
  const pass = await createOrRenewPass(e, { patronNumber: 1 });
  const body = await (await SELF.fetch(`${base}/api/patronage/${pass.pass.pass_id}`)).json();
  const validate = await validator("/api/patronage/{pass_id}");
  expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
  expect(validate({ ...body as object, monthly_note: "unsigned replacement" })).toBe(false);
});
it("the operator history declares its commission and opening chain position before purchase", async () => {
  const { record } = await startOperatorStatement(e, `0x${"12".repeat(20)}`, { ...BASE_RAIL, head: async () => 100 }, undefined,
    { certId: "fixture-cert" });
  const body = await (await SELF.fetch(`${base}/api/operator-statement/${record.statement_id}`)).json();
  const validate = await validator("/api/operator-statement/{statement_id}");
  expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
  expect(validate({ ...body as object, commission: "not a signed commission" })).toBe(false);
  expect(validate({ ...body as object, opened_at_block: "unknown" })).toBe(false);
});
async function validator(path: string) {
  const doc = await (await SELF.fetch(`${base}/openapi.json`)).json() as {
    paths: Record<string, { get: { responses: { "200": { content: { "application/json": { schema: object } } } } } }>;
    components: object;
  };
  return new Ajv({ strict: false, allErrors: true, validateFormats: false }).compile({
    ...doc.paths[path]!.get.responses["200"].content["application/json"].schema, components: doc.components,
  });
}
