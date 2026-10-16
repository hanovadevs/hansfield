import { readCredentials } from "@/generation/server-credentials";
import { createPlatformClient } from "@/generation/platform";
import { PlatformError } from "@/generation/platform";
import { credentialEncryptionKey } from "@/generation/server-credentials";
import { credentialIdentity, RequestGuardError } from "@/server/request-guard";
import { inputDigest, verifyQuote } from "@/server/spend-quotes";
import {
  findIntent,
  reserveUsage,
  saveReceipt,
  rejectIntent,
} from "@/server/usage-ledger";
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
    const { plane, idempotencyKey, approval } = await readJsonBody(request);
    if (
      typeof idempotencyKey !== "string" ||
      !/^[a-zA-Z0-9_-]{8,128}$/.test(idempotencyKey)
    )
      return Response.json(
        { error: "Invalid generation identifier" },
        { status: 400 },
      );
    const { path, body } = toPlatform(validatePlane(plane));
    const account = credentialIdentity(credentials.apiKey);
    const digest = inputDigest(path, body);
    const existing = findIntent(account, idempotencyKey);
    if (existing) {
      // An accepted request is replayed without creating another provider job.
      // reserveUsage also checks the original input digest on recovered intents.
      reserveUsage(
        account,
        idempotencyKey,
        digest,
        {
          id: "",
          account,
          digest,
          unitUsd: 0,
          count: 1,
          expiresAt: 0,
          kind: "",
        },
        path,
        body,
      );
      if (existing.receipt) return Response.json(existing.receipt);
      if (existing.state === "rejected")
        throw new RequestGuardError(
          "This submission was rejected. Review the inputs and start a new request.",
          409,
        );
    } else {
      const claim = verifyQuote(
        credentialEncryptionKey(),
        credentials.apiKey,
        path,
        body,
        approval,
      );
      const previous = reserveUsage(
        account,
        idempotencyKey,
        digest,
        claim,
        path,
        body,
      );
      if (previous?.receipt) return Response.json(previous.receipt);
    }
    try {
      const result = await createPlatformClient(credentials).submit(
        path,
        body,
        idempotencyKey,
      );
      try {
        saveReceipt(account, idempotencyKey, result);
      } catch {
        throw new RequestGuardError(
          "Higgsfield may have accepted this request, but its receipt could not be saved. Resume the existing submission; do not start another generation.",
          503,
        );
      }
      return Response.json(result);
    } catch (error) {
      if (
        error instanceof PlatformError &&
        error.status < 500 &&
        ![408, 429].includes(error.status)
      )
        rejectIntent(account, idempotencyKey);
      throw error;
    }
  } catch (error) {
    return routeError(error, "Could not submit generation");
  }
}
