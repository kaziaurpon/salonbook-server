import mongoose, { Schema } from "mongoose";

export interface TransactionRecord {
  appointmentId: mongoose.Types.ObjectId;
  customerId: string;
  amount: number;
  currency: string;
  stripeSessionId: string;
  status: "paid" | "failed";
  createdAt: Date;
}

const transactionSchema = new Schema<TransactionRecord>(
  {
    appointmentId: { type: Schema.Types.ObjectId, ref: "Appointment", required: true, index: true },
    customerId: { type: String, required: true, index: true },
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, required: true, lowercase: true, minlength: 3, maxlength: 3 },
    stripeSessionId: { type: String, required: true, unique: true },
    status: { type: String, enum: ["paid", "failed"], required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

export const Transaction = mongoose.models.Transaction
  || mongoose.model<TransactionRecord>("Transaction", transactionSchema);
