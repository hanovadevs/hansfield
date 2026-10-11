import type { Clip, Cut } from "./types";

type Operation = {
  mode: "inspect" | "frame" | "trim" | "render";
  clips: Cut[];
  time?: number;
  format?: "landscape" | "portrait" | "square";
  resolution?: "720p" | "1080p";
  transition?: "cut" | "fade";
  muted?: boolean;
};
export async function mediaRequest(operation: Operation): Promise<Response> {
  const response = await fetch("/api/film/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(operation),
    signal: AbortSignal.timeout(300000),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Could not process the video.");
  }
  return response;
}
export async function inspectClip(url: string): Promise<Clip> {
  const response = await mediaRequest({
    mode: "inspect",
    clips: [{ url, start: 0, end: 0 }],
  });
  return response.json() as Promise<Clip>;
}
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export async function uploadReference(
  blob: Blob,
  name: string,
): Promise<string> {
  const form = new FormData();
  form.set("file", new File([blob], name, { type: blob.type }));
  const response = await fetch("/api/upload", {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(60000),
  });
  const data = await response.json();
  if (!response.ok || typeof data.url !== "string")
    throw new Error(data.error || "Could not upload continuity reference.");
  return data.url;
}
