/**
 * WhatsApp Session Monitoring API
 * Provides endpoints for monitoring and managing optimized WhatsApp sessions
 */

import { Router, Response } from "express";
import { requireAdmin, AuthenticatedRequest } from "../middleware/requireAdmin";
import { waSessionOptimizer } from "../services/wa-session-optimizer.service";
import { waMessageMultiplexer } from "../services/wa-message-multiplexer.service";
import { accountDatabaseService } from "@/database/account.database.service"
import { databaseService } from "../database/database.service";

const r = Router();

/**
 * Get session health status for all accounts
 */
// @ts-ignore
r.get("/health", requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionHealth = waSessionOptimizer.getSessionHealth();
    const healthArray = Array.from(sessionHealth.values());
    
    res.json({
      success: true,
      data: {
        totalSessions: healthArray.length,
        healthySessions: healthArray.filter(h => h.healthScore > 80).length,
        unhealthySessions: healthArray.filter(h => h.healthScore <= 50).length,
        sessions: healthArray.map(health => ({
          accountId: health.accountId,
          isConnected: health.isConnected,
          healthScore: health.healthScore,
          lastSeen: new Date(health.lastSeen).toISOString(),
          messageCount: health.messageCount,
          issues: health.issues,
          status: health.healthScore > 80 ? 'healthy' : 
                  health.healthScore > 50 ? 'warning' : 'critical'
        }))
      }
    });
  } catch (error: any) {
    console.error("❌ 获取会话健康状态失败:", error);
    res.status(500).json({
      success: false,
      error: error.message || "获取健康状态失败"
    });
  }
});

/**
 * Get performance metrics
 */
// @ts-ignore
r.get("/metrics", requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const metrics = waSessionOptimizer.getMetrics();
    const messageStats = waMessageMultiplexer.getMessageStats();
    
    res.json({
      success: true,
      data: {
        performance: {
          totalReconnections: metrics.totalReconnections,
          successfulReconnections: metrics.successfulReconnections,
          failedReconnections: metrics.failedReconnections,
          successRate: metrics.totalReconnections > 0 
            ? Math.round((metrics.successfulReconnections / metrics.totalReconnections) * 100) 
            : 0,
          averageReconnectionTime: Math.round(metrics.averageReconnectionTime),
          messagesProcessed: metrics.messagesProcessed,
          lastHealthCheck: new Date(metrics.lastHealthCheck).toISOString()
        },
        sessions: {
          active: metrics.activeSessions,
          healthy: metrics.healthySessions,
          unhealthy: metrics.unhealthySessions
        },
        messageStats: messageStats.map(stat => ({
          accountId: stat.accountId,
          messageCount: stat.messageCount,
          lastMessageTime: stat.lastMessageTime ? new Date(stat.lastMessageTime).toISOString() : null,
          isActive: stat.isActive
        }))
      }
    });
  } catch (error: any) {
    console.error("❌ 获取性能指标失败:", error);
    res.status(500).json({
      success: false,
      error: error.message || "获取性能指标失败"
    });
  }
});

/**
 * Force reconnection of a specific account
 */
// @ts-ignore
r.post("/reconnect/:accountId", requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { accountId } = req.params;
    console.log(`🔄 强制重连账号: ${accountId}`);
    const currentUser = req.user.userId
    console.log(`🔄 强制重连账号: ${currentUser}`);
    console.log(`🔄 ${req.user.role_id}请求重连账号: ${currentUser}`);

    const user = await databaseService.getUserById(currentUser)

    if (!user || !user.role_name) {
      return res.status(403).json({ success: false, message: "用户角色无效或不存在" });
    }

    console.log(`🔄 ${user.role_name}(${currentUser}) 请求重连账号 ${accountId}`);

    

    // 1️⃣ Check if account exists
    const account = await accountDatabaseService.findById(accountId);
    if (!account) {
      return res.status(404).json({ success: false, message: "账号不存在" });
    }

    // 2️⃣ Check permission
    const canAccess = await accountDatabaseService.canUserAccessAccount(currentUser, user.role_name, accountId);
    if (!canAccess) {
      return res.status(403).json({ success: false, message: "无权限重连此账号" });
    }

    const success = await waSessionOptimizer.forceReconnect(accountId);
    
    if (success) {
      res.json({
        success: true,
        message: `账号 ${accountId} 重连成功`
      });
    } else {
      res.status(500).json({
        success: false,
        error: `账号 ${accountId} 重连失败`
      });
    }
  } catch (error: any) {
    console.error(`❌ 强制重连失败:`, error);
    res.status(500).json({
      success: false,
      error: error.message || "强制重连失败"
    });
  }
});

/**
 * Get detailed session information
 */
// @ts-ignore
r.get("/session/:accountId", requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { accountId } = req.params;
    
    const sessionHealth = waSessionOptimizer.getSessionHealth().get(accountId);
    const messageStats = waMessageMultiplexer.getClientStats(accountId);
    const isRegistered = waMessageMultiplexer.isClientRegistered(accountId);
    
    if (!sessionHealth) {
      return res.status(404).json({
        success: false,
        error: "Session not found"
      });
    }
    
    res.json({
      success: true,
      data: {
        accountId,
        health: {
          isConnected: sessionHealth.isConnected,
          healthScore: sessionHealth.healthScore,
          lastSeen: new Date(sessionHealth.lastSeen).toISOString(),
          messageCount: sessionHealth.messageCount,
          issues: sessionHealth.issues,
          status: sessionHealth.healthScore > 80 ? 'healthy' : 
                  sessionHealth.healthScore > 50 ? 'warning' : 'critical'
        },
        messageStats: messageStats ? {
          messageCount: messageStats.messageCount,
          lastMessageTime: messageStats.lastMessageTime ? new Date(messageStats.lastMessageTime).toISOString() : null,
          isActive: messageStats.isActive
        } : null,
        registration: {
          isRegistered,
          registeredClients: waMessageMultiplexer.getRegisteredClients()
        }
      }
    });
  } catch (error: any) {
    console.error(`❌ 获取会话详情失败:`, error);
    res.status(500).json({
      success: false,
      error: error.message || "获取会话详情失败"
    });
  }
});

/**
 * Get system status overview
 */
// @ts-ignore
r.get("/status", requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const metrics = waSessionOptimizer.getMetrics();
    const sessionHealth = waSessionOptimizer.getSessionHealth();
    const validation = waMessageMultiplexer.validateListeners();
    
    const healthArray = Array.from(sessionHealth.values());
    const healthyCount = healthArray.filter(h => h.healthScore > 80).length;
    const warningCount = healthArray.filter(h => h.healthScore > 50 && h.healthScore <= 80).length;
    const criticalCount = healthArray.filter(h => h.healthScore <= 50).length;
    
    res.json({
      success: true,
      data: {
        system: {
          status: criticalCount > 0 ? 'critical' : warningCount > 0 ? 'warning' : 'healthy',
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          timestamp: new Date().toISOString()
        },
        sessions: {
          total: healthArray.length,
          healthy: healthyCount,
          warning: warningCount,
          critical: criticalCount,
          connected: healthArray.filter(h => h.isConnected).length
        },
        performance: {
          totalReconnections: metrics.totalReconnections,
          successRate: metrics.totalReconnections > 0 
            ? Math.round((metrics.successfulReconnections / metrics.totalReconnections) * 100) 
            : 0,
          averageReconnectionTime: Math.round(metrics.averageReconnectionTime),
          messagesProcessed: metrics.messagesProcessed
        },
        validation: {
          valid: validation.valid,
          registeredCount: validation.registeredCount,
          activeCount: validation.activeCount,
          missingListeners: validation.missingListeners
        }
      }
    });
  } catch (error: any) {
    console.error("❌ 获取系统状态失败:", error);
    res.status(500).json({
      success: false,
      error: error.message || "获取系统状态失败"
    });
  }
});

export default r;
