import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { priceFromResponse } from "../src/generation/pricing";
import {
  signQuote,
  verifyQuote,
  inputDigest,
} from "../src/server/spend-quotes";
import {
  reserveUsage,
  saveReceipt,
  usageSummary,
  setUsageLimits,
  updateUsageState,
  findIntent,
} from "../src/server/usage-ledger";
import { credentialIdentity } from "../src/server/request-guard";

const description =
  "Token-metered pricing. Billable video tokens = ceil(generated video seconds × output width × output height × 24 fps / 1024). Image and audio references do not count as video input. Per 1,000 video tokens: 480p/720p/1080p $0.014, 4K $0.008. Rates shown are before any applicable customer discount.";
const model = "bytedance/seedance-2.0/text-to-video";
const input = {
  duration: 5,
  resolution: "720p",
  aspect_ratio: "16:9",
  prompt: "A traveler walks in the desert.",
};

test("Seedance token estimates explain five-second pricing without inventing a billed amount", () => {
  const price = priceFromResponse(
    { type: "description", pricing_description: description },
    model,
    input,
  );
  assert.equal(price.usd, 1.512);
  assert.equal(price.kind, "calculated");
  assert.equal(
    priceFromResponse({ pricing_description: description }, model, {
      ...input,
      resolution: "1080p",
    }).usd,
    3.402,
  );
  assert.equal(
    priceFromResponse({ pricing_description: description }, model, {
      ...input,
      aspect_ratio: "9:16",
    }).usd,
    1.512,
  );
  assert.equal(priceFromResponse({ usd: "0.42" }, model, input).usd, 0.42);
  assert.equal(priceFromResponse({ usd: " " }, model, input).usd, null);
  assert.equal(
    priceFromResponse(
      { pricing_description: "Unknown rate card" },
      model,
      input,
    ).usd,
    null,
  );
  assert.equal(
    priceFromResponse({ pricing_description: description }, model, {
      ...input,
      video_urls: ["https://example.com/video.mp4"],
    }).usd,
    null,
  );
});

test("cost approvals bind the account, exact input, request count and price", () => {
  const secret = Buffer.alloc(32, 7);
  const price = priceFromResponse(
    { pricing_description: description },
    model,
    input,
  );
  const quote = signQuote(secret, "account:key", model, input, price, 2);
  const claim = verifyQuote(secret, "account:key", model, input, quote.token);
  assert.equal(claim.count, 2);
  assert.equal(quote.totalUsd, 3.024);
  assert.throws(() =>
    verifyQuote(secret, "other:key", model, input, quote.token),
  );
  assert.throws(() =>
    verifyQuote(
      secret,
      "account:key",
      model,
      { ...input, duration: 15 },
      quote.token,
    ),
  );
  assert.throws(() =>
    verifyQuote(secret, "account:key", model, input, quote.token + "x"),
  );
  assert.throws(() =>
    signQuote(
      secret,
      "account:key",
      model,
      input,
      { usd: null, kind: "unavailable", description: "Unknown" },
      1,
    ),
  );
});

test("verified duration-based contracts support Wan, Genjutsu and Seedance source-video edits", () => {
  assert.equal(
    priceFromResponse(
      {
        pricing_description:
          "Priced per generated second by resolution: 480p $0.05, 720p $0.10, or 1080p $0.20.",
      },
      "alibaba/wan-3.0/text-to-video",
      input,
    ).usd,
    0.5,
  );
  assert.equal(
    priceFromResponse(
      {
        pricing_description:
          "Per-second pricing. Each second of input video costs $0.318 at 480p, $0.681 at 720p, $1.632 at 1080p. Input duration is rounded up to the nearest whole second.",
      },
      "higgsfield/genjutsu/motion-transfer/v1.0",
      { video_url: "https://cdn.example.com/video.mp4", resolution: "720p" },
      4.1,
    ).usd,
    3.405,
  );
  const contract =
    "Each 1,000 video tokens costs $0.01284 at 480p or 720p and $0.01404 at 1080p (0.6×). Billable video tokens = ceil(output height × output width × (input video duration + generated video duration) × 24 / 1024).";
  assert.equal(
    priceFromResponse(
      { pricing_description: contract },
      "bytedance/seedance-2.5/video-edit",
      { ...input, video_url: "https://cdn.example.com/video.mp4" },
      5,
    ).usd,
    2.77344,
  );
  assert.equal(
    priceFromResponse(
      { pricing_description: "Updated unsupported pricing" },
      "bytedance/seedance-2.5/video-edit",
      { ...input, video_url: "https://cdn.example.com/video.mp4" },
      5,
    ).usd,
    null,
  );
});

test("durable account budgets reserve once, replay receipts and release terminal failures", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "jenera-ledger-test-"));
  const previous = process.env.JENERA_DATA_DIR;
  process.env.JENERA_DATA_DIR = directory;
  try {
    const account = credentialIdentity("account:key");
    const digest = inputDigest(model, input);
    setUsageLimits(account, 2, 3);
    const claim = {
      id: "approval-a",
      account,
      digest,
      unitUsd: 1.512,
      count: 2,
      expiresAt: Date.now() + 60000,
      kind: "calculated",
    };
    reserveUsage(account, "intent-one", digest, claim, model, input);
    reserveUsage(account, "intent-one", digest, claim, model, input);
    assert.equal(usageSummary(account).todayEstimatedUsd, 1.512);
    assert.throws(() =>
      reserveUsage(account, "intent-two", digest, claim, model, input),
    );
    const receipt = {
      requestId: "provider-1",
      statusUrl: "https://api.example/status",
      cancelUrl: "",
      status: "queued",
    };
    saveReceipt(account, "intent-one", receipt);
    const stored = globalThis as typeof globalThis & {
      jeneraLedger?: { db: { close: () => void } };
    };
    stored.jeneraLedger?.db.close();
    delete stored.jeneraLedger;
    assert.equal(
      findIntent(account, "intent-one")?.receipt?.requestId,
      "provider-1",
    );
    assert.equal(
      usageSummary(credentialIdentity("other:key")).entries.length,
      0,
    );
    assert.throws(() =>
      reserveUsage(account, "intent-one", "changed-input", claim, model, input),
    );
    updateUsageState(account, "provider-1", "failed");
    assert.equal(usageSummary(account).todayEstimatedUsd, 0);
    reserveUsage(account, "intent-two", digest, claim, model, input);
    assert.equal(usageSummary(account).todayEstimatedUsd, 1.512);
    assert.throws(() =>
      reserveUsage(
        account,
        "intent-three",
        digest,
        { ...claim, unitUsd: 0.01 },
        model,
        input,
      ),
    );
  } finally {
    const runtime = globalThis as typeof globalThis & {
      jeneraLedger?: { db: { close: () => void } };
    };
    runtime.jeneraLedger?.db.close();
    delete runtime.jeneraLedger;
    if (previous === undefined) delete process.env.JENERA_DATA_DIR;
    else process.env.JENERA_DATA_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
