import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const LIFETIME = 30 * 24 * 60 * 60 * 1000;
const AAD = Buffer.from("jenera.connection.v1");

export function encryptionKey(value: string): Buffer {
  if (!/^[a-f0-9]{64}$/i.test(value))
    throw new Error(
      "SESSION_ENCRYPTION_KEY must contain 64 hexadecimal characters.",
    );
  return Buffer.from(value, "hex");
}

export function sealCredentials(
  apiKey: string,
  secret: Buffer,
  now = Date.now(),
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secret, iv);
  cipher.setAAD(AAD);
  const bytes = Buffer.concat([
    cipher.update(JSON.stringify({ apiKey, expires: now + LIFETIME }), "utf8"),
    cipher.final(),
  ]);
  return `v1.${Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString("base64url")}`;
}

export function openCredentials(
  value: string | undefined,
  secret: Buffer,
  now = Date.now(),
): { apiKey: string } | null {
  if (!value?.startsWith("v1.") || value.length > 3000) return null;
  try {
    const bytes = Buffer.from(value.slice(3), "base64url");
    if (bytes.length < 29) return null;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      secret,
      bytes.subarray(0, 12),
    );
    decipher.setAAD(AAD);
    decipher.setAuthTag(bytes.subarray(12, 28));
    const data = JSON.parse(
      Buffer.concat([
        decipher.update(bytes.subarray(28)),
        decipher.final(),
      ]).toString("utf8"),
    );
    if (
      typeof data.apiKey !== "string" ||
      data.apiKey.length > 1000 ||
      typeof data.expires !== "number" ||
      data.expires <= now
    )
      return null;
    return { apiKey: data.apiKey };
  } catch {
    return null;
  }
}
