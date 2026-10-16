import { toAuthorizationHeader } from "./credentials";

const MODEL_ID = /^[a-z0-9][a-z0-9._/-]*$/i;

export class PlatformError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(messageFromBody(status, body));
    this.name = "PlatformError";
    this.status = status;
    this.body = body;
  }
}

export type QueuedGeneration = {
  correlationId?: string;
  status: string;
  requestId: string;
  statusUrl: string;
  cancelUrl: string;
};

export type GenerationStatus = {
  status: string;
  requestId: string;
  images?: Array<{ url: string }>;
  video?: { url: string };
  error?: unknown;
};

/** One request's answer inside a batched status poll. A request that errors
    carries its reason alone, so it cannot lose the answers standing beside it. */
export type StatusResult =
  | { requestId: string; status: GenerationStatus }
  | { requestId: string; error: string; retryable?: boolean };

export type PlatformClientOptions = {
  apiKey: string;
  baseUrl: string;
  fetch?: typeof fetch;
};

export function isModelId(model: string): boolean {
  return MODEL_ID.test(model) && !model.includes("..");
}

export function createPlatformClient(options: PlatformClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const fetchImpl = options.fetch ?? fetch;
  const auth = toAuthorizationHeader(options.apiKey);
  let correlationId: string | undefined;

  async function send(
    method: "GET" | "POST",
    path: string,
    body?: Record<string, unknown>,
    idempotencyKey?: string,
  ) {
    const url = new URL(path, `${baseUrl}/`);
    if (url.origin !== new URL(baseUrl).origin || url.username || url.password)
      throw new PlatformError(400, { detail: "Invalid platform request URL" });
    const response = await fetchImpl(url, {
      method,
      headers: {
        Authorization: auth,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
      redirect: "error",
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    const payload = await readJson(response);
    correlationId = response.headers.get("X-Correlation-ID") ?? undefined;
    if (!response.ok) throw new PlatformError(response.status, payload);
    return payload;
  }

  return {
    async estimate(model:string,input:Record<string,unknown>):Promise<unknown> {
      if(!isModelId(model)) throw new PlatformError(400,{detail:"Invalid model"});
      return send("POST", `/estimate/${model}`, input);
    },
    async submit(
      model: string,
      input: Record<string, unknown>,
      idempotencyKey = crypto.randomUUID(),
    ): Promise<QueuedGeneration> {
      if (!isModelId(model))
        throw new PlatformError(400, { detail: "Invalid model" });
      for (let attempt = 0; ; attempt++) {
        try {
          const result = mapQueued(
            await send("POST", `/${model}`, input, idempotencyKey),
          );
          return {...result,...(correlationId?{correlationId}:{})};
        } catch (error) {
          if (
            attempt >= 1 ||
            (error instanceof PlatformError && error.status < 500)
          )
            throw error;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    },
    async status(
      requestId: string,
      statusUrl?: string,
    ): Promise<GenerationStatus> {
      if (!requestId)
        throw new PlatformError(400, { detail: "Missing request id" });
      if (
        statusUrl &&
        new URL(statusUrl, `${baseUrl}/`).pathname !==
          `/requests/${encodeURIComponent(requestId)}/status`
      )
        throw new PlatformError(400, { detail: "Invalid status URL" });
      return mapStatus(
        await send(
          "GET",
          statusUrl || `/requests/${encodeURIComponent(requestId)}/status`,
        ),
      );
    },
    async cancel(requestId: string) {
      if (!requestId)
        throw new PlatformError(400, { detail: "Missing request id" });
      await send("POST", `/requests/${encodeURIComponent(requestId)}/cancel`);
    },
  };
}

function mapQueued(payload: unknown): QueuedGeneration {
  const data = asRecord(payload);
  const requestId = stringField(data, "request_id");
  if (!requestId)
    throw new PlatformError(502, {
      detail: "Platform response missing request_id",
    });
  return {
    status: stringField(data, "status") ?? "queued",
    requestId,
    statusUrl: stringField(data, "status_url") ?? "",
    cancelUrl: stringField(data, "cancel_url") ?? "",
  };
}

function mapStatus(payload: unknown): GenerationStatus {
  const data = asRecord(payload);
  const requestId = stringField(data, "request_id") ?? "";
  const images = Array.isArray(data.images)
    ? data.images.flatMap((item) => {
        const url = asRecord(item).url;
        return typeof url === "string" ? [{ url }] : [];
      })
    : undefined;
  const videoUrl = asRecord(data.video).url;

  return {
    status: stringField(data, "status") ?? "unknown",
    requestId,
    ...(images?.length ? { images } : {}),
    ...(typeof videoUrl === "string" ? { video: { url: videoUrl } } : {}),
    ...(data.error !== undefined ? { error: data.error } : {}),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringField(
  value: Record<string, unknown>,
  key: string,
): string | undefined {
  const field = value[key];
  return typeof field === "string" ? field : undefined;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function messageFromBody(status: number, body: unknown): string {
  const data = asRecord(body);
  const detail = data.detail ?? data.message ?? data.error;
  if (typeof detail === "string" && detail) return detail;
  if (Array.isArray(detail))
    return detail
      .map((item) => {
        const field = asRecord(item);
        return `${Array.isArray(field.loc) ? field.loc.filter((part) => part !== "body").join(".") : "Input"}: ${String(field.msg ?? "invalid value")}`;
      })
      .join("; ");
  if (typeof body === "string" && body.length < 300 && !body.includes("<"))
    return body;
  if (status === 401)
    return "Higgsfield rejected the API key. Update your connection.";
  if (status === 403)
    return "Higgsfield denied access. Check API credits and model access in the console.";
  if (status === 429)
    return "Higgsfield is rate limiting requests. Please wait before trying again.";
  return `Platform request failed (${status})`;
}
