# SalonBook Server

SalonBook Server is the Express REST API for the SalonBook booking platform. It manages the service catalog, appointments, customer administration, and payment records. The companion [SalonBook Client](https://github.com/kaziaurpon/salonbook-client) provides the public website, dashboards, and Better Auth sign-in.

## Project overview

The Client and Server use the same MongoDB database. Better Auth in the Client owns users, sessions, linked accounts, and verification records. For protected API requests, the Server verifies the Client's signed identity token against its JWKS endpoint and checks the user's role and access status.

## Features

- Public active-service catalog with search, category filters, featured services, sorting, and pagination.
- Customer appointment availability, booking, history, cancellation, and payment checkout.
- Admin service, appointment, customer, and transaction management endpoints.
- Role and blocked-account checks for protected routes.
- Service and profile image uploads through Cloudinary-backed signed uploads.
- Stripe Checkout for confirmed appointments, with signature-verified and idempotent webhook processing.
- Health endpoint that reports API and MongoDB connection status.

## Architecture

```text
SalonBook Client ── authenticated API requests ──> SalonBook Server ──> MongoDB
       │                                                  │
       └── Better Auth / JWKS token verification <────────┘
                                                          ├── Cloudinary image storage
Stripe Checkout ── signed webhook event ──────────────────┘
```

The browser return from Stripe Checkout does not mark an appointment as paid. The Server validates the webhook signature and reconciles the Checkout Session, amount, and saved appointment before recording payment.

## Technology stack

| Area | Technology |
| --- | --- |
| Runtime and API | Node.js, Express 5, TypeScript |
| Data | MongoDB, Mongoose |
| Authentication verification | Better Auth JWT/JWKS, `jose` |
| Validation and security | Zod, Helmet, CORS |
| Image storage | Cloudinary, Multer |
| Payments | Stripe Checkout and webhooks |
| Hosting | Render |

## API overview

All endpoints are under `/api`. Protected endpoints require a valid Client-issued identity token and the appropriate customer or admin role.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | API and MongoDB readiness. |
| `GET` | `/api/services` | Active catalog with search, category, sort, and pagination filters. |
| `GET` | `/api/services/categories` | Active service categories. |
| `GET` | `/api/services/category-cards` | Category cards and representative images. |
| `GET` | `/api/services/featured` | Featured active services. |
| `GET` | `/api/services/:id` | Active service details for an authenticated user. |
| `GET`, `POST`, `PATCH` | `/api/appointments/...` | Customer availability, bookings, history, cancellation, checkout, and payment status. |
| `GET`, `PATCH` | `/api/admin/appointments/...` | Admin appointment listing and status updates. |
| `GET`, `POST`, `PUT`, `PATCH`, `DELETE` | `/api/admin/services/...` | Admin service catalog and image upload operations. |
| `GET` | `/api/admin/overview` | Admin dashboard summary. |
| `GET` | `/api/admin/customers/...` | Customer listing and detail. |
| `PATCH` | `/api/admin/customers/:customerId/status` | Update customer access status. |
| `GET` | `/api/admin/transactions` | Read-only payment transaction records. |
| `GET`, `PATCH`, `POST` | `/api/profile/...` | Current-user profile and profile-image operations. |
| `POST` | `/api/payments/webhook` | Stripe Checkout event receiver. |

## Installation and local development

### Requirements

- Node.js 20.9 or newer and npm.
- MongoDB Atlas or a local MongoDB instance.
- A local checkout of the [SalonBook Client](https://github.com/kaziaurpon/salonbook-client).
- Stripe CLI for local payment-webhook development.

### Set up the Server

1. Clone this repository and install dependencies:

   ```bash
   git clone https://github.com/kaziaurpon/salonbook-server.git
   cd salonbook-server
   npm install
   ```

2. Create a local environment file:

   ```bash
   cp .env.example .env
   ```

   If `.env` already exists, preserve it and add any missing variables rather than replacing it.

3. Configure MongoDB to use the same database and database name as the Client's Better Auth adapter. For local development, allow the Client origin at `http://localhost:3000` and use that origin for the Better Auth issuer and audience. The JWKS endpoint is `http://localhost:3000/api/auth/jwks`.

4. Add Stripe test-mode and Cloudinary credentials for payment and image-upload features. Keep these private values only in the ignored `.env` file.

5. Start the Client by following its [local setup instructions](https://github.com/kaziaurpon/salonbook-client#installation-and-local-development), then start the API:

   ```bash
   npm run dev
   ```

The API listens on port 4000 locally by default. Check [http://localhost:4000/api/health](http://localhost:4000/api/health) to confirm that the API can connect to MongoDB. The endpoint returns HTTP 503 when the database is unavailable.

## Available scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the API in watch mode. |
| `npm run build` | Compile TypeScript into `dist/`. |
| `npm start` | Start the compiled production API. |
| `npm run seed:services` | Add missing built-in salon services to MongoDB. |
| `npm run refresh:service-images` | Refresh bundled image paths for existing built-in services. |

## Required environment variables

Variable names only. Configure private values in `.env` or the hosting provider's environment settings; never commit them.

```text
PORT
CLIENT_ORIGIN
MONGODB_URI
DATABASE_NAME
BETTER_AUTH_ISSUER
BETTER_AUTH_AUDIENCE
BETTER_AUTH_JWKS_URL
BETTER_AUTH_URL
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
```

`BETTER_AUTH_URL` is an optional issuer fallback. Better Auth secrets, Google OAuth variables, and `NEXT_PUBLIC_*` frontend configuration belong to the Client, not this API service. The API is configured for Stripe test mode and rejects live secret keys.

## Local Stripe webhook

1. Install and authenticate the Stripe CLI.
2. Forward the required event to the local API:

   ```bash
   stripe login
   stripe listen --forward-to http://localhost:4000/api/payments/webhook --events checkout.session.completed
   ```

3. Put the listener's signing secret in `STRIPE_WEBHOOK_SECRET` in the Server's `.env`, restart the API, and keep the listener running.
4. Complete a test Checkout for a confirmed appointment. The Server records payment only after signature verification and matching the saved appointment, amount, and Checkout Session.

## Deployment

The API is deployed as a Render Web Service from this repository. Keep the repository root as the service root directory.

1. Set the Build Command to `npm ci && npm run build` and the Start Command to `npm start`. Render supplies the `PORT` value.
2. Add the required environment variables in Render's Environment settings. Keep Stripe in test mode for this deployment. Cloudinary variables stay on Render and must not be added to the Client or committed to GitHub.
3. Set `CLIENT_ORIGIN`, `BETTER_AUTH_ISSUER`, and `BETTER_AUTH_AUDIENCE` to the production Client origin: `https://salonbook-client-olive.vercel.app`. Set `BETTER_AUTH_JWKS_URL` to `https://salonbook-client-olive.vercel.app/api/auth/jwks`.
4. In Stripe Dashboard test mode, register `https://salonbook-server-slxb.onrender.com/api/payments/webhook` for `checkout.session.completed`. Store its signing secret in Render's `STRIPE_WEBHOOK_SECRET`, then redeploy the API.
5. Set the Client's `NEXT_PUBLIC_API_URL` to `https://salonbook-server-slxb.onrender.com`. Confirm the API health endpoint and verify that the configured Client origin is accepted by CORS.

## Links

- Live website: [salonbook-client-olive.vercel.app](https://salonbook-client-olive.vercel.app)
- Live API: [salonbook-server-slxb.onrender.com](https://salonbook-server-slxb.onrender.com)
- API health: [salonbook-server-slxb.onrender.com/api/health](https://salonbook-server-slxb.onrender.com/api/health)
- Client repository: [kaziaurpon/salonbook-client](https://github.com/kaziaurpon/salonbook-client)
- Server repository: [kaziaurpon/salonbook-server](https://github.com/kaziaurpon/salonbook-server)
