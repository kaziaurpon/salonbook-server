import Stripe from "stripe";

let stripeClient: Stripe | undefined;

export function getStripeClient() {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret || !secret.startsWith("sk_test_")) {
    throw new Error("Stripe test mode is not configured. Set a test secret key on the server.");
  }
  stripeClient ??= new Stripe(secret);
  return stripeClient;
}
