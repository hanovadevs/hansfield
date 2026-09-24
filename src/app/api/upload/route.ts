import { NextResponse } from "next/server";

import { readStoredCredentials } from "@/generation/actions";
import { toAuthorizationHeader } from "@/generation/credentials";

export const maxDuration = 60; // Allow sufficient time for larger uploads

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const credentials = await readStoredCredentials();
    if (!credentials?.apiKey) {
      return NextResponse.json(
        { error: "Please enter your API Key in the top-right before uploading." },
        { status: 401 },
      );
    }

    const baseUrl = process.env.HF_API_BASE_URL || "https://api.higgsfield.ai";
    const contentType = file.type || "image/png";

    // 1. Request presigned upload slot from Higgsfield API
    const slotRes = await fetch(`${baseUrl}/files/generate-upload-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: toAuthorizationHeader(credentials.apiKey),
      },
      body: JSON.stringify({
        content_type: contentType,
      }),
    });

    if (!slotRes.ok) {
      const errText = await slotRes.text();
      console.error("[upload] Higgsfield generate-upload-url failed", slotRes.status, errText);
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

    // 2. Upload file bytes to the presigned storage slot (includes signed headers like x-amz-tagging)
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const uploadHeaders: Record<string, string> = {
      "Content-Type": contentType,
      ...(slot.upload_headers || {}),
    };

    const putRes = await fetch(slot.upload_url, {
      method: "PUT",
      headers: uploadHeaders,
      body: fileBuffer,
    });

    if (!putRes.ok) {
      const putErr = await putRes.text();
      console.error("[upload] Storage PUT failed", putRes.status, putErr);
      return NextResponse.json(
        { error: `Media upload to storage failed (${putRes.status})` },
        { status: 502 },
      );
    }

    console.info("[upload] Success:", slot.public_url);
    return NextResponse.json({ url: slot.public_url });
  } catch (error) {
    console.error("[upload] Unexpected error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 },
    );
  }
}
