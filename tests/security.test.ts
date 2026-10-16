import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  encryptionKey,
  sealCredentials,
  openCredentials,
} from "../src/server/credential-vault";
import {
  consumeLimit,
  guardOrigin,
  readJsonBody,
  RequestGuardError,
} from "../src/server/request-guard";
import { parseCredentialInput } from "../src/generation/credentials";
import { fetchTransfer } from "../src/server/fetch-transfer";
import { uploadToProvider } from "../src/server/provider-upload";

test("storage transfers retry a network failure with the same signed headers and bytes, without sending the API key", async () => {
  let puts = 0;
  let slots = 0;
  const bytes = new Uint8Array([255, 216, 255, 217]);
  const fetchImpl: typeof fetch = async (url, init) => {
    if (String(url).endsWith("generate-upload-url")) {
      slots++;
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        "Key test:secret",
      );
      return Response.json({
        upload_url: "https://storage.example/frame?signature=private",
        public_url: "https://cdn.example/frame.jpg",
        upload_headers: {
          "Content-Type": "image/jpeg",
          "x-amz-tagging": "signed-tag",
        },
      });
    }
    puts++;
    assert.equal(init?.method, "PUT");
    const headers = new Headers(init?.headers);
    assert.equal(headers.has("Authorization"), false);
    assert.equal(headers.get("x-amz-tagging"), "signed-tag");
    assert.deepEqual(new Uint8Array(init?.body as Uint8Array), bytes);
    if (puts === 1) throw new TypeError("fetch failed");
    return new Response(null, { status: 200 });
  };
  assert.equal(
    await uploadToProvider(
      new File([bytes], "frame.jpg", { type: "image/jpeg" }),
      { apiKey: "test:secret", baseUrl: "https://api.example" },
      fetchImpl,
    ),
    "https://cdn.example/frame.jpg",
  );
  assert.equal(slots, 1);
  assert.equal(puts, 2);
});

test("media transfer retries stop after two attempts and permanent storage rejection is not retried", async () => {
  let calls = 0;
  await assert.rejects(
    fetchTransfer("https://cdn.example/clip.mp4", {}, 1000, async () => {
      calls++;
      throw new TypeError("fetch failed");
    }),
    /fetch failed/,
  );
  assert.equal(calls, 2);
  calls = 0;
  const response = await fetchTransfer(
    "https://storage.example/frame",
    { method: "PUT", body: "frame" },
    1000,
    async () => {
      calls++;
      return new Response(null, { status: 403 });
    },
  );
  assert.equal(response.status, 403);
  assert.equal(calls, 1);
});

test("upload failures name their stage without returning signed URLs or credentials", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls++;
    if (calls === 1)
      return Response.json({
        upload_url: "https://storage.example/frame?signature=secret",
        public_url: "https://cdn.example/frame.jpg",
      });
    throw new TypeError(
      "fetch failed at https://storage.example/frame?signature=secret",
    );
  };
  await assert.rejects(
    uploadToProvider(
      new File(["frame"], "frame.jpg", { type: "image/jpeg" }),
      { apiKey: "test:secret", baseUrl: "https://api.example" },
      fetchImpl,
    ),
    (error: RequestGuardError) =>
      error.status === 502 &&
      error.message.includes("Higgsfield storage") &&
      !error.message.includes("secret"),
  );
  assert.equal(calls, 3);
});

test("customer credential cookies encrypt, authenticate, expire and reject legacy plaintext", () => {
  const key = encryptionKey("ab".repeat(32));
  const value = sealCredentials("customer:private-secret", key, 1000);
  assert.equal(value.includes("private-secret"), false);
  assert.equal(
    Buffer.from(value.slice(3), "base64url")
      .toString()
      .includes("private-secret"),
    false,
  );
  assert.deepEqual(openCredentials(value, key, 1001), {
    apiKey: "customer:private-secret",
  });
  assert.equal(
    openCredentials(value, encryptionKey("cd".repeat(32)), 1001),
    null,
  );
  const bytes = Buffer.from(value.slice(3), "base64url");
  bytes[30] ^= 1;
  assert.equal(
    openCredentials(`v1.${bytes.toString("base64url")}`, key, 1001),
    null,
  );
  assert.equal(openCredentials(value, key, 1000 + 30 * 86400000), null);
  assert.equal(
    openCredentials(JSON.stringify({ apiKey: "customer:private-secret" }), key),
    null,
  );
  assert.notEqual(value, sealCredentials("customer:private-secret", key, 1000));
  assert.throws(() => encryptionKey("short"));
});

test("public connection rejects oversized or malformed API credentials", () => {
  assert.throws(() => parseCredentialInput({ apiKey: "id:bad\nheader" }));
  assert.throws(() =>
    parseCredentialInput({ apiKey: `id:${"a".repeat(1000)}` }),
  );
  assert.deepEqual(parseCredentialInput({ apiKey: " id:secret " }), {
    apiKey: "id:secret",
  });
});

test("request boundaries reject cross-site fetches and limit streamed JSON without Content-Length", async () => {
  assert.throws(
    () =>
      guardOrigin(
        new Request("https://studio.example/api/generations", {
          headers: { origin: "https://elsewhere.example" },
        }),
      ),
    RequestGuardError,
  );
  assert.throws(
    () =>
      guardOrigin(
        new Request("https://studio.example/api/generations", {
          headers: { "sec-fetch-site": "cross-site" },
        }),
      ),
    RequestGuardError,
  );
  guardOrigin(
    new Request("https://studio.example/api/generations", {
      headers: { origin: "https://studio.example" },
    }),
  );
  await assert.rejects(
    readJsonBody(
      new Request("https://studio.example/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "x".repeat(200),
      }),
      100,
    ),
    (error: RequestGuardError) => error.status === 413,
  );
  await assert.rejects(
    readJsonBody(
      new Request("https://studio.example/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "[]",
      }),
    ),
    RequestGuardError,
  );
});

test("customer limits are independent and recover at the window boundary", () => {
  const id = crypto.randomUUID();
  consumeLimit(id, 1, 1000);
  assert.throws(
    () => consumeLimit(id, 1, 2000),
    (error: RequestGuardError) =>
      error.status === 429 && error.retryAfter === 59,
  );
  consumeLimit(`${id}:second`, 1, 2000);
  consumeLimit(id, 1, 61000);
});

test("origin checks permit the configured HTTPS proxy origin and actual localhost host", () => {
  const previous = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = "https://studio.example";
  try {
    guardOrigin(
      new Request("http://0.0.0.0:3000/api/film/process", {
        headers: { origin: "https://studio.example", host: "studio.example" },
      }),
    );
    guardOrigin(
      new Request("http://0.0.0.0:3012/api/film/process", {
        headers: { origin: "http://localhost:3012", host: "localhost:3012" },
      }),
    );
    assert.throws(
      () =>
        guardOrigin(
          new Request("http://0.0.0.0:3012/api/film/process", {
            headers: {
              origin: "http://localhost:4444",
              host: "localhost:3012",
            },
          }),
        ),
      RequestGuardError,
    );
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previous;
  }
});

test("no credential reader is remotely exported as a Server Action", async () => {
  const actions = await readFile(
    new URL("../src/generation/actions.ts", import.meta.url),
    "utf8",
  );
  const exported = [...actions.matchAll(/export async function (\w+)/g)]
    .map((match) => match[1])
    .sort();
  assert.deepEqual(exported, [
    "clearPlatformCredentials",
    "hasPlatformCredentials",
    "savePlatformCredentials",
  ]);
  const readers = await readFile(
    new URL("../src/generation/server-credentials.ts", import.meta.url),
    "utf8",
  );
  assert.ok(readers.includes('import "server-only"'));
});
