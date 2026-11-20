import mongoose from "mongoose";
import type Stripe from "stripe";
import { Appointment } from "../models/appointment.js";
import { Transaction } from "../models/transaction.js";

/** Records a Stripe-confirmed test payment once, whether observed by webhook or status polling. */
export async function recordSuccessfulCheckout(checkout: Stripe.Checkout.Session) {
  if (checkout.livemode || checkout.mode !== "payment" || checkout.payment_status !== "paid" || checkout.currency !== "bdt" || !checkout.amount_total) {
    throw new Error("Checkout session is not a paid SalonBook test payment.");
  }

  const appointmentId = checkout.metadata?.appointmentId;
  const customerId = checkout.metadata?.customerId;
  if (!appointmentId || !mongoose.isValidObjectId(appointmentId) || !customerId || checkout.client_reference_id !== appointmentId) {
    throw new Error("Checkout metadata is missing or invalid.");
  }

  const mongoSession = await mongoose.startSession();
  try {
    await mongoSession.withTransaction(async () => {
      const appointment = await Appointment.findOne({ _id: appointmentId, customerId }).session(mongoSession);
      if (!appointment) throw new Error("The appointment for this payment no longer exists.");
      const expectedAmount = Math.round(appointment.servicePrice * 100);
      if (checkout.amount_total !== expectedAmount) throw new Error("Checkout amount does not match the appointment price.");

      const existingTransaction = await Transaction.findOne({ stripeSessionId: checkout.id }).session(mongoSession);
      if (existingTransaction) {
        if (appointment.paymentStatus !== "paid" || existingTransaction.appointmentId.toString() !== appointmentId) {
          throw new Error("Payment record is inconsistent and needs reconciliation.");
        }
        return;
      }

      if (appointment.status !== "confirmed" || appointment.paymentStatus !== "unpaid") {
        throw new Error("Only confirmed, unpaid appointments can be marked paid.");
      }
      if (appointment.checkoutSessionId !== checkout.id) {
        throw new Error("Checkout Session does not match the appointment's active payment attempt.");
      }

      await Transaction.create([{
        appointmentId: appointment._id,
        customerId,
        amount: checkout.amount_total / 100,
        currency: checkout.currency,
        stripeSessionId: checkout.id,
        status: "paid",
      }], { session: mongoSession });

      appointment.paymentStatus = "paid";
      appointment.checkoutSessionId = undefined;
      await appointment.save({ session: mongoSession });
    });
  } finally {
    await mongoSession.endSession();
  }
}

/** Records terminal unsuccessful Checkout attempts for the read-only admin ledger. */
export async function recordFailedCheckout(checkout: Stripe.Checkout.Session) {
  if (checkout.livemode || checkout.mode !== "payment" || checkout.currency !== "bdt" || !checkout.amount_total) {
    throw new Error("Checkout session is not a SalonBook test payment attempt.");
  }

  const appointmentId = checkout.metadata?.appointmentId;
  const customerId = checkout.metadata?.customerId;
  if (!appointmentId || !mongoose.isValidObjectId(appointmentId) || !customerId || checkout.client_reference_id !== appointmentId) {
    throw new Error("Checkout metadata is missing or invalid.");
  }

  const appointment = await Appointment.findOne({ _id: appointmentId, customerId }).select("servicePrice").lean<{ servicePrice: number }>();
  if (!appointment || checkout.amount_total !== Math.round(appointment.servicePrice * 100)) {
    throw new Error("Checkout amount does not match the appointment price.");
  }

  await Transaction.updateOne({ stripeSessionId: checkout.id }, {
    $setOnInsert: {
      appointmentId: new mongoose.Types.ObjectId(appointmentId),
      customerId,
      amount: checkout.amount_total / 100,
      currency: checkout.currency,
      stripeSessionId: checkout.id,
      status: "failed",
    },
  }, { upsert: true });
}
