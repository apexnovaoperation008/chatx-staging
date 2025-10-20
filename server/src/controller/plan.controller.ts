// src/controllers/plan.controller.ts
import { NextFunction, Request, Response } from "express";
import { databaseService } from "../database/database.service";
import { DatabaseService } from "../database/database.service";
import {logApiRequestError, logBusinessLogicEvent}  from "../logger"

export class PlanController {

    static async getAllPlans(req: Request, res: Response) {
        try {
          const plans = await DatabaseService.getAllPlans();
          logBusinessLogicEvent(
            req.requestId as string || "unknown-request",
            "getAllPlans",
            "N/A",
            "Fetched",
            undefined,
            "databaseService"
          );
          return res.json(plans);
        } catch (err:any) {
          logApiRequestError(
            req.user.sessionId as string || "unknown-session",
            err.message || "Unknown error",
            req.originalUrl,
            req.method,
            res.statusCode,
            undefined,
            { ip: req.ip , userId: req.user.email}
          );
          console.error("Error fetching plans:", err);
          return res.status(500).json({ error: "Failed to fetch plans" });
        }
    }

    static async createPlan(req: Request, res: Response) {
        try {
          const { name, description, max_workspace, max_account, price, billing_cycle } = req.body;
    
          // ✅ Basic validation
          if (!name || !description || !billing_cycle) {
            logApiRequestError(
              req.user.sessionId as string || "unknown-session",
              "Missing required fields",
              req.originalUrl,
              req.method,
              res.statusCode,          
              ["Missing required fields"],
              { ip: req.ip , userId: req.user.email}
            );
            return res.status(400).json({ error: "Missing required fields" });
          }
    
          const plan = await databaseService.createPlan(
            name,
            description,
            Number(max_workspace),
            Number(max_account),
            Number(price),
            billing_cycle
          );
    
          logBusinessLogicEvent(
            req.requestId as string || "unknown-request",
            "createPlan",
            "N/A",
            "Created",
            undefined,
            "databaseService"
          );
          return res.status(201).json({
            message: "Plan created successfully",
            plan,
          });
        } catch (err: any) {
          logApiRequestError(
            req.user.sessionId as string || "unknown-session",
            err.message || "Unknown error",
            req.originalUrl,
            req.method,
            res.statusCode,
            undefined,
            { ip: req.ip , userId: req.user.email}
          );
          console.error("❌ Error creating plan:", err);
          return res.status(500).json({ error: "Internal Server Error" });
        }
    }

    static async updatePlans(req: Request, res: Response) {
        try {
          const id = Number(req.params.id);
          const plan = await DatabaseService.updatePlan(id, req.body);
          logBusinessLogicEvent(
            req.requestId as string || "unknown-request",
            "updatePlan",
            "N/A",
            "Updated",
            undefined,
            "databaseService"
          );
          res.json({ plan });
        } catch (err:any) {
          logApiRequestError(
            req.user.sessionId as string || "unknown-session",
            err.message || "Unknown error",
            req.originalUrl,
            req.method,
            res.statusCode,
            undefined,
            { ip: req.ip , userId: req.user.email}
          );
          res.status(500).json({ error: "Failed to update plan" });
        }
    }

    static async deletePlans(req: Request, res: Response) {
        try {
          const id = Number(req.params.id);
          await DatabaseService.deletePlan(id);
          logBusinessLogicEvent(
            req.requestId as string || "unknown-request",
            "deletePlan",
            "N/A",
            "Deleted",
            undefined,
            "databaseService"
          );
          res.json({ success: true });
        } catch (err:any) {
          logApiRequestError(
            req.user.sessionId as string || "unknown-session",
            err.message || "Unknown error",
            req.originalUrl,
            req.method,
            res.statusCode,
            undefined,
            { ip: req.ip , userId: req.user.email}
          );
          res.status(500).json({ error: "Failed to delete plan" });
        }
    }

}