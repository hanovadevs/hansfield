import { toAuthorizationHeader } from "@/generation/credentials";
import { RequestGuardError } from "./request-guard";
import { fetchTransfer } from "./fetch-transfer";

export async function uploadToProvider(
  file: File,
  credentials: { apiKey: string; baseUrl: string },
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  let response: Response;
  try {
    response = await fetchImpl(
      `${credentials.baseUrl}/files/generate-upload-url`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: toAuthorizationHeader(credentials.apiKey),
        },
        body: JSON.stringify({ content_type: file.type }),
        signal: AbortSignal.timeout(15000),
        redirect: "error",
        cache: "no-store",
      },
    );
  } catch {
    throw new RequestGuardError(
      "Could not reach Higgsfield to prepare a reference upload. Retry the upload.",
      502,
    );
  }
  if (!response.ok)
    throw new RequestGuardError(
      response.status === 401 || response.status === 403
        ? "Higgsfield rejected the reference upload connection. Reconnect your API key."
        : `Higgsfield could not prepare a reference upload (HTTP ${response.status}). Retry shortly.`,
      response.status === 401 || response.status === 403 ? 401 : 502,
    );
  let slot: {
    upload_url: string;
    public_url: string;
    upload_headers?: Record<string, string>;
  };
  try {
    slot = await response.json();
    const upload = new URL(slot.upload_url);
    const publicUrl = new URL(slot.public_url);
    const fixture =
      process.env.HANSFIELD_TEST_MODE === "1" &&
      upload.origin === "http://127.0.0.1:4319";
    if (
      (!fixture && upload.protocol !== "https:") ||
      publicUrl.protocol !== "https:" ||
      upload.username ||
      upload.password ||
      publicUrl.username ||
      publicUrl.password ||
      Object.values(slot.upload_headers ?? {}).some(
        (value) => typeof value !== "string",
      )
    )
      throw new Error("Invalid slot");
  } catch {
    throw new RequestGuardError(
      "Higgsfield returned an invalid reference upload slot. Retry the upload.",
      502,
    );
  }
  const headers = new Headers({ "Content-Type": file.type });
  for (const [key, value] of Object.entries(slot.upload_headers ?? {}))
    headers.set(key, value);
  try {
    response = await fetchTransfer(
      slot.upload_url,
      {
        method: "PUT",
        headers,
        body: Buffer.from(await file.arrayBuffer()),
        redirect: "error",
      },
      18000,
      fetchImpl,
    );
  } catch {
    throw new RequestGuardError(
      "Could not transfer the reference to Higgsfield storage after retrying. Retry the upload; if it persists, check the server's storage connectivity.",
      502,
    );
  }
  if (!response.ok)
    throw new RequestGuardError(
      `Higgsfield storage rejected the reference upload (HTTP ${response.status}). Retry with a fresh upload.`,
      502,
    );
  return slot.public_url;
}
