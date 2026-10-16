import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { SpendQuote, PriceEstimate } from "@/generation/pricing";
import { RequestGuardError, credentialIdentity } from "./request-guard";

export function inputDigest(path: string, input: Record<string, unknown>) {
  const stable = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(stable)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, item]) => [key, stable(item)]),
          )
        : value;
  return createHash("sha256")
    .update(JSON.stringify([path, stable(input)]))
    .digest("hex");
}
export type QuoteClaim = {
  id: string;
  account: string;
  digest: string;
  unitUsd: number;
  count: number;
  expiresAt: number;
  kind: string;
};
export function signQuote(
  secret: Buffer,
  apiKey: string,
  path: string,
  input: Record<string, unknown>,
  price: PriceEstimate,
  count: number,
): SpendQuote {
  if (price.usd === null)
    throw new RequestGuardError(
      "Higgsfield returned a pricing description that cannot be safely calculated for this input. No generation was submitted. Review pricing or choose another input/model.",
      422,
    );
  const claim: QuoteClaim = {
    id: crypto.randomUUID(),
    account: credentialIdentity(apiKey),
    digest: inputDigest(path, input),
    unitUsd: price.usd,
    count,
    expiresAt: Date.now() + 10 * 60000,
    kind: price.kind,
  };
  const payload = Buffer.from(JSON.stringify(claim)).toString("base64url");
  const token = `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
  return {
    ...price,
    token,
    count,
    totalUsd: Math.ceil(price.usd * count * 1e6) / 1e6,
    expiresAt: claim.expiresAt,
    model: path,
    resolution: String(input.resolution ?? "Default"),
    duration: Number(input.duration ?? 0),
  };
}
export function verifyQuote(
  secret: Buffer,
  apiKey: string,
  path: string,
  input: Record<string, unknown>,
  token: unknown,
): QuoteClaim {
  if (typeof token !== "string" || token.length > 3000)
    throw new RequestGuardError(
      "Review and approve the generation cost first.",
      428,
    );
  const [payload, signature] = token.split(".");
  try {
    const expected = createHmac("sha256", secret).update(payload).digest();
    const supplied = Buffer.from(signature ?? "", "base64url");
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      throw new Error();
    const claim = JSON.parse(
      Buffer.from(payload, "base64url").toString(),
    ) as QuoteClaim;
    if (
      claim.account !== credentialIdentity(apiKey) ||
      claim.digest !== inputDigest(path, input) ||
      claim.expiresAt < Date.now() ||
      !Number.isFinite(claim.unitUsd) ||
      claim.unitUsd < 0 ||
      !Number.isInteger(claim.count) ||
      claim.count < 1 ||
      claim.count > 4 ||
      typeof claim.id !== "string"
    )
      throw new Error();
    return claim;
  } catch {
    throw new RequestGuardError(
      "This cost approval expired or the inputs changed. Review the cost again.",
      428,
    );
  }
}
