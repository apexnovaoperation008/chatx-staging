/**
 * WhatsApp Message Monitoring API
 * Endpoints for validating multi-client message event handling
 */

import { Router, Response } from "express";
import { waMessageMultiplexer } from "../services/wa-message-multiplexer.service";
import { requireAdmin, AuthenticatedRequest } from "../middleware/requireAdmin";

const r = Router();

/**
 * Get message monitoring statistics
 */
// @ts-ignore
r.get("/stats", requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const stats = waMessageMultiplexer.getMessageStats();
    const registeredClients = waMessageMultiplexer.getRegisteredClients();
    
    res.json({
      success: true,
      data: {
        registeredClientCount: waMessageMultiplexer.getRegisteredClientCount(),
        registeredClients,
        messageStats: stats,
        summary: {
          totalRegistered: registeredClients.length,
          totalMessagesReceived: stats.reduce((sum, stat) => sum + stat.messageCount, 0),
          activeAccounts: stats.filter(s => s.isActive).length
        }
      }
    });
  } catch (error: any) {
    console.error("❌ 获取消息监听统计失败:", error);
    res.status(500).json({
      success: false,
      error: error.message || "获取统计信息失败"
    });
  }
});

/**
 * Validate all listeners are properly registered
 */
// @ts-ignore
r.get("/validate", requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const validation = waMessageMultiplexer.validateListeners();
    
    res.json({
      success: true,
      data: validation
    });
  } catch (error: any) {
    console.error("❌ 验证消息监听器失败:", error);
    res.status(500).json({
      success: false,
      error: error.message || "验证失败"
    });
  }
});

/**
 * Get statistics for a specific client
 */
// @ts-ignore
r.get("/stats/:accountId", requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { accountId } = req.params;
    const stats = waMessageMultiplexer.getClientStats(accountId);
    
    if (!stats) {
      return res.status(404).json({
        success: false,
        error: "Account not found in message monitoring"
      });
    }
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    console.error(`❌ 获取账号统计失败:`, error);
    res.status(500).json({
      success: false,
      error: error.message || "获取账号统计失败"
    });
  }
});

/**
 * Check if a specific client is registered
 */
// @ts-ignore
r.get("/registered/:accountId", requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { accountId } = req.params;
    const isRegistered = waMessageMultiplexer.isClientRegistered(accountId);
    
    res.json({
      success: true,
      data: {
        accountId,
        isRegistered
      }
    });
  } catch (error: any) {
    console.error(`❌ 检查注册状态失败:`, error);
    res.status(500).json({
      success: false,
      error: error.message || "检查注册状态失败"
    });
  }
});

export default r;

