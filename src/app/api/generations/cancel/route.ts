import { readCredentials } from "@/generation/server-credentials";
import { createPlatformClient } from "@/generation/platform";
import {
  guardOrigin,
  limitCustomer,
  readJsonBody,
} from "@/server/request-guard";
import { routeError } from "@/server/route-error";

export async function POST(request: Request) {
  try {
    guardOrigin(request);
    const credentials = await readCredentials();
    limitCustomer(credentials.apiKey, "cancel", 30, 300);
    const { requestId } = await readJsonBody(request);
    if (typeof requestId !== "string" || !requestId || requestId.length > 200)
      return Response.json(
        { error: "Invalid request identifier" },
        { status: 400 },
      );
    await createPlatformClient(credentials).cancel(requestId);
    return Response.json({ canceled: true });
  } catch (error) {
    return routeError(error, "Could not cancel request");
  }
}
