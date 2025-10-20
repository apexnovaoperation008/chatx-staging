/**
 * 启动时自动重连服务
 * 在服务器启动时自动重新连接已保存的WhatsApp和Telegram账号
 */

import { WhatsAppSessionsStore } from "../stores/whatsapp-sessions.store";
import { TelegramSessionsStore } from "../stores/telegram-sessions.store";
import { create, Client } from "@open-wa/wa-automate";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { config } from "../config/env";
import path from "path";
import fs from "fs";
// Removed node-persist-redirect import as it's no longer needed
import { waMessageMultiplexer } from "./wa-message-multiplexer.service";
import { waSessionOptimizer, ReconnectionResult } from "./wa-session-optimizer.service";

// Use global singletons to avoid duplicate maps across module instances
const G: any = globalThis as any;
G.__WA_RECONNECTED__ = G.__WA_RECONNECTED__ || new Map<string, Client>();
G.__TG_RECONNECTED__ = G.__TG_RECONNECTED__ || new Map<string, TelegramClient>();
const reconnectedWaClients: Map<string, Client> = G.__WA_RECONNECTED__;
const reconnectedTgClients: Map<string, TelegramClient> = G.__TG_RECONNECTED__;

/**
 * 启动时自动重连所有已保存的账号
 */
export async function autoReconnectOnStartup() {
  console.log("🚀 开始自动重连已保存的账号...");
  
  const startTime = Date.now();
  
  // 并行重连WhatsApp和Telegram
  const [waResults, tgResults] = await Promise.all([
    reconnectWhatsAppAccountsOptimized(),
    reconnectTelegramAccounts()
  ]);
  
  const totalTime = Date.now() - startTime;
  console.log(`✅ 自动重连完成 (耗时: ${totalTime}ms)`);
  
  // 显示重连统计
  if (waResults.length > 0) {
    const successful = waResults.filter(r => r.success).length;
    const failed = waResults.filter(r => !r.success).length;
    const avgTime = waResults.reduce((sum, r) => sum + r.reconnectionTime, 0) / waResults.length;
    
    console.log(`📊 WhatsApp重连统计:`);
    console.log(`   成功: ${successful}/${waResults.length}`);
    console.log(`   失败: ${failed}/${waResults.length}`);
    console.log(`   平均耗时: ${Math.round(avgTime)}ms`);
  }
}

/**
 * 重连WhatsApp账号
 */
export async function reconnectWhatsAppAccountsOptimized(): Promise<ReconnectionResult[]> {
  try {
    console.log("📱 开始优化重连WhatsApp账号...");
    
    // 使用优化的会话管理器
    const results = await waSessionOptimizer.reconnectAllAccounts();
    // console.log("📱 WhatsApp优化重连结果:", results);
    // console.log("📱 WhatsApp优化重连完成，成功连接", results.length, "个账号");
    
    // 更新重连的客户端映射
    for (const result of results) {
      if (result.success && result.client) {
        reconnectedWaClients.set(result.accountId, result.client);
      }
    }
    
    console.log(`✅ WhatsApp优化重连完成，成功连接 ${reconnectedWaClients.size} 个账号`);
    return results;
    
  } catch (error) {
    console.error("❌ WhatsApp优化重连失败:", error);
    return [];
  }
}

/**
 * 重连WhatsApp账号（原始版本，保留作为备用）
 */
export async function reconnectWhatsAppAccounts() {
  try {
    console.log("📱 开始重连WhatsApp账号...");
    
    const whatsappAccounts = WhatsAppSessionsStore.list();
    console.log(`📋 找到 ${whatsappAccounts.length} 个WhatsApp账号`);
    
    for (const account of whatsappAccounts) {
      console.log(`🔄 重连WhatsApp账号: ${account.id} (${account.label})`);
      
      // 🔒 保存原始工作目录，用于后续恢复
      const originalCwd = process.cwd();
      
      try {
        
        // 🔍 检查实际的session目录
        const sessionsRoot = account.data.dataDir; // sessions根目录
        const sessionId = account.data.sessionId;
        
        // 🔑 新的存储方法：IGNORE文件夹直接在sessions根目录下
        const actualSessionDir = sessionId.startsWith('_IGNORE_') 
          ? path.join(sessionsRoot, sessionId)
          : path.join(sessionsRoot, `_IGNORE_${sessionId}`);
        
        console.log(`📁 sessions根目录: ${sessionsRoot}`);
        console.log(`📁 SessionId: ${sessionId}`);
        console.log(`📁 实际的Session目录: ${actualSessionDir}`);
        console.log(`📁 sessions目录存在: ${fs.existsSync(sessionsRoot)}`);
        console.log(`📁 实际目录存在: ${fs.existsSync(actualSessionDir)}`);
        
        // 如果实际session目录不存在，跳过
        if (!fs.existsSync(actualSessionDir)) {
          console.log(`⚠️ 实际Session目录不存在，跳过: ${actualSessionDir}`);
          continue;
        }
        
        // 🔍 检查session数据文件 (在sessions根目录内)
        const cleanSessionId = sessionId.replace('_IGNORE_', '');
        const sessionDataFile = path.join(sessionsRoot, `${cleanSessionId}.data.json`);
        const hasSessionData = fs.existsSync(sessionDataFile);
        console.log(`📄 Session数据文件: ${sessionDataFile} (存在: ${hasSessionData})`);
        
        console.log(`🔄 开始重连，使用目录: ${sessionsRoot}`);
        console.log(`🔄 使用sessionId: ${cleanSessionId} (去掉前缀)`);
        
        // 🔒 切换到sessions根目录进行重连
        process.chdir(sessionsRoot);
        console.log(`🔄 切换工作目录到sessions目录: ${originalCwd} -> ${process.cwd()}`);
        
        // 🛠️ 不再需要node-persist设置，新存储方法直接使用sessions目录
        
        const client = await create({
          sessionId: cleanSessionId, // 使用干净的sessionId
          multiDevice: true,
          headless: true,
          dataDir: '.', // 使用当前目录（账号会话文件夹）

          // 🔑 关键：session恢复配置
          qrTimeout: 30000, // 给一些时间尝试恢复session
          authTimeout: 60000, // 给足够时间认证
          qrLogSkip: true, // 不显示QR日志
          disableSpins: true,
          killProcessOnBrowserClose: false,
          // 使用Puppeteer自动寻找Chrome路径，更可靠
          useChrome: true,
          // 让Puppeteer自动管理浏览器，避免路径问题
          autoRefresh: true,
          
          // 🔧 session恢复优化
          restartOnCrash: false,
          throwErrorOnTosBlock: false,
          bypassCSP: true
        });
        
        // 等待连接建立
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // 🧪 五、验证是否真的发送出去 - 添加调试监听器
        client.onMessage(async (msg) => {
          console.log(`[收到消息回调] ${account.id}`, msg?.type, msg?.body?.substring(0, 50));
        });

        client.onStateChanged((state: any) => {
          console.log(`[客户端状态变化] ${account.id}`, state);
        });

        client.onAck((ack: any) => {
          console.log(`[发送状态回执] ${account.id}`, ack?.id, ack?.ack);
        });
        
        // 检查连接状态
        let isConnected = false;
        try {
          isConnected = await client.isConnected();
          console.log(`🔍 [重连检查] ${account.id} 连接状态: ${isConnected}`);
        } catch (connectionError: any) {
          console.log(`⚠️ [重连检查] ${account.id} 连接检查失败:`, connectionError?.message || connectionError);
          // 即使连接检查失败，也尝试注册客户端
          isConnected = true; // 强制注册
        }
        
        if (isConnected) {
          // 🔑 使用原始账号ID存储重连的客户端
          reconnectedWaClients.set(account.id, client);
          console.log(`✅ WhatsApp账号重连成功: ${account.id} (${account.label})`);
          console.log(`📊 [重连统计] 当前已注册客户端数量: ${reconnectedWaClients.size}`);
          
          // 🔥 注册到消息多路复用器（关键：支持多客户端消息监听）
          console.log(`📡 注册重连客户端到消息多路复用器: ${account.id}`);
          waMessageMultiplexer.registerClient(account.id, client);
          
          // 获取基本信息验证连接
          try {
            const me = await client.getMe();
            console.log(`📱 验证连接 - 账号: ${me.pushname || me.id}`);
            
            // 🔍 如果获取到了真实信息，更新label
            if (me.pushname && me.pushname !== account.label) {
              console.log(`📱 更新账号显示名称: ${account.label} -> ${me.pushname}`);
              // 这里可以更新数据库中的label
            }
          } catch (verifyError) {
            console.log(`⚠️ 验证连接失败，但客户端已连接: ${account.id}`);
          }
        } else {
          console.log(`❌ WhatsApp账号连接失败，可能需要重新扫码: ${account.id}`);
          console.log(`🔍 [重连失败] 客户端状态检查:`, {
            accountId: account.id,
            hasClient: !!client,
            clientType: typeof client,
            isConnected: isConnected
          });
        }
        
        // 🔄 恢复原始工作目录
        process.chdir(originalCwd);
        console.log(`🔄 恢复工作目录: ${process.cwd()}`);
        
        // 🧹 不再需要node-persist同步，直接清理环境变量
        delete process.env.NODE_PERSIST_DIR;
        
      } catch (reconnectError: any) {
        console.error(`❌ 重连WhatsApp账号失败: ${account.id}`, reconnectError.message);
        // 🔄 确保在错误情况下也恢复工作目录
        try {
          process.chdir(originalCwd);
          console.log(`🔄 错误恢复工作目录: ${process.cwd()}`);
          // 🧹 清理环境变量
          delete process.env.NODE_PERSIST_DIR;
        } catch (dirError) {
          console.error(`❌ 恢复工作目录失败:`, dirError);
        }
      }
    }
    
    console.log(`✅ WhatsApp重连完成，成功连接 ${reconnectedWaClients.size} 个账号`);
    console.log(`📊 [重连总结] 已注册的客户端ID:`, Array.from(reconnectedWaClients.keys()));
    
    // 🔍 验证所有账号的消息监听器是否正常注册
    const validation = waMessageMultiplexer.validateListeners();
    console.log(`📊 消息监听器验证结果:`, validation);
    
  } catch (error) {
    console.error("❌ WhatsApp批量重连失败:", error);
  }
}

/**
 * 重连Telegram账号
 */
export async function reconnectTelegramAccounts() {
  try {
    console.log("📱 开始重连Telegram账号...");
    
    const telegramAccounts = TelegramSessionsStore.list();
    console.log(`📋 找到 ${telegramAccounts.length} 个Telegram账号`);
    
    const apiId = Number(config.TG_API_ID);
    const apiHash = String(config.TG_API_HASH);
    
    for (const account of telegramAccounts) {
      console.log(`🔄 重连Telegram账号: ${account.id} (${account.label})`);
      
      try {
        // 使用已保存的session字符串重新连接
        const sessionString = account.data.session;
        if (!sessionString) {
          console.log(`⚠️ 没有session数据，跳过: ${account.id}`);
          continue;
        }
        
        const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
          deviceModel: "WebDashboard",
          appVersion: "1.0",
          systemVersion: "Node",
          connectionRetries: 5,
        });
        
        // 尝试连接
        await client.connect();
        
        // 验证连接
        const me = await client.getMe();
        if (me) {
          reconnectedTgClients.set(account.id, client);
          console.log(`✅ Telegram账号重连成功: ${account.id} (${account.label})`);
          console.log(`📱 验证连接 - 用户: ${me.firstName || me.username || account.id}`);
        } else {
          console.log(`❌ Telegram账号验证失败: ${account.id}`);
        }
        
      } catch (reconnectError: any) {
        console.error(`❌ 重连Telegram账号失败: ${account.id}`, reconnectError.message);
      }
    }
    
    console.log(`✅ Telegram重连完成，成功连接 ${reconnectedTgClients.size} 个账号`);
  } catch (error) {
    console.error("❌ Telegram批量重连失败:", error);
  }
}

/**
 * 获取重连的WhatsApp客户端
 */
export function getReconnectedWaClient(accountId: string): Client | undefined {
  return reconnectedWaClients.get(accountId);
}

/**
 * 获取重连的Telegram客户端
 */
export function getReconnectedTgClient(accountId: string): TelegramClient | undefined {
  return reconnectedTgClients.get(accountId);
}

/**
 * 获取所有已重连的WhatsApp客户端
 */
export function getAllReconnectedWaClients(): Map<string, Client> {
  return reconnectedWaClients;
}

/**
 * 获取所有已重连的Telegram客户端
 */
export function getAllReconnectedTgClients(): Map<string, TelegramClient> {
  return reconnectedTgClients;
}

/**
 * 手动注册已连接的 WhatsApp 客户端到全局映射
 */
export function registerReconnectedWaClient(accountId: string, client: Client): void {
  try {
    reconnectedWaClients.set(accountId, client);
    try {
      const modPath = require.resolve('../services/startup-reconnect.service');
      console.log(`🧭 [WA REGISTER] pid=${process.pid} cwd=${process.cwd()} mod=${modPath}`);
      console.log(`🧭 [WA REGISTER] keys=`, Array.from(reconnectedWaClients.keys()));
      console.log(`🧭 [WA REGISTER] size=`, reconnectedWaClients.size);
    } catch {}
  } catch {}
}