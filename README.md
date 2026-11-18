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
