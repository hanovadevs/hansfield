import { MissingCredentialsError } from "@/generation/credentials";
import { PlatformError } from "@/generation/platform";
import { RequestGuardError } from "./request-guard";

export function routeError(error: unknown, fallback: string) {
  const status =
    error instanceof RequestGuardError || error instanceof PlatformError
      ? error.status
      : error instanceof MissingCredentialsError
        ? 401
        : error instanceof TypeError
          ? 503
          : error instanceof Error && error.name === "TimeoutError"
            ? 504
            : 400;
  return Response.json(
    { error: error instanceof Error ? error.message : fallback },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        ...(error instanceof RequestGuardError && error.retryAfter
          ? { "Retry-After": String(error.retryAfter) }
          : {}),
      },
    },
  );
}
