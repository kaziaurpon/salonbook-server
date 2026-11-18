import mongoose from "mongoose";

export async function connectDatabase(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Set MONGODB_URI in server/.env before starting the API.");
  await mongoose.connect(uri, process.env.DATABASE_NAME ? { dbName: process.env.DATABASE_NAME } : undefined);
}
