import type { GenerationPlane } from "./catalog";
import type { QueuedGeneration, StatusResult } from "./platform";
import type { SpendQuote } from "./pricing";
import { reviewSpend } from "./spend-review";

export class GenerationRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function generationRequest<T>(
  url: string,
  body: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new GenerationRequestError(
      data.error || `Request failed (${response.status})`,
      response.status,
    );
  return data as T;
}

export async function estimateGeneration(plane:GenerationPlane,count=1):Promise<SpendQuote> {
  return generationRequest<SpendQuote>("/api/generations/estimate",{plane,count});
}
export async function authorizeGeneration(plane:GenerationPlane,count=1,label="Generation"):Promise<SpendQuote> {
  const quote=await estimateGeneration(plane,count);
  await reviewSpend(quote,label);
  return quote;
}

export const submitGeneration = async (
  plane: GenerationPlane,
  idempotencyKey: string,
  approved?: SpendQuote,
) => {
  const response=await fetch(`/api/usage?intent=${encodeURIComponent(idempotencyKey)}`,{cache:"no-store"});
  const previous=response.ok?await response.json():null;
  if(previous?.entry?.receipt)return previous.entry.receipt as QueuedGeneration;
  const recovering=previous?.entry?.state==="uncertain";
  const quote=recovering?undefined:approved??await authorizeGeneration(plane,1,"Generate this shot");
  return generationRequest<QueuedGeneration>("/api/generations", {
    plane,
    idempotencyKey,
    approval:quote?.token,
  });
};
export const getGenerationStatuses = (
  requests: { requestId: string; statusUrl?: string }[],
) => generationRequest<StatusResult[]>("/api/generations/status", { requests });
export const cancelGeneration = (requestId: string) =>
  generationRequest<{ canceled: boolean }>("/api/generations/cancel", {
    requestId,
  });
