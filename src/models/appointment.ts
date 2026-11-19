import mongoose, { Schema } from "mongoose";

export const APPOINTMENT_TIME_SLOTS = [
  "10:00 AM", "11:00 AM", "12:00 PM", "01:00 PM",
  "02:00 PM", "03:00 PM", "04:00 PM", "05:00 PM",
] as const;

export interface AppointmentRecord {
  serviceId: mongoose.Types.ObjectId;
  customerId: string;
  appointmentDate: Date;
  timeSlot: (typeof APPOINTMENT_TIME_SLOTS)[number];
  message?: string;
  servicePrice: number;
  paymentStatus: "unpaid" | "paid";
  status: "pending" | "confirmed" | "cancelled";
  slotKey?: string;
  checkoutSessionId?: string;
  createdAt: Date;
}

const appointmentSchema = new Schema<AppointmentRecord>(
  {
    serviceId: { type: Schema.Types.ObjectId, ref: "Service", required: true, index: true },
    customerId: { type: String, required: true, index: true },
    appointmentDate: { type: Date, required: true },
    timeSlot: { type: String, enum: APPOINTMENT_TIME_SLOTS, required: true },
    message: { type: String, trim: true, maxlength: 1000 },
    servicePrice: { type: Number, required: true, min: 0.01 },
    paymentStatus: { type: String, enum: ["unpaid", "paid"], default: "unpaid" },
    status: { type: String, enum: ["pending", "confirmed", "cancelled"], default: "pending", index: true },
    slotKey: { type: String, unique: true, sparse: true },
    checkoutSessionId: { type: String, default: undefined },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

export const Appointment = mongoose.models.Appointment
  || mongoose.model<AppointmentRecord>("Appointment", appointmentSchema);
