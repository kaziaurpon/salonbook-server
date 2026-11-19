import dotenv from "dotenv";

const localEnvironment = dotenv.config().parsed;

// Stripe must remain in test mode for this project. Prefer the server-local
// test credentials if a parent shell exported an empty or unrelated value.
const localStripeSecret = localEnvironment?.STRIPE_SECRET_KEY?.trim();
if (localStripeSecret?.startsWith("sk_test_")) {
  process.env.STRIPE_SECRET_KEY = localStripeSecret;
}

const localStripeWebhookSecret = localEnvironment?.STRIPE_WEBHOOK_SECRET?.trim();
if (localStripeWebhookSecret?.startsWith("whsec_")) {
  process.env.STRIPE_WEBHOOK_SECRET = localStripeWebhookSecret;
}
