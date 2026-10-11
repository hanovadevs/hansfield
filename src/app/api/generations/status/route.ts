import { readCredentials } from "@/generation/server-credentials";
import { createPlatformClient, PlatformError } from "@/generation/platform";
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
    limitCustomer(credentials.apiKey, "status", 120, 1200);
    const { requests } = await readJsonBody(request);
    if (
      !Array.isArray(requests) ||
      !requests.length ||
      requests.length > 50 ||
      requests.some(
        (r) =>
          !r ||
          typeof r.requestId !== "string" ||
          !r.requestId ||
          r.requestId.length > 200 ||
          (r.statusUrl !== undefined && typeof r.statusUrl !== "string"),
      )
    ) {
      return Response.json(
        { error: "Invalid status requests" },
        { status: 400 },
      );
    }
    const client = createPlatformClient(credentials);
    const results = await Promise.all(
      requests.map(async ({ requestId, statusUrl }) => {
        try {
          return {
            requestId,
            status: await client.status(requestId, statusUrl),
          };
        } catch (error) {
          return {
            requestId,
            error:
              error instanceof Error ? error.message : "Status unavailable",
            retryable:
              !(error instanceof PlatformError) ||
              error.status >= 500 ||
              error.status === 429,
          };
        }
      }),
    );
    return Response.json(results);
  } catch (error) {
    return routeError(error, "Status unavailable");
  }
}
