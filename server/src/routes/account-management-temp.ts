import { Router } from "express";
import path from "path";
import fs from "fs";
import { WhatsAppSessionsStore } from "../stores/whatsapp-sessions.store";
import { TelegramSessionsStore } from "../stores/telegram-sessions.store";
import { DatabaseService } from "../database/database.service";
import { getConnectedWaSessions, getWaClient, manualCleanupSession } from "../services/wa-simple-final.service";
import * as AccountManagementService from '../services/account-management.service';
import { sessionStateService } from '../services/session-state.service';
import { requireAuth } from "@/middleware/requireAuth";
import { accountDatabaseService } from "@/database/account.database.service";
import { databaseService } from "../database/database.service";
import { Workspace, Account } from "@/types/chat.types";

const r = Router();

// 🔄 重试删除文件夹函数（处理Windows文件锁问题）
async function retryDeleteFolder(folderPath: string, maxRetries: number = 5, delay: number = 2000): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🗑️ 尝试删除文件夹 (第${attempt}次): ${folderPath}`);
      fs.rmSync(folderPath, { 
        recursive: true, 
        force: true,
        maxRetries: 3,
        retryDelay: 500
      });
      console.log(`✅ 文件夹删除成功: ${folderPath}`);
      return;
    } catch (error: any) {
      console.log(`⚠️ 第${attempt}次删除失败: ${error.message} (${error.code})`);
      
      if (attempt === maxRetries) {
        throw error; // 最后一次尝试失败，抛出错误
      }
      
      // 等待后重试
      console.log(`⏳ 等待 ${delay}ms 后重试...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// 🔄 重试删除文件函数
async function retryDeleteFile(filePath: string, maxRetries: number = 3, delay: number = 1000): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🗑️ 尝试删除文件 (第${attempt}次): ${filePath}`);
      fs.unlinkSync(filePath);
      console.log(`✅ 文件删除成功: ${filePath}`);
      return;
    } catch (error: any) {
      console.log(`⚠️ 第${attempt}次删除失败: ${error.message} (${error.code})`);
      
      if (attempt === maxRetries) {
        throw error; // 最后一次尝试失败，抛出错误
      }
      
      // 等待后重试
      console.log(`⏳ 等待 ${delay}ms 后重试...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// 🔒 手机号脱敏函数
function maskPhoneNumber(phone: string, isAdmin: boolean = false): string {
  if (!phone) return "";
  if (isAdmin) return phone; // admin账号不脱敏
  
  // 脱敏逻辑：保留前3位和后2位，中间用*替换
  if (phone.startsWith('+')) {
    const cleanPhone = phone.substring(1); // 去掉+号
    if (cleanPhone.length > 5) {
      const prefix = cleanPhone.substring(0, 3);
      const suffix = cleanPhone.substring(cleanPhone.length - 2);
      const masked = prefix + '*'.repeat(cleanPhone.length - 5) + suffix;
      return `+${masked}`;
    }
  } else {
    if (phone.length > 5) {
      const prefix = phone.substring(0, 3);
      const suffix = phone.substring(phone.length - 2);
      const masked = prefix + '*'.repeat(phone.length - 5) + suffix;
      return masked;
    }
  }
  
  return phone; // 如果号码太短，不脱敏
}

// 🔍 获取WhatsApp账号真实信息的辅助函数
async function getWhatsAppAccountInfo(sessionId: string): Promise<{displayName: string, phoneNumber: string, pushname?: string}> {
  try {
    console.log(`🔍 尝试获取WhatsApp账号真实信息: ${sessionId}`);
    
    // 🔑 直接访问WhatsApp客户端获取真实用户信息
    const client = getWaClient(sessionId);
    if (client) {
      console.log(`📱 找到WhatsApp客户端: ${sessionId}`);
      
      try {
        // 获取用户的完整信息
        const me = await client.getMe();
        console.log(`🔍 WhatsApp getMe()完整结果:`, JSON.stringify(me, null, 2));
        
        let phoneNumber = "";
        let pushname = "";
        let displayName = "";
        
        // 获取手机号 - 根据实际日志结构调整
        if (me && me.me && me.me.user) {
          phoneNumber = me.me.user;
          console.log(`📱 从me.me.user获取手机号: ${phoneNumber}`);
        } else if (me && me.id && me.id._serialized) {
          phoneNumber = me.id._serialized.split('@')[0];
          console.log(`📱 从me.id._serialized获取手机号: ${phoneNumber}`);
        } else if (me && me._serialized) {
          phoneNumber = me._serialized.split('@')[0];
          console.log(`📱 从me._serialized获取手机号: ${phoneNumber}`);
        }
        
        // 🔍 获取pushname（用户的显示名称）
        if (me && me.pushname) {
          pushname = me.pushname;
          displayName = pushname;
          console.log(`📱 获取到pushname: ${pushname}`);
        } else if (me && me.name) {
          pushname = me.name;
          displayName = pushname;
          console.log(`📱 获取到name: ${pushname}`);
        } else {
          // 尝试其他方法获取用户信息
          try {
            const hostInfo = await client.getHostNumber();
            console.log(`🔍 getHostNumber结果:`, hostInfo);
          } catch (hostError: any) {
            console.log(`⚠️ getHostNumber失败:`, hostError.message);
          }
          
          // 如果没有pushname，使用手机号
          if (phoneNumber) {
            displayName = `WhatsApp +${phoneNumber}`;
          } else {
            displayName = `WhatsApp ${sessionId.slice(-8)}`;
          }
        }
        
        console.log(`📱 最终WhatsApp信息: 显示名称=${displayName}, 手机号=${phoneNumber}, pushname=${pushname}`);
        return { displayName, phoneNumber, pushname };
        
      } catch (clientError: any) {
        console.log(`⚠️ 从WhatsApp客户端获取信息失败:`, clientError.message);
      }
    } else {
      console.log(`⚠️ 未找到WhatsApp客户端: ${sessionId}`);
    }
    
    // Fallback逻辑
    const phoneMatch = sessionId.match(/(\d{10,15})/);
    if (phoneMatch) {
      const phoneNumber = phoneMatch[1];
      console.log(`📱 Fallback: 从sessionId提取手机号: ${phoneNumber}`);
      return {
        displayName: `WhatsApp +${phoneNumber}`,
        phoneNumber: phoneNumber
      };
    }
    
    return {
      displayName: `WhatsApp ${sessionId.slice(-8)}`,
      phoneNumber: ""
    };
  } catch (error) {
    console.log(`⚠️ 获取WhatsApp用户信息失败:`, error);
    return {
      displayName: `WhatsApp ${sessionId.slice(-8)}`,
      phoneNumber: ""
    };
  }
}

// 简化版获取所有账号
// r.get("/accounts", (req, res) => {
//   try {
//     // TODO: 从请求中获取用户权限，现在暂时假设是admin
//     const isAdmin = true; // 临时设置，实际应该从req.user或token中获取
    
//     // 合并WhatsApp和Telegram sessions
//     const whatsappSessions = WhatsAppSessionsStore.list().map(x => {
//       console.log(`📋 WhatsApp session数据:`, x);
      
//       const phoneNumber = x.data?.phoneNumber || "";
//       const maskedPhone = maskPhoneNumber(phoneNumber, isAdmin);
      
//       return {
//         id: x.id, 
//         provider: x.provider, 
//         displayName: x.label || `WhatsApp ${x.id}`,
//         description: x.description || "", 
//         platform: x.provider,
//         status: "connected",
//         isActive: x.data?.isActive !== false, // 从data中读取isActive状态，默认为true
//         lastSeen: "刚刚",
//         messageCount: 0,
//         phoneNumber: maskedPhone, // 脱敏后的手机号
//         createdAt: new Date(x.createdAt).toISOString(),
//         // 添加原始数据用于调试
//         _rawLabel: x.label,
//         _rawDescription: x.description,
//         _rawPhoneNumber: phoneNumber, // 原始手机号（调试用）
//         _rawData: x.data
//       };
//     });
    
//     const telegramSessions = TelegramSessionsStore.list().map(x => {
//       console.log(`📋 Telegram session数据:`, x);
      
//       const phoneNumber = x.data?.phone || "";
//       const username = x.data?.username || "";
//       const maskedPhone = maskPhoneNumber(phoneNumber, isAdmin);
      
//       return {
//         id: x.id, 
//         provider: x.provider, 
//         displayName: x.label || `Telegram ${x.id}`,
//         description: x.description || "", 
//         platform: x.provider,
//         status: "connected",
//         isActive: x.data?.isActive !== false, // 从data中读取isActive状态，默认为true
//         lastSeen: "刚刚",
//         messageCount: 0,
//         phoneNumber: maskedPhone, // 脱敏后的手机号
//         username: username, // Telegram用户名
//         createdAt: new Date(x.createdAt).toISOString(),
//         // 添加原始数据用于调试
//         _rawLabel: x.label,
//         _rawDescription: x.description,
//         _rawPhoneNumber: phoneNumber, // 原始手机号（调试用）
//         _rawUsername: username,
//         _rawData: x.data
//       };
//     });
    
//     const allSessions = [...whatsappSessions, ...telegramSessions];
//     console.log(`📋 返回 ${allSessions.length} 个账号 (${whatsappSessions.length} WhatsApp + ${telegramSessions.length} Telegram)`);
//     res.json({ data: allSessions });
//   } catch (error: any) {
//     console.error("❌ 获取账号失败:", error);
//     res.status(500).json({ error: error.message });
//   }
// });

r.get("/accounts", requireAuth, async (req, res) => {
  try {
    const isAdmin = true; // TODO: 从 token / req.user 判断
    const userId = req.user.userId 
    const roleId = req.user.role_id;

    const managerWorkspaces: Workspace[] = await accountDatabaseService.findByManagerId(userId);
    let memberWorkspaces: Workspace[] = await accountDatabaseService.findByUserId(userId);
    
    // Ensure it's an array
    if (!Array.isArray(memberWorkspaces)) {
      memberWorkspaces = memberWorkspaces ? [memberWorkspaces] : [];
    }

    // Combine & deduplicate workspace IDs
    const workspaceIds: number[] = [
      ...new Set([
        ...(managerWorkspaces || []).map(w => Number(w.id)),
        ...(memberWorkspaces || []).map(w => Number(w.id)),
      ]),
    ];
 

    console.log(`📋 用户 ${userId} 属于工作区: [${workspaceIds.join(", ")}]`);

    // --- Step 2: Fetch all account records ---
    //const dbAccounts = await accountDatabaseService.getAccountsByWorkspace(workspaceIds);

    const safeWorkspaceIds = workspaceIds.length > 0 ? workspaceIds : [0];

    console.log("✅ workspaceIds:", safeWorkspaceIds);
    console.log("✅ userId:", userId);


    const dbAccounts: Account[] = await accountDatabaseService.getAccountsByWorkspaceOrCreator(workspaceIds, userId);
    const dbMap = new Map(dbAccounts.map(acc => [acc.session_id, acc]));

    // --- Step 3: Get in-memory session states ---
    const whatsappSessions = WhatsAppSessionsStore.list()
    .filter(x => {
      const wsId = Number(x.data?.workspaceId || 0);
      
      // Include if workspace is in user's workspaces
      if (wsId !== 0 && workspaceIds.includes(wsId)) {
        return true;
      }
      
      // Include if personal account (workspace=0) created by current user
      if (wsId === 0 && x.createdBy === userId) {
        return true;
      }
      
      return false;
    })
    .map(x => {
        const dbData = dbMap.get(x.id);
        const phoneNumber = x.data?.phoneNumber || dbData?.phone_number || "";
        const maskedPhone = maskPhoneNumber(phoneNumber, isAdmin);

        return {
          id: x.id,
          provider: "whatsapp",
          displayName: dbData?.display_name || x.label || `WhatsApp ${x.id}`,
          description: dbData?.description || x.description || "",
          platform: "whatsapp",
          status: x.data?.isActive !== false ? "connected" : "disconnected",
          isActive: dbData?.is_active ?? (x.data?.isActive !== false),
          workspaceId: dbData?.workspace_id || x.data?.workspaceId,
          brandId: dbData?.brand_id || x.data?.brandId,
          lastSeen: new Date().toISOString(),
          phoneNumber: maskedPhone,
          createdAt: dbData?.created_at || new Date(x.createdAt).toISOString(),
        };
      });

    const telegramSessions = TelegramSessionsStore.list()
    .filter(x => {
      const wsId = Number(x.data?.workspace_id || 0);
      
      // Include if workspace is in user's workspaces
      if (wsId !== 0 && workspaceIds.includes(wsId)) {
        return true;
      }
      
      // Include if personal account (workspace=0) created by current user
      if (wsId === 0 && x.createdBy === userId) {
        return true;
      }
      
      return false;
    })
    .map(x => {
        const dbData = dbMap.get(x.id);
        const phoneNumber = x.data?.phone || dbData?.phone_number || "";
        const username = x.data?.username || dbData?.username || "";
        const maskedPhone = maskPhoneNumber(phoneNumber, isAdmin);

        return {
          id: x.id,
          provider: "telegram",
          displayName: dbData?.display_name || x.label || `Telegram ${x.id}`,
          name: dbData?.name || x.data?.name || "",
          description: dbData?.description || x.data?.description || "",
          platform: "telegram",
          status: x.data?.isActive !== false ? "connected" : "disconnected",
          isActive: dbData?.is_active ?? (x.data?.isActive !== false),
          workspaceId: dbData?.workspace_id || x.data?.workspace_id,
          brandId: dbData?.brand_id  || x.data?.brand_id,
          phoneNumber: maskedPhone,
          username,
          createdAt: dbData?.created_at || new Date(x.createdAt).toISOString(),
        };
      });

    const allSessions = [...whatsappSessions, ...telegramSessions];
    console.log(`📋 返回 ${allSessions.length} 个账号`);
    res.json({ data: allSessions });

  } catch (error: any) {
    console.error("❌ 获取账号失败:", error);
    res.status(500).json({ error: error.message });
  }
});

// 删除账号
r.delete('/accounts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`🔍 [API] 收到删除账号请求: ${id}`);
    
    const success = await AccountManagementService.deleteAccount(id);
    
    if (success) {
      console.log(`✅ [API] 账号删除成功: ${id}`);
      res.json({
        ok: true,
        message: '账号删除成功'
      });
    } else {
      res.status(404).json({
        ok: false,
        message: '账号未找到'
      });
    }
  } catch (error: any) {
    console.error('❌ [API] 删除账号失败:', error);
    res.status(500).json({
      ok: false,
      message: '删除账号失败',
      error: error.message
    });
  }
});

// 简化版获取统计
r.get("/stats", requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId
    const roleId = req.user.role_id
    // --- 从数据库获取账号数量 ---
    const statsFromDB = await DatabaseService.getAccountStats(userId,roleId); 
    // { total: number, active: number, whatsapp: number, telegram: number }

    // --- 从内存获取连接数 ---
    const whatsappConnected = statsFromDB.whatsapp;
    const telegramConnected = statsFromDB.telegram;

    const stats = {
      totalAccounts: statsFromDB.total,
      connectedAccounts: statsFromDB.whatsapp + statsFromDB.telegram,
      activeAccounts: statsFromDB.active,
      todayMessages: 0, // TODO: 可从 message log 表统计
      whatsappCount: statsFromDB.whatsapp,
      telegramCount: statsFromDB.telegram,
      whatsappConnected ,
      telegramConnected,
    };

    console.log(`📊 返回统计信息:`, stats);
    res.json({ data: stats });
  } catch (error: any) {
    console.error("❌ 获取统计失败:", error);
    res.status(500).json({ error: error.message });
  }
});

r.post("/accounts/whatsapp", requireAuth, async (req, res) => {
  try {
    const { sessionId, displayName, description, workspaceId, brandId } = req.body;
    console.log(`💾 保存WhatsApp账号到数据库:`, { sessionId, displayName, description, workspaceId, brandId });
    
    // 🆕 新的存储方法：直接在sessions目录下存储
    const sessionsRoot = path.resolve(process.cwd(), "sessions");

    const accountSessionFolder = path.join(sessionsRoot, `WA_Session_${sessionId}`);

    // 🧩 获取 WhatsApp 账号信息（仅在必要时）
    let finalDisplayName = displayName;
    let phoneNumber = "";

    if (!displayName || displayName.trim() === "" || displayName === `WhatsApp ${sessionId}`) {
      try {
        const accountInfo = await getWhatsAppAccountInfo(sessionId);
        finalDisplayName = accountInfo.displayName;
        phoneNumber = accountInfo.phoneNumber;
      } catch (infoErr: any) {
        console.warn("⚠️ 无法获取WhatsApp账号信息:", infoErr?.message);
      }
    }
    const actualSessionId = sessionId.startsWith('_IGNORE_') ? sessionId : `_IGNORE_${sessionId}`;

    // 保存到 WhatsAppSessionsStore
    WhatsAppSessionsStore.add({
      id: actualSessionId,
      //id: sessionId,
      provider: "whatsapp",
      label: finalDisplayName || `WhatsApp ${sessionId}`,
      description: description?.trim() || "",
      data: {
        sessionId: actualSessionId,
        dataDir: sessionsRoot, // sessions根目录
        phoneNumber: phoneNumber, // 保存手机号（不管是否为空）
        pushname: finalDisplayName !== `WhatsApp ${sessionId.slice(-8)}` ? finalDisplayName : undefined,
        workspaceId:Number(workspaceId),
        brandId:Number(brandId),
      },
      createdAt: Date.now(),
      createdBy: req.user.userId
    });

    // 🗄️ 保存到数据库 accounts 表
    try {
      const account = await DatabaseService.createAccount(
        "whatsapp",
        sessionId, // use string sessionId
        displayName,
        description,
        Number(workspaceId),
        Number(brandId),
        "connected",
        true,
        req.user.userId
      );
      console.log(`✅ 已保存到accounts表:`, account);
    } catch (dbErr: any) {
      console.warn("⚠️ 保存到accounts表失败（继续返回成功）:", dbErr?.message);
    }

    let warningMessage = null;
    if (!workspaceId || !brandId) {
      warningMessage = "⚠️ workspaceId 或 brandId 未填写，请稍后在设置中补全。";
      console.warn(warningMessage);
    }    

    console.log(`✅ WhatsApp账号已保存: ${sessionId}`);
    return res.status(200).json({
      ok: true,
      message: warningMessage || "WhatsApp账号保存成功",
      warning: !!warningMessage,
      accountInfo: { displayName: finalDisplayName, phoneNumber },
    });
  } catch (error: any) {
    console.error("❌ 保存WhatsApp账号失败:", error);
    res.status(500).json({
      ok: false,
      message: error.message || "保存WhatsApp账号失败",
    });
  }
});


r.post("/accounts/telegram", async (req, res) => {
  try {
    const { sessionId, displayName, description, workspaceId, brandId } = req.body;
    console.log(`💾 保存Telegram账号:`, { sessionId, displayName, description, workspaceId, brandId });

    // ✅ Check session existence - 尝试多种格式
    let existingSession = TelegramSessionsStore.get(sessionId);
    let actualSessionId = sessionId;
    
    // 如果直接查找失败，尝试添加 tg- 前缀
    if (!existingSession && !sessionId.startsWith('tg-')) {
      actualSessionId = `tg-${sessionId}`;
      existingSession = TelegramSessionsStore.get(actualSessionId);
      console.log(`🔍 尝试使用 tg- 前缀查找会话: ${actualSessionId}`);
    }
    
    // // 如果还是找不到，尝试移除 tg- 前缀
    // if (!existingSession && sessionId.startsWith('tg-')) {
    //   actualSessionId = sessionId.replace('tg-', '');
    //   existingSession = TelegramSessionsStore.get(actualSessionId);
    //   console.log(`🔍 尝试移除 tg- 前缀查找会话: ${actualSessionId}`);
    // }
    
    if (!existingSession) {
      console.log(`❌ Telegram会话不存在: ${sessionId}`);
      console.log(`🔍 可用的Telegram会话:`, TelegramSessionsStore.list().map(s => s.id));
      return res.status(404).json({
        ok: false,
        message: "Telegram会话不存在，请先完成连接",
      });
    }
    
    console.log(`✅ 找到Telegram会话: ${actualSessionId}`);

    // 🧩 Determine display name and additional info
    let finalDisplayName = displayName;
    let extractedPhone = "";
    let extractedUsername = "";

    if (!displayName || displayName.trim() === "" || displayName.includes(`Telegram ${sessionId}`)) {
      console.log(`🔍 使用已存储的Telegram账号真实信息: ${sessionId}`);

      if (existingSession.data.firstName) {
        finalDisplayName = existingSession.data.lastName
          ? `${existingSession.data.firstName} ${existingSession.data.lastName}`
          : existingSession.data.firstName;
        console.log(`📱 使用已保存的真实姓名: ${finalDisplayName}`);
      } else if (existingSession.data.username) {
        finalDisplayName = existingSession.data.username;
        console.log(`📱 使用已保存的用户名: ${finalDisplayName}`);
      } else {
        finalDisplayName = existingSession.label || `Telegram ${sessionId}`;
        console.log(`📱 使用现有label: ${finalDisplayName}`);
      }

      extractedPhone = existingSession.data.phone || "";
      extractedUsername = existingSession.data.username || "";
    }

    // 🧱 Update Telegram session label + description
    // TelegramSessionsStore.update(actualSessionId, {
    //   label: finalDisplayName,
    //   description: description?.trim() || "",
    // });

    // 🗄️ 保存到数据库 accounts 表
    try {
      const account = await DatabaseService.createAccount(
        "telegram",
        sessionId, // use string sessionId
        displayName,
        description,
        Number(workspaceId),
        Number(brandId),
        "connected",
        true,
        req.user.userId
      );
      console.log(`✅ 已保存到accounts表:`, account);
    } catch (dbErr: any) {
      console.warn("⚠️ 保存到accounts表失败（继续返回成功）:", dbErr?.message);
    }
    
    let warningMessage = null;
    if (!workspaceId || !brandId) {
      warningMessage = "⚠️ workspaceId 或 brandId 未填写，请稍后在设置中补全。";
      console.warn(warningMessage);
    }  
    console.log(`✅ Telegram账号已保存: ${sessionId} (${finalDisplayName})`);
    res.json({
      ok: true,
      message: "Telegram账号保存成功",
      accountInfo: {
        displayName: finalDisplayName,
        phoneNumber: extractedPhone,
        username: extractedUsername,
      },
    });
  } catch (error: any) {
    console.error("❌ 保存Telegram账号失败:", error);
    res.status(500).json({ ok: false, message: error.message });
  }
});


r.delete("/accounts/:id", async (req, res) => {
  try {
    const sessionId = req.params.id;
    console.log(`🗑️ 删除账号: ${sessionId}`);

    let provider: "whatsapp" | "telegram" | null = null;
    let deletedFolder: string | null = null;

    const actualSessionId = sessionId.startsWith("_IGNORE_")
      ? sessionId
      : `_IGNORE_${sessionId}`;

    // ===== 1️⃣ WhatsApp 删除逻辑 =====
    const whatsappSession = WhatsAppSessionsStore.get(sessionId);
    if (whatsappSession) {
      provider = "whatsapp";
      console.log(`🔍 找到WhatsApp账号: ${sessionId}`);

      // 清理 WhatsApp 客户端
      try {
        const { cleanupWaClient } = await import(
          "../services/wa-simple-final.service"
        );
        console.log(`🔌 清理WhatsApp客户端: ${sessionId}`);
        cleanupWaClient(sessionId);
      } catch (clientError: any) {
        console.warn(`⚠️ 清理WhatsApp客户端失败: ${clientError.message}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));

      // 3️⃣ 删除IGNORE文件夹和相关的data.json文件（新存储方法）
      let ignoreFolder = "";
      try {
        const sessionsRoot = whatsappSession.data?.dataDir;
        if (sessionsRoot && fs.existsSync(sessionsRoot)) {
          console.log(`🗂️ 准备删除WhatsApp会话文件: ${sessionsRoot}`);

          // 删除IGNORE文件夹 - 使用增强的重试机制
          ignoreFolder = path.join(sessionsRoot, sessionId);
          if (fs.existsSync(ignoreFolder)) {
            console.log(`🗑️ 删除IGNORE文件夹: ${ignoreFolder}`);

            // 使用递归重试删除函数
            await retryDeleteFolder(ignoreFolder, 5, 2000);
            console.log(`✅ IGNORE文件夹已删除: ${ignoreFolder}`);
          } else {
            console.log(`⚠️ IGNORE文件夹不存在: ${ignoreFolder}`);
          }

          // 删除对应的data.json文件
          const cleanSessionId = sessionId.replace("_IGNORE_", "");
          const dataFile = path.join(
            sessionsRoot,
            `${cleanSessionId}.data.json`
          );
          if (fs.existsSync(dataFile)) {
            console.log(`🗑️ 删除数据文件: ${dataFile}`);
            await retryDeleteFile(dataFile, 3, 1000);
            console.log(`✅ 数据文件已删除: ${dataFile}`);
          } else {
            console.log(`⚠️ 数据文件不存在: ${dataFile}`);
          }
        } else {
          console.log(`⚠️ sessions目录不存在: ${sessionsRoot}`);
        }
      } catch (fileError: any) {
        console.error(`❌ 删除WhatsApp会话文件失败: ${fileError.message}`);
        console.error(`   错误代码: ${fileError.code}`);
        if (fileError.code === "EBUSY" || fileError.code === "EPERM") {
          console.error(
            `   ⚠️ 文件被占用（Windows文件锁），建议重启服务器后删除`
          );
          console.error(`   📁 无法删除的文件夹: ${ignoreFolder}`);
        }
      }

      // 删除会话文件夹
      const sessionFolder = whatsappSession.data?.dataDir;
      if (sessionFolder && fs.existsSync(sessionFolder)) {
        try {
          console.log(`🗂️ 删除文件夹: ${sessionFolder}`);
          fs.rmSync(sessionFolder, {
            recursive: true,
            force: true,
            maxRetries: 5,
            retryDelay: 1000,
          });
          deletedFolder = sessionFolder;
          console.log(`✅ 会话文件夹已删除`);
        } catch (folderError: any) {
          console.error(`❌ 删除文件夹失败: ${folderError.message}`);
        }
      }

      // 从store删除
      WhatsAppSessionsStore.remove(sessionId);
      console.log(`✅ WhatsApp账号已从内存删除`);
    }

    // ===== 2️⃣ Telegram 删除逻辑 =====
    const telegramSession = TelegramSessionsStore.get(sessionId);
    if (telegramSession) {
      provider = "telegram";
      console.log(`🔍 找到Telegram账号: ${sessionId}`);

      TelegramSessionsStore.remove(sessionId);
      console.log(`✅ Telegram账号已从内存删除`);
    }

    // ===== 3️⃣ 没找到任何账号 =====
    if (!provider) {
      console.log(`❌ 未找到账号: ${sessionId}`);
      return res.status(404).json({ ok: false, message: "账号不存在" });
    }

    // ===== 4️⃣ 数据库删除 =====
    try {
      const result = await DatabaseService.deleteAccountBySessionId(sessionId);
      console.log(`🗄️ 数据库账号已删除: ${result?.id || sessionId}`);
    } catch (dbErr: any) {
      console.warn(`⚠️ 数据库删除失败（忽略错误）: ${dbErr.message}`);
    }

    res.json({
      ok: true,
      provider,
      message: `${provider} account deleted successfully`,
      deletedFolder,
    });
  } catch (error: any) {
    console.error(`❌ 删除账号失败: ${req.params.id}`, error);
    res.status(500).json({ ok: false, message: error.message });
  }
});


r.put("/accounts/:id/info", async (req, res) => {
  try {
    const { displayName, description, workspaceId, brandId } = req.body;
    const accountId = req.params.id;

    console.log("📝 更新账号信息请求:", { accountId, displayName, description, workspaceId, brandId });

    let provider: "whatsapp" | "telegram" | null = null;

    // 1️⃣ 更新 WhatsApp 存储
    const whatsappSession = WhatsAppSessionsStore.get(accountId);
    if (whatsappSession) {
      const success = WhatsAppSessionsStore.update(accountId, {
        label: displayName?.trim() || whatsappSession.label,
        description: description?.trim() || whatsappSession.description || "",
        data: {
          ...whatsappSession.data,
          workspaceId: workspaceId ? Number(workspaceId) : whatsappSession.data.workspaceId,
          brandId: brandId ? Number(brandId) : whatsappSession.data.brandId,
        },
      });

      if (!success) throw new Error("更新 WhatsApp 账号信息失败");
      provider = "whatsapp";
    }

    // 2️⃣ 更新 Telegram 存储
    const telegramSession = TelegramSessionsStore.get(accountId);
    if (telegramSession) {
      const success = TelegramSessionsStore.update(accountId, {
        label: displayName?.trim() || telegramSession.label,
        data: {
          ...telegramSession.data,
          description: description?.trim() || telegramSession.data.description || "",
          workspace_id: workspaceId ? Number(workspaceId) : telegramSession.data.workspace_id,
          brand_id: brandId ? Number(brandId) : telegramSession.data.brand_id,
        },
      });

      if (!success) throw new Error("更新 Telegram 账号信息失败");
      provider = "telegram";
    }

    if (!provider) {
      console.warn(`❌ 未找到账号: ${accountId}`);
      return res.status(404).json({ ok: false, message: "账号不存在" });
    }

    // 3️⃣ 数据库同步更新
    try {
      const updated = await DatabaseService.updateAccountInfoBySessionId(accountId, {
        name: displayName?.trim(),
        description: description?.trim(),
        workspaceId: workspaceId ? Number(workspaceId) : null,
        brandId: brandId ? Number(brandId) : null,
      });
      console.log("🗄️ 数据库账号信息已更新:", updated);
    } catch (dbErr: any) {
      console.warn("⚠️ 数据库更新失败（忽略错误）:", dbErr.message);
    }

    // ✅ 成功响应
    res.json({
      ok: true,
      message: `${provider} 账号信息更新成功`,
    });
  } catch (error: any) {
    console.error("❌ 更新账号信息失败:", error);
    res.status(500).json({ ok: false, message: error.message });
  }
});


// 切换账号启用状态
r.put("/accounts/:id/toggle", async (req, res) => {
  try {
    const { isActive } = req.body;
    const accountId = req.params.id;

    console.log(`🔄 切换账号状态: ${accountId} -> ${isActive ? "启用" : "禁用"}`);

    try {
      // DatabaseService.setAccountActiveStatus(accountId, isActive) 是你要在 DatabaseService 中实现的
      await DatabaseService.setAccountActiveStatus(accountId, isActive);
      console.log(`💾 数据库账号状态已更新: ${accountId} -> ${isActive ? "启用" : "禁用"}`);
    } catch (dbErr: any) {
      console.warn(`⚠️ 更新数据库账号状态失败: ${dbErr.message}`);
    }

    // --- Step 1: 更新内存中的会话状态 ---
    let platform: string | null = null;

    const whatsappSession = WhatsAppSessionsStore.get(accountId);
    const telegramSession = TelegramSessionsStore.get(accountId);

    if (whatsappSession) {
      const success = WhatsAppSessionsStore.update(accountId, {
        data: { ...whatsappSession.data, isActive },
      });

      if (!success) {
        return res.status(500).json({ ok: false, message: "更新WhatsApp账号状态失败" });
      }

      platform = "whatsapp";
      console.log(`✅ WhatsApp账号状态切换成功: ${accountId} -> ${isActive ? "启用" : "禁用"}`);
    } 
    else if (telegramSession) {
      const success = TelegramSessionsStore.update(accountId, {
        data: { ...telegramSession.data, isActive },
      });

      if (!success) {
        return res.status(500).json({ ok: false, message: "更新Telegram账号状态失败" });
      }

      platform = "telegram";
      console.log(`✅ Telegram账号状态切换成功: ${accountId} -> ${isActive ? "启用" : "禁用"}`);
    } 
    else {
      console.log(`❌ 账号不存在: ${accountId}`);
      return res.status(404).json({ ok: false, message: "账号不存在" });
    }

    // --- Step 3: 返回响应 ---
    res.json({
      ok: true,
      data: { 
        id: accountId,
        isActive,
        platform,
      },
    });
  } catch (error: any) {
    console.error("❌ 切换账号状态失败:", error);
    res.status(500).json({
      ok: false,
      message: error.message || "切换账号状态失败",
    });
  }
});


// 手动清理废弃的WhatsApp会话
r.post("/wa/cleanup/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    console.log(`🧹 手动清理WhatsApp会话: ${sessionId}`);
    
    manualCleanupSession(sessionId);
    
    res.json({ 
      ok: true, 
      message: `会话 ${sessionId} 已清理` 
    });
  } catch (error: any) {
    console.error("❌ 手动清理会话失败:", error);
    res.status(500).json({ 
      ok: false, 
      message: error.message || "清理会话失败" 
    });
  }
});

export default r;
