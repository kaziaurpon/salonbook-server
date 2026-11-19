import { Router, type Response } from "express";
import multer from "multer";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { Service } from "../models/service.js";

export const adminServicesRouter = Router();
const adminOnly = [requireAuth, requireRole("admin")];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.mimetype)) {
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

const createServiceSchema = z.object({
  serviceName: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(80),
  description: z.string().trim().min(10).max(2000),
  price: z.coerce.number().positive().finite(),
  duration: z.coerce.number().int().positive(),
  image: z.string().url(),
  status: z.enum(["active", "inactive"]).optional(),
});

const updateServiceSchema = createServiceSchema.partial().refine((values) => Object.keys(values).length > 0, {
  message: "Provide at least one service field to update.",
});

function validId(id: string, response: Response) {
  if (isValidObjectId(id)) return true;
  response.status(400).json({ message: "This service ID is not valid." });
  return false;
}

adminServicesRouter.use(...adminOnly);

adminServicesRouter.get("/", async (request, response) => {
  const rawPage = Number(request.query.page || 1);
  const rawLimit = Number(request.query.limit || 12);
  const page = Number.isFinite(rawPage) ? Math.max(Math.floor(rawPage), 1) : 1;
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 48) : 12;
  const search = typeof request.query.q === "string" ? request.query.q.trim().slice(0, 100) : "";
  const filter: Record<string, unknown> = {};
  if (request.query.status === "active" || request.query.status === "inactive") filter.status = request.query.status;
  if (search) filter.serviceName = { $regex: search.replace(/[.*+?^$()|[\]{}\\]/g, "\\$&"), $options: "i" };
  const [services, total] = await Promise.all([
    Service.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Service.countDocuments(filter),
  ]);
  response.json({ services, page, limit, total, pages: Math.ceil(total / limit) });
});

adminServicesRouter.post("/upload-image", (request, response, next) => {
  upload.single("image")(request, response, (error: unknown) => {
    if (!error) return next();
    const message = error instanceof Error ? error.message : "The image could not be uploaded.";
    response.status(message.includes("File too large") ? 413 : 400).json({ message });
  });
}, async (request, response) => {
  const apiKey = process.env.IMGBB_API_KEY;
  if (!apiKey) {
    response.status(503).json({ message: "Image upload is not configured. Set IMGBB_API_KEY on the server." });
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
    response.status(201).json({ image: payload.data.display_url });
  } catch {
    response.status(502).json({ message: "Could not reach the image hosting service. Try again." });
  }
});

adminServicesRouter.post("/", async (request, response) => {
  const parsed = createServiceSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "Check the service fields and try again.", errors: parsed.error.flatten().fieldErrors });
    return;
  }
  const service = await Service.create({ ...parsed.data, status: parsed.data.status || "active" });
  response.status(201).json({ service });
});

adminServicesRouter.put("/:id", async (request, response) => {
  if (!validId(request.params.id, response)) return;
  const parsed = updateServiceSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "Check the service fields and try again.", errors: parsed.error.flatten().fieldErrors });
    return;
  }
  const service = await Service.findByIdAndUpdate(request.params.id, parsed.data, { new: true, runValidators: true });
  if (!service) {
    response.status(404).json({ message: "Service not found." });
    return;
  }
  response.json({ service });
});

adminServicesRouter.patch("/:id/status", async (request, response) => {
  if (!validId(request.params.id, response)) return;
  const parsed = z.object({ status: z.enum(["active", "inactive"]) }).safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "Choose active or inactive status." });
    return;
  }
  const service = await Service.findByIdAndUpdate(request.params.id, { status: parsed.data.status }, { new: true, runValidators: true });
  if (!service) {
    response.status(404).json({ message: "Service not found." });
    return;
  }
  response.json({ service });
});

adminServicesRouter.delete("/:id", async (request, response) => {
  if (!validId(request.params.id, response)) return;
  const service = await Service.findByIdAndDelete(request.params.id);
  if (!service) {
    response.status(404).json({ message: "Service not found." });
    return;
  }
  response.json({ message: "Service deleted." });
});
