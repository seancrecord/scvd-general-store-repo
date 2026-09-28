export declare const PAY_TO_DIGEST_SALT: "scvd:payto:v1:";
export declare function normalizePayTo(address: string): string;
export declare function payToDigest(address: string): Promise<string>;
