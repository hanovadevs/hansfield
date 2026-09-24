export async function uploadMedia(file: File): Promise<{ url: string }> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/upload", {
    method: "POST",
    body: formData,
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
