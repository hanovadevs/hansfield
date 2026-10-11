import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import {
  MissingCredentialsError,
  PLATFORM_KEY_COOKIE,
  parseCredentialInput,
} from "./credentials";
import { encryptionKey, openCredentials } from "@/server/credential-vault";

const state = globalThis as typeof globalThis & {
  jeneraDevelopmentKey?: Buffer;
};

export function credentialEncryptionKey(): Buffer {
  const configured = process.env.SESSION_ENCRYPTION_KEY?.trim();
  if (configured) return encryptionKey(configured);
  if (process.env.NODE_ENV === "production")
    throw new Error(
      "The server connection vault is not configured. Contact the studio operator.",
    );
  return (state.jeneraDevelopmentKey ??= randomBytes(32));
}

export async function readStoredCredentials() {
  const jar = await cookies();
  const raw = jar.get(PLATFORM_KEY_COOKIE)?.value;
  const stored = raw ? openCredentials(raw, credentialEncryptionKey()) : null;
  if (stored) return parseCredentialInput(stored);
  // Public BYOK is the default, even if a deployment accidentally has HF_API_KEY.
  if (process.env.JENERA_APP_MODE !== "private") return null;
  const apiKey = (
    process.env.HF_API_KEY ||
    process.env.HF_CREDENTIALS ||
    process.env.HF_KEY
  )?.trim();
  return apiKey ? parseCredentialInput({ apiKey }) : null;
}

export function platformBaseUrl() {
  const raw = process.env.HF_API_BASE_URL || "https://api.higgsfield.ai";
  const url = new URL(raw);
  const fixture =
    process.env.HANSFIELD_TEST_MODE === "1" &&
    url.origin === "http://127.0.0.1:4319";
  if (
    (!fixture && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("Configure an HTTPS Higgsfield API origin.");
  return raw.replace(/\/+$/, "");
}

export async function readCredentials() {
  const stored = await readStoredCredentials();
  if (!stored) throw new MissingCredentialsError();
  return { ...stored, baseUrl: platformBaseUrl() };
}
