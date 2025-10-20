import { Router, Response } from "express";
import { requireAdmin, AuthenticatedRequest } from "../middleware/requireAdmin";
import { tgStartQr, tgPoll, tgPhoneStart, tgPhoneVerify, getConnectedTgSessions } from "../services/tg.service";
import { requireAuth } from "@/middleware/requireAuth";

const r = Router();

// @ts-ignore
r.post("/qr/start", requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    console.log("📱 请求Telegram QR登录");
    const result = await tgStartQr();
    res.json({ 
      ok: true, 
      loginKey: result.loginKey, 
      qrPayload: result.qrPayload,
      qrImage: result.qrImage  // 新增：后端生成的QR图片
    });
  } catch (error: any) {
    console.error("❌ Telegram QR启动失败:", error);
    res.status(500).json({ 
      ok: false, 
      code: "INTERNAL_ERROR", 
      message: error.message || "启动Telegram二维码登录失败" 
    });
  }
});

// @ts-ignore
r.get("/qr/poll", requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const loginKey = String(req.query.loginKey || "");
    console.log(`🔍 轮询Telegram QR状态: ${loginKey}`);
    
    const result = await tgPoll(loginKey);
    
    if (result.ok) {
      console.log(`✅ Telegram QR登录成功: ${loginKey}`);
      res.json({ ok: true });
    } else if (result.error) {
      console.log(`❌ Telegram QR轮询错误: ${loginKey} - ${result.error}`);
      res.json({ error: result.error, message: result.message });
    } else {
      res.json({ pending: true });
    }
  } catch (error: any) {
    console.error("❌ Telegram QR轮询异常:", error);
    res.status(500).json({ 
      ok: false, 
      code: "TG_QR_TIMEOUT", 
      message: error.message || "Telegram二维码轮询失败" 
    });
  }
});

// @ts-ignore
r.post("/phone/start", requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const phone = String(req.body.phone);
    console.log(`📱 请求Telegram手机号登录: ${phone}`);
    
    const result = await tgPhoneStart(phone);
    res.json({ ok: true, txId: result.txId });
  } catch (error: any) {
    console.error("❌ Telegram手机号启动失败:", error);
    res.status(500).json({ 
      ok: false, 
      code: "INTERNAL_ERROR", 
      message: error.message || "启动Telegram手机号登录失败" 
    });
  }
});

// @ts-ignore
r.post("/phone/verify", requireAuth, async (req, res) => {
  try {
    const { txId, code, password, workspaceId, brandId, description, name } = req.body;
    const currentUserId = req.user?.userId;
    if (!currentUserId) {
        return res.status(400).json({ ok: false, message: "Missing userId" });
    }
    console.log(`🔍 验证Telegram手机号: ${txId}`);
    
    const result = await tgPhoneVerify(
      String(txId),
      String(code),
      password ? String(password) : undefined,
      workspaceId ? Number(workspaceId) : undefined,
      brandId ? Number(brandId) : undefined,
      description ? String(description) : undefined,
      name ? String(name) : undefined,
      currentUserId
    );

    // ✅ result 已经包含 ok, message, warning
    console.log(`✅ Telegram账号验证并保存完成: ${txId}`);
    return res.status(200).json({
      ok: true,
      message: result?.message || "Telegram账号验证成功",
      warning: !!result?.warning,
    });
  } catch (error: any) {
    console.error("❌ Telegram手机号验证失败:", error);
    
    let errorCode = "INTERNAL_ERROR";
    if (error.message === "TG_2FA_REQUIRED") {
      errorCode = "TG_2FA_REQUIRED";
    } else if (error.message === "TG_PASSWORD_INVALID") {
      errorCode = "TG_PASSWORD_INVALID";
    } else if (error.message === "TG_SIGNUP_REQUIRED") {
      errorCode = "TG_SIGNUP_REQUIRED";
    } else if (error.message === "TX_NOT_FOUND") {
      errorCode = "SESSION_NOT_FOUND";
    } else if (String(error).includes("PHONE_CODE_INVALID")) {
      errorCode = "TG_CODE_INVALID";
    }
    
    res.status(400).json({ 
      ok: false, 
      code: errorCode, 
      message: error.message || "验证Telegram手机号失败" 
    });
  }
});

// 调试路由：获取已连接的sessions
// @ts-ignore
r.get("/sessions", requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const sessions = getConnectedTgSessions();
    res.json({ sessions });
  } catch (error: any) {
    console.error("❌ 获取Telegram sessions失败:", error);
    res.status(500).json({ 
      ok: false, 
      message: error.message || "获取sessions失败" 
    });
  }
});

export default r;