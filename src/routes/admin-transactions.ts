import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { Appointment } from "../models/appointment.js";
import { AuthUser } from "../models/auth-user.js";
import { Transaction } from "../models/transaction.js";

export const adminTransactionsRouter = Router();
adminTransactionsRouter.use(requireAuth, requireRole("admin"));

adminTransactionsRouter.get("/", async (_request, response) => {
  const transactions = await Transaction.find().sort({ createdAt: -1 }).lean();
  const appointmentIds = transactions.map((item) => item.appointmentId);
  const appointments = await Appointment.find({ _id: { $in: appointmentIds } })
    .select("_id appointmentDate timeSlot serviceId")
    .populate("serviceId", "serviceName category")
    .lean();
  const customerIds = [...new Set(transactions.map((item) => item.customerId))];
  const userIdCandidates = customerIds.flatMap((id) => mongoose.isValidObjectId(id)
    ? [id, new mongoose.Types.ObjectId(id)]
    : [id]);
  const users = await AuthUser.find({ _id: { $in: userIdCandidates } }).select("_id name email").lean();
  const appointmentsById = new Map(appointments.map((item) => [String(item._id), item]));
  const usersById = new Map(users.map((item) => [String(item._id), { name: item.name, email: item.email }]));
  response.json({ transactions: transactions.map((item) => ({
    ...item,
    status: String(item.status) === "succeeded" ? "paid" : item.status,
    appointment: appointmentsById.get(String(item.appointmentId)) || null,
    customer: usersById.get(item.customerId) || null,
  })) });
});
