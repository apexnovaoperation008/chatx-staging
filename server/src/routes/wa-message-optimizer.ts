/**
 * WhatsApp Message Optimizer API
 * Provides endpoints for monitoring and managing optimized message handling
 */

import { Router, Response } from "express";
import { requireAdmin, AuthenticatedRequest } from "../middleware/requireAdmin";
import { waMessageOptimizer } from "../services/wa-message-optimizer.service";

const r = Router();

/**
 * Get message processing statistics
 */
// @ts-ignore
r.get("/stats", requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const stats = waMessageOptimizer.getProcessingStats();
    const metrics = waMessageOptimizer.getPerformanceMetrics();
    
    res.json({
      success: true,
      data: {
        processing: {
          totalProcessed: stats.totalProcessed,
          totalFiltered: stats.totalFiltered,
          totalErrors: stats.totalErrors,
          averageProcessingTime: Math.round(stats.averageProcessingTime),
          queueSize: stats.queueSize,
          lastProcessed: stats.lastProcessed ? new Date(stats.lastProcessed).toISOString() : null
        },
        performance: {
          currentQueueSize: metrics.currentQueueSize,
          processingTimes: {
            average: metrics.processingTimes.length > 0 
              ? Math.round(metrics.processingTimes.reduce((sum, time) => sum + time, 0) / metrics.processingTimes.length)
              : 0,
            min: metrics.processingTimes.length > 0 ? Math.min(...metrics.processingTimes) : 0,
            max: metrics.processingTimes.length > 0 ? Math.max(...metrics.processingTimes) : 0,
            samples: metrics.processingTimes.length
          },
          queueDepths: {
            average: metrics.queueDepths.length > 0
              ? Math.round(metrics.queueDepths.reduce((sum, depth) => sum + depth, 0) / metrics.queueDepths.length)
              : 0,
            max: metrics.queueDepths.length > 0 ? Math.max(...metrics.queueDepths) : 0,
            samples: metrics.queueDepths.length
          },
          throughput: {
            average: metrics.throughput.length > 0
              ? Math.round(metrics.throughput.reduce((sum, rate) => sum + rate, 0) / metrics.throughput.length)
              : 0,
            current: metrics.throughput.length > 0 ? metrics.throughput[metrics.throughput.length - 1] : 0,
            samples: metrics.throughput.length
          }
        },
        rateLimiting: metrics.rateLimitCounters,
        filters: metrics.activeFilters
      }
    });
  } catch (error: any) {
    console.error("❌ 获取消息处理统计失败:", error);
    res.status(500).json({
      success: false,
      error: error.message || "获取统计失败"
    });
  }
});

/**
 * Get message queue status
 */
// @ts-ignore
r.get("/queue", requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const metrics = waMessageOptimizer.getPerformanceMetrics();
    
    res.json({
      success: true,
      data: {
        currentSize: metrics.currentQueueSize,
        maxSize: 1000, // From config
        utilization: Math.round((metrics.currentQueueSize / 1000) * 100),
        status: metrics.currentQueueSize > 800 ? 'high' : 
                metrics.currentQueueSize > 500 ? 'medium' : 'low'
      }
    });
  } catch (error: any) {
    console.error("❌ 获取消息队列状态失败:", error);
    res.status(500).json({
      success: false,
      error: error.message || "获取队列状态失败"
    });
  }
});

/**
 * Clear message queue
 */
// @ts-ignore
r.post("/queue/clear", requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    waMessageOptimizer.clearQueue();
    
    res.json({
      success: true,
      message: "Message queue cleared successfully"
    });
  } catch (error: any) {
    console.error("❌ 清空消息队列失败:", error);
    res.status(500).json({
      success: false,
      error: error.message || "清空队列失败"
    });
  }
});

/**
 * Add global message filter
 */
// @ts-ignore
r.post("/filters/global", requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const filter = req.body;
    
    // Validate filter
    if (!filter || typeof filter !== 'object') {
      return res.status(400).json({
        success: false,
        error: "Invalid filter format"
      });
    }
    
    waMessageOptimizer.addGlobalFilter(filter);
    
    res.json({
      success: true,
      message: "Global filter added successfully",
      filter
    });
  } catch (error: any) {
    console.error("❌ 添加全局过滤器失败:", error);
    res.status(500).json({
      success: false,
      error: error.message || "添加过滤器失败"
    });
  }
});

/**
 * Add account-specific filter
 */
// @ts-ignore
r.post("/filters/account/:accountId", requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { accountId } = req.params;
    const filter = req.body;
    
    // Validate filter
    if (!filter || typeof filter !== 'object') {
      return res.status(400).json({
        success: false,
        error: "Invalid filter format"
      });
    }
    
    waMessageOptimizer.addAccountFilter(accountId, filter);
    
    res.json({
      success: true,
      message: `Filter added for account ${accountId}`,
      accountId,
      filter
    });
  } catch (error: any) {
    console.error(`❌ 为账号 ${req.params.accountId} 添加过滤器失败:`, error);
    res.status(500).json({
      success: false,
      error: error.message || "添加过滤器失败"
    });
  }
});

/**
 * Remove global filter
 */
// @ts-ignore
r.delete("/filters/global", requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const filter = req.body;
    
    if (!filter || typeof filter !== 'object') {
      return res.status(400).json({
        success: false,
        error: "Invalid filter format"
      });
    }
    
    waMessageOptimizer.removeGlobalFilter(filter);
    
    res.json({
      success: true,
      message: "Global filter removed successfully"
    });
  } catch (error: any) {
    console.error("❌ 移除全局过滤器失败:", error);
    res.status(500).json({
      success: false,
      error: error.message || "移除过滤器失败"
    });
  }
});

/**
 * Remove account filter
 */
// @ts-ignore
r.delete("/filters/account/:accountId", requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { accountId } = req.params;
    const filter = req.body;
    
    if (!filter || typeof filter !== 'object') {
      return res.status(400).json({
        success: false,
        error: "Invalid filter format"
      });
    }
    
    waMessageOptimizer.removeAccountFilter(accountId, filter);
    
    res.json({
      success: true,
      message: `Filter removed for account ${accountId}`
    });
  } catch (error: any) {
    console.error(`❌ 移除账号 ${req.params.accountId} 过滤器失败:`, error);
    res.status(500).json({
      success: false,
      error: error.message || "移除过滤器失败"
    });
  }
});

/**
 * Update optimizer configuration
 */
// @ts-ignore
r.put("/config", requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const config = req.body;
    
    if (!config || typeof config !== 'object') {
      return res.status(400).json({
        success: false,
        error: "Invalid configuration format"
      });
    }
    
    waMessageOptimizer.updateConfig(config);
    
    res.json({
      success: true,
      message: "Configuration updated successfully",
      config
    });
  } catch (error: any) {
    console.error("❌ 更新优化器配置失败:", error);
    res.status(500).json({
      success: false,
      error: error.message || "更新配置失败"
    });
  }
});

/**
 * Get current configuration
 */
// @ts-ignore
r.get("/config", requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    // Note: This would require exposing the config from the optimizer
    // For now, return the default configuration
    const defaultConfig = {
      maxQueueSize: 1000,
      batchSize: 10,
      batchTimeout: 100,
      maxRetries: 3,
      retryDelay: 1000,
      deduplicationWindow: 5000,
      rateLimit: {
        maxMessagesPerSecond: 50,
        maxMessagesPerMinute: 1000,
        burstLimit: 100
      }
    };
    
    res.json({
      success: true,
      data: defaultConfig
    });
  } catch (error: any) {
    console.error("❌ 获取配置失败:", error);
    res.status(500).json({
      success: false,
      error: error.message || "获取配置失败"
    });
  }
});

/**
 * Get rate limiting status for all accounts
 */
// @ts-ignore
r.get("/rate-limits", requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const metrics = waMessageOptimizer.getPerformanceMetrics();
    
    res.json({
      success: true,
      data: {
        rateLimitCounters: metrics.rateLimitCounters,
        limits: {
          maxMessagesPerSecond: 50,
          maxMessagesPerMinute: 1000,
          burstLimit: 100
        }
      }
    });
  } catch (error: any) {
    console.error("❌ 获取速率限制状态失败:", error);
    res.status(500).json({
      success: false,
      error: error.message || "获取速率限制状态失败"
    });
  }
});

export default r;
