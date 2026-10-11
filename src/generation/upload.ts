import { validateMediaFile } from "./media-validation";

export async function uploadMedia(file: File): Promise<{ url: string }> {
  validateMediaFile(file);
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/upload", {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    let message = "Upload failed";
    try {
      const errorJson = (await res.json()) as { error?: string };
      if (errorJson.error) message = errorJson.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const data = (await res.json()) as { url?: string };
  if (!data.url) throw new Error("No URL returned from upload");
  return { url: data.url };
}
