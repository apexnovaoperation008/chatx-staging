// src/controllers/auth.controller.ts
import { NextFunction, Request, Response } from "express";
import { authService } from "../services/auth.service";
import { databaseService } from "../database/database.service";
import { DatabaseService } from "../database/database.service";
import {logApiRequestError, logBusinessLogicEvent}  from "../logger"
import { getCookieOptions } from "../utils/cookieOptions";
import jwt from "jsonwebtoken";
import { config } from "../config/env";
//import { verifyRefreshToken, generateTokens } from "@/services/auth.service";

const REFRESH_TOKEN_SECRET = config.REFRESH_SECRET || config.SESS_SECRET;
const ACCESS_TOKEN_SECRET = config.SESS_SECRET;

export class AuthController {  
  
  async login(req: Request, res: Response) {
    try{
      const result = await authService.login(req.body);
      logBusinessLogicEvent(
        req.requestId as string || "unknown-request",
        "login",
        "unauthenticated",
        result.success ? "authenticated" : "failed",
        result.success ? undefined : "invalid credentials",
        "authService"
      );

      res.cookie("access_token", result.accessToken, getCookieOptions(15 * 60 * 1000));

      // Example: cross-domain deployment
      //res.cookie("refresh_token", result.refreshToken, getCookieOptions(7 * 24 * 60 * 60 * 1000, { crossDomain: true, isRefresh: true }));
      res.cookie("refresh_token", result.refreshToken, getCookieOptions(7 * 24 * 60 * 1000, { crossDomain: true, isRefresh: true }));

      return res.status(result.success ? 200 : 401).json(result);
    }catch (err: any) {
      // API error log
      logApiRequestError(
        req.user.sessionId as string || "unknown-session",
        err.message || "Unknown error",
        req.originalUrl,
        req.method,
        res.statusCode,
        undefined,
        { ip: req.ip , userId: req.user.email}
      ); 
    }
  }

  async me(req: Request, res: Response) {
    // req.user is set by requireAuth
    const authUser = req.user;
    if (!authUser) return res.status(401).json({ success: false });

    const dbUser = await databaseService.getUserById(authUser.userId);
    if (!dbUser) return res.status(404).json({ success: false });

    const perms = await databaseService.getPermissionsByRole(dbUser.role_id);
    const permissions = perms.map(p => p.code);
    
    let plan = null;
    if (dbUser.plan_id != null) { 
      plan = await databaseService.getPlanById(dbUser.plan_id);
    }

    return res.json({
      success: true,
      user: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        role: dbUser.role_name,
        role_id: dbUser.role_id,
        plan_id: dbUser.plan_id ?? null,
        plan_name: plan?.name??null,
        department: dbUser.department ?? null,
        permissions,
        createdAt: dbUser.created_at.toISOString(),
        lastLogin: undefined,
        workspace_id: undefined,
        avatar: undefined,
        isActive:dbUser.is_active,
        assignedTo: dbUser.assigned_to ??null,
      },
    });
  }

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

  static async getAllRoles(req: Request, res: Response, next: NextFunction){
    try{
      const roles = await databaseService.getAllRoles();
      logBusinessLogicEvent(
        req.requestId as string || "unknown-request",
        "getAllRoles",
        "N/A",
        "Fetched",
        undefined,
        "databaseService"
      );
      res.json({success: true, data: roles})
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

  async refreshToken(req: Request, res: Response) {
    try {
      const token = req.cookies?.refresh_token;
      if (!token) {
        return res.status(401).json({ success: false, message: "Missing refresh token" });
      }
  
      // Verify existing refresh token
      const decoded = jwt.verify(token, REFRESH_TOKEN_SECRET) as any;
      if (!decoded?.userId) {
        return res.status(403).json({ success: false, message: "Invalid refresh token" });
      }
  
      const user = await databaseService.getUserById(decoded.userId);
      if (!user || !user.is_active) {
        return res.status(403).json({ success: false, message: "User inactive" });
      }
  
      // Build new access token payload
      const tokenPayload = {
        userId: user.id,
        email: user.email,
        role_id: user.role_id,
        role_name: user.role_name,
      };
  
      // Only generate new access token, keep same refresh token
      const accessToken = jwt.sign(tokenPayload, ACCESS_TOKEN_SECRET, { expiresIn: "15m" });
  
      res.cookie("access_token", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 15 * 60 * 1000, // 15 minutes
        path: "/", // must be same path as login cookie
      });

  
      return res.json({
        success: true,
        accessToken,
        message: "Access token refreshed successfully",
      });
    } catch (err: any) {
      console.error("Refresh error:", err);
      return res.status(401).json({ success: false, message: "Invalid or expired refresh token" });
    }
  }

  // async refreshToken(req: Request, res: Response) {
  //   try {
  //     const token = req.cookies?.refreshToken;
  //     if (!token) {
  //       return res.status(401).json({ success: false, message: "Missing refresh token" });
  //     }
  
  //     // Verify existing refresh token
  //     const decoded = jwt.verify(token, REFRESH_TOKEN_SECRET) as any;
  //     if (!decoded?.userId) {
  //       return res.status(403).json({ success: false, message: "Invalid refresh token" });
  //     }
  
  //     const user = await databaseService.getUserById(decoded.userId);
  //     if (!user || !user.is_active) {
  //       return res.status(403).json({ success: false, message: "User inactive" });
  //     }
  
  //     // Build new access token payload
  //     const tokenPayload = {
  //       userId: user.id,
  //       email: user.email,
  //       role_id: user.role_id,
  //       role_name: user.role_name,
  //     };
  
  //     // Only generate new access token, keep same refresh token
  //     const accessToken = jwt.sign(tokenPayload, ACCESS_TOKEN_SECRET, { expiresIn: "15m" });
  
  //     res.cookie("accessToken", accessToken, {
  //       httpOnly: true,
  //       sameSite: "strict",
  //       secure: process.env.NODE_ENV === "production",
  //       maxAge: 15 * 60 * 1000, // 15 mins
  //     });
  
  //     return res.json({
  //       success: true,
  //       accessToken,
  //       message: "Access token refreshed successfully",
  //     });
  //   } catch (err: any) {
  //     console.error("Refresh error:", err);
  //     return res.status(401).json({ success: false, message: "Invalid or expired refresh token" });
  //   }
  // }
  
}
