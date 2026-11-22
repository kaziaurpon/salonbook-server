import { createHash, randomUUID } from "node:crypto";

type HostedImage = { secure_url?: string; error?: { message?: string } };

export class ImageStorageConfigurationError extends Error {}

function cloudinarySettings() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
  const count = [cloudName, apiKey, apiSecret].filter(Boolean).length;
  if (count < 3) throw new ImageStorageConfigurationError("Cloudinary image uploads are not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET on Render.");
  return { cloudName: cloudName!, apiKey: apiKey!, apiSecret: apiSecret! };
}

export async function uploadSalonImage(file: Express.Multer.File): Promise<string> {
  const cloudinary = cloudinarySettings();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const publicId = `upload-${randomUUID()}`;
  const signedParameters = `public_id=${publicId}&timestamp=${timestamp}`;
  const signature = createHash("sha1").update(`${signedParameters}${cloudinary.apiSecret}`).digest("hex");
  const form = new FormData();
  const imageBytes = new Uint8Array(file.buffer.byteLength);
  imageBytes.set(file.buffer);
  form.set("file", new Blob([imageBytes.buffer], { type: file.mimetype }), file.originalname);
  form.set("api_key", cloudinary.apiKey);
  form.set("timestamp", timestamp);
  form.set("public_id", publicId);
  form.set("signature", signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudinary.cloudName)}/image/upload`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json() as HostedImage;
  if (!response.ok || !result.secure_url) {
    throw new Error(result.error?.message || "Cloudinary did not accept the image.");
  }
  return result.secure_url;
}
