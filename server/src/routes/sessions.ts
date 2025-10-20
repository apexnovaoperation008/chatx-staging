import { Router, Response } from "express";
import { requireAdmin, AuthenticatedRequest } from "../middleware/requireAdmin";
import { WhatsAppSessionsStore } from "../stores/whatsapp-sessions.store";
import { TelegramSessionsStore } from "../stores/telegram-sessions.store";
import { deleteAccount } from "../services/account-management.service";

const r = Router();

// @ts-ignore
r.get("/", requireAdmin, ((_req: AuthenticatedRequest, res: Response) => {
  // 合并WhatsApp和Telegram sessions
  const whatsappSessions = WhatsAppSessionsStore.list().map(x => ({ 
    id: x.id, 
    provider: x.provider, 
    label: x.label, 
    createdAt: new Date(x.createdAt).toISOString() 
  }));
  
  const telegramSessions = TelegramSessionsStore.list().map(x => ({ 
    id: x.id, 
    provider: x.provider, 
    label: x.label, 
    createdAt: new Date(x.createdAt).toISOString() 
  }));
  
  const allSessions = [...whatsappSessions, ...telegramSessions];
  res.json(allSessions);
}) as any);

// @ts-ignore
r.delete("/:id", requireAdmin, (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = req.params.id;
    console.log(`🗑️ [Sessions API] 删除账号: ${sessionId}`);
    
    // 使用完整的删除逻辑（包括文件夹删除和客户端清理）
    const success = await deleteAccount(sessionId);
    
    if (success) {
      console.log(`✅ [Sessions API] 账号删除成功: ${sessionId}`);
      res.json({ ok: true, message: "账号删除成功" });
    } else {
      console.log(`❌ [Sessions API] 账号删除失败: ${sessionId}`);
      res.status(500).json({ ok: false, error: "账号删除失败" });
    }
  } catch (error: any) {
    console.error(`❌ [Sessions API] 删除账号异常:`, error);
    res.status(500).json({ 
      ok: false, 
      error: error.message || "删除账号失败" 
    });
  }
  
  // 如果都找不到
  res.status(404).json({ ok: false, error: "Session not found" });
}) as any);

export default r;