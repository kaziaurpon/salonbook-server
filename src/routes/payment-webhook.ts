import type { Request, Response } from "express";
import mongoose from "mongoose";
import Stripe from "stripe";
import { Appointment } from "../models/appointment.js";
import { Transaction } from "../models/transaction.js";
import { getStripeClient } from "../lib/stripe.js";

export async function stripeWebhookHandler(request: Request, response: Response) {
  const signature = request.header("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    response.status(503).json({ message: "Stripe webhook verification is not configured on the server." });
    return;
  }
  if (!signature || !Buffer.isBuffer(request.body)) {
    response.status(400).json({ message: "A valid Stripe webhook signature and raw request body are required." });
    return;
  }

  let event: Stripe.Event;
  try {
    event = getStripeClient().webhooks.constructEvent(request.body, signature, webhookSecret);
  } catch {
    response.status(400).json({ message: "Stripe webhook signature verification failed." });
    return;
  }

  if (event.type !== "checkout.session.completed") {
    response.json({ received: true, ignored: true });
    return;
  }

  const checkout = event.data.object as Stripe.Checkout.Session;
  if (checkout.livemode || checkout.mode !== "payment" || checkout.payment_status !== "paid" || checkout.currency !== "bdt" || !checkout.amount_total) {
    response.json({ received: true, ignored: true });
    return;
  }

  const appointmentId = checkout.metadata?.appointmentId;
  const customerId = checkout.metadata?.customerId;
  if (!appointmentId || !mongoose.isValidObjectId(appointmentId) || !customerId || checkout.client_reference_id !== appointmentId) {
    response.status(400).json({ message: "Checkout metadata is missing or invalid." });
    return;
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
        status: "succeeded",
      }], { session: mongoSession });

      appointment.paymentStatus = "paid";
      appointment.checkoutSessionId = undefined;
      await appointment.save({ session: mongoSession });
    });
    response.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook processing failed.", error instanceof Error ? error.message : "Unknown error");
    response.status(500).json({ message: "Payment could not be recorded yet. Stripe can retry this event." });
  } finally {
    await mongoSession.endSession();
  }
}
