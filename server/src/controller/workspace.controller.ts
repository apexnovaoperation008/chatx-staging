// src/controllers/workspace.controller.ts
import { NextFunction, Request, Response } from "express";
import { databaseService } from "../database/database.service";
import { DatabaseService } from "../database/database.service";
import {logApiRequestError, logBusinessLogicEvent}  from "../logger"

export class WorkspaceController {

    static async getAllWorkspaces(req: Request, res: Response, next: NextFunction){
        const currentManager =  req.user.userId;
        try{
        const workspace = await databaseService.getAllWorkspace(currentManager);
        logBusinessLogicEvent(
            req.requestId as string || "unknown-request",
            "getAllWorkspace",
            "N/A",
            "Fetched",
            undefined,
            "databaseService"
        );
        res.json({workspaces: workspace})
        }catch(err:any){
        logApiRequestError(
            req.user.sessionId as string || "unknown-session",
            err.message || "Unknown error",
            req.originalUrl,
            req.method,
            res.statusCode,
            undefined,
            { ip: req.ip , userId: req.user.email}
        );
        next(err)
        }
    }

  static async getWorkspaces(req: Request, res: Response, next: NextFunction){
    try{
      const workspace = await databaseService.getWorkspace();
      logBusinessLogicEvent(
        req.requestId as string || "unknown-request",
        "getWorkspace",
        "N/A",
        "Fetched",
        undefined,
        "databaseService"
      );
      res.json({workspaces: workspace})
    }catch(err:any){
      logApiRequestError(
        req.user.sessionId as string || "unknown-session",
        err.message || "Unknown error",
        req.originalUrl,
        req.method,
        res.statusCode,
        undefined,
        { ip: req.ip , userId: req.user.email}
      );
      next(err)
    }
  }


  static async getUserAccessibleWsBrands(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = Number(req.params.userId);
      const rows = await databaseService.getAccessibleWorkspacesAndBrands(userId);
      logBusinessLogicEvent(
        req.requestId as string || "unknown-request",
        "getAccessibleWorkspacesAndBrands",
        "N/A",
        "Fetched",
        undefined,
        "databaseService"
      );
      res.json({ workspaces: rows });
    } catch (err: any) {
      logApiRequestError(
        req.user?.sessionId as string || "unknown-session",
        err.message || "Unknown error",
        req.originalUrl,
        req.method,
        res.statusCode,
        undefined,
        { ip: req.ip , userId: req.user?.email }
      );
      next(err);
    }
  }

  static async getAllBrands(req: Request, res: Response, next: NextFunction){
    const currentManager =  req.user.userId;
    try{
      const brand = await databaseService.getAllBrands(currentManager);
      logBusinessLogicEvent(
        req.requestId as string || "unknown-request",
        "getAllBrands",
        "N/A",
        "Fetched",
        undefined,
        "databaseService"
      );
      res.json({brands:brand })
    }catch(err:any){
      logApiRequestError(
        req.user.sessionId as string || "unknown-session",
        err.message || "Unknown error",
        req.originalUrl,
        req.method,
        res.statusCode,
        undefined,
        { ip: req.ip , userId: req.user.email}
      );
      next(err)
    }
  }

  static async getBrands(req: Request, res: Response, next: NextFunction){
    try{
      const brand = await databaseService.getBrands();
      logBusinessLogicEvent(
        req.requestId as string || "unknown-request",
        "getBrands",
        "N/A",
        "Fetched",
        undefined,
        "databaseService"
      );
      res.json({brands: brand})
    }catch(err:any){
      logApiRequestError(
        req.user.sessionId as string || "unknown-session",
        err.message || "Unknown error",
        req.originalUrl,
        req.method,
        res.statusCode,
        undefined,
        { ip: req.ip , userId: req.user.email}
      );
      next(err)
    }
  }

  static async createWorkspace(req: Request, res: Response) {
    try {
      const managerId = req.user.userId;
      const { name, description, brands, members } = req.body;
  
      console.log("ManagerId:", managerId);
  
      // 1. Check Manager + Plan
      const manager = await databaseService.getManagerWithPlan(managerId);
      if (!manager) {
        logApiRequestError(
          req.user.sessionId as string || "unknown-session",
          "Manager not found",
          req.originalUrl,
          req.method,
          res.statusCode,
          ["Manager not found"],
          { ip: req.ip , userId: req.user.email}
        );
        return res.status(404).json({ error: "Manager not found" });
      }
  
      if (manager.role_id !== 2) {
        logApiRequestError(
          req.user.sessionId as string || "unknown-session",
          "Invalid permission",
          req.originalUrl,
          req.method,
          res.statusCode,
          ["Only managers can create workspaces"],
          { ip: req.ip , userId: req.user.email}
        );
        return res.status(403).json({ error: "Only managers can create workspaces" });
      }
  
      // 2. Check Plan Limit
      const currentCount = await databaseService.countWorkspacesByManager(managerId);
      if (manager.max_workspace !== 0 && currentCount >= manager.max_workspace) {
        logApiRequestError(
          req.user.sessionId as string || "unknown-session",
          "Reached maximum workspace limit",
          req.originalUrl,
          req.method,
          res.statusCode,
          ["Workspace limit reached for this plan"],
          { ip: req.ip , userId: req.user.email}
        );
        return res.status(400).json({ error: "Workspace limit reached for this plan" });
      }
  
      // 3. Validate required fields
      if (!name || !brands || !Array.isArray(brands) || brands.length === 0) {
        logApiRequestError(
          req.user.sessionId as string || "unknown-session",
          "Missing required field",
          req.originalUrl,
          req.method,
          res.statusCode,
          ["Workspace name and at least one brand are required"],
          { ip: req.ip , userId: req.user.email}
        );
        return res.status(400).json({ error: "Workspace name and at least one brand are required" });
      }
  
      // 4. Create Workspace
      const workspace = await databaseService.createWorkspace(
        name,
        description,
        managerId
      );
  
      for (const brandName of brands) {
        await databaseService.createBrand(brandName, workspace.id);
      }
      
      // 6. Insert team members
      if (members && Array.isArray(members) && members.length > 0) {
        for (const userId of members) {
          await databaseService.addWorkspaceMember(userId, workspace.id, new Date());
        }
      }
      logBusinessLogicEvent(
        req.requestId as string || "unknown-request",
        "createWorkspace, createBrand,addWorkspaceMember",
        "N/A",
        "Created",
        undefined,
        "databaseService"
      );
      res.status(201).json({ workspace });
  
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
      console.error("Error creating workspace:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async addBrand(req: Request, res: Response) {
    try {
      const { name, workspaceId } = req.body;

      if (!name || !workspaceId) {
        logApiRequestError(
          req.user.sessionId as string || "unknown-session",
          "Missing required field",
          req.originalUrl,
          req.method,
          res.statusCode,
          ["Missing brand name or workspaceId"],
          { ip: req.ip , userId: req.user.email}
        );
        return res.status(400).json({ ok: false, message: "Missing brand name or workspaceId" });
      }

      const brand = await databaseService.createBrand(name, workspaceId);
      logBusinessLogicEvent(
        req.requestId as string || "unknown-request",
        "createBrand",
        "N/A",
        "Created",
        undefined,
        "databaseService"
      );
      return res.json({ ok: true, brand });
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
      console.error("Error adding brand:", err);
      return res.status(500).json({ ok: false, message: err.message });
    }
  }

  // 3. Add Workspace Member
  static async addWorkspaceMember(req: Request, res: Response) {
    try {
      const { userId, workspaceId } = req.body;
      if (!userId || !workspaceId) {
        logApiRequestError(
          req.user.sessionId as string || "unknown-session",
          "Missing userId or workspaceId",
          req.originalUrl,
          req.method,
          res.statusCode,
          ["Brand name required"],
          { ip: req.ip , userId: req.user.email}
        );
        return res.status(400).json({ ok: false, message: "Missing userId or workspaceId" });
      }

      const member = await databaseService.addWorkspaceMember(userId, workspaceId, new Date());
      logBusinessLogicEvent(
        req.requestId as string || "unknown-request",
        "addWorkspaceMember",
        "N/A",
        "Created",
        undefined,
        "databaseService"
      );
      return res.json({ ok: true, member });
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
      console.error("Error adding member:", err);
      return res.status(500).json({ ok: false, message: err.message });
    }
  }

  // 3b. Remove Workspace Member
  static async removeWorkspaceMember(req: Request, res: Response) {
    try {
      const { userId, workspaceId } = req.body;
      if (!userId || !workspaceId) {
        logApiRequestError(
          req.user.sessionId as string || "unknown-session",
          "Missing userId or workspaceId",
          req.originalUrl,
          req.method,
          res.statusCode,
          ["Missing userId or workspaceId"],
          { ip: req.ip , userId: req.user.email}
        );
        return res.status(400).json({ ok: false, message: "Missing userId or workspaceId" });
      }

      const member = await databaseService.removeWorkspaceMember(userId, workspaceId);
      logBusinessLogicEvent(
        req.requestId as string || "unknown-request",
        "removeWorkspaceMember",
        "N/A",
        "DELETE",
        undefined,
        "databaseService"
      );
      return res.json({ ok: true, removed: member });
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
      console.error("Error removing member:", err);
      return res.status(500).json({ ok: false, message: err.message });
    }
  }

  // 4. Edit Workspace
  static async updateWorkspace(req: Request, res: Response) {
    try {
      const { workspaceId } = req.params;
      const { name, description, brands, members } = req.body;

      const ws = await databaseService.updateWorkspaceWithRelations(
        Number(workspaceId),
        name,
        description,
        brands,
        members
      );
      
      logBusinessLogicEvent(
        req.requestId as string || "unknown-request",
        "updateWorkspaceWithRelations",
        "N/A",
        "Updated",
        undefined,
        "databaseService"
      );
      return res.json({ ok: true, workspace: ws });
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
      console.error("Error updating workspace:", err);
      return res.status(500).json({ ok: false, message: err.message });
    }
  }  

  static async deleteBrand(req: Request, res: Response) {
    try {
      const { wsId, brandId } = req.params;
  
      const deletedBrand = await databaseService.deleteBrand(Number(brandId), Number(wsId));
      if (!deletedBrand) {
        logApiRequestError(
          req.user.sessionId as string || "unknown-session",
          "Brand not found in workspace",
          req.originalUrl,
          req.method,
          res.statusCode,
          ["Brand not found in workspace"],
          { ip: req.ip , userId: req.user.email}
        );
        return res.status(404).json({ ok: false, message: "Brand not found in workspace" });
      }

      logBusinessLogicEvent(
        req.requestId as string || "unknown-request",
        "deleteBrand",
        "N/A",
        "Deleted",
        undefined,
        "databaseService"
      );
      res.json({ ok: true, brand: deletedBrand });
    } catch (err:any) {
      logApiRequestError(
        req.user.sessionId as string || "unknown-session",
        err.message || "Unknown error",
        "/auth/:wsId/brands/:brandId",
        "DELETE",
        500,
        undefined,
        { ip: req.ip , userId: req.user.email}
      );
      console.error("❌ Error deleting brand:", err);
      res.status(500).json({ ok: false, message: "Internal server error" });
    }
  };
  

  static async deleteWorkspace(req: Request, res: Response) {
    try {
      const { workspaceId } = req.params;

      const ws = await databaseService.deleteWorkspace(Number(workspaceId));
      logBusinessLogicEvent(
        req.requestId as string || "unknown-request",
        "deleteWorkspace",
        "N/A",
        "Deleted",
        undefined,
        "databaseService"
      );
      return res.json({ ok: true, deleted: ws });
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
      console.error("Error deleting workspace:", err);
      return res.status(500).json({ ok: false, message: err.message });
    }
  }

  // ✅ Add new method here
  static async getWorkspacesForUser(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = Number(req.params.userId); // or from token (req.user.id)
      const rows = await DatabaseService.getWorkspacesForUser(userId);

      // Format rows into response shape
      const workspaces = rows.map(r => ({
        workspace: {
          id: r.workspace_id,
          name: r.workspace_name,
        },
        brand: r.brand_id
          ? {
              id: r.brand_id,
              name: r.brand_name,
              workspace_id: r.workspace_id,
              is_active: r.is_active,
              created_at: r.created_at,
            }
          : null,
        }));

      logBusinessLogicEvent(
        req.requestId as string || "unknown-request",
        "getWorkspacesForUser",
        "N/A",
        "Fetched",
        undefined,
        "databaseService"
      );

      return res.status(200).json({ success: true, data: workspaces });
    } catch (err: any) {
      logApiRequestError(
        req.user?.sessionId as string || "unknown-session",
        err.message || "Unknown error",
        req.originalUrl,
        req.method,
        res.statusCode,
        undefined,
        { ip: req.ip, userId: req.user?.email }
      );
      next(err);
    }
  }

}