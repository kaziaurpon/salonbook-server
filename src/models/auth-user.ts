import mongoose, { Schema } from "mongoose";

export interface AuthUserRecord {
  _id: string | mongoose.Types.ObjectId;
  name: string;
  email: string;
  image?: string | null;
  role: "customer" | "admin";
  isBlocked: boolean;
}

const authUserSchema = new Schema<AuthUserRecord>(
  {
    // The official Better Auth Mongo adapter may store the Mongo-generated _id
    // as an ObjectId while exposing it as a string in auth sessions and JWTs.
    _id: { type: Schema.Types.Mixed, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    image: { type: String, default: null },
    role: { type: String, enum: ["customer", "admin"], default: "customer" },
    isBlocked: { type: Boolean, default: false },
  },
  { strict: false, collection: "users", versionKey: false, id: false },
);

// This model reads Better Auth's users collection; it is not a second user store.
export const AuthUser = mongoose.models.AuthUser
  || mongoose.model<AuthUserRecord>("AuthUser", authUserSchema, "users");
