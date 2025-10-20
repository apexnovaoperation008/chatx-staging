/**
 * WhatsApp 会话管理 API
 * 实现状态机驱动的会话管理接口
 */

import { Router, Response } from "express";
import { requireAdmin, AuthenticatedRequest } from "../middleware/requireAdmin";
import { waSessionManager } from "../services/wa-session-manager.service";

const router = Router();

/**
 * GET /wa/sessions
 * 获取所有会话列表
 */
// @ts-ignore
router.get("/sessions", requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessions = waSessionManager.getAllSessions();
    const stats = waSessionManager.getStats();
    
    res.json({
      success: true,
      data: {
        sessions,
        stats
      }
    });
  } catch (error) {
    console.error("获取会话列表失败:", error);
    res.status(500).json({
      success: false,
      error: "FETCH_SESSIONS_FAILED",
      message: "获取会话列表失败"
    });
  }
});

/**
 * POST /wa/sessions
 * 创建新会话（仅分配instanceId，不生成QR）
 */
// @ts-ignore
router.post("/sessions", requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // 创建新会话但不启动
    const session = await waSessionManager.createSession();
    
    res.json({
      success: true,
      data: {
        instanceId: session.id,
        state: session.state
      }
    });
  } catch (error) {
    console.error("创建会话失败:", error);
    res.status(500).json({
      success: false,
      error: "CREATE_SESSION_FAILED",
      message: error instanceof Error ? error.message : "创建会话失败"
    });
  }
});

/**
 * POST /wa/sessions/:id/generate-qr
 * 按需生成QR码（启动open-wa客户端）
 */
// @ts-ignore
router.post("/sessions/:id/generate-qr", requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const session = waSessionManager.getSession(id);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: "SESSION_NOT_FOUND",
        message: "会话不存在"
      });
    }

    // 只有INIT或FAILED状态才能生成QR
    if (session.state !== 'INIT' && session.state !== 'FAILED') {
      return res.status(400).json({
        success: false,
        error: "INVALID_STATE_FOR_QR_GENERATION",
        message: `当前状态不支持生成QR码: ${session.state}`
      });
    }

    // 启动会话并生成QR
    await waSessionManager.startSession(id);
    
    res.json({
      success: true,
      data: {
        instanceId: id,
        state: session.state
      }
    });
  } catch (error) {
    console.error("生成QR码失败:", error);
    res.status(500).json({
      success: false,
      error: "GENERATE_QR_FAILED",
      message: error instanceof Error ? error.message : "生成QR码失败"
    });
  }
});

/**
 * GET /wa/sessions/:id
 * 获取特定会话信息
 */
// @ts-ignore
router.get("/sessions/:id", requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const session = waSessionManager.getSession(id);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: "SESSION_NOT_FOUND",
        message: "会话不存在"
      });
    }

    res.json({
      success: true,
      data: session.info
    });
  } catch (error) {
    console.error("获取会话信息失败:", error);
    res.status(500).json({
      success: false,
      error: "FETCH_SESSION_FAILED",
      message: "获取会话信息失败"
    });
  }
});

/**
 * GET /wa/sessions/:id/qr
 * 获取会话QR码（仅 state=QR_READY 时返回）
 */
// @ts-ignore
router.get("/sessions/:id/qr", requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const session = waSessionManager.getSession(id);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: "SESSION_NOT_FOUND",
        message: "会话不存在"
      });
    }

    // 只有QR_READY状态才返回QR码
    if (session.state !== 'QR_READY') {
      return res.status(400).json({
        success: false,
        error: "QR_NOT_READY",
        message: `当前状态不支持获取QR码: ${session.state}`,
        state: session.state
      });
    }

    const qrData = waSessionManager.getSessionQR(id);
    
    if (!qrData) {
      return res.status(404).json({
        success: false,
        error: "QR_NOT_AVAILABLE",
        message: "QR码暂不可用"
      });
    }

    res.json({
      success: true,
      data: {
        qrData,
        expiresAt: session.qr?.expiresAt,
        state: session.state
      }
    });
  } catch (error) {
    console.error("获取QR码失败:", error);
    res.status(500).json({
      success: false,
      error: "FETCH_QR_FAILED",
      message: "获取QR码失败"
    });
  }
});

/**
 * POST /wa/sessions/:id/retry
 * 重试（从FAILED状态回到INIT）
 */
// @ts-ignore
router.post("/sessions/:id/retry", requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const session = waSessionManager.getSession(id);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: "SESSION_NOT_FOUND",
        message: "会话不存在"
      });
    }

    if (session.state !== 'FAILED') {
      return res.status(400).json({
        success: false,
        error: "INVALID_STATE_FOR_RETRY",
        message: `当前状态不支持重试: ${session.state}`
      });
    }

    await waSessionManager.retrySession(id);
    
    res.json({
      success: true,
      data: {
        instanceId: id,
        state: session.state
      }
    });
  } catch (error) {
    console.error("重试会话失败:", error);
    res.status(500).json({
      success: false,
      error: "RETRY_SESSION_FAILED",
      message: error instanceof Error ? error.message : "重试会话失败"
    });
  }
});

/**
 * POST /wa/sessions/:id/finalize
 * 将已连接的会话转为正式账号
 */
// @ts-ignore
router.post("/sessions/:id/finalize", requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const session = waSessionManager.getSession(id);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: "SESSION_NOT_FOUND",
        message: "会话不存在"
      });
    }

    // 只有CONNECTED状态才能finalize
    if (session.state !== 'CONNECTED') {
      return res.status(409).json({
        success: false,
        error: "SESSION_NOT_CONNECTED",
        message: "请先完成扫描连接"
      });
    }

    // 添加到正式账号存储
    const accountId = await waSessionManager.finalizeSession(id);
    
    res.json({
      success: true,
      data: {
        accountId,
        instanceId: id
      }
    });
  } catch (error) {
    console.error("添加账号失败:", error);
    res.status(500).json({
      success: false,
      error: "FINALIZE_SESSION_FAILED",
      message: error instanceof Error ? error.message : "添加账号失败"
    });
  }
});

/**
 * POST /wa/sessions/:id/disconnect
 * 断开会话连接
 */
// @ts-ignore
router.post("/sessions/:id/disconnect", requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const session = waSessionManager.getSession(id);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: "SESSION_NOT_FOUND",
        message: "会话不存在"
      });
    }

    await waSessionManager.disconnectSession(id);
    
    res.json({
      success: true,
      data: {
        instanceId: id,
        state: session.state
      }
    });
  } catch (error) {
    console.error("断开会话失败:", error);
    res.status(500).json({
      success: false,
      error: "DISCONNECT_SESSION_FAILED",
      message: "断开会话失败"
    });
  }
});

/**
 * DELETE /wa/sessions/:id
 * 删除会话
 */
// @ts-ignore
router.delete("/sessions/:id", requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const session = waSessionManager.getSession(id);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: "SESSION_NOT_FOUND",
        message: "会话不存在"
      });
    }

    await waSessionManager.removeSession(id);
    
    res.json({
      success: true,
      message: "会话已删除"
    });
  } catch (error) {
    console.error("删除会话失败:", error);
    res.status(500).json({
      success: false,
      error: "DELETE_SESSION_FAILED",
      message: "删除会话失败"
    });
  }
});

/**
 * GET /wa/sessions/stats
 * 获取会话统计信息
 */
// @ts-ignore
router.get("/sessions/stats", requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const stats = waSessionManager.getStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error("获取统计信息失败:", error);
    res.status(500).json({
      success: false,
      error: "FETCH_STATS_FAILED",
      message: "获取统计信息失败"
    });
  }
});

/**
 * POST /wa/sessions/cleanup
 * 清理无效会话
 */
// @ts-ignore
router.post("/sessions/cleanup", requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await waSessionManager.cleanup();
    
    res.json({
      success: true,
      message: "会话清理完成"
    });
  } catch (error) {
    console.error("清理会话失败:", error);
    res.status(500).json({
      success: false,
      error: "CLEANUP_FAILED",
      message: "清理会话失败"
    });
  }
});

export default router;
