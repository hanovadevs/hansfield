import { createHash } from "node:crypto";

export class RequestGuardError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

export function guardOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  let local: URL | null = null;
  try { local = origin ? new URL(origin) : null; } catch { throw new RequestGuardError("Invalid request origin", 403); }
  const localPreview =
    local && local.origin === origin && ["http:", "https:"].includes(local.protocol) &&
    ["localhost", "127.0.0.1", "[::1]"].includes(local.hostname) &&
    local.host === request.headers.get("host");
  if (
    (origin &&
      origin !== new URL(request.url).origin &&
      origin !== (configuredOrigin ? new URL(configuredOrigin).origin : null) &&
      !localPreview) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new RequestGuardError("Invalid request origin", 403);
}

type Bucket = { count: number; expires: number };
const globalState = globalThis as typeof globalThis & {
  jeneraRates?: Map<string, Bucket>;
};
const buckets = (globalState.jeneraRates ??= new Map<string, Bucket>());
let uploads = 0;

export function acquireUpload() {
  if (uploads >= 2)
    throw new RequestGuardError(
      "Uploads are busy. Please try again shortly.",
      429,
      10,
    );
  uploads++;
  return () => {
    uploads--;
  };
}

export function credentialIdentity(apiKey: string) {
  return createHash("sha256").update(apiKey).digest("hex");
}

export function consumeLimit(name: string, limit: number, now = Date.now()) {
  for (const [key, bucket] of buckets)
    if (bucket.expires <= now) buckets.delete(key);
  const bucket = buckets.get(name) ?? { count: 0, expires: now + 60000 };
  if (bucket.count >= limit)
    throw new RequestGuardError(
      "Too many requests. Please wait a moment and try again.",
      429,
      Math.ceil((bucket.expires - now) / 1000),
    );
  if (!buckets.has(name) && buckets.size >= 10000)
    throw new RequestGuardError(
      "The studio is busy. Please try again shortly.",
      503,
      60,
    );
  bucket.count++;
  buckets.set(name, bucket);
}

export function limitCustomer(
  apiKey: string,
  operation: string,
  perCustomer: number,
  globalLimit: number,
) {
  consumeLimit(`global:${operation}`, globalLimit);
  consumeLimit(`${credentialIdentity(apiKey)}:${operation}`, perCustomer);
}

export async function readJsonBody(
  request: Request,
  maxBytes = 128000,
): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new RequestGuardError("Send an application/json request.", 415);
  const bytes = await readBoundedBody(request, maxBytes);
  try {
    const data: unknown = JSON.parse(bytes.toString("utf8"));
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error();
    return data as Record<string, unknown>;
  } catch {
    throw new RequestGuardError("Invalid JSON request.", 400);
  }
}

export async function readBoundedBody(request: Request, maxBytes: number) {
  if (Number(request.headers.get("content-length")) > maxBytes)
    throw new RequestGuardError("Request is too large.", 413);
  if (!request.body) throw new RequestGuardError("Missing request body.", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new RequestGuardError("Request is too large.", 413);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
