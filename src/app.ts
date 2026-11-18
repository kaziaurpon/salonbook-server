import cors from "cors";
import express from "express";
import helmet from "helmet";
import { requireAuth, requireRole } from "./middleware/auth.js";
import { servicesRouter } from "./routes/services.js";

export const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || "http://localhost:3000",
  credentials: true,
}));
app.use(express.json());

app.use("/api/services", servicesRouter);

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok", service: "salonbook-api" });
});

app.get("/api/dashboard/customer", requireAuth, requireRole("customer"), (request, response) => {
  response.json({ user: request.authUser, role: "customer" });
});

app.get("/api/dashboard/admin", requireAuth, requireRole("admin"), (request, response) => {
  response.json({ user: request.authUser, role: "admin" });
});

app.use("/api", (_request, response) => {
  response.status(404).json({ message: "API endpoint not found." });
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error("API request failed.");
  response.status(500).json({ message: "An unexpected server error occurred." });
});
