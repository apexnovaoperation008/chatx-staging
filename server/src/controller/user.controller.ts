// src/controllers/user.controller.ts
import { NextFunction, Request, Response } from "express";
import { databaseService } from "../database/database.service";
import { DatabaseService } from "../database/database.service";
import {logApiRequestError, logBusinessLogicEvent}  from "../logger"
import { users } from "telegram/client";

export class UserController {
    static async getAllUsers(req: Request, res: Response, next: NextFunction){
        try{
            const users = await databaseService.getAllUsersWithPermissions();
            logBusinessLogicEvent(
            req.requestId as string || "unknown-request",
            "getAllUsersWithPermissions",
            "N/A",
            "Fetched",
            undefined,
            "databaseService"
            );   
            res.json({success: true, data: users})
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

    static async getSubordinateList(req: Request, res: Response,) {
        try {
          const currentUser = req.user;
          const assignedTo = parseInt(req.params.assigned_to, 10);
          console.log(currentUser.role_id)
          console.log(currentUser.userId)
    
    
          if (!currentUser) {
            logApiRequestError(
              req.user.sessionId as string || "unknown-session",
              "Invalid Authorized",
              req.originalUrl,
              req.method,
              res.statusCode,
              ["Unauthorized"],
              { ip: req.ip , userId: req.user.email}
            );
            return res.status(401).json({ message: "Unauthorized" });
          }
    
          // Only allow manager to view their own subordinates
          if (currentUser.role_id === 2 && assignedTo === currentUser.userId) {
            const subordinates = await DatabaseService.getSubordinatesByManagerId(currentUser.userId);
            logBusinessLogicEvent(
              req.requestId as string || "unknown-request",
              "getSubordinatesByManagerId",
              "N/A",
              "Fetched",
              undefined,
              "databaseService"
            );
            return res.json(subordinates);
          }
    
          logApiRequestError(
            req.user.sessionId as string || "unknown-session",
            "Invalid Authorized",
            req.originalUrl,
            req.method,
            res.statusCode,
            ["Forbidden"],
            { ip: req.ip , userId: req.user.email}
          );
          return res.status(403).json({ message: "Forbidden" });
        } catch (err) {
          logApiRequestError(
            req.user.sessionId as string || "unknown-session",
            "Invalid Authorized",
            req.originalUrl,
            req.method,
            res.statusCode,
            ["Internal server error"],
            { ip: req.ip , userId: req.user.email}
          );
          console.error("getSubordinateList error:", err);
          res.status(500).json({ message: "Internal server error" });
        }
    }

    static async getAllManagers(req: Request, res: Response, next: NextFunction){
        try{
          const managers = await databaseService.getAllManagers();
          logBusinessLogicEvent(
            req.requestId as string || "unknown-request",
            "getAllManagers",
            "N/A",
            "Fetched",
            undefined,
            "databaseService"
          );
          res.json({success: true, manager: managers})
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

    static async getAllPermisssions(req: Request, res: Response, next: NextFunction){
        try{
          const users = await databaseService.getAllPermission();
          logBusinessLogicEvent(
            req.requestId as string || "unknown-request",
            "getAllPermission",
            "N/A",
            "Fetched",
            undefined,
            "databaseService"
          );
          res.json({success: true, data: users})
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

    static async createUser(req: Request, res: Response) {
      try {
        const { name, email, department, password, role_id, plan_id, assigned_to } = req.body;
    
        // 🔹 Define role rules
        const roleWithPlan = [1, 2]; // SUPERADMIN & MANAGER
        const rolesWithoutManager = [1, 2]; // SUPERADMIN & MANAGER also don't need assigned_to
    
        // ✅ 1️⃣ Check required fields
        if (!name || !email || !department || !password) {
          return res.status(400).json({ error: "Missing required field" });
        }
        console.log("Role_id", role_id)
    
        // ✅ 2️⃣ Check Plan requirement
        if (roleWithPlan.includes(Number(role_id)) && !plan_id) {
          logApiRequestError(
            req.user.sessionId ?? "unknown-session",
            "Missing Plan ID",
            req.originalUrl,
            req.method,
            res.statusCode,
            ["Plan ID is required for this role"],
            { ip: req.ip, userId: req.user.email }
          );
          return res.status(400).json({ error: "Plan is required for this role" });
        }
    
        // ✅ 3️⃣ Check Manager requirement
        if (!rolesWithoutManager.includes(Number(role_id)) && !assigned_to) {
          logApiRequestError(
            req.user.sessionId ?? "unknown-session",
            "Missing Assigner ID",
            req.originalUrl,
            req.method,
            res.statusCode,
            ["Assigner ID is required for this role"],
            { ip: req.ip, userId: req.user.email }
          );
          return res.status(400).json({ error: "Manager is required for this role" });
        }
    
        // ✅ 4️⃣ Adjust nullability based on role
        const finalPlanId = roleWithPlan.includes(Number(role_id)) ? plan_id : null;
        const finalAssignedTo = rolesWithoutManager.includes(Number(role_id)) ? null : assigned_to;
    
        // ✅ 5️⃣ Create user
        const user = await DatabaseService.createUser(
          name,
          email,
          department,
          password,
          role_id,
          finalPlanId,
          finalAssignedTo
        );
    
        logBusinessLogicEvent(
          req.requestId ?? "unknown-request",
          "createUser",
          "N/A",
          "Created",
          undefined,
          "databaseService"
        );
    
        // ✅ 6️⃣ Attach permissions
        const permissions = await databaseService.getPermissionsByRoleID(role_id);
        logBusinessLogicEvent(
          req.requestId ?? "unknown-request",
          "getPermissionsByRoleID",
          "N/A",
          "Fetched",
          undefined,
          "databaseService"
        );
    
        return res.status(201).json({ ...user, permissions });
      } catch (err: any) {
        logApiRequestError(
          req.user.sessionId ?? "unknown-session",
          err.message || "Unknown error",
          req.originalUrl,
          req.method,
          res.statusCode,
          undefined,
          { ip: req.ip, userId: req.user.email }
        );
        return res.status(500).json({ error: err.message });
      }
    }
    

    static async updateUser(req: Request, res: Response) {
        try {
          const { id } = req.params
          const { name, email, department, role_id, plan_id, assigned_to, password } = req.body
    
          if (!id || !name || !email || !role_id) {
            logApiRequestError(
              req.user.sessionId as string || "unknown-session",
              "Missing required fields",
              req.originalUrl,
              req.method,
              res.statusCode,
              ["Missing required fields"],
              { ip: req.ip , userId: req.user.email}
            );
            return res.status(400).json({ error: "Missing required fields" })
          }
    
          const updatedUser = await DatabaseService.updateUser(
            Number(id),
            name,
            email,
            department || null,
            role_id,
            plan_id ?? null,
            assigned_to ?? null,
            password
          )
    
          if (!updatedUser) {
            logApiRequestError(
              req.user.sessionId as string || "unknown-session",
              "User not found",
              req.originalUrl,
              req.method,
              res.statusCode,
              ["User not found"],
              { ip: req.ip , userId: req.user.email}
            );
            return res.status(404).json({ error: "User not found" })
          }
    
          logBusinessLogicEvent(
            req.requestId as string || "unknown-request",
            "updateUser",
            "Created",
            "Updated",
            undefined,
            "databaseService"
          );
          return res.status(200).json({ user: updatedUser })
        } catch (error: any) {
          logApiRequestError(
            req.user.sessionId as string || "unknown-session",
            error.message || "Unknown error",
            req.originalUrl,
            req.method,
            res.statusCode,
            undefined,
            { ip: req.ip , userId: req.user.email}
          );
          console.error("Update user failed:", error)
          return res.status(500).json({ error: error.message })
        }
    }

    static async deleteUser(req: Request, res: Response,next: NextFunction) {
        try {
          const { id } = req.params;
          const userId = parseInt(id, 10);
      
          if (isNaN(userId)) {
            logApiRequestError(
              req.user.sessionId as string || "unknown-session",
              "Invalid User ID",
              req.originalUrl,
              req.method,
              res.statusCode,
              ["Invalid User ID"],
              { ip: req.ip , userId: req.user.email}
            );
            return res.status(400).json({ error: "Invalid user ID" });
          }
      
          const deleted = await databaseService.deleteUserById(userId);
      
          if (!deleted) {
            logApiRequestError(
              req.user.sessionId as string || "unknown-session",
              "User not found",
              req.originalUrl,
              req.method,
              res.statusCode,
              ["User not found"],
              { ip: req.ip , userId: req.user.email}
            );
            return res.status(404).json({ error: "User not found" });
          }
    
          logBusinessLogicEvent(
            req.requestId as string || "unknown-request",
            "deleteUserById",
            "N/A",
            "Deleted",
            undefined,
            "databaseService"
          );
          return res.status(200).json({ message: "User deleted successfully" });
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
          next(err)
        }
    }

    static async toggleUserStatus(req: Request, res: Response, next: NextFunction) {
        try {
          const { id } = req.params;
          const { isActive } = req.body;
      
          await databaseService.toggleUserStatus(Number(id), isActive);
          logBusinessLogicEvent(
            req.requestId as string || "unknown-request",
            "toggleUserStatus",
            "N/",
            "Updated",
            undefined,
            "databaseService"
          );
          return res.status(200).json({ success: true });
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
          next(err);
        }
    }

    static async getSubordinateCounts(req: Request, res: Response){
        try {
          const managerId = parseInt(req.params.managerId, 10);
      
          if (isNaN(managerId)) {
            logApiRequestError(
              req.user.sessionId as string || "unknown-session",
              "Invalid manager ID",
              req.originalUrl,
              req.method,
              res.statusCode,
              ["Invalid manager ID"],
              { ip: req.ip , userId: req.user.email}
            );
            return res.status(400).json({ ok: false, message: "Invalid manager ID" });
          }
      
          const result = await databaseService.getSubordinateCounts(managerId);
      
          logBusinessLogicEvent(
            req.requestId as string || "unknown-request",
            "getSubordinateCounts",
            "N/A",
            "Fetched",
            undefined,
            "databaseService"
          );
          res.json({ ok: true, ...result });
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
          console.error("Error fetching subordinates:", err);
          res.status(500).json({ ok: false, message: "Error fetching subordinates" });
        }
    }

    //---------------------------- Roles -------------------------------------//
    // static async getAllRoles(req: Request, res: Response, next: NextFunction){
    //     try{
    //       const roles = await databaseService.getAllRoles();
    //       logBusinessLogicEvent(
    //         req.requestId as string || "unknown-request",
    //         "getAllRoles",
    //         "N/A",
    //         "Fetched",
    //         undefined,
    //         "databaseService"
    //       );
    //       res.json({success: true, data: roles})
    //     }catch(err:any){
    //       logApiRequestError(
    //         req.user.sessionId as string || "unknown-session",
    //         err.message || "Unknown error",
    //         req.originalUrl,
    //         req.method,
    //         res.statusCode,
    //         undefined,
    //         { ip: req.ip , userId: req.user.email}
    //       );
    //       next(err)
    //     }
    // }


    static async getAllRoles(req: Request, res: Response, next: NextFunction) {
      try {
        const userId = req.user.userId;
        const userRoleId = req.user.role_id; // e.g. 'SUPERADMIN' or 'MANAGER'
    
        let roles;
    
        // SUPERADMIN sees everything
        if (userRoleId === 1) {
          roles = await databaseService.getAllRoles();
        } else {
          // MANAGER and others get filtered visibility & editability info
          roles = await DatabaseService.getEditableRoles(userId, userRoleId);
        }
    
        logBusinessLogicEvent(
          req.requestId || "unknown-request",
          "getAllRoles",
          "N/A",
          "Fetched",
          undefined,
          "databaseService"
        );
    
        return res.json({ success: true, data: roles });
      } catch (err: any) {
        logApiRequestError(
          req.user.sessionId || "unknown-session",
          err.message || "Unknown error",
          req.originalUrl,
          req.method,
          res.statusCode,
          undefined,
          { ip: req.ip, userId: req.user.email }
        );
        next(err);
      }
    }

    static async createRole(req: Request, res: Response, next: NextFunction) {
      try {
        const { name, description, label, permissions =[] } = req.body;
        const userId = req.user.userId;
    
        if (!name) {
          logApiRequestError(
            req.user.sessionId as string || "unknown-session",
            "Role name missing",
            req.originalUrl,
            req.method,
            res.statusCode,
            ["Role name is required"],
            { ip: req.ip, userId: req.user.email }
          );
          return res.status(400).json({ error: "Role name is required" });
        }
    
        // ✅ Create role in DB (should return the new role id)
        const newRole = await databaseService.createRole({
          name,
          description,
          label,
          created_by: userId,
          permissionCodes: permissions,
        });
    
        // ✅ Optionally fetch full record if not returned by createRole
        const role =
          newRole && newRole.id
            ? await DatabaseService.getRoleById(newRole.id)
            : newRole;
    
        logBusinessLogicEvent(
          req.requestId as string || "unknown-request",
          "createRole",
          "N/A",
          "Created",
          undefined,
          "databaseService"
        );
    
        // ✅ Return complete role data to frontend
        return res.status(201).json({
          success: true,
          role,
        });
      } catch (err: any) {
        logApiRequestError(
          req.user.sessionId as string || "unknown-session",
          err.message || "Unknown error",
          req.originalUrl,
          req.method,
          res.statusCode,
          undefined,
          { ip: req.ip, userId: req.user.email }
        );
        next(err);
      }
    }

    static async getPermissionsByCategory(req: Request, res: Response, next: NextFunction) {
      try {
        const categoryId = Number(req.params.categoryId);
  
        if (isNaN(categoryId)) {
          return res.status(400).json({ error: "Invalid category ID" });
        }
  
        const permissions = await DatabaseService.getPermissionsByCategory(categoryId);
  
        return res.status(200).json({
          success: true,
          permissions,
        });
      } catch (err: any) {
        logApiRequestError(
          req.user.sessionId || "unknown-session",
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
    
    

    // static async createRole(req: Request, res: Response, next: NextFunction) {
    //     try {
    //       const { name, description, label } = req.body;
    //       const userId = req.user.userId;
      
    //       if (!name) {
    //         logApiRequestError(
    //           req.user.sessionId as string || "unknown-session",
    //           "Role name missing",
    //           req.originalUrl,
    //           req.method,
    //           res.statusCode,
    //           ["Role name is required"],
    //           { ip: req.ip , userId: req.user.email}
    //         );
    //         return res.status(400).json({ error: "Role name is required" });
    //       }
      
    //       const role = await databaseService.createRole({ name, description, label, created_by:userId });
    
    //       logBusinessLogicEvent(
    //         req.requestId as string || "unknown-request",
    //         "createRole",
    //         "N/A",
    //         "Created",
    //         undefined,
    //         "databaseService"
    //       );
    //       return res.status(201).json({ success: true, role });
    //     } catch (err:any) {
    //       logApiRequestError(
    //         req.user.sessionId as string || "unknown-session",
    //         err.message || "Unknown error",
    //         req.originalUrl,
    //         req.method,
    //         res.statusCode,
    //         undefined,
    //         { ip: req.ip , userId: req.user.email}
    //       );
    //       next(err);
    //     }
    // }

    static async getAssignablePermission(req: Request, res: Response, next: NextFunction) {
        try {
          const roleId = Number(req.params.roleId);
          const rows = await databaseService.getAssignablePermissionsForRole(roleId)
          logBusinessLogicEvent(
            req.requestId as string || "unknown-request",
            "getAssignablePermissionsForRole",
            "N/A",
            "Fetched",
            undefined,
            "databaseService"
          );
          return res.status(200).json({ success: true, data:rows });
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
          next(err);
        }
    }

    static async updateRolePermissions(req: Request, res: Response, next: NextFunction) {
      try {
        const id = Number(req.params.id);
        const permissionCodes: string[] = req.body.permissions || [];
        const userRole = req.user.role_id;
        const userId = req.user.userId;
    
        if (!Array.isArray(permissionCodes)) {
          logApiRequestError(
            req.user.sessionId as string || "unknown-session",
            "Permissions not array",
            req.originalUrl,
            req.method,
            res.statusCode,
            ["Permissions must be an array"],
            { ip: req.ip, userId: req.user.email }
          );
          return res.status(400).json({ error: "Permissions must be an array" });
        }
    
        // --- 🔒 Access control ---
        if (userRole !== 1) {
          // 🧩 Fetch the role to check who created it
          const targetRole = await DatabaseService.getRoleById(id);
          if (!targetRole) {
            return res.status(404).json({ error: "Role not found" });
          }
    
          // Only allow manager to edit their own created roles
          if (targetRole.created_by !== userId) {
            return res.status(403).json({ error: "You do not have permission to edit this role" });
          }
        }
    
        await databaseService.updateRolePermissions(id, permissionCodes);
    
        logBusinessLogicEvent(
          req.requestId as string || "unknown-request",
          "updateRolePermissions",
          "N/A",
          "Updated",
          undefined,
          "databaseService"
        );
    
        return res.status(200).json({ success: true, message: "Role permissions updated successfully" });
      } catch (err: any) {
        logApiRequestError(
          req.user.sessionId as string || "unknown-session",
          err.message || "Unknown error",
          req.originalUrl,
          req.method,
          res.statusCode,
          undefined,
          { ip: req.ip, userId: req.user.email }
        );
        next(err);
      }
    }
    

    static async updateRole(req: Request, res: Response, next: NextFunction) {
        try {
          const { id } = req.params;
          const { name, description, label } = req.body;
      
          const role = await databaseService.updateRole(Number(id), { name, description, label});
      
          if (!role) {
            logApiRequestError(
              req.user.sessionId as string || "unknown-session",
              "Role not found",
              req.originalUrl,
              req.method,
              res.statusCode,
              ["Role not found"],
              { ip: req.ip , userId: req.user.email}
            );
            return res.status(404).json({ error: "Role not found" });
          }

          // Check permission using the database function
          const canEdit = await DatabaseService.canUserEditRole(req.user.userId, Number(id));
          
          if (!canEdit) {
            const reason = role.is_system_role 
              ? "Cannot modify system roles" 
              : "You can only modify roles you created";
            
            logApiRequestError(
              req.user.sessionId || "unknown-session",
              "Permission denied",
              req.originalUrl,
              req.method,
              403,
              [reason],
              { ip: req.ip, userId: req.user.email }
            );
          }

          logBusinessLogicEvent(
            req.requestId as string || "unknown-request",
            "updateRole",
            "N/A",
            "Updated",
            undefined,
            "databaseService"
          );
          return res.status(200).json({ success: true, role });
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
          next(err);
        }
    }

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
