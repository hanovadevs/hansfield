"use server";

import { cookies } from "next/headers";
import {
  PLATFORM_KEY_COOKIE,
  PLATFORM_KEY_COOKIE_OPTIONS,
  parseCredentialInput,
  toAuthorizationHeader,
} from "./credentials";
import {
  credentialEncryptionKey,
  platformBaseUrl,
  readStoredCredentials,
} from "./server-credentials";
import { sealCredentials } from "@/server/credential-vault";
import { limitCustomer } from "@/server/request-guard";

// Only safe connection operations are remotely callable. Key readers live in
// a server-only module and are never registered as Server Actions.
export async function savePlatformCredentials(data: unknown) {
  try {
    const { apiKey } = parseCredentialInput(data);
    limitCustomer(apiKey, "connect", 5, 60);
    const secret = credentialEncryptionKey();
    // Verify API access with an unused upload slot; no generation is submitted.
    const response = await fetch(
      `${platformBaseUrl()}/files/generate-upload-url`,
      {
        method: "POST",
        headers: {
          Authorization: toAuthorizationHeader(apiKey),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content_type: "image/png" }),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok)
      throw new Error(
        response.status === 401 || response.status === 403
          ? "Higgsfield rejected this API key. Check the key ID and secret."
          : "Higgsfield could not verify the connection. Please try again shortly.",
      );
    const jar = await cookies();
    jar.set(
      PLATFORM_KEY_COOKIE,
      sealCredentials(apiKey, secret),
      PLATFORM_KEY_COOKIE_OPTIONS,
    );
    jar.set("api_key", "", { ...PLATFORM_KEY_COOKIE_OPTIONS, maxAge: 0 });
    return { ok: true as const };
  } catch (error) {
    // Expected connection errors must reach production UI. Next intentionally
    // hides messages from thrown Server Action errors in production.
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Could not connect to Higgsfield.",
    };
  }
}

export async function clearPlatformCredentials() {
  const jar = await cookies();
  for (const name of [PLATFORM_KEY_COOKIE, "api_key"])
    jar.set(name, "", { ...PLATFORM_KEY_COOKIE_OPTIONS, maxAge: 0 });
}

export async function hasPlatformCredentials() {
  return (await readStoredCredentials()) !== null;
}
