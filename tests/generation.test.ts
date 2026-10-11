import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MODELS,
  getModel,
  parseSettings,
  resolveSettings,
  type GenerationPlane,
  type MediaRole,
} from "../src/generation/catalog";
import { schemaFor } from "../src/generation/catalog/schema";
import { modelForInput } from "../src/generation/catalog/input-mode";
import { toPlatform } from "../src/generation/to-platform";
import { validatePlane } from "../src/generation/validate";
import {
  createPlatformClient,
  PlatformError,
} from "../src/generation/platform";
import {
  validateMediaFile,
  MAX_UPLOAD_BYTES,
} from "../src/generation/media-validation";
import {
  loadHistory,
  saveHistory,
  type RunRecord,
} from "../src/openhiggsfield/history";
import { memoryKv } from "../src/openhiggsfield/idb";

function plane(id: string, roles: MediaRole[] = []): GenerationPlane {
  const model = getModel(id);
  const media: GenerationPlane["media"] = {};
  for (const role of roles)
    media[role] = [
      {
        id: role,
        role,
        url: `https://cdn.example.com/${role}.${role === "video" ? "mp4" : role === "audio" ? "wav" : "png"}`,
      },
    ];
  return {
    model: id,
    prompt: { text: "A slow tracking shot of a traveler at dawn." },
    media,
    settings: parseSettings(model, {}),
  };
}

test("every selectable model maps its default input to a documented endpoint", () => {
  for (const model of MODELS) {
    const draft = plane(model.id, model.requiredRoles);
    let mapped: ReturnType<typeof toPlatform>;
    try {
      mapped = toPlatform(validatePlane(draft));
    } catch (error) {
      throw new Error(
        `${model.label}: ${error instanceof Error ? error.message : error}`,
      );
    }
    const schema = schemaFor(mapped.path);
    assert.ok(schema, `${model.label}: undocumented endpoint`);
    for (const [key, value] of Object.entries(mapped.body)) {
      const field = schema.properties[key];
      assert.ok(field, `${model.label}: unsupported ${key}`);
      if (field.enum)
        assert.ok(
          field.enum.includes(value as string | number),
          `${model.label}: invalid ${key}`,
        );
      if (field.type === "integer")
        assert.ok(
          Number.isInteger(value),
          `${model.label}: ${key} must be an integer`,
        );
    }
  }
});

test("all offered controls and reference modes produce provider-valid payloads", () => {
  for (const model of MODELS) {
    for (const role of [undefined, ...Object.keys(model.roles)] as (
      MediaRole | undefined
    )[]) {
      const roles = [
        ...new Set([
          ...(model.requiredRoles ?? []),
          ...(role ? [role] : []),
          ...(role === "end" ? ["start" as const] : []),
        ]),
      ];
      const draft = plane(model.id, roles);
      const effective = modelForInput(model, draft.media);
      draft.settings = resolveSettings(effective, {});
      for (const [key, field] of Object.entries(effective.settings)) {
        const values =
          field.type === "enum"
            ? field.values
            : field.type === "range"
              ? [field.min, field.max]
              : [true, false];
        for (const value of values) {
          try {
            toPlatform(
              validatePlane({
                ...draft,
                settings: { ...draft.settings, [key]: value },
              }),
            );
          } catch (error) {
            throw new Error(
              `${model.label} / ${role ?? "default"} / ${key}=${value}: ${(error as Error).message}`,
            );
          }
        }
      }
    }
  }
});

test("LTX supports its documented discrete durations and image route", () => {
  const model = getModel("ltx-2.5-fast");
  assert.deepEqual(model.settings.duration, {
    type: "enum",
    values: ["6", "8", "10"],
    default: "6",
    optional: false,
  });
  const mapped = toPlatform(plane(model.id, ["start", "end"]));
  assert.equal(mapped.path, "lightricks/ltx-2.5/image-to-video/fast");
  assert.equal(mapped.body.duration, 6);
  assert.equal(mapped.body.end_image_url, "https://cdn.example.com/end.png");
  assert.equal(mapped.body.generate_audio, true);
});

test("Seedance sends output format only to the text endpoint", () => {
  const text = plane("seedance-2.5");
  text.settings.outputFormat = "mov";
  assert.equal(toPlatform(text).body.output_format, "mov");
  for (const roles of [
    ["start", "end"],
    ["reference"],
    ["video"],
    ["audio"],
  ] as MediaRole[][]) {
    const draft = plane("seedance-2.5", roles);
    draft.settings.outputFormat = "mov";
    assert.ok(!("output_format" in toPlatform(draft).body));
    assert.equal(toPlatform(draft).body.bitrate_mode, "high");
  }
});

test("cinema sends explicit creative controls and omits automatic fields", () => {
  const draft = plane("cinema-4", ["reference", "audio"]);
  draft.settings.cameraMovement = "dolly-in";
  const { body } = toPlatform(draft);
  assert.equal(body.camera_movement, "dolly-in");
  assert.ok(!("camera_lens" in body));
  assert.deepEqual(body.image_urls, ["https://cdn.example.com/reference.png"]);
  assert.deepEqual(body.audio_urls, ["https://cdn.example.com/audio.wav"]);
});

test("required inputs, frame dependencies and invalid public URLs fail before submission", () => {
  assert.throws(() => validatePlane(plane("genjutsu")), /video/);
  assert.throws(() => validatePlane(plane("seedance-2.5-edit")), /video/);
  assert.throws(
    () => validatePlane(plane("kling-3-motion-pro", ["start"])),
    /video/,
  );
  assert.throws(
    () => validatePlane(plane("kling-3-pro", ["end"])),
    /start frame/,
  );
  assert.throws(
    () => validatePlane(plane("seedance-2.5", ["start", "reference"])),
    /separate runs/,
  );
  const draft = plane("cinema-4", ["reference"]);
  draft.media.reference![0]!.url = "http://127.0.0.1/private";
  assert.throws(() => validatePlane(draft), /public HTTPS/);
});

test("NaN, infinity and fractional integer durations are rejected; stale settings recover", () => {
  const model = getModel("cinema-4");
  for (const duration of [NaN, Infinity, 5.5])
    assert.throws(() => parseSettings(model, { duration }), /duration/);
  assert.equal(
    resolveSettings(model, {
      duration: NaN,
      resolution: "4k",
      aspectRatio: "9:16",
    }).aspectRatio,
    "9:16",
  );
  assert.equal(resolveSettings(model, { duration: NaN }).duration, 5);
});

test("platform retries an ambiguous submit with the same idempotency key", async () => {
  const keys: string[] = [];
  let attempts = 0;
  const client = createPlatformClient({
    apiKey: "id:secret",
    baseUrl: "https://api.example.com",
    fetch: async (_url, init) => {
      keys.push(new Headers(init?.headers).get("Idempotency-Key")!);
      attempts++;
      if (attempts === 1) throw new TypeError("connection reset");
      return Response.json({
        request_id: "accepted",
        status: "queued",
        status_url: "https://api.example.com/requests/accepted/status",
      });
    },
  });
  const result = await client.submit(
    "model/video",
    { prompt: "scene" },
    "same-intent",
  );
  assert.equal(result.requestId, "accepted");
  assert.deepEqual(keys, ["same-intent", "same-intent"]);
});

test("platform surfaces validation details and never retries authentication errors", async () => {
  let calls = 0;
  const client = createPlatformClient({
    apiKey: "id:secret",
    baseUrl: "https://api.example.com",
    fetch: async () => {
      calls++;
      return Response.json(
        { detail: [{ loc: ["body", "duration"], msg: "Invalid duration" }] },
        { status: 422 },
      );
    },
  });
  await assert.rejects(
    client.submit("model/video", {}),
    /duration: Invalid duration/,
  );
  assert.equal(calls, 1);
  assert.ok(new PlatformError(403, {}).message.includes("credits"));
});

test("status URLs stay on the provider origin and match their request", async () => {
  let calls = 0;
  const client = createPlatformClient({
    apiKey: "id:secret",
    baseUrl: "https://api.example.com",
    fetch: async () => {
      calls++;
      return Response.json({
        status: "completed",
        video: { url: "https://cdn.example.com/output.mp4" },
      });
    },
  });
  await assert.rejects(
    client.status("job", "https://evil.example/requests/job/status"),
    /Invalid platform/,
  );
  await assert.rejects(
    client.status("job", "https://api.example.com/requests/other/status"),
    /Invalid status/,
  );
  assert.equal(calls, 0);
  assert.equal(
    (await client.status("job", "https://api.example.com/requests/job/status"))
      .video?.url,
    "https://cdn.example.com/output.mp4",
  );
});

test("uploads reject empty, oversized and unsupported files", () => {
  assert.throws(
    () => validateMediaFile({ size: 0, type: "image/png" }),
    /empty/,
  );
  assert.throws(
    () => validateMediaFile({ size: MAX_UPLOAD_BYTES + 1, type: "video/mp4" }),
    /100 MB/,
  );
  assert.throws(
    () => validateMediaFile({ size: 3, type: "text/html" }),
    /Upload a/,
  );
  validateMediaFile({ size: 20, type: "audio/wav" });
});

test("deleted history does not return from a stale legacy backup", async () => {
  const kv = memoryKv();
  const map = new Map<string, string>();
  const legacy = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
  const record: RunRecord = {
    id: "run",
    surface: "video",
    modelId: "cinema-4",
    modelLabel: "Cinema",
    prompt: "scene",
    ratio: "16 / 9",
    meta: "",
    kind: "video",
    urls: [],
    status: "interrupted",
    art: "",
    createdAt: Date.now(),
    requestId: "request",
  };
  await saveHistory([record], kv, legacy);
  map.set("openhiggsfield.history.v1", JSON.stringify([record]));
  await saveHistory([], kv, legacy);
  assert.deepEqual(await loadHistory(kv, legacy), []);
});
