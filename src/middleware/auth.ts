import type { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import mongoose from "mongoose";
import { AuthUser, type AuthUserRecord } from "../models/auth-user.js";

declare global {
  namespace Express {
    interface Request {
      authUser?: {
        id: string;
        name: string;
        email: string;
        image?: string | null;
        role: "customer" | "admin";
        isBlocked: boolean;
      };
    }
  }
}

const authBaseUrl = process.env.BETTER_AUTH_ISSUER || process.env.BETTER_AUTH_URL;
const jwksUrl = process.env.BETTER_AUTH_JWKS_URL || (authBaseUrl ? `${authBaseUrl.replace(/\/$/, "")}/api/auth/jwks` : undefined);
const audience = process.env.BETTER_AUTH_AUDIENCE || authBaseUrl;
const jwks = jwksUrl ? createRemoteJWKSet(new URL(jwksUrl)) : undefined;

export async function requireAuth(request: Request, response: Response, next: NextFunction) {
  if (!jwks || !authBaseUrl || !audience) {
    response.status(503).json({ message: "Authentication is not configured on the API." });
    return;
  }

  const authorization = request.header("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    response.status(401).json({ message: "A valid Bearer token is required." });
    return;
  }

  try {
    const { payload } = await jwtVerify(match[1], jwks, {
      issuer: authBaseUrl,
      audience,
    });
    if (typeof payload.exp !== "number" || payload.exp <= Math.floor(Date.now() / 1000)) {
      response.status(401).json({ message: "The token is missing an expiry or has expired." });
      return;
    }
    const id = typeof payload.sub === "string" ? payload.sub : "";
    if (!id) {
      response.status(401).json({ message: "The token has no user subject." });
      return;
    }

    const idCandidates: Array<string | mongoose.Types.ObjectId> = [id];
    if (mongoose.isValidObjectId(id)) idCandidates.push(new mongoose.Types.ObjectId(id));
    const currentUser = await AuthUser.findOne({ _id: { $in: idCandidates } }).lean<AuthUserRecord>();
    const currentRole = currentUser?.role ?? "customer";
    if (!currentUser || !["customer", "admin"].includes(currentRole)) {
      response.status(401).json({ message: "The account no longer exists." });
      return;
    }
    const isBlocked = currentUser.isBlocked === true;
    if (isBlocked) {
      response.status(403).json({ message: "This account is blocked." });
      return;
    }

    request.authUser = {
      id: String(currentUser._id),
      name: currentUser.name,
      email: currentUser.email,
      image: currentUser.image,
      role: currentRole,
      isBlocked,
    };
    next();
  } catch {
    response.status(401).json({ message: "The Bearer token is invalid or expired." });
  }
}

export function requireRole(...roles: Array<"customer" | "admin">) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (!request.authUser) {
      response.status(401).json({ message: "Sign in is required." });
      return;
    }
    if (!roles.includes(request.authUser.role)) {
      response.status(403).json({ message: "You do not have permission to access this resource." });
      return;
    }
    next();
  };
}
