# SalonBook Server

Express REST API and MongoDB connection for SalonBook.

## Local development

1. Use Node.js 20.9 or later and start MongoDB (or prepare a MongoDB connection string).
2. Run `npm install` in this repository.
3. Copy `.env.example` to `.env`; set `PORT=4000`, `CLIENT_ORIGIN=http://localhost:3000`, and `MONGODB_URI` (for example, `mongodb://127.0.0.1:27017/salonbook`).
4. Run `npm run dev`; the API listens on `http://localhost:4000` and its health endpoint is `/api/health`.

The API uses Mongoose for its MongoDB connection. The Better Auth MongoDB adapter is included for the authentication work in a later step.

## Environment variables

See `.env.example`. Never commit `.env` or other files containing credentials.
# SalonBook Server

Express REST API for SalonBook. MongoDB is accessed through Mongoose. Authentication is issued by the Next.js Better Auth integration; this API verifies Better Auth JWTs using the published JWKS and reloads the current user from Better Auth's `users` collection for every protected request.

## Local setup

1. Install packages with `npm install`.
2. Copy `.env.example` to `.env` and set `MONGODB_URI`, `DATABASE_NAME`, `PORT`, `CLIENT_ORIGIN`, and the Better Auth issuer, audience, and JWKS URL. The client and server must use the same MongoDB database.
3. Start the API with `npm run dev` (default port 4000).
4. Start the frontend in `client/` and open `http://localhost:3000`.

The API does not need the Better Auth secret; it only needs the public JWKS URL and expected issuer/audience. Role guards check the current MongoDB role and blocked status rather than trusting role claims in a token.

## Environment variables

See `.env.example` for names only. Never commit actual MongoDB credentials or other secrets.

## Repositories

- Client: https://github.com/kaziaurpon/salonbook-client
- Server: https://github.com/kaziaurpon/salonbook-server
