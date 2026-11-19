# SalonBook — Server

SalonBook Server is the Express REST API for the salon booking platform. It stores salon services, appointments, and transactions in MongoDB with Mongoose. Better Auth in the separate Next.js Client repository owns authentication users, sessions, accounts, and verification records in the shared database.

## Features

- Public active-service catalog, search, category filters, sorting, and pagination.
- Admin-only service image upload through the server-side ImgBB integration and service management endpoints.
- Appointment creation, customer-owned history/cancellation, and admin status management.
- Current-user role and blocked-state checks on protected APIs after JWT/JWKS verification.
- Confirmed-appointment Stripe Checkout and signature-verified, idempotent payment webhook.
- Read-only admin transaction listing, plus customer/profile management APIs.

## Stack

Node.js, Express 5, TypeScript, MongoDB, Mongoose, Better Auth JWT/JWKS verification, Zod, ImgBB, and Stripe.

## Run locally

Requirements: Node.js 20.9 or newer, npm, MongoDB Atlas or local MongoDB, and the separate SalonBook Client checkout.

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` (or add missing variables to an existing `.env`).
3. Set `MONGODB_URI` and `DATABASE_NAME` to the same database used by the Client's Better Auth adapter. Set `PORT=4000` and `CLIENT_ORIGIN=http://localhost:3000` for local development.
4. Set the Better Auth verifier values to issuer/audience `http://localhost:3000` and JWKS URL `http://localhost:3000/api/auth/jwks`.
5. Set Stripe test credentials and `IMGBB_API_KEY` to enable payments and image upload. Keep all keys in this server's ignored `.env`.
6. Start the API with `npm run dev`. It listens on port 4000 locally; `http://localhost:4000/api/health` reports whether MongoDB is connected (HTTP 503 when the database is unavailable).

## Environment variable names

Names only; configure values in the ignored `.env` file or hosting provider:

```text
PORT
CLIENT_ORIGIN
MONGODB_URI
DATABASE_NAME
BETTER_AUTH_ISSUER
BETTER_AUTH_AUDIENCE
BETTER_AUTH_JWKS_URL
BETTER_AUTH_URL (optional issuer fallback)
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
IMGBB_API_KEY
```

Use a Stripe test secret beginning with `sk_test_`; the API rejects live secret keys. Better Auth, Google OAuth, and frontend public URL variables belong in the Client deployment, not this API service.

## Local Stripe webhook check

Install and authenticate the Stripe CLI, then forward only the required event:

```bash
stripe login
stripe listen --forward-to http://localhost:4000/api/payments/webhook --events checkout.session.completed
```

Put the CLI listener's signing secret in `STRIPE_WEBHOOK_SECRET` in `server/.env`, restart the API, and keep the listener running. Complete a real test Checkout for a confirmed appointment. A test card such as `4242 4242 4242 4242` works with any future expiry and any CVC. The API changes the payment status only after verifying the webhook signature and matching the saved appointment, amount, and Checkout Session.

## Deployment — Render

1. Create a Render Web Service from the separate `salonbook-server` repository. Leave Root Directory at the repository root.
2. Set Build Command to `npm ci && npm run build` and Start Command to `npm start`. The app uses Render's `PORT` value when supplied.
3. In Render's Environment settings, add `MONGODB_URI`, `DATABASE_NAME`, `CLIENT_ORIGIN`, `BETTER_AUTH_ISSUER`, `BETTER_AUTH_AUDIENCE`, `BETTER_AUTH_JWKS_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `IMGBB_API_KEY`. Keep `STRIPE_SECRET_KEY` in test mode for this assignment.
4. After both services have domains, set `CLIENT_ORIGIN` to the exact client origin, for example `https://<client-domain>` (no path or trailing slash). Set issuer and audience to that same client origin and JWKS URL to `https://<client-domain>/api/auth/jwks`.
5. In Stripe Dashboard **test mode**, add a webhook endpoint at `https://<api-domain>/api/payments/webhook` and subscribe to `checkout.session.completed`. Copy that endpoint's signing secret into Render's `STRIPE_WEBHOOK_SECRET`, then redeploy the API.
6. Add the deployed API health URL to the Client's `NEXT_PUBLIC_API_URL`. Verify an allowed client origin succeeds and an untrusted origin is rejected before submitting.

## Links

- Live API: **Not deployed yet — add the verified base URL here.**
- Client repository: https://github.com/kaziaurpon/salonbook-client
- Server repository: https://github.com/kaziaurpon/salonbook-server
