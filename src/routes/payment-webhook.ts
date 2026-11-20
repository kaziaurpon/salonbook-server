import type { Request, Response } from "express";
import Stripe from "stripe";
import { getStripeClient } from "../lib/stripe.js";
import { recordSuccessfulCheckout } from "../lib/record-stripe-payment.js";

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
  try {
    await recordSuccessfulCheckout(checkout);
    response.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook processing failed.", error instanceof Error ? error.message : "Unknown error");
    response.status(500).json({ message: "Payment could not be recorded yet. Stripe can retry this event." });
  }
}
