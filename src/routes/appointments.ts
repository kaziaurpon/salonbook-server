import { Router } from "express";
import mongoose, { isValidObjectId } from "mongoose";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { Appointment, APPOINTMENT_TIME_SLOTS } from "../models/appointment.js";
import { Service } from "../models/service.js";
import { AuthUser } from "../models/auth-user.js";

export const appointmentsRouter = Router();
export const adminAppointmentsRouter = Router();
const customerOnly = [requireAuth, requireRole("customer")];
const adminOnly = [requireAuth, requireRole("admin")];

function parseDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function isPastDate(date: Date) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return date < today;
}

const appointmentSchema = z.object({
  serviceId: z.string().refine(isValidObjectId, "Invalid service ID."),
  appointmentDate: z.string(),
  timeSlot: z.enum(APPOINTMENT_TIME_SLOTS),
  message: z.string().trim().max(1000).optional().default(""),
});

appointmentsRouter.get("/available-slots", ...customerOnly, async (request, response) => {
  const serviceId = typeof request.query.serviceId === "string" ? request.query.serviceId : "";
  if (!isValidObjectId(serviceId)) {
    response.status(400).json({ message: "Choose a valid salon service first." });
    return;
  }
  const serviceObjectId = new mongoose.Types.ObjectId(serviceId);
  const date = parseDate(request.query.date);
  if (!date || isPastDate(date)) {
    response.status(400).json({ message: "Choose a valid date from today onward." });
    return;
  }
  const service = await Service.findOne({ _id: serviceObjectId, status: "active" }).select("_id").lean();
  if (!service) {
    response.status(404).json({ message: "This salon service is unavailable." });
    return;
  }
  const occupied = await Appointment.distinct("timeSlot", {
    serviceId: serviceObjectId,
    appointmentDate: date,
    status: { $in: ["pending", "confirmed"] },
  });
  response.json({
    slots: APPOINTMENT_TIME_SLOTS.map((timeSlot) => ({ timeSlot, available: !occupied.includes(timeSlot) })),
  });
});

appointmentsRouter.get("/mine", ...customerOnly, async (request, response) => {
  const appointments = await Appointment.find({ customerId: request.authUser!.id })
    .populate("serviceId", "serviceName category image")
    .sort({ appointmentDate: -1, createdAt: -1 })
    .lean();
  response.json({ appointments });
});

appointmentsRouter.post("/", ...customerOnly, async (request, response) => {
  const parsed = appointmentSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "Choose a service, valid date, and available time slot.", errors: parsed.error.flatten().fieldErrors });
    return;
  }
  const appointmentDate = parseDate(parsed.data.appointmentDate);
  if (!appointmentDate || isPastDate(appointmentDate)) {
    response.status(400).json({ message: "Choose a valid appointment date from today onward." });
    return;
  }
  const serviceObjectId = new mongoose.Types.ObjectId(parsed.data.serviceId);
  const service = await Service.findOne({ _id: parsed.data.serviceId, status: "active" });
  if (!service) {
    response.status(404).json({ message: "This salon service is unavailable." });
    return;
  }

  const slotKey = `${serviceObjectId.toString()}:${appointmentDate.toISOString().slice(0, 10)}:${parsed.data.timeSlot}`;
  try {
    const existing = await Appointment.exists({ serviceId: serviceObjectId, appointmentDate, timeSlot: parsed.data.timeSlot, status: { $in: ["pending", "confirmed"] } });
    if (existing) {
      response.status(409).json({ message: "That service and time are already requested. Choose another available time." });
      return;
    }
    const appointment = await Appointment.create({
      serviceId: serviceObjectId,
      customerId: request.authUser!.id,
      appointmentDate,
      timeSlot: parsed.data.timeSlot,
      message: parsed.data.message,
      servicePrice: service.price,
      status: "pending",
      paymentStatus: "unpaid",
      slotKey,
    });
    response.status(201).json({ appointment, message: "Your appointment request has been sent." });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 11000) {
      response.status(409).json({ message: "That time was just booked. Choose another available time." });
      return;
    }
    throw error;
  }
});

appointmentsRouter.patch("/:id/cancel", ...customerOnly, async (request, response) => {
  if (!isValidObjectId(request.params.id)) {
    response.status(400).json({ message: "This appointment ID is not valid." });
    return;
  }
  const appointment = await Appointment.findOneAndUpdate(
    { _id: request.params.id, customerId: request.authUser!.id, status: "pending" },
    { $set: { status: "cancelled" }, $unset: { slotKey: 1 } },
    { new: true },
  ).lean();
  if (!appointment) {
    response.status(409).json({ message: "Only your own pending appointments can be cancelled." });
    return;
  }
  response.json({ appointment, message: "Appointment request cancelled." });
});

adminAppointmentsRouter.get("/", ...adminOnly, async (_request, response) => {
  const appointments = await Appointment.find()
    .populate("serviceId", "serviceName category image")
    .sort({ appointmentDate: -1, createdAt: -1 })
    .lean();
  const ids = [...new Set(appointments.map((appointment) => appointment.customerId))];
  const idCandidates = ids.flatMap((id) => mongoose.isValidObjectId(id)
    ? [id, new mongoose.Types.ObjectId(id)]
    : [id]);
  const users = await AuthUser.find({ _id: { $in: idCandidates } }).lean();
  const usersById = new Map(users.map((user) => [String(user._id), { id: String(user._id), name: user.name, email: user.email, image: user.image }]));
  response.json({ appointments: appointments.map((appointment) => ({ ...appointment, customer: usersById.get(appointment.customerId) || null })) });
});

adminAppointmentsRouter.patch("/:id/status", ...adminOnly, async (request, response) => {
  if (!isValidObjectId(request.params.id)) {
    response.status(400).json({ message: "This appointment ID is not valid." });
    return;
  }
  const parsed = z.object({ status: z.enum(["confirmed", "cancelled"]) }).safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "Choose confirmed or cancelled." });
    return;
  }
  const allowedStatus = parsed.data.status === "confirmed" ? "pending" : { $in: ["pending", "confirmed"] };
  const update = parsed.data.status === "cancelled"
    ? { $set: { status: "cancelled" }, $unset: { slotKey: 1 } }
    : { $set: { status: "confirmed" } };
  const appointment = await Appointment.findOneAndUpdate(
    { _id: request.params.id, status: allowedStatus },
    update,
    { new: true },
  ).lean();
  if (!appointment) {
    response.status(409).json({ message: "This appointment no longer has a status that allows that action." });
    return;
  }
  response.json({ appointment, message: `Appointment ${parsed.data.status}.` });
});
