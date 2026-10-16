import { NextResponse } from "next/server";

import { readCredentials } from "@/generation/server-credentials";
import {
  acquireUpload,
  guardOrigin,
  limitCustomer,
  readBoundedBody,
} from "@/server/request-guard";
import { routeError } from "@/server/route-error";
import { uploadToProvider } from "@/server/provider-upload";
import {
  MAX_UPLOAD_BYTES,
  validateMediaFile,
} from "@/generation/media-validation";

export const maxDuration = 60; // Allow sufficient time for larger uploads

export async function POST(request: Request): Promise<Response> {
  let release: (() => void) | undefined;
  try {
    guardOrigin(request);
    if (
      Number(request.headers.get("content-length")) >
      MAX_UPLOAD_BYTES + 1024 * 1024
    )
      return NextResponse.json(
        { error: "Choose a file smaller than 100 MB." },
        { status: 413 },
      );
    const credentials = await readCredentials();
    limitCustomer(credentials.apiKey, "upload", 60, 300);
    release = acquireUpload();
    const bytes = await readBoundedBody(
      request,
      MAX_UPLOAD_BYTES + 1024 * 1024,
    );
    const formData = await new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": request.headers.get("content-type") || "" },
    }).formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    try {
      validateMediaFile(file);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid file" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      url: await uploadToProvider(file, credentials),
    });
  } catch (error) {
    return routeError(error, "Upload failed");
  } finally {
    release?.();
  }
}
