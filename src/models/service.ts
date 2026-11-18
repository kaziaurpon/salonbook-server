import mongoose, { Schema } from "mongoose";

export interface ServiceRecord {
  serviceName: string;
  category: string;
  description: string;
  price: number;
  duration: number;
  image: string;
  status: "active" | "inactive";
  createdAt: Date;
}

const serviceSchema = new Schema<ServiceRecord>(
  {
    serviceName: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    price: { type: Number, required: true, min: 0.01 },
    duration: { type: Number, required: true, min: 1 },
    image: { type: String, required: true, trim: true },
    status: { type: String, enum: ["active", "inactive"], default: "active", index: true },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

serviceSchema.index({ serviceName: "text" });

export const Service = mongoose.models.Service || mongoose.model<ServiceRecord>("Service", serviceSchema);
