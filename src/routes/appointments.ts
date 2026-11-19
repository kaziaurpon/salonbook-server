import { Router } from "express";
import mongoose, { isValidObjectId } from "mongoose";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { Appointment, APPOINTMENT_TIME_SLOTS } from "../models/appointment.js";
import { Service } from "../models/service.js";
import { AuthUser } from "../models/auth-user.js";
import { getStripeClient } from "../lib/stripe.js";

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

appointmentsRouter.post("/:id/checkout", ...customerOnly, async (request, response) => {
  if (!isValidObjectId(request.params.id)) {
    response.status(400).json({ message: "This appointment ID is not valid." });
    return;
  }
  const appointment = await Appointment.findOne({
    _id: request.params.id,
    customerId: request.authUser!.id,
    status: "confirmed",
    paymentStatus: "unpaid",
  }).populate("serviceId", "serviceName");
  if (!appointment) {
    response.status(409).json({ message: "Only your own confirmed, unpaid appointment can be paid." });
    return;
  }

  let stripe;
  try {
    stripe = getStripeClient();
  } catch {
    response.status(503).json({ message: "Stripe test mode is not configured on the server." });
    return;
  }

  let expiredSessionId: string | undefined;
  if (appointment.checkoutSessionId) {
    try {
      const existingSession = await stripe.checkout.sessions.retrieve(appointment.checkoutSessionId);
      if (existingSession.status === "open" && existingSession.url) {
        response.json({ url: existingSession.url });
        return;
      }
      if (existingSession.status === "complete") {
        response.status(409).json({ message: "Payment is processing. Refresh your appointments in a moment." });
        return;
      }
      expiredSessionId = existingSession.id;
    } catch {
      response.status(502).json({ message: "Could not check the previous Stripe Checkout session." });
      return;
    }
  }

  const clientOrigin = (process.env.CLIENT_ORIGIN || "http://localhost:3000").replace(/\/$/, "");
  const serviceName = (appointment.serviceId as unknown as { serviceName?: string } | null)?.serviceName || "Salon appointment";
  const amount = Math.round(appointment.servicePrice * 100);
  if (!Number.isSafeInteger(amount) || amount < 1) {
    response.status(400).json({ message: "The appointment price cannot be charged." });
    return;
  }

  try {
    const checkout = await stripe.checkout.sessions.create({
      mode: "payment",
      allowed_payment_method_types: ["card"],
      client_reference_id: appointment.id,
      customer_email: request.authUser!.email,
      metadata: { appointmentId: appointment.id, customerId: request.authUser!.id },
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "bdt",
          unit_amount: amount,
          product_data: { name: serviceName },
        },
      }],
      success_url: `${clientOrigin}/payment/success?appointment_id=${appointment.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${clientOrigin}/payment/cancel?appointment_id=${appointment.id}`,
    }, {
      idempotencyKey: `salonbook-checkout:${appointment.id}:${expiredSessionId || "initial"}`,
    });
    if (!checkout.url) {
      response.status(502).json({ message: "Stripe did not return a Checkout URL." });
      return;
    }

    const sessionFilter = appointment.checkoutSessionId
      ? { checkoutSessionId: appointment.checkoutSessionId }
      : { checkoutSessionId: { $exists: false } };
    const updated = await Appointment.findOneAndUpdate({
      _id: appointment._id,
      customerId: request.authUser!.id,
      status: "confirmed",
      paymentStatus: "unpaid",
      ...sessionFilter,
    }, { $set: { checkoutSessionId: checkout.id } }, { new: true });
    if (!updated) {
      const current = await Appointment.findById(appointment._id).select("checkoutSessionId").lean<{ checkoutSessionId?: string }>();
      if (current?.checkoutSessionId === checkout.id) {
        response.json({ url: checkout.url });
        return;
      }
      response.status(409).json({ message: "Appointment status changed. Refresh your appointment list." });
      return;
    }
    response.json({ url: checkout.url });
  } catch {
    response.status(502).json({ message: "Could not create Stripe Checkout. Please try again." });
  }
});

appointmentsRouter.get("/:id/payment-status", ...customerOnly, async (request, response) => {
  if (!isValidObjectId(request.params.id)) {
    response.status(400).json({ message: "This appointment ID is not valid." });
    return;
  }
  const appointment = await Appointment.findOne({ _id: request.params.id, customerId: request.authUser!.id })
    .select("status paymentStatus")
    .lean<{ status: string; paymentStatus: string }>();
  if (!appointment) {
    response.status(404).json({ message: "Appointment not found." });
    return;
  }
  response.json({ status: appointment.status, paymentStatus: appointment.paymentStatus });
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

adminAppointmentsRouter.get("/", ...adminOnly, async (request, response) => {
  const rawPage = Number(request.query.page || 1);
  const rawLimit = Number(request.query.limit || 10);
  const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;
  const limit = Number.isFinite(rawLimit) ? Math.min(30, Math.max(1, Math.floor(rawLimit))) : 10;
  const [appointments, total, pending, confirmed, cancelled] = await Promise.all([
    Appointment.find()
      .populate("serviceId", "serviceName category image")
      .sort({ appointmentDate: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Appointment.countDocuments(),
    Appointment.countDocuments({ status: "pending" }),
    Appointment.countDocuments({ status: "confirmed" }),
    Appointment.countDocuments({ status: "cancelled" }),
  ]);
  const ids = [...new Set(appointments.map((appointment) => appointment.customerId))];
  const idCandidates = ids.flatMap((id) => mongoose.isValidObjectId(id)
    ? [id, new mongoose.Types.ObjectId(id)]
    : [id]);
  const users = await AuthUser.find({ _id: { $in: idCandidates } }).lean();
  const usersById = new Map(users.map((user) => [String(user._id), { id: String(user._id), name: user.name, email: user.email, image: user.image }]));
  response.json({
    appointments: appointments.map((appointment) => ({ ...appointment, customer: usersById.get(appointment.customerId) || null })),
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    totals: { total, pending, confirmed, cancelled },
  });
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
  if (parsed.data.status === "cancelled") {
    const current = await Appointment.findOne({ _id: request.params.id, status: { $in: ["pending", "confirmed"] } }).select("checkoutSessionId").lean<{ checkoutSessionId?: string }>();
    if (current?.checkoutSessionId) {
      try {
        const checkout = await getStripeClient().checkout.sessions.retrieve(current.checkoutSessionId);
        if (checkout.status !== "expired") {
          response.status(409).json({ message: checkout.status === "complete" ? "Payment is completing. Refresh and review the payment status before cancelling." : "This appointment has an open Checkout session. Wait for it to expire before cancelling." });
          return;
        }
      } catch {
        response.status(503).json({ message: "Could not verify the active Checkout session. Try again shortly." });
        return;
      }
    }
  }
  const allowedStatus = parsed.data.status === "confirmed" ? "pending" : { $in: ["pending", "confirmed"] };
  const update = parsed.data.status === "cancelled"
    ? { $set: { status: "cancelled" }, $unset: { slotKey: 1, checkoutSessionId: 1 } }
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
