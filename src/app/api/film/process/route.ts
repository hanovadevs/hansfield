import { readCredentials } from "@/generation/server-credentials";
import { processMedia, validateOperation } from "@/film/server";
import {
  guardOrigin,
  limitCustomer,
  readJsonBody,
} from "@/server/request-guard";
import { routeError } from "@/server/route-error";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    guardOrigin(request);
    const credentials = await readCredentials();
    const operation = validateOperation(await readJsonBody(request));
    limitCustomer(
      credentials.apiKey,
      `film-${operation.mode}`,
      operation.mode === "render" ? 6 : 90,
      operation.mode === "render" ? 30 : 300,
    );
    const result = await processMedia(operation);
    if (result.metadata) return Response.json(result.metadata);
    return new Response(new Uint8Array(result.bytes!), {
      headers: {
        "Content-Type": result.contentType!,
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${operation.mode === "frame" ? "continuity-frame.jpg" : "jenera-film.mp4"}"`,
        ...(result.duration
          ? { "X-Film-Duration": String(result.duration) }
          : {}),
      },
    });
  } catch (error) {
    return routeError(error, "Could not process video.");
  }
}
