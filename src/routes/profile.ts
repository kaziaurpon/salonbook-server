import { Router } from "express";
import mongoose from "mongoose";
import multer from "multer";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { AuthUser } from "../models/auth-user.js";

export const profileRouter = Router();
profileRouter.use(requireAuth);

const profileInput = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  image: z.union([z.string().trim().url().max(2048).refine((value) => /^https?:\/\//i.test(value), "Use an http or https image URL."), z.literal(""), z.null()]).optional(),
  phone: z.union([z.string().trim().min(5).max(30).regex(/^[+\d().\-\s]+$/), z.literal(""), z.null()]).optional(),
}).strict().refine((data) => Object.keys(data).length > 0, "Provide at least one profile field to update.");
const profileImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      callback(new Error("Choose a JPG, PNG, or WebP image."));
      return;
    }
    callback(null, true);
  },
});

function imageSignatureMatches(mimeType: string, bytes: Buffer) {
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === "image/webp") return bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  return false;
}

function idCandidates(id: string) {
  return mongoose.isValidObjectId(id) ? [id, new mongoose.Types.ObjectId(id)] : [id];
}

profileRouter.get("/me", async (request, response) => {
  const user = await AuthUser.findOne({ _id: { $in: idCandidates(request.authUser!.id) } })
    .select("_id name email image phone role isBlocked createdAt")
    .lean();
  if (!user) return response.status(404).json({ message: "Your account could not be found." });
  response.json({ profile: user });
});

profileRouter.post("/me/upload-image", (request, response, next) => {
  profileImageUpload.single("image")(request, response, (error: unknown) => {
    if (!error) return next();
    const message = error instanceof Error ? error.message : "The image could not be uploaded.";
    response.status(message.includes("File too large") ? 413 : 400).json({ message });
  });
}, async (request, response) => {
  const apiKey = process.env.IMGBB_API_KEY;
  if (!apiKey) {
    response.status(503).json({ message: "Image upload is not configured. You can still use an image URL." });
    return;
  }
  if (!request.file) {
    response.status(400).json({ message: "Choose an image file to upload." });
    return;
  }
  if (!imageSignatureMatches(request.file.mimetype, request.file.buffer)) {
    response.status(400).json({ message: "The selected file is not a valid JPG, PNG, or WebP image." });
    return;
  }

  const form = new FormData();
  const imageBytes = new Uint8Array(request.file.buffer.byteLength);
  imageBytes.set(request.file.buffer);
  form.append("image", new Blob([imageBytes.buffer], { type: request.file.mimetype }), request.file.originalname);
  try {
    const result = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(apiKey)}`, { method: "POST", body: form });
    const payload = await result.json() as { success?: boolean; data?: { display_url?: string }; error?: { message?: string } };
    if (!result.ok || !payload.success || !payload.data?.display_url) {
      response.status(502).json({ message: payload.error?.message || "Image hosting did not accept the upload." });
      return;
    }
    response.status(201).json({ image: payload.data.display_url, message: "Profile image uploaded. Save your profile to apply it." });
  } catch {
    response.status(502).json({ message: "Could not reach the image hosting service. Try an image URL instead." });
  }
});

profileRouter.patch("/me", async (request, response) => {
  const parsed = profileInput.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: "Profile details are invalid.", issues: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) });
  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.data)) updates[key] = value === "" ? null : value;
  const user = await AuthUser.findOneAndUpdate(
    { _id: { $in: idCandidates(request.authUser!.id) } },
    { $set: updates },
    { new: true, runValidators: true },
  ).select("_id name email image phone role isBlocked createdAt").lean();
  if (!user) return response.status(404).json({ message: "Your account could not be found." });
  response.json({ profile: user, message: "Profile updated." });
});
