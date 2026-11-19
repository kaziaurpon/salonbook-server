import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { Appointment } from "../models/appointment.js";
import { AuthUser } from "../models/auth-user.js";
import { Service } from "../models/service.js";

export const adminOverviewRouter = Router();
adminOverviewRouter.use(requireAuth, requireRole("admin"));

adminOverviewRouter.get("/", async (_request, response) => {
  const [customers, activeServices, totalAppointments, pendingAppointments, confirmedAppointments, cancelledAppointments, successfulPayments] = await Promise.all([
    AuthUser.countDocuments({ role: { $ne: "admin" } }),
    Service.countDocuments({ status: "active" }),
    Appointment.countDocuments(),
    Appointment.countDocuments({ status: "pending" }),
    Appointment.countDocuments({ status: "confirmed" }),
    Appointment.countDocuments({ status: "cancelled" }),
    Appointment.countDocuments({ paymentStatus: "paid" }),
  ]);
  response.json({ overview: { customers, activeServices, totalAppointments, pendingAppointments, confirmedAppointments, cancelledAppointments, successfulPayments } });
});
