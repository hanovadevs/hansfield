import { NextResponse } from "next/server";

import { readCredentials } from "@/generation/server-credentials";
import {
  acquireUpload,
  guardOrigin,
  limitCustomer,
  readBoundedBody,
} from "@/server/request-guard";
import { routeError } from "@/server/route-error";
import { toAuthorizationHeader } from "@/generation/credentials";
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

    const baseUrl = credentials.baseUrl;
    const contentType = file.type || "image/png";

    // 1. Request presigned upload slot from Higgsfield API
    const slotRes = await fetch(`${baseUrl}/files/generate-upload-url`, {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        Authorization: toAuthorizationHeader(credentials.apiKey),
      },
      body: JSON.stringify({
        content_type: contentType,
      }),
    });

    if (!slotRes.ok) {
      return NextResponse.json(
        { error: `Storage slot generation failed (${slotRes.status})` },
        { status: slotRes.status },
      );
    }

    const slot = (await slotRes.json()) as {
      upload_url: string;
      public_url: string;
      upload_headers?: Record<string, string>;
    };

    if (!slot.upload_url || !slot.public_url) {
      return NextResponse.json(
        { error: "Invalid upload response from platform" },
        { status: 502 },
      );
    }

    if (
      new URL(slot.upload_url).protocol !== "https:" ||
      new URL(slot.public_url).protocol !== "https:"
    )
      return NextResponse.json(
        { error: "Invalid storage URL" },
        { status: 502 },
      );
    // Upload with the returned signed headers; never send API credentials here.
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const uploadHeaders: Record<string, string> = {
      "Content-Type": contentType,
      ...(slot.upload_headers || {}),
    };

    const putRes = await fetch(slot.upload_url, {
      method: "PUT",
      signal: AbortSignal.timeout(40000),
      redirect: "error",
      headers: uploadHeaders,
      body: fileBuffer,
    });

    if (!putRes.ok) {
      return NextResponse.json(
        { error: `Media upload to storage failed (${putRes.status})` },
        { status: 502 },
      );
    }

    return NextResponse.json({ url: slot.public_url });
  } catch (error) {
    return routeError(error, "Upload failed");
  } finally {
    release?.();
  }
}
