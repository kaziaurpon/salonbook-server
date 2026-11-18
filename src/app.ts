import cors from "cors";
import express from "express";
import helmet from "helmet";
import { requireAuth, requireRole } from "./middleware/auth.js";

export const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || "http://localhost:3000",
  credentials: true,
}));
app.use(express.json());

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok", service: "salonbook-api" });
});

app.get("/api/dashboard/customer", requireAuth, requireRole("customer"), (request, response) => {
  response.json({ user: request.authUser, role: "customer" });
});

app.get("/api/dashboard/admin", requireAuth, requireRole("admin"), (request, response) => {
  response.json({ user: request.authUser, role: "admin" });
});
