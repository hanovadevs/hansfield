import {
  readCredentials,
  credentialEncryptionKey,
} from "@/generation/server-credentials";
import { createPlatformClient } from "@/generation/platform";
import { validatePlane } from "@/generation/validate";
import { toPlatform } from "@/generation/to-platform";
import { priceFromResponse } from "@/generation/pricing";
import { signQuote } from "@/server/spend-quotes";
import {
  guardOrigin,
  limitCustomer,
  readJsonBody,
} from "@/server/request-guard";
import { routeError } from "@/server/route-error";
import { processMedia } from "@/film/server";
import { createHash } from "node:crypto";
import type { Clip } from "@/film/types";

const inspections = new Map<
  string,
  { expiresAt: number; clip: Promise<Clip> }
>();
function inspectVideo(apiKey: string, url: string): Promise<Clip> {
  const key = createHash("sha256")
    .update(JSON.stringify([apiKey, url]))
    .digest("hex");
  const existing = inspections.get(key);
  if (existing && existing.expiresAt > Date.now()) return existing.clip;
  for (const [id, item] of inspections)
    if (item.expiresAt < Date.now()) inspections.delete(id);
  if (inspections.size >= 100)
    inspections.delete(inspections.keys().next().value!);
  const clip = processMedia({
    mode: "inspect",
    clips: [{ url, start: 0, end: 0 }],
  })
    .then((result) => {
      if (!result.metadata)
        throw new Error("Could not inspect the source video for pricing.");
      return result.metadata;
    })
    .catch((error) => {
      inspections.delete(key);
      throw error;
    });
  inspections.set(key, { clip, expiresAt: Date.now() + 5 * 60000 });
  return clip;
}

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    guardOrigin(request);
    const credentials = await readCredentials();
    limitCustomer(credentials.apiKey, "estimate", 90, 600);
    const data = await readJsonBody(request);
    const count = data.count === undefined ? 1 : Number(data.count);
    if (!Number.isInteger(count) || count < 1 || count > 4)
      throw new Error("Choose between 1 and 4 requests.");
    const { path, body } = toPlatform(validatePlane(data.plane));
    const estimate = await createPlatformClient(credentials).estimate(
      path,
      body,
    );
    const videoUrls = [
      ...(typeof body.video_url === "string" ? [body.video_url] : []),
      ...(Array.isArray(body.video_urls)
        ? body.video_urls.filter(
            (url): url is string => typeof url === "string",
          )
        : []),
    ];
    let price = priceFromResponse(estimate, path, body);
    let outputDuration = Number(body.duration ?? 0);
    if (price.kind !== "account" && videoUrls.length) {
      let seconds = 0;
      let source: Clip | undefined;
      for (const url of videoUrls) {
        const clip = await inspectVideo(credentials.apiKey, url);
        if (url === body.video_url) source = clip;
        seconds += clip.duration;
      }
      const pricingInput = { ...body };
      if (
        source &&
        [
          "bytedance/seedance-2.5/video-edit",
          "bytedance/seedance-2.5/video-extend",
        ].includes(path)
      ) {
        // These endpoints preserve source framing. Edit derives output duration
        // from its processed source (minimum 4s, capped by the 30s video budget).
        pricingInput.aspect_ratio = `${source.width}:${source.height}`;
        if (path.endsWith("/video-edit"))
          pricingInput.duration = Math.max(4, Math.min(30, source.duration));
        outputDuration = Number(pricingInput.duration);
      }
      price = priceFromResponse(estimate, path, pricingInput, seconds);
    }
    return Response.json({
      ...signQuote(
        credentialEncryptionKey(),
        credentials.apiKey,
        path,
        body,
        price,
        count,
      ),
      duration: outputDuration,
    });
  } catch (error) {
    return routeError(
      error,
      "Could not estimate generation cost. No generation was submitted.",
    );
  }
}
