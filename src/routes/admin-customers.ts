import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { Appointment } from "../models/appointment.js";
import { AuthUser } from "../models/auth-user.js";

export const adminCustomersRouter = Router();
adminCustomersRouter.use(requireAuth, requireRole("admin"));

const statusInput = z.object({ isBlocked: z.boolean() }).strict();
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const idCandidates = (id: string) => mongoose.isValidObjectId(id) ? [id, new mongoose.Types.ObjectId(id)] : [id];

adminCustomersRouter.get("/", async (request, response) => {
  const query = z.object({ q: z.string().trim().max(100).optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(12) }).safeParse(request.query);
  if (!query.success) return response.status(400).json({ message: "Search or pagination values are invalid." });
  const { q = "", page, limit } = query.data;
  const filter: Record<string, unknown> = { role: "customer" };
  if (q) filter.$or = [
    { name: { $regex: escapeRegex(q), $options: "i" } },
    { email: { $regex: escapeRegex(q), $options: "i" } },
  ];
  const [customers, total, blocked, unblocked] = await Promise.all([
    AuthUser.find(filter).select("_id name email image phone role isBlocked createdAt").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuthUser.countDocuments(filter),
    AuthUser.countDocuments({ ...filter, isBlocked: true }),
    AuthUser.countDocuments({ ...filter, isBlocked: { $ne: true } }),
  ]);
  response.json({ customers, pagination: { page, limit, total, pages: Math.ceil(total / limit) }, totals: { blocked, unblocked } });
});

adminCustomersRouter.get("/:customerId", async (request, response) => {
  const { customerId } = request.params;
  if (!customerId || !mongoose.isValidObjectId(customerId)) return response.status(400).json({ message: "Customer id is invalid." });
  const user = await AuthUser.findOne({ _id: { $in: idCandidates(customerId) }, role: "customer" })
    .select("_id name email image phone role isBlocked createdAt")
    .lean();
  if (!user) return response.status(404).json({ message: "Customer was not found." });
  const appointments = await Appointment.find({ customerId: String((user as unknown as { _id: unknown })._id) })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate("serviceId", "serviceName category image")
    .lean();
  response.json({ customer: user, appointments });
});

adminCustomersRouter.patch("/:customerId/status", async (request, response) => {
  const { customerId } = request.params;
  if (!customerId || !mongoose.isValidObjectId(customerId)) return response.status(400).json({ message: "Customer id is invalid." });
  const parsed = statusInput.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ message: "A valid blocked status is required." });
  const customer = await AuthUser.findOneAndUpdate(
    { _id: { $in: idCandidates(customerId) }, role: "customer" },
    { $set: { isBlocked: parsed.data.isBlocked } },
    { new: true },
  ).select("_id name email image phone role isBlocked createdAt").lean();
  if (!customer) return response.status(404).json({ message: "Customer was not found." });
  response.json({ customer, message: parsed.data.isBlocked ? "Customer blocked." : "Customer unblocked." });
});
