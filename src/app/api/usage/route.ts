import { readCredentials } from "@/generation/server-credentials";
import {
  guardOrigin,
  credentialIdentity,
  readJsonBody,
  limitCustomer,
} from "@/server/request-guard";
import {
  findIntent,
  usageSummary,
  setUsageLimits,
} from "@/server/usage-ledger";
import { routeError } from "@/server/route-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const credentials = await readCredentials();
    const account = credentialIdentity(credentials.apiKey);
    const intent = new URL(request.url).searchParams.get("intent");
    if (intent && !/^[a-zA-Z0-9_-]{8,128}$/.test(intent))
      throw new Error("Invalid request identifier.");
    return Response.json(
      intent ? { entry: findIntent(account, intent) } : usageSummary(account),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return routeError(error, "Usage is unavailable.");
  }
}
export async function POST(request: Request) {
  try {
    guardOrigin(request);
    const credentials = await readCredentials();
    limitCustomer(credentials.apiKey, "limits", 20, 200);
    const data = await readJsonBody(request);
    return Response.json(
      setUsageLimits(
        credentialIdentity(credentials.apiKey),
        Number(data.requestLimitUsd),
        Number(data.dailyLimitUsd),
      ),
    );
  } catch (error) {
    return routeError(error, "Could not update your budgets.");
  }
}
