import { Router } from "express";
import mongoose from "mongoose";
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
