import { Router } from "express";
import { isValidObjectId } from "mongoose";
import { Service } from "../models/service.js";

export const servicesRouter = Router();

function escapeRegex(value: string) {
  return value.split("").map((character) => {
    const special = ".*+?^()|[]{}".includes(character)
      || character === String.fromCharCode(36)
      || character === String.fromCharCode(92);
    return special ? String.fromCharCode(92) + character : character;
  }).join("");
}

servicesRouter.get("/categories", async (_request, response) => {
  const categories = await Service.distinct("category", { status: "active" });
  response.json({ categories: categories.sort((a, b) => String(a).localeCompare(String(b))) });
});

servicesRouter.get("/featured", async (request, response) => {
  const rawLimit = Number(request.query.limit || 6);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 12) : 6;
  const services = await Service.find({ status: "active" }).sort({ createdAt: -1 }).limit(limit).lean();
  response.json({ services });
});

servicesRouter.get("/", async (request, response) => {
  const rawPage = Number(request.query.page || 1);
  const rawLimit = Number(request.query.limit || 12);
  const page = Number.isFinite(rawPage) ? Math.max(Math.floor(rawPage), 1) : 1;
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 48) : 12;
  const search = typeof request.query.q === "string" ? request.query.q.trim().slice(0, 100) : "";
  const category = typeof request.query.category === "string" ? request.query.category.trim().slice(0, 80) : "";
  const sort = request.query.sort;
  const sortBy: Record<string, 1 | -1> = sort === "price-asc" ? { price: 1 } : sort === "price-desc" ? { price: -1 } : { createdAt: -1 };
  const filter: Record<string, unknown> = { status: "active" };
  if (search) filter.serviceName = { $regex: escapeRegex(search), $options: "i" };
  if (category) filter.category = category;

  const [services, total] = await Promise.all([
    Service.find(filter).sort(sortBy).skip((page - 1) * limit).limit(limit).lean(),
    Service.countDocuments(filter),
  ]);
  response.json({ services, page, limit, total, pages: Math.ceil(total / limit) });
});

servicesRouter.get("/:id", async (request, response) => {
  if (!isValidObjectId(request.params.id)) {
    response.status(400).json({ message: "This service link is not valid." });
    return;
  }
  const service = await Service.findOne({ _id: request.params.id, status: "active" }).lean();
  if (!service) {
    response.status(404).json({ message: "This salon service is unavailable." });
    return;
  }
  response.json({ service });
});
