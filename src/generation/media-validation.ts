export const MEDIA_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "audio/wav",
  "audio/x-wav",
];
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
export function validateMediaFile(file: Pick<File, "size" | "type">): void {
  if (!file.size) throw new Error("This file is empty.");
  if (file.size > MAX_UPLOAD_BYTES)
    throw new Error("Choose a file smaller than 100 MB.");
  if (!MEDIA_TYPES.includes(file.type))
    throw new Error(
      "Upload a JPG, PNG, WebP, GIF, MP4 video, or WAV audio file.",
    );
}
