// src/middleware/requireAuth.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/env";
import { databaseService } from "../database/database.service";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.access_token; // ✅ only read from cookies

  if (!token) {
    return res.status(401).json({ success: false, message: "Missing token" });
  }


  try {
    const payload = jwt.verify(token, config.SESS_SECRET) as {
      userId: number;
      email: string;
      role_id: number;
      jwtid: string;
    };

    const perms = await databaseService.getPermissionsByRole(payload.role_id);
    const permissions = perms.map(p => p.code);

    req.user = {
      userId: payload.userId,
      email: payload.email,
      role_id: payload.role_id,
      sessionId: payload.jwtid,
      permissions
    };

    next();
  } catch {
    return res
      .status(401)
      .json({ success: false, message: "Invalid or expired token" });
  }
}
