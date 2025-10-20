// src/routes/workspace.routes.ts
import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePerm";
import { WorkspaceController } from "../controller/workspace.controller";
//import { requirePermission } from "../middleware/requirePerm";

const router = Router();

router.get("/", requireAuth, WorkspaceController.getWorkspaces)
router.get("/workspaces", requireAuth, WorkspaceController.getAllWorkspaces)
router.get("/brand", requireAuth, WorkspaceController.getBrands)
router.get("/brands", requireAuth, WorkspaceController.getAllBrands)
router.get("/user/:userId/workspaces-brands", requireAuth, WorkspaceController.getUserAccessibleWsBrands)

router.post("/create", requireAuth, WorkspaceController.createWorkspace)
router.put("/update/:workspaceId", requireAuth, WorkspaceController.updateWorkspace);
router.delete("/delete/:workspaceId", requireAuth, WorkspaceController.deleteWorkspace);

router.post("/update/:workspaceId/brands", requireAuth, WorkspaceController.addBrand)
router.delete("/delete/:workspaceId/brands/:brandId", requireAuth, WorkspaceController.deleteBrand)

router.post("/add/:workspaceId/member", requireAuth, WorkspaceController.addWorkspaceMember);
router.delete("/delete/:workspaceId/member", requireAuth, WorkspaceController.removeWorkspaceMember);

export default router;
