// src/routes/plan.routes.ts
import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePerm";
import { PlanController } from "../controller/plan.controller";
//import { requirePermission } from "../middleware/requirePerm";

const router = Router()

router.get("/", requireAuth, PlanController.getAllPlans)
router.post("/create", requireAuth, PlanController.createPlan)
router.put("/update/:id", requireAuth, PlanController.updatePlans)
router.delete("/delete/:id", requireAuth, PlanController.deletePlans)

export default router;