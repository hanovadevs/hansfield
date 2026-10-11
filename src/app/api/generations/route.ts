import { readCredentials } from "@/generation/server-credentials";
import { createPlatformClient } from "@/generation/platform";
import { validatePlane } from "@/generation/validate";
import { toPlatform } from "@/generation/to-platform";
import {
  guardOrigin,
  limitCustomer,
  readJsonBody,
} from "@/server/request-guard";
import { routeError } from "@/server/route-error";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    guardOrigin(request);
    const credentials = await readCredentials();
    limitCustomer(credentials.apiKey, "generate", 30, 300);
    const { plane, idempotencyKey } = await readJsonBody(request);
    if (
      typeof idempotencyKey !== "string" ||
      !/^[a-zA-Z0-9_-]{8,128}$/.test(idempotencyKey)
    )
      return Response.json(
        { error: "Invalid generation identifier" },
        { status: 400 },
      );
    const { path, body } = toPlatform(validatePlane(plane));
    const result = await createPlatformClient(credentials).submit(
      path,
      body,
      idempotencyKey,
    );
    return Response.json(result);
  } catch (error) {
    return routeError(error, "Could not submit generation");
  }
}
