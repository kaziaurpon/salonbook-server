# SalonBook Server

Express REST API for SalonBook. Mongoose manages business data in MongoDB; Better Auth remains the owner of its authentication records in the shared `users` collection.

## Local setup

1. In this folder, run `npm install`.
2. Copy `.env.example` to `.env`. Set `MONGODB_URI`, `DATABASE_NAME`, `PORT=4000`, and `CLIENT_ORIGIN=http://localhost:3000`. Use the same MongoDB database as the client.
3. Set `BETTER_AUTH_ISSUER` and `BETTER_AUTH_AUDIENCE` to `http://localhost:3000`, and set `BETTER_AUTH_JWKS_URL` to `http://localhost:3000/api/auth/jwks`.
4. To allow service image uploads, add your ImgBB key as `IMGBB_API_KEY`. It stays on the server and is never sent to the browser.
5. Start the API with `npm run dev`. It listens on port 4000 by default; health is available at `/api/health`.

The public service API provides active services, categories, name search, price sorting, pagination, featured services, and active service details. Admin service management requires a verified Better Auth JWT and a current `admin` role in MongoDB. The API reads that role and blocked status from Better Auth's `users` collection for each protected request.

Customers can request appointments for active services, view their own requests, and cancel only pending requests. A unique service/date/time reservation prevents duplicate pending/confirmed requests for the same service. Admins can review all requests, confirm pending requests, and cancel pending or confirmed requests. Appointment records snapshot the service price and begin as pending/unpaid.

## Stripe test payments

Only confirmed, unpaid appointments belonging to the signed-in customer can start Stripe Checkout. The API creates a card-only BDT Checkout Session from the saved appointment price. The browser return page never marks an appointment paid; only a signature-verified `checkout.session.completed` webhook with a paid session creates the transaction and updates the appointment. Transaction records are idempotent by Stripe Checkout Session ID, and the admin transaction screen is read-only.

Keep `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in this server's ignored `.env` only. Use a Stripe test secret beginning with `sk_test_`; the API rejects live keys. For local webhook testing, install and sign in to the Stripe CLI, then run:

```bash
stripe login
stripe listen --forward-to http://localhost:4000/api/payments/webhook --events checkout.session.completed
```

Copy the `whsec_...` secret printed by the CLI into `STRIPE_WEBHOOK_SECRET` in `server/.env`, restart the API, and keep the CLI listener running. In Stripe Checkout, use a Stripe test card such as `4242 4242 4242 4242`, any future expiry, and any CVC. For deployment, configure a Stripe webhook endpoint at `https://<your-api-domain>/api/payments/webhook` listening for `checkout.session.completed`; put that endpoint's signing secret in the deployed server's `STRIPE_WEBHOOK_SECRET` environment variable.

## Environment variables

See `.env.example` for names only. The API needs Better Auth's public JWKS URL and expected issuer/audience, but not the Better Auth secret. Never commit actual MongoDB credentials, provider keys, or other secrets.

## Repositories

- Client: https://github.com/kaziaurpon/salonbook-client
- Server: https://github.com/kaziaurpon/salonbook-server
