// src/services/auth.service.ts
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { databaseService } from "../database/database.service";
import { config } from "../config/env";
import { logApiRequestError } from "../logger";

// ----------- Types -----------
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  user?: {
    id: number;
    email: string;
    name: string;
    role_id: number;
    role: string;
    role_name: string;
    department?: string | null;
    plan_id?: number | null;
    permissions?: string[];
    plan_name?: string | null;
  };
  accessToken?: string;
  refreshToken?: string;
  message?: string;
}

export interface AuthTokenPayload {
  userId: number;
  email: string;
  role_id: number;
  role_name: string;
  jwtId: string;
}

// ----------- Config -----------
const ACCESS_TOKEN_SECRET = config.SESS_SECRET;
const REFRESH_TOKEN_SECRET = config.REFRESH_SECRET || config.SESS_SECRET;
const ACCESS_EXP = "15m";
const REFRESH_EXP = "7d";

// =======================================================
// ✅ Exported utility function to generate tokens
// =======================================================
export function generateTokens(payload: Omit<AuthTokenPayload, "jwtId">) {
  const jwtId = crypto.randomUUID();

  const accessToken = jwt.sign(
    { ...payload, jwtId },
    ACCESS_TOKEN_SECRET,
    { expiresIn: ACCESS_EXP }
  );  

  const refreshToken = jwt.sign(
    { ...payload, jwtId },
    REFRESH_TOKEN_SECRET,
    { expiresIn: REFRESH_EXP }
  );

  return { accessToken, refreshToken };
}

// =======================================================
// ✅ AuthService class
// =======================================================
class AuthService {
  async login({ email, password }: LoginRequest): Promise<LoginResponse> {
    try {
      const user = await databaseService.getUserByEmail(email);
      if (!user)
        return { success: false, message: "Invalid email or password" };

      if (!user.is_active)
        return { success: false, message: "Account is deactivated" };

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch)
        return { success: false, message: "Invalid email or password" };

      const perms = await databaseService.getPermissionsByRole(user.role_id);
      const permissions = perms.map((p) => p.code);

      const plan = user.plan_id ? await databaseService.getPlanById(user.plan_id) : null;

      // ✅ Build token payload
      const tokenPayload = {
        userId: user.id,
        email: user.email,
        role_id: user.role_id,
        role_name: user.role_name,
      };

      // ✅ Use the new token generator
      const { accessToken, refreshToken } = generateTokens(tokenPayload);

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role_id: user.role_id,
          role: user.role_name,
          role_name: user.role_name,
          department: user.department ?? null,
          plan_id: user.plan_id ?? null,
          plan_name: plan?.name ?? null,
          permissions,
        },
        accessToken,
        refreshToken,
      };
    } catch (err: any) {
      logApiRequestError(
        "LOGIN_ERROR",
        err.message || "Unexpected error during login",
        "/auth/login",
        "POST",
        500
      );
      console.error("Login error:", err);
      return { success: false, message: "Login failed due to server error" };
    }
  }
}

// =======================================================
// ✅ Token verification helpers
// =======================================================
export function verifyAccessToken(token: string) {
  return jwt.verify(token, ACCESS_TOKEN_SECRET);
}

export function verifyRefreshToken(token: string) {
  return jwt.verify(token, REFRESH_TOKEN_SECRET);
}

export const authService = new AuthService();
