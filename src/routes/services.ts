import { Router } from "express";
import { isValidObjectId } from "mongoose";
import { Service } from "../models/service.js";
import { requireAuth } from "../middleware/auth.js";

export const servicesRouter = Router();

const publicServiceOrder = [
  "Haircut & Styling",
  "Beard Trim & Shape",
  "Hair Coloring",
  "Hair Treatment",
  "Facial & Skincare",
  "Manicure",
  "Pedicure",
  "Relaxing Massage",
  "Hair Wash",
  "Bridal Makeup",
];

function salonMenuOrder<T>(services: T[]): T[] {
  const priority = new Map(publicServiceOrder.map((name, index) => [name, index]));
  return services.sort((a, b) => {
    const first = a as { serviceName?: string; createdAt?: Date };
    const second = b as { serviceName?: string; createdAt?: Date };
    const aPriority = priority.get(first.serviceName || "") ?? Number.MAX_SAFE_INTEGER;
    const bPriority = priority.get(second.serviceName || "") ?? Number.MAX_SAFE_INTEGER;
    return aPriority - bPriority || (second.createdAt?.getTime() ?? 0) - (first.createdAt?.getTime() ?? 0);
  });
}

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

servicesRouter.get("/category-cards", async (_request, response) => {
  const services = salonMenuOrder(await Service.find({ status: "active" })
    .select("serviceName category image createdAt")
    .sort({ createdAt: -1 })
    .lean());
  const categoryCards = new Map<string, { name: string; image: string }>();
  for (const service of services) {
    if (!categoryCards.has(service.category)) {
      categoryCards.set(service.category, { name: service.category, image: service.image });
    }
  }
  response.json({ categories: [...categoryCards.values()].sort((a, b) => a.name.localeCompare(b.name)) });
});

servicesRouter.get("/featured", async (request, response) => {
  const rawLimit = Number(request.query.limit || 6);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 12) : 6;
  const services = salonMenuOrder(await Service.find({ status: "active" }).lean()).slice(0, limit);
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
  const sortBy: Record<string, 1 | -1> | null = sort === "price-asc" ? { price: 1 } : sort === "price-desc" ? { price: -1 } : null;
  const filter: Record<string, unknown> = { status: "active" };
  if (search) filter.serviceName = { $regex: escapeRegex(search), $options: "i" };
  if (category) filter.category = category;

  const [records, total] = await Promise.all([
    Service.find(filter).sort(sortBy || { createdAt: -1 }).lean(),
    Service.countDocuments(filter),
  ]);
  const ordered = sortBy ? records : salonMenuOrder(records);
  const services = ordered.slice((page - 1) * limit, page * limit);
  response.json({ services, page, limit, total, pages: Math.ceil(total / limit) });
});

servicesRouter.get("/:id", requireAuth, async (request, response) => {
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
