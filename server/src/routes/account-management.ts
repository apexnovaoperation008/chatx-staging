import { Router } from "express";
import { requireAdmin, AuthenticatedRequest } from "../middleware/requireAdmin";
import { getAllAccounts, getAccountStats, deleteAccount, toggleAccountActive } from "../services/account-management.service";
import { DatabaseService } from "../database/database.service";
import { WhatsAppSessionsStore } from "../stores/whatsapp-sessions.store";
import { TelegramSessionsStore } from "../stores/telegram-sessions.store";
import * as path from "path";

const r = Router();

// 获取所有账号
// @ts-ignore
r.get("/accounts", requireAdmin, (req: AuthenticatedRequest, res) => {
  try {
    const accounts = getAllAccounts();
    res.json({ data: accounts });
  } catch (error: any) {
    console.error("❌ 获取账号列表失败:", error);
    res.status(500).json({ 
      ok: false, 
      message: error.message || "获取账号列表失败" 
    });
  }
});

// 获取账号统计
// @ts-ignore
r.get("/stats", requireAdmin, (req: AuthenticatedRequest, res) => {
  try {
    const stats = getAccountStats();
    res.json({ data: stats });
  } catch (error: any) {
    console.error("❌ 获取账号统计失败:", error);
    res.status(500).json({ 
      ok: false, 
      message: error.message || "获取账号统计失败" 
    });
  }
});

// 获取单个账号详情
// @ts-ignore
r.get("/accounts/:id", requireAdmin, (req: AuthenticatedRequest, res) => {
  try {
    const accounts = getAllAccounts();
    const account = accounts.find(acc => acc.id === req.params.id);
    
    if (!account) {
      return res.status(404).json({ 
        ok: false, 
        message: "账号不存在" 
      });
    }
    
    res.json({ data: account });
  } catch (error: any) {
    console.error("❌ 获取账号详情失败:", error);
    res.status(500).json({ 
      ok: false, 
      message: error.message || "获取账号详情失败" 
    });
  }
});

// 删除账号
// @ts-ignore
r.delete("/accounts/:id", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const success = await deleteAccount(req.params.id);
    
    if (success) {
      res.json({ ok: true, message: "Account deleted successfully" });
    } else {
      res.status(500).json({ 
        ok: false, 
        message: "Failed to delete account" 
      });
    }
  } catch (error: any) {
    console.error("❌ 删除账号失败:", error);
    res.status(500).json({ 
      ok: false, 
      message: error.message || "Failed to delete account" 
    });
  }
});

// 切换账号启用状态
// @ts-ignore
r.put("/accounts/:id/toggle", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { isActive } = req.body;
    const accountId = req.params.id;
    
    console.log(`🔄 [API] 收到账号状态切换请求: ${accountId} -> ${isActive}`);
    console.log(`🔍 [API] 请求体:`, req.body);
    console.log(`🔍 [API] 账号ID:`, accountId);
    
    const updatedAccount = await toggleAccountActive(accountId, isActive);
    
    console.log(`🔍 [API] toggleAccountActive 返回:`, updatedAccount ? '成功' : '失败');
    
    if (updatedAccount) {
      console.log(`✅ [API] 账号状态切换成功，返回数据:`, {
        id: updatedAccount.id,
        platform: updatedAccount.platform,
        isActive: updatedAccount.isActive
      });
      res.json({ data: updatedAccount });
    } else {
      console.log(`❌ [API] 账号不存在或切换失败: ${accountId}`);
      res.status(404).json({ 
        ok: false, 
        message: "账号不存在或切换失败" 
      });
    }
  } catch (error: any) {
    console.error("❌ [API] 切换账号状态失败:", error);
    console.error("❌ [API] 错误堆栈:", error.stack);
    res.status(500).json({ 
      ok: false, 
      message: error.message || "切换账号状态失败" 
    });
  }
});

// 刷新账号状态（重新连接）
// @ts-ignore
r.post("/accounts/:id/refresh", requireAdmin, (req: AuthenticatedRequest, res) => {
  try {
    // TODO: 实现账号重新连接逻辑
    // 这里应该调用对应平台的重新连接服务
    
    const accounts = getAllAccounts();
    const account = accounts.find(acc => acc.id === req.params.id);
    
    if (!account) {
      return res.status(404).json({ 
        ok: false, 
        message: "账号不存在" 
      });
    }
    
    // 临时返回账号信息，未来实现真实的刷新逻辑
    account.status = "connected";
    res.json({ data: account });
  } catch (error: any) {
    console.error("❌ 刷新账号状态失败:", error);
    res.status(500).json({ 
      ok: false, 
      message: error.message || "刷新账号状态失败" 
    });
  }
});

// 更新账号信息（显示名称和描述）
// @ts-ignore
r.put("/accounts/:id/info", requireAdmin, (req: AuthenticatedRequest, res) => {
  try {
    const { displayName, description } = req.body;
    const accountId = req.params.id;
    
    // 先尝试从WhatsApp存储获取
    const whatsappSession = WhatsAppSessionsStore.get(accountId);
    if (whatsappSession) {
      const updatedData = {
        ...whatsappSession.data,
        displayName: displayName?.trim(),
        description: description?.trim(),
      };
      
      const success = WhatsAppSessionsStore.update(accountId, {
        label: displayName?.trim() || whatsappSession.label,
        data: updatedData,
      });
      
      if (success) {
        res.json({ ok: true, message: "WhatsApp账号信息更新成功" });
      } else {
        res.status(500).json({ ok: false, message: "更新WhatsApp账号信息失败" });
      }
      return;
    }
    
    // 尝试从Telegram存储获取
    const telegramSession = TelegramSessionsStore.get(accountId);
    if (telegramSession) {
      // Telegram的data结构不同，需要特殊处理
      const success = TelegramSessionsStore.update(accountId, {
        label: displayName?.trim() || telegramSession.label,
      });
      
      if (success) {
        res.json({ ok: true, message: "Telegram账号信息更新成功" });
      } else {
        res.status(500).json({ ok: false, message: "更新Telegram账号信息失败" });
      }
      return;
    }
    
    // 账号不存在
    res.status(404).json({ 
      ok: false, 
      message: "账号不存在" 
    });
  } catch (error: any) {
    console.error("❌ 更新账号信息失败:", error);
    res.status(500).json({ 
      ok: false, 
      message: error.message || "更新账号信息失败" 
    });
  }
});

// 保存WhatsApp账号
// @ts-ignore
r.post("/accounts/whatsapp", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { sessionId, displayName, description, workspaceId, brandId } = req.body;
    
    console.log(`💾 保存WhatsApp账号到数据库:`, { sessionId, displayName, description });
    
    // 🆕 新的存储方法：直接在sessions目录下存储
    const sessionsRoot = path.resolve(process.cwd(), "sessions");
    
    // 保存到WhatsApp专用存储
    WhatsAppSessionsStore.add({
      id: sessionId,
      provider: "whatsapp",
      label: displayName || `WhatsApp ${sessionId}`,
      data: {
        sessionId,
        dataDir: sessionsRoot, // sessions根目录
      },
      createdAt: Date.now(),
      createdBy: req.user.userId
    });

    // 🗄️ 保存到accounts表
    if (workspaceId && brandId) {
      try {
        await DatabaseService.createAccount(
          "whatsapp",
          sessionId, // keep original
          displayName,
          description,
          Number(workspaceId),
          Number(brandId),
          "connected",
          true,
          req.user.userId
        );          
      } catch (dbErr: any) {
        console.warn("⚠️ 保存到accounts表失败（继续返回成功）:", dbErr?.message);
      }
    }
    
    console.log(`✅ WhatsApp账号已保存: ${sessionId}`);
    res.json({ ok: true, message: "WhatsApp账号保存成功" });
  } catch (error: any) {
    console.error("❌ 保存WhatsApp账号失败:", error);
    res.status(500).json({ 
      ok: false, 
      message: error.message || "保存WhatsApp账号失败" 
    });
  }
});

// 保存Telegram账号
// @ts-ignore
r.post("/accounts/telegram", requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { sessionId, displayName, description, workspaceId, brandId } = req.body;
    
    console.log(`💾 保存Telegram账号到数据库:`, { sessionId, displayName, description });
    
    // 从现有的Telegram sessions中查找对应的session数据
    const existingSession = TelegramSessionsStore.get(sessionId);
    if (!existingSession) {
      return res.status(404).json({ 
        ok: false, 
        message: "Telegram会话不存在，请先完成连接" 
      });
    }
    
    // 更新session的label
    TelegramSessionsStore.update(sessionId, {
      label: displayName || existingSession.label,
    });

    // 🗄️ 保存到accounts表
    if (workspaceId && brandId) {
      try {
        await DatabaseService.createAccount(
          "telegram",
          Number(sessionId.replace(/\D/g, "")) || Date.now(),
          displayName,
          description,
          Number(workspaceId),
          Number(brandId),
          "connected",
          true,
          req.user.userId
        );
      } catch (dbErr: any) {
        console.warn("⚠️ 保存到accounts表失败（继续返回成功）:", dbErr?.message);
      }
    }
    
    console.log(`✅ Telegram账号已保存: ${sessionId}`);
    res.json({ ok: true, message: "Telegram账号保存成功" });
  } catch (error: any) {
    console.error("❌ 保存Telegram账号失败:", error);
    res.status(500).json({ 
      ok: false, 
      message: error.message || "保存Telegram账号失败" 
    });
  }
});

export default r;