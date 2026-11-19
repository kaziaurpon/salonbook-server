import "./config/environment.js";
import { app } from "./app.js";
import { connectDatabase } from "./db.js";

const port = Number(process.env.PORT || 4000);

async function start(): Promise<void> {
  try {
    await connectDatabase();
    app.listen(port, "0.0.0.0", () => console.log(`SalonBook API listening on port ${port}`));
  } catch (error) {
    console.error("Failed to start SalonBook API", error);
    process.exitCode = 1;
  }
}

void start();
