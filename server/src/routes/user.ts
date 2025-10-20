// src/routes/user.routes.ts
import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePerm";
import { UserController } from "../controller/user.controller";
//import { requirePermission } from "../middleware/requirePerm";

const router = Router();

router.post("/create", requireAuth, requirePermission("user.create"), UserController.createUser)
router.delete("/delete/:id", requireAuth, requirePermission("user.delete"), UserController.deleteUser)
router.put("/update/:id", requireAuth, requirePermission("user.edit"), UserController.updateUser)
router.put("/update/:id/status", requireAuth, UserController.toggleUserStatus)

router.post("/create/role", requireAuth, UserController.createRole)
router.put("/update/roles/:id/permissions", requireAuth, UserController.updateRolePermissions)
router.put("/update/roles/:id", requireAuth, UserController.updateRole)
router.get("/:roleId/permissions", requireAuth, UserController.getAssignablePermission)

router.get("/:assigned_to/subordinatesList", requireAuth, UserController.getSubordinateList);
router.get("/:managerId/subordinateCounts", requireAuth,UserController.getSubordinateCounts)
router.get("/:userId/workspacebrand", requireAuth, UserController.getWorkspacesForUser)

router.get("/permissions/category/:categoryId", requireAuth, UserController.getPermissionsByCategory);

export default router;
