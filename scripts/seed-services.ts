import "dotenv/config";
import mongoose from "mongoose";
import { Service } from "../src/models/service.js";

type SeedService = {
  serviceName: string;
  category: string;
  description: string;
  price: number;
  duration: number;
  imageSource: string;
  sourcePage: string;
  photographer: string;
};
// These bundled images are served from the Client's public directory, so
// seeded services do not depend on third-party image hosts at runtime.
// Sources: Pexels (https://www.pexels.com/license/) and Unsplash
// (https://unsplash.com/license/). Their source pages and photographers are
// retained here for attribution.
const services: SeedService[] = [
  {
    serviceName: "Manicure",
    category: "Nails",
    description: "A neat, relaxing nail-care session with shaping, cuticle care, and a polished finish.",
    price: 600,
    duration: 45,
    imageSource: "https://images.pexels.com/photos/7755173/pexels-photo-7755173.jpeg?auto=compress&cs=tinysrgb&w=1400",
    sourcePage: "https://www.pexels.com/photo/a-man-getting-a-manicure-7755173/",
    photographer: "RDNE Stock project",
  },
  {
    serviceName: "Pedicure",
    category: "Nails",
    description: "Refresh tired feet with a careful soak, nail shaping, cuticle care, and a clean finish.",
    price: 700,
    duration: 50,
    imageSource: "https://images.pexels.com/photos/19695948/pexels-photo-19695948.jpeg?auto=compress&cs=tinysrgb&w=1400",
    sourcePage: "https://www.pexels.com/photo/man-soaking-feet-in-spa-19695948/",
    photographer: "Jonathan Borba",
  },
  {
    serviceName: "Relaxing Massage",
    category: "Spa & Massage",
    description: "Unwind with a calming full-back massage in a quiet, comfortable salon setting.",
    price: 2000,
    duration: 60,
    imageSource: "https://images.pexels.com/photos/19695945/pexels-photo-19695945.jpeg?auto=compress&cs=tinysrgb&w=1400",
    sourcePage: "https://www.pexels.com/photo/a-man-having-a-shoulders-massage-19695945/",
    photographer: "Jonathan Borba",
  },
  {
    serviceName: "Haircut & Styling",
    category: "Hair",
    description: "A consultation-led cut and finish tailored to your hair texture, face shape, and everyday routine.",
    price: 500,
    duration: 45,
    imageSource: "https://images.pexels.com/photos/7518731/pexels-photo-7518731.jpeg?auto=compress&cs=tinysrgb&w=1400",
    sourcePage: "https://www.pexels.com/photo/a-barber-cutting-a-client-s-hair-7518731/",
    photographer: "Pavel Danilyuk",
  },
  {
    serviceName: "Beard Trim & Shape",
    category: "Beard & Grooming",
    description: "A precise beard trim with clean lines and shaping to suit your face and preferred look.",
    price: 300,
    duration: 30,
    imageSource: "https://images.pexels.com/photos/5568403/pexels-photo-5568403.jpeg?auto=compress&cs=tinysrgb&w=1400",
    sourcePage: "https://www.pexels.com/photo/a-man-grooming-a-bearded-man-5568403/",
    photographer: "Alexandre Saraiva Carniato",
  },
  {
    serviceName: "Hair Coloring",
    category: "Hair Color",
    description: "Salon color service planned around your chosen shade, with careful application and a polished finish.",
    price: 1800,
    duration: 120,
    imageSource: "https://images.pexels.com/photos/7389077/pexels-photo-7389077.jpeg?auto=compress&cs=tinysrgb&w=1400",
    sourcePage: "https://www.pexels.com/photo/black-man-and-master-dying-hair-in-salon-7389077/",
    photographer: "John Diez",
  },
  {
    serviceName: "Hair Treatment",
    category: "Hair Treatments",
    description: "A nourishing wash-and-care ritual designed to leave hair feeling softer, lighter, and refreshed.",
    price: 1500,
    duration: 90,
    imageSource: "https://images.pexels.com/photos/4952618/pexels-photo-4952618.jpeg?auto=compress&cs=tinysrgb&w=1400",
    sourcePage: "https://www.pexels.com/photo/barber-drying-hair-of-male-client-in-salon-4952618/",
    photographer: "Jonathan Nenemann",
  },
  {
    serviceName: "Facial & Skincare",
    category: "Skin & Facial",
    description: "A gentle, professional facial with cleansing and skin-focused care for a fresh, comfortable feel.",
    price: 1200,
    duration: 60,
    imageSource: "https://images.pexels.com/photos/16131206/pexels-photo-16131206.jpeg?auto=compress&cs=tinysrgb&w=1400",
    sourcePage: "https://www.pexels.com/photo/close-up-of-a-man-getting-a-facial-treatment-by-a-cosmetician-16131206/",
    photographer: "Omar Medina",
  },
  {
    serviceName: "Bridal Makeup",
    category: "Makeup",
    description: "A refined bridal makeup session focused on your preferred style, occasion, and lasting finish.",
    price: 6000,
    duration: 180,
    imageSource: "https://images.pexels.com/photos/7999707/pexels-photo-7999707.jpeg?auto=compress&cs=tinysrgb&w=1400",
    sourcePage: "https://www.pexels.com/photo/makeup-artist-putting-makeup-on-groom-7999707/",
    photographer: "Bin PhotoST",
  },
];

const localImages: Record<string, string> = {
  Manicure: "/images/services/manicure.jpg",
  Pedicure: "/images/services/pedicure.jpg",
  "Relaxing Massage": "/images/services/relaxing-massage.jpg",
  "Haircut & Styling": "/images/services/haircut-styling.jpg",
  "Beard Trim & Shape": "/images/services/beard-trim-shape.jpg",
  "Hair Coloring": "/images/services/hair-coloring.jpg",
  "Hair Treatment": "/images/services/hair-treatment.jpg",
  "Facial & Skincare": "/images/services/facial-skincare.jpg",
  "Bridal Makeup": "/images/services/bridal-makeup.jpg",
  "Hair Wash": "/images/services/hair-wash.jpg",
};

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is missing from server/.env.");

  await mongoose.connect(uri, process.env.DATABASE_NAME ? { dbName: process.env.DATABASE_NAME } : undefined);
  try {
    const existing = await Service.find({ serviceName: { $in: services.map(({ serviceName }) => serviceName) } });
    if (process.argv.includes("--refresh-images")) {
      const byName = new Map(existing.map((service) => [service.serviceName, service]));
      const missingNames = services.filter(({ serviceName }) => !byName.has(serviceName)).map(({ serviceName }) => serviceName);
      if (missingNames.length) throw new Error(`Create the missing services before refreshing images: ${missingNames.join(", ")}.`);
      for (const service of services) {
        const image = localImages[service.serviceName];
        await Service.updateOne({ serviceName: service.serviceName }, { $set: { image } });
        console.log(`Updated service photo: ${service.serviceName}`);
      }
      const hairWash = await Service.exists({ serviceName: "Hair Wash" });
      if (hairWash) {
        const image = localImages["Hair Wash"];
        await Service.updateOne({ serviceName: "Hair Wash" }, { $set: { image } });
        console.log("Updated service photo: Hair Wash");
      }
      console.log("Updated all requested service photos.");
      return;
    }
    const existingNames = new Set(existing.map((record) => record.serviceName));
    const missing = services.filter(({ serviceName }) => !existingNames.has(serviceName));
    if (!missing.length) {
      console.log("All nine requested services already exist; no changes were made.");
      return;
    }

    const timestamp = Date.now();
    for (const [index, service] of missing.entries()) {
      const image = localImages[service.serviceName];
      await Service.create({
        serviceName: service.serviceName,
        category: service.category,
        description: service.description,
        price: service.price,
        duration: service.duration,
        image,
        status: "active",
        // The newest six are the primary services and therefore appear in
        // the current featured endpoint's newest-first six-item selection.
        createdAt: new Date(timestamp + index),
      });
      console.log(`Added active service: ${service.serviceName} (${service.category}). Photo by ${service.photographer}; source: ${service.sourcePage}`);
    }
    console.log(`Added ${missing.length} service(s).`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Service setup stopped:", error instanceof Error ? error.message : "unexpected error");
  process.exitCode = 1;
});
