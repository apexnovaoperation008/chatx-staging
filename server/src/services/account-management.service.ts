import { WhatsAppSessionsStore, WhatsAppSessRow } from "../stores/whatsapp-sessions.store";
import { TelegramSessionsStore, TelegramSessRow } from "../stores/telegram-sessions.store";
import { getConnectedWaSessions } from "./wa-simple-final.service";
import { getConnectedTgSessions } from "./tg.service";
import { sessionStateService, SessionData } from './session-state.service';
import { databaseService, DatabaseService } from "../database/database.service";
import path from "path";
import fs from "fs";

// 通用的会话行类型
type SessRow = WhatsAppSessRow | TelegramSessRow;

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

export interface AccountInfo {
  id: string;
  platform: "whatsapp" | "telegram";
  displayName: string;
  phoneNumber?: string;
  username?: string;
  name?:string;
  status: "connected" | "disconnected" | "error";
  isActive: boolean;
  lastSeen: string;
  messageCount: number;
  createdAt: string;
  description?: string;
}

export interface AccountStats {
  totalAccounts: number;
  connectedAccounts: number;
  activeAccounts: number;
  todayMessages: number;
  whatsappCount: number;
  telegramCount: number;
  whatsappConnected: number;
  telegramConnected: number;
}

// 从session数据提取账号信息
function extractAccountInfo(session: SessionData): AccountInfo {
  // 解析存储的账号信息（如果有的话）
  let displayName = session.label || `${session.provider} Account`;
  let description: string | undefined;
  
  // 这部分逻辑已移到具体的provider处理中
  
  const baseInfo: AccountInfo = {
    id: session.id,
    platform: session.provider as "whatsapp" | "telegram",
    displayName,
    description,
    status: session.data?.isActive !== false ? "connected" : "disconnected", // 根据isActive状态设置status
    isActive: session.data?.isActive !== undefined ? session.data.isActive : true, // 从session.data读取isActive状态
    lastSeen: "刚刚", // 临时值，未来通过API获取
    messageCount: 0, // 临时值，未来通过API获取
    createdAt: new Date(session.createdAt).toISOString(),
  };

  if (session.provider === "whatsapp") {
    // WhatsApp账号信息提取
    const waSession = session as WhatsAppSessRow;
    
    // 从ID中提取手机号（如果可能）
    const phoneMatch = waSession.id.match(/(\d{10,15})/);
    if (phoneMatch) {
      baseInfo.phoneNumber = phoneMatch[1];
      baseInfo.displayName = waSession.label || `WhatsApp ${phoneMatch[1]}`;
    }
    
    // 检查WhatsApp连接状态
    try {
      const connectedSessions = getConnectedWaSessions();
      const isConnected = connectedSessions.some(s => s.sessionId === session.id);
      baseInfo.status = isConnected ? "connected" : "disconnected";
    } catch (error) {
      baseInfo.status = "error";
    }
    
  } else if (session.provider === "telegram") {
    // Telegram账号信息提取
    const tgSession = session as TelegramSessRow;
    
    if (tgSession.data.phone) {
      baseInfo.phoneNumber = tgSession.data.phone;
      baseInfo.displayName = tgSession.label || `Telegram ${tgSession.data.phone}`;
    } else {
      // 从label中提取信息
      const phoneMatch = tgSession.label?.match(/(\+\d{10,15})/);
      if (phoneMatch) {
        baseInfo.phoneNumber = phoneMatch[1];
        baseInfo.displayName = tgSession.label || `Telegram ${phoneMatch[1]}`;
      } else {
        baseInfo.username = tgSession.label?.replace("Telegram ", "") || "Unknown";
      }
    }
    
    // 检查Telegram连接状态
    try {
      const connectedSessions = getConnectedTgSessions();
      const isConnected = connectedSessions.some(s => s.id === session.id);
      baseInfo.status = isConnected ? "connected" : "disconnected";
    } catch (error) {
      baseInfo.status = "error";
    }
  }

  return baseInfo;
}

// 获取所有账号
export function getAllAccounts(): AccountInfo[] {
  try {
    // 从sessionStateService获取所有会话数据（包含最新的isActive状态）
    const allSessionIds = sessionStateService.getAllSessions();
    const whatsappSessions = WhatsAppSessionsStore.list();
    const telegramSessions = TelegramSessionsStore.list();
    const uniqueSessionIds = new Set(allSessionIds);
    if (allSessionIds.length !== uniqueSessionIds.size) {
      console.warn(`⚠️ 发现重复的session ID，可能存在数据不一致问题`);
      const duplicates = allSessionIds.filter((id, index) => allSessionIds.indexOf(id) !== index);
      console.warn(`⚠️ 重复的session IDs:`, [...new Set(duplicates)]);
    }

    const allSessions = [...whatsappSessions, ...telegramSessions];
    console.log(`📋 从sessionStateService获取到 ${allSessions.length} 个会话`);
    
    // 打印每个session的详细信息
    allSessions.forEach(session => {
      console.log(`📋 Session: ${session.id} - ${session.provider} - ${session.label} - isActive: ${session.data.isActive}`);
    });

    const accounts = allSessions.map(session => extractAccountInfo({
      ...session,
      label: session.label || `${session.provider} Account`,
      data: {
        ...session.data,
        isActive: session.data.isActive ?? true
      }
    }));

    console.log(`📋 转换为 ${accounts.length} 个账号信息`);

    // 检查是否有重复的账号ID（跨平台）
    const accountIds = accounts.map(a => `${a.platform}-${a.id}`);
    const uniqueAccountIds = new Set(accountIds);
    if (accountIds.length !== uniqueAccountIds.size) {
      console.error(`❌ 发现重复的账号ID，可能存在严重的数据不一致问题`);
      const duplicates = accountIds.filter((id, index) => accountIds.indexOf(id) !== index);
      console.error(`❌ 重复的账号IDs:`, [...new Set(duplicates)]);
    }

    // 打印每个账号的详细信息
    accounts.forEach(account => {
      console.log(`📋 账号: ${account.id} - ${account.platform} - ${account.displayName} - ${account.phoneNumber || 'no phone'}`);
    });

    return accounts;
  } catch (error) {
    console.error("❌ 获取账号列表失败:", error);
    return [];
  }
}

// 获取账号统计
export function getAccountStats(): AccountStats {
  try {
    const accounts = getAllAccounts();
    
    const whatsappAccounts = accounts.filter(acc => acc.platform === "whatsapp");
    const telegramAccounts = accounts.filter(acc => acc.platform === "telegram");
    
    const connectedAccounts = accounts.filter(acc => acc.status === "connected");
    const activeAccounts = accounts.filter(acc => acc.isActive);
    
    const stats: AccountStats = {
      totalAccounts: accounts.length,
      connectedAccounts: connectedAccounts.length,
      activeAccounts: activeAccounts.length,
      todayMessages: 0, // 临时值，未来通过消息API计算
      whatsappCount: whatsappAccounts.length,
      telegramCount: telegramAccounts.length,
      whatsappConnected: whatsappAccounts.filter(acc => acc.status === "connected").length,
      telegramConnected: telegramAccounts.filter(acc => acc.status === "connected").length,
    };
    
    console.log(`📊 账号统计:`, stats);
    return stats;
  } catch (error) {
    console.error("❌ 获取账号统计失败:", error);
    return {
      totalAccounts: 0,
      connectedAccounts: 0,
      activeAccounts: 0,
      todayMessages: 0,
      whatsappCount: 0,
      telegramCount: 0,
      whatsappConnected: 0,
      telegramConnected: 0,
    };
  }
}

// 删除账号
// Delete account
export async function deleteAccount(accountId: string): Promise<boolean> {
  try {
    console.log(`🗑️ Deleting account: ${accountId}`);

    // --- WhatsApp deletion ---
    const whatsappSession = WhatsAppSessionsStore.get(accountId);
    if (whatsappSession) {
      const { cleanupWaClient } = await import("./wa-simple-final.service");

      console.log(`🔌 Cleaning WhatsApp client: ${accountId}`);
      cleanupWaClient(accountId);

      // Give time for process to fully release resources
      await new Promise(resolve => setTimeout(resolve, 2000));

      WhatsAppSessionsStore.remove(accountId);
      sessionStateService.removeSession(accountId);

      // Remove session files
      try {
        const sessionsRoot = whatsappSession.data.dataDir;
        if (sessionsRoot && fs.existsSync(sessionsRoot)) {
          const ignoreFolder = path.join(sessionsRoot, accountId);
          if (fs.existsSync(ignoreFolder)) {
            await retryDeleteFolder(ignoreFolder, 5, 2000);
            console.log(`✅ Deleted IGNORE folder: ${ignoreFolder}`);
          }

          const dataFile = path.join(sessionsRoot, `${accountId.replace('_IGNORE_', '')}.data.json`);
          if (fs.existsSync(dataFile)) {
            await retryDeleteFile(dataFile, 3, 1000);
            console.log(`✅ Deleted session data file: ${dataFile}`);
          }
        }
      } catch (err: any) {
        console.warn(`⚠️ Failed to delete WhatsApp session files: ${err.message}`);
      }

      await DatabaseService.deleteAccountBySessionId(accountId);
      console.log(`✅ WhatsApp account fully deleted: ${accountId}`);
      return true;
    }

    // --- Telegram deletion ---
    const telegramSession = TelegramSessionsStore.get(accountId);
    if (telegramSession) {
      TelegramSessionsStore.remove(accountId);
      sessionStateService.removeSession(accountId);

      await DatabaseService.deleteAccountBySessionId(accountId);
      console.log(`✅ Telegram account fully deleted: ${accountId}`);
      return true;
    }

    console.log(`❌ Account not found: ${accountId}`);
    return false;

  } catch (error: any) {
    console.error(`❌ Failed to delete account: ${accountId}`, error);
    return false;
  }
}


// 切换账号启用状态
export async function toggleAccountActive(accountId: string, isActive: boolean):Promise<AccountInfo | null> {
  try {
    console.log(`🔄 切换账号状态: ${accountId} -> ${isActive ? "启用" : "禁用"}`);
    
    const accounts = getAllAccounts();
    const account = accounts.find(acc => acc.id === accountId);
    
    if (account) {
      account.isActive = isActive;
      // 如果禁用，状态改为disconnected
      if (!isActive) {
        account.status = "disconnected";
      }
      
      // 更新会话状态服务中的活跃状态
      console.log(`🔍 [AccountManagement] 准备更新会话状态: ${accountId} -> ${isActive}`);
      try {
        const success = sessionStateService.updateSessionActiveStatus(accountId, isActive);
        console.log(`🔍 [AccountManagement] updateSessionActiveStatus 返回: ${success}`);
        
        if (success) {
          console.log(`✅ 账号状态切换成功: ${accountId}`);
          console.log(`✅ ${account.platform === 'whatsapp' ? 'WhatsApp' : 'Telegram'}会话已更新: ${accountId}`);
        } else {
          console.log(`⚠️ 会话状态更新失败: ${accountId}`);
        }
      } catch (error: any) {
        console.error(`❌ [AccountManagement] 更新会话状态时出错:`, error.message);
        console.error(`❌ [AccountManagement] 错误堆栈:`, error.stack);
      }

      // ✅ 更新数据库 accounts 表
      try {
        // DatabaseService.setAccountActiveStatus(accountId, isActive) 是你要在 DatabaseService 中实现的
        await DatabaseService.setAccountActiveStatus(accountId, isActive);
        console.log(`💾 数据库账号状态已更新: ${accountId} -> ${isActive ? "启用" : "禁用"}`);
      } catch (dbErr: any) {
        console.warn(`⚠️ 更新数据库账号状态失败: ${dbErr.message}`);
      }

      const updatedAccountFromDb = await DatabaseService.getAccountById(accountId);

  
      return updatedAccountFromDb;
    }
    
    return null;
  } catch (error) {
    console.error(`❌ 切换账号状态失败: ${accountId}`, error);
    return null;
  }
}