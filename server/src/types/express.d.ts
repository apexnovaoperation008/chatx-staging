// src/types/express.d.ts
import "express-serve-static-core";
declare module "express-serve-static-core" {
  interface Request {
    requestId?: string,
    user: { userId: number; email: string; role_id: number; sessionId: string; permissions?: string[];};
  }
}
