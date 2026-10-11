import type { GenerationPlane } from "./catalog";
import type { QueuedGeneration, StatusResult } from "./platform";

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

export const submitGeneration = (
  plane: GenerationPlane,
  idempotencyKey: string,
) =>
  generationRequest<QueuedGeneration>("/api/generations", {
    plane,
    idempotencyKey,
  });
export const getGenerationStatuses = (
  requests: { requestId: string; statusUrl?: string }[],
) => generationRequest<StatusResult[]>("/api/generations/status", { requests });
export const cancelGeneration = (requestId: string) =>
  generationRequest<{ canceled: boolean }>("/api/generations/cancel", {
    requestId,
  });
