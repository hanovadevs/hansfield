export const PLATFORM_KEY_COOKIE = "jenera_connection";

export const PLATFORM_KEY_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};

export class MissingCredentialsError extends Error {
  constructor() {
    super("Connect your Higgsfield API key to continue.");
    this.name = "MissingCredentialsError";
  }
}

export function parseCredentialInput(data: unknown): { apiKey: string } {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Enter an API key");
  }
  const record = data as { apiKey?: unknown; api_key?: unknown };
  const apiKey = record.apiKey ?? record.api_key;
  if (typeof apiKey !== "string" || !apiKey.trim())
    throw new Error("Enter an API key");
  return { apiKey: requireIdAndSecret(apiKey.trim()) };
}

export function toAuthorizationHeader(apiKey: string): string {
  return `Key ${requireIdAndSecret(apiKey)}`;
}

function requireIdAndSecret(apiKey: string): string {
  if (apiKey.length > 1000 || /\s/.test(apiKey))
    throw new Error("Enter a valid API key without spaces.");
  const colon = apiKey.indexOf(":");
  if (colon <= 0 || colon === apiKey.length - 1) {
    throw new Error("API key must be id:secret");
  }
  return apiKey;
}
