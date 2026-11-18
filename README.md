# SalonBook Server

Express REST API for SalonBook. Mongoose manages business data in MongoDB; Better Auth remains the owner of its authentication records in the shared `users` collection.

## Local setup

1. In this folder, run `npm install`.
2. Copy `.env.example` to `.env`. Set `MONGODB_URI`, `DATABASE_NAME`, `PORT=4000`, and `CLIENT_ORIGIN=http://localhost:3000`. Use the same MongoDB database as the client.
3. Set `BETTER_AUTH_ISSUER` and `BETTER_AUTH_AUDIENCE` to `http://localhost:3000`, and set `BETTER_AUTH_JWKS_URL` to `http://localhost:3000/api/auth/jwks`.
4. To allow service image uploads, add your ImgBB key as `IMGBB_API_KEY`. It stays on the server and is never sent to the browser.
5. Start the API with `npm run dev`. It listens on port 4000 by default; health is available at `/api/health`.

The public service API provides active services, categories, name search, price sorting, pagination, featured services, and active service details. Admin service management requires a verified Better Auth JWT and a current `admin` role in MongoDB. The API reads that role and blocked status from Better Auth's `users` collection for each protected request.

Customers can request appointments for active services, view their own requests, and cancel only pending requests. A unique active time-slot reservation prevents overlapping pending/confirmed appointments. Admins can review all requests, confirm pending requests, and cancel pending or confirmed requests. Appointment records snapshot the service price and begin as pending/unpaid.

## Environment variables

See `.env.example` for names only. The API needs Better Auth's public JWKS URL and expected issuer/audience, but not the Better Auth secret. Never commit actual MongoDB credentials, provider keys, or other secrets.

## Repositories

- Client: https://github.com/kaziaurpon/salonbook-client
- Server: https://github.com/kaziaurpon/salonbook-server
