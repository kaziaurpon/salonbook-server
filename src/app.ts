import cors from "cors";
import express from "express";
import helmet from "helmet";

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
