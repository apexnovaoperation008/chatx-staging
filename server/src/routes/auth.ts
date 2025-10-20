// src/routes/auth.routes.ts
import { Router } from "express";
import { AuthController } from "../controller/auth.controller";
import { requireAuth } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePerm";
//import { requirePermission } from "../middleware/requirePerm";

const router = Router();
const ctrl = new AuthController();

router.post("/login", (req, res) => ctrl.login(req, res))
router.get("/me", requireAuth, (req, res) => ctrl.me(req, res))
//router.post("/change-password", requireAuth, (req, res) => ctrl.changePassword(req, res));
router.post("/logout", (req, res) => {
    // Clear cookies by setting Max-Age=0
    res.clearCookie("access_token", {
      httpOnly: true,
      secure: true, // or false in local dev (localhost)
      sameSite: "lax",
      path: "/",
    });
    res.clearCookie("refresh_token", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
  
    return res.status(200).json({ message: "Logged out successfully" });
});
router.post("/refresh", (req, res) => ctrl.refreshToken(req, res));

router.get("/managers", requireAuth, AuthController.getAllManagers)
router.get("/users", requireAuth, AuthController.getAllUsers)
router.get("/roles", requireAuth, AuthController.getAllRoles)
router.get("/permissions", requireAuth, AuthController.getAllPermisssions)

export default router;
