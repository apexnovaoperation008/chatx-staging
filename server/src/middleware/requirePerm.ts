// middleware/requirePermission.ts
import { Request, Response, NextFunction } from "express";

export const requirePermission = (permission: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // ensure req.user and permissions exist
      if (!req.user || !req.user.permissions) {
        return res.status(403).json({ error: "Forbidden: No user or permissions found" });
      }

      // check if the required permission is in the array
      if (!req.user.permissions.includes(permission)) {
        return res.status(403).json({ error: "Forbidden: Missing permission" });
      }

      // ✅ user has permission
      next();
    } catch (err) {
      next(err);
    }
  };
};
