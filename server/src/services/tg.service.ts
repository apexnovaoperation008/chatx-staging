import base64url from "base64url";
import { randomBytes } from "crypto";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { Api } from "telegram/tl";
import QR from "qrcode";
import { TelegramSessionsStore } from "../stores/telegram-sessions.store";
import { reconnectTelegramAccounts } from "./startup-reconnect.service";
import { DatabaseService } from "../database/database.service";

import { config } from "../config/env";

const apiId = Number(config.TG_API_ID);
const apiHash = String(config.TG_API_HASH);

// 检查Telegram API配置
console.log(`🔧 Telegram配置: API_ID=${apiId}, API_HASH=${apiHash.substring(0, 8)}...`);

if (apiId === 123456 || apiHash === "your_api_hash") {
  console.warn("⚠️ 使用默认Telegram API配置，请设置真实的TG_API_ID和TG_API_HASH");
  console.warn("📝 申请地址: https://my.telegram.org");
}

type QrItem = { 
  client: TelegramClient; 
  token: Buffer; 
  createdAt: number;
  refreshCount: number;
  isConnected: boolean;
  sessionData?: string;
};
const qrMap = new Map<string, QrItem>();

// 实时连接状态检查器（类似WhatsApp的事件机制）
const activePollers = new Map<string, NodeJS.Timeout>();

function newClient() {
  return new TelegramClient(new StringSession(""), apiId, apiHash, {
    deviceModel: "WebDashboard",
    appVersion: "1.0",
    systemVersion: "Node",
    connectionRetries: 5,
  });
}

// 扫码：开始
export async function tgStartQr() {
  console.log("🔵 启动Telegram二维码登录");
  
  // 检查是否使用真实API配置
  if (apiId === 123456 || apiHash === "your_api_hash" || !apiHash || apiHash.length < 10) {
    console.log("🎭 使用Telegram桩实现（需要真实API_ID/API_HASH）");
    const loginKey = base64url(randomBytes(8));  // 进一步缩短
    // 使用更简单的测试数据，确保QR码清晰
    const qrToken = Math.random().toString(36).substring(2, 8);  // 6位字母数字
    const qrPayload = `tg://login?token=${qrToken}`;  // 简化URL
    
    try {
      console.log(`📊 Telegram QR数据: ${qrPayload}`);
      console.log(`📏 QR数据长度: ${qrPayload.length} 字符`);
      
      // 大幅简化QR码参数，减少密度
      const qrImage = await QR.toDataURL(qrPayload, { 
        version: 2,  // 进一步减小版本
        errorCorrectionLevel: "L",  // 最低纠错级别
        margin: 2,   // 减小边距
        scale: 4,    // 减小比例  
        width: 200,  // 减小尺寸
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      
      console.log(`✅ Telegram QR码生成成功，base64长度: ${qrImage.length}`);
      
      // 模拟会话，15秒后自动"成功"
      setTimeout(() => {
        TelegramSessionsStore.add({ 
          id: `tg-${loginKey}`, 
          provider: "telegram", 
          label: `Telegram 桩 ${loginKey.slice(-6)}`,
          data: { session: "mock_session_" + Date.now() }, 
          createdAt: Date.now() 
        });
        console.log(`✅ Telegram桩登录模拟成功: ${loginKey}`);
      }, 15000);
      
      console.log(`✅ Telegram桩 QR码已生成: ${loginKey}`);
      return { loginKey, qrPayload, qrImage };
    } catch (error) {
      console.error("❌ 生成Telegram桩QR失败:", error);
      return { loginKey, qrPayload, qrImage: null };
    }
  }
  
  // 真实实现
  const client = newClient();
  await client.connect();

  const exported = await client.invoke(new Api.auth.ExportLoginToken({ 
    apiId, 
    apiHash, 
    exceptIds: [] 
  })) as Api.auth.LoginToken;
  
  const token = Buffer.from((exported as any).token);
  const loginKey = base64url(randomBytes(12));
  
  qrMap.set(loginKey, { 
    client, 
    token, 
    createdAt: Date.now(),
    refreshCount: 0,
    isConnected: false
  });

  // 启动后台实时检查器（每2秒检查一次，类似WhatsApp）
  startBackgroundPoller(loginKey);

  const qrPayload = `tg://login?token=${base64url(token)}`;
  
  console.log(`📊 Telegram真实token长度: ${token.length} bytes`);
  console.log(`📊 Telegram base64url token: ${base64url(token)}`);
  console.log(`📊 Telegram QR payload: ${qrPayload}`);
  
  try {
    // 简化二维码生成参数，确保能正确扫描
    const qrImage = await QR.toDataURL(qrPayload, { 
      errorCorrectionLevel: "M",  // 中等纠错级别
      margin: 4, 
      scale: 4,
      width: 256,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
      // 让库自动选择version
    });
    
    console.log(`✅ Telegram QR码已生成: ${loginKey}`);
    console.log(`📏 QR图片大小: ${qrImage.length} 字符`);
    return { loginKey, qrPayload, qrImage };
  } catch (error) {
    console.error("❌ 生成Telegram QR图片失败:", error);
    // 如果图片生成失败，仍返回payload让前端用BigQR渲染
    return { loginKey, qrPayload, qrImage: null };
  }
}

// 后台实时检查器（类似WhatsApp的事件机制）
function startBackgroundPoller(loginKey: string) {
  console.log(`🔄 启动Telegram后台检查器: ${loginKey}`);
  
  const poller = setInterval(async () => {
    const item = qrMap.get(loginKey);
    if (!item) {
      console.log(`🛑 停止后台检查器 - session不存在: ${loginKey}`);
      clearInterval(poller);
      activePollers.delete(loginKey);
      return;
    }

    if (item.isConnected) {
      console.log(`✅ 停止后台检查器 - 已连接: ${loginKey}`);
      clearInterval(poller);
      activePollers.delete(loginKey);
      return;
    }

    // 检查token是否过期（30秒）
    const age = Date.now() - item.createdAt;
    if (age > 30000) {
      try {
        console.log(`🔄 刷新过期token: ${loginKey} (${Math.round(age/1000)}秒)`);
        
        // 刷新token
        const exported = await item.client.invoke(new Api.auth.ExportLoginToken({ 
          apiId, 
          apiHash, 
          exceptIds: [] 
        })) as Api.auth.LoginToken;
        
        item.token = Buffer.from((exported as any).token);
        item.createdAt = Date.now();
        item.refreshCount++;
        
        console.log(`✅ Token刷新成功: ${loginKey} (第${item.refreshCount}次)`);
      } catch (error) {
        console.error(`❌ Token刷新失败: ${loginKey}`, error);
        
        if (item.refreshCount >= 3) {
          console.log(`🛑 刷新次数过多，停止检查器: ${loginKey}`);
          clearInterval(poller);
          activePollers.delete(loginKey);
          qrMap.delete(loginKey);
        }
      }
    }

    // 检查连接状态
    try {
      const res = await item.client.invoke(new Api.auth.ImportLoginToken({ token: item.token }));
      
      if (!(res instanceof Api.auth.LoginToken) && !(res instanceof Api.auth.LoginTokenMigrateTo)) {
        // 连接成功！
        console.log(`🎉 后台检查器检测到连接成功: ${loginKey}`);
        
        const session = (item.client.session as StringSession).save();
        if (session && session.length > 10) {
          item.isConnected = true;
          item.sessionData = session;
          
          // 🔍 尝试获取Telegram用户信息
          let displayName = `Telegram QR ${loginKey.slice(-6)}`;
          let firstName = "";
          let lastName = "";
          let username = "";
          let phone = "QR扫码登录";
          
          try {
            console.log(`🔍 QR登录成功，尝试获取用户信息: ${loginKey}`);
            const userInfo = await item.client.invoke(new Api.users.GetFullUser({
              id: new Api.InputUserSelf()
            }));
            
            if (userInfo && userInfo.users && userInfo.users.length > 0) {
              const user = userInfo.users[0];
              // 类型安全的方式：检查用户类型并安全访问属性
              if ('firstName' in user) {
                firstName = user.firstName || "";
                lastName = user.lastName || "";
                username = user.username || "";
                phone = user.phone || "QR扫码登录";
              } else {
                // 如果是 UserEmpty 类型，使用默认值
                firstName = "";
                lastName = "";
                username = "";
                phone = "QR扫码登录";
              }
              
              // 构建显示名称：优先使用真实姓名，其次用户名
              if (firstName) {
                displayName = lastName ? `${firstName} ${lastName}` : firstName;
              } else if (username) {
                displayName = username;
              }
              
              console.log(`📱 QR登录获取用户信息: 姓名=${firstName} ${lastName}, 用户名=${username}, 手机号=${phone}`);
              console.log(`📱 QR登录最终显示名称: ${displayName}`);
            }
          } catch (userInfoError: any) {
            console.log(`⚠️ QR登录获取用户信息失败，使用默认名称:`, userInfoError?.message || '未知错误');
          }
          
          // 保存到Telegram专用数据库
          TelegramSessionsStore.add({ 
            id: `tg-${loginKey}`, 
            provider: "telegram", 
            label: displayName,
            data: { 
              session, 
              phone: phone,
              firstName,
              lastName,
              username
            }, 
            createdAt: Date.now() 
          });
          
          console.log(`💾 后台检查器已保存session: tg-${loginKey} (${displayName})`);
          
          // 🔄 立即重连以激活客户端
          try {
            console.log(`🔄 开始重连Telegram账号: tg-${loginKey}`);
            await reconnectTelegramAccounts();
            console.log(`✅ Telegram账号重连完成: tg-${loginKey}`);
          } catch (reconnectError) {
            console.error(`❌ Telegram账号重连失败: tg-${loginKey}`, reconnectError);
          }
          
          // 延迟断开
          setTimeout(async () => {
            try {
              await item.client.disconnect();
              console.log(`🔌 后台检查器断开客户端: ${loginKey}`);
            } catch (e) {
              console.error(`❌ 断开客户端失败: ${loginKey}`, e);
            }
          }, 3000);
        }
      }
    } catch (error) {
      // 静默处理轮询错误，不打印太多日志
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes('AUTH_TOKEN_EXPIRED')) {
        console.log(`⏳ 后台检查器轮询: ${loginKey} - ${errorMessage}`);
      }
    }
  }, 2000); // 每2秒检查一次

  activePollers.set(loginKey, poller);
  
  // 5分钟后自动停止
  setTimeout(() => {
    if (activePollers.has(loginKey)) {
      clearInterval(poller);
      activePollers.delete(loginKey);
      qrMap.delete(loginKey);
      console.log(`⏰ 后台检查器超时停止: ${loginKey}`);
    }
  }, 5 * 60 * 1000);
}

// 扫码：轮询
export async function tgPoll(loginKey: string) {
  const it = qrMap.get(loginKey);
  if (!it) {
    console.log(`❌ Telegram登录密钥不存在或已清理: ${loginKey}`);
    // 返回明确的完成状态，让前端停止轮询
    return { error: "TOKEN_NOT_FOUND", message: "登录密钥不存在或已完成" };
  }
  
  // 🆕 优先检查后台检查器的结果
  if (it.isConnected) {
    console.log(`✅ 前端轮询检测到后台连接成功: ${loginKey}`);
    // 清理后台检查器
    if (activePollers.has(loginKey)) {
      clearInterval(activePollers.get(loginKey)!);
      activePollers.delete(loginKey);
    }
    return { ok: true };
  }
  
  console.log(`🔍 前端轮询 (后台检查器运行中): ${loginKey} (${Math.round((Date.now() - it.createdAt)/1000)}秒)`);
  
  // 简化前端轮询逻辑 - 主要依赖后台检查器
  try {
    const res = await it.client.invoke(new Api.auth.ImportLoginToken({ token: it.token }));
    
    if (res instanceof Api.auth.LoginToken) {
      return { pending: true };
    }
    
    if (res instanceof Api.auth.LoginTokenMigrateTo) {
      console.log(`🔄 前端检测到DC迁移需求: ${loginKey} -> DC${res.dcId}`);
      return { pending: true };
    }
    
    // 如果前端轮询也检测到成功，标记为已连接
    console.log(`🎯 前端轮询也检测到连接成功: ${loginKey}`);
    it.isConnected = true;
    return { ok: true };
    
  } catch (error) {
    // 静默处理轮询错误，让后台检查器处理
    return { pending: true };
  }
}

// 手机号：开始
type Tx = { client: TelegramClient; phone: string; phoneCodeHash: string };
const txMap = new Map<string, Tx>();

export async function tgPhoneStart(phone: string) {
  console.log(`🔵 启动Telegram手机号登录: ${phone}`);
  
  const client = newClient();
  await client.connect();
  
  const sent = await client.invoke(new Api.auth.SendCode({ 
    phoneNumber: phone, 
    apiId, 
    apiHash, 
    settings: new Api.CodeSettings({}) 
  })) as Api.auth.SentCode;
  
  const txId = base64url(randomBytes(9));
  txMap.set(txId, { client, phone, phoneCodeHash: sent.phoneCodeHash });
  
  console.log(`✅ Telegram验证码已发送: ${phone} -> ${txId}`);
  return { txId };
}

// 手机号：验证
export async function tgPhoneVerify(txId: string, code: string, password?: string, workspaceId?: number, brandId?: number, description?: string, name?: string ,created_by?:number) {
  console.log(`🔵 验证Telegram手机号: ${txId}`);
  
  const tx = txMap.get(txId);
  if (!tx) {
    console.error(`❌ Telegram事务不存在: ${txId}`);
    throw new Error("TX_NOT_FOUND");
  }
  
  let loginResult: any = null;
  
  try {
    loginResult = await tx.client.invoke(new Api.auth.SignIn({ 
      phoneNumber: tx.phone, 
      phoneCodeHash: tx.phoneCodeHash, 
      phoneCode: code 
    }));
    
    console.log(`📋 Telegram登录结果类型: ${loginResult.constructor.name}`);
    console.log(`📋 Telegram登录结果:`, loginResult);
    
    // 检查是否需要注册新账户
    if ((loginResult as any)._ === 'auth.authorizationSignUpRequired') {
      console.error(`❌ Telegram账号需要注册: ${txId}`);
      throw new Error("TG_SIGNUP_REQUIRED");
    }
    
    console.log(`✅ Telegram登录成功: ${txId}`);
    
  } catch (e: any) {
    console.log(`🔍 Telegram登录错误详情:`, e);
    console.log(`🔍 错误消息: ${e.message}`);
    console.log(`🔍 错误字符串: ${String(e)}`);
    console.log(`🔍 错误类型: ${e.constructor.name}`);
    
    if (String(e).includes("SESSION_PASSWORD_NEEDED") || e.message.includes("SESSION_PASSWORD_NEEDED")) {
      if (!password) {
        console.log(`🔐 Telegram需要2FA密码: ${txId}`);
        throw new Error("TG_2FA_REQUIRED");
      }
      
      console.log(`🔐 验证Telegram 2FA密码: ${txId}`);
      try {
        // 🆕 使用正确的2FA API流程
        console.log(`🔐 获取密码配置: ${txId}`);
        const passwordSrp = await tx.client.invoke(new Api.account.GetPassword());
        
        console.log(`🔐 计算SRP: ${txId}`);
        const { computeCheck } = require('telegram/Password');
        const passwordCheck = await computeCheck(passwordSrp, password);
        
        console.log(`🔐 提交密码验证: ${txId}`);
        const authResult = await tx.client.invoke(new Api.auth.CheckPassword({
          password: passwordCheck
        }));
        
        console.log(`✅ Telegram 2FA验证成功: ${txId}`);
        console.log(`📋 2FA验证结果:`, authResult);
        
        // 🔍 2FA验证成功后，更新loginResult以获取用户信息
        loginResult = authResult;
      } catch (pwdError: any) {
        console.error(`❌ Telegram 2FA密码错误: ${txId}`, pwdError);
        console.error(`❌ 2FA错误详情:`, pwdError);
        throw new Error("TG_PASSWORD_INVALID");
      }
    } else if (e.message === "TG_SIGNUP_REQUIRED") {
      throw e;  // 重新抛出注册错误
    } else {
      console.error(`❌ Telegram登录失败: ${txId}`, e);
      throw e;
    }
  }
  
  const session = (tx.client.session as StringSession).save();
  
  // 🔍 尝试获取用户真实信息
  let displayName = `Telegram ${tx.phone}`;
  let firstName = "";
  let lastName = "";
  let username = "";
  
  try {
    // 从登录结果中提取用户信息
    if (loginResult && (loginResult as any).user) {
      const user = (loginResult as any).user;
      firstName = user.firstName || "";
      lastName = user.lastName || "";
      username = user.username || "";
      
      // 构建显示名称：优先使用真实姓名，其次用户名，最后手机号
      if (firstName) {
        displayName = lastName ? `${firstName} ${lastName}` : firstName;
      } else if (username) {
        displayName = username;
      } else {
        displayName = `Telegram ${tx.phone}`;
      }
      
      console.log(`📱 获取到Telegram用户信息: 姓名=${firstName} ${lastName}, 用户名=${username}, 手机号=${tx.phone}`);
      console.log(`📱 最终显示名称: ${displayName}`);
    } else {
      // 🔍 如果登录结果中没有用户信息，尝试单独获取
      console.log(`🔍 登录结果中没有用户信息，尝试单独获取...`);
      try {
        const userInfo = await tx.client.invoke(new Api.users.GetFullUser({
          id: new Api.InputUserSelf()
        }));
        
        if (userInfo && userInfo.users && userInfo.users.length > 0) {
          const user = userInfo.users[0];
          // 类型安全的方式：检查用户类型并安全访问属性
          if ('firstName' in user) {
            firstName = user.firstName || "";
            lastName = user.lastName || "";
            username = user.username || "";
          } else {
            // 如果是 UserEmpty 类型，使用默认值
            firstName = "";
            lastName = "";
            username = "";
          }
          
          if (firstName) {
            displayName = lastName ? `${firstName} ${lastName}` : firstName;
          } else if (username) {
            displayName = username;
          }
          
          console.log(`📱 通过GetFullUser获取用户信息: 姓名=${firstName} ${lastName}, 用户名=${username}`);
          console.log(`📱 最终显示名称: ${displayName}`);
        }
      } catch (getUserError: any) {
        console.log(`⚠️ GetFullUser也失败了，使用默认名称:`, getUserError?.message || '未知错误');
      }
    }
  } catch (userInfoError: any) {
    console.log(`⚠️ 无法获取Telegram用户详细信息，使用默认名称`);
  }

  const sessionId = `tg-${txId}`;  // txId is your Telegram transaction ID
  const normalizedWorkspaceId =
      workspaceId && !isNaN(Number(workspaceId)) ? Number(workspaceId) : null;
  const normalizedBrandId =
    brandId && !isNaN(Number(brandId)) ? Number(brandId) : null;
  
  TelegramSessionsStore.add({ 
    id: sessionId, 
    provider: "telegram", 
    label: displayName,
    data: { 
      session, 
      name,
      description,
      phone: tx.phone,
      firstName,
      lastName,
      username,
      workspace_id:normalizedWorkspaceId?? undefined,
      brand_id:normalizedBrandId?? undefined,
    }, 
    createdAt: Date.now(),
    createdBy: created_by,
  });

  let success = true;
  let warningMessage: string | null = null;

  try {
    const account = await DatabaseService.createAccount(
      "telegram",
      sessionId,
      displayName,
      description || "",
      normalizedWorkspaceId,
      normalizedBrandId ,
      "connected",
      true,
      created_by
    );
    console.log(`✅ 已保存到数据库:`, account);
  } catch (dbErr: any) {
    console.warn("⚠️ 保存到数据库失败:", dbErr?.message);
    success = false;
    warningMessage = "保存数据库失败";
  }

  if (!normalizedWorkspaceId || !normalizedBrandId) {
    warningMessage = "⚠️ workspaceId 或 brandId 未填写，请稍后在设置中补全。";
    console.warn(warningMessage);
  }
  
  try {
    await reconnectTelegramAccounts();
  } catch (reconnectError) {
    console.error(`❌ Telegram账号重连失败:`, reconnectError);
    success = false;
    warningMessage = "Telegram账号重连失败";
  }
  txMap.delete(txId);
  console.log(`✅ Telegram手机号登录成功: ${tx.phone}`);
  
  return {
    ok: success,
    message: success
      ? warningMessage || "✅ Telegram账号验证成功"
      : warningMessage || "❌ Telegram验证失败",
    warning: !!warningMessage,
    accountInfo: {
      displayName,
      phoneNumber: tx.phone,
    },
  };
}

// 清理过期的QR会话
export function cleanupExpiredQR() {
  const now = Date.now();
  const expiredTime = 5 * 60 * 1000; // 5分钟
  
  for (const [loginKey, item] of qrMap.entries()) {
    if (now - item.createdAt > expiredTime) {
      try {
        // 停止后台检查器
        if (activePollers.has(loginKey)) {
          clearInterval(activePollers.get(loginKey)!);
          activePollers.delete(loginKey);
        }
        item.client.destroy();
      } catch (error) {
        console.error(`❌ 清理Telegram客户端失败: ${loginKey}`, error);
      }
      qrMap.delete(loginKey);
      console.log(`🧹 清理过期Telegram QR会话: ${loginKey}`);
    }
  }
  
  for (const [txId, tx] of txMap.entries()) {
    if (now - Date.now() > expiredTime) {
      try {
        tx.client.destroy();
      } catch (error) {
        console.error(`❌ 清理Telegram客户端失败: ${txId}`, error);
      }
      txMap.delete(txId);
      console.log(`🧹 清理过期Telegram手机号会话: ${txId}`);
    }
  }
}

// 定期清理
setInterval(cleanupExpiredQR, 60000); // 每分钟清理一次

// 获取已连接的Telegram sessions
export function getConnectedTgSessions() {
  const sessions = TelegramSessionsStore.list();
  console.log(`📋 当前Telegram sessions数量: ${sessions.length}`);
  
  sessions.forEach(session => {
    console.log(`📋 Telegram session: ${session.id} - ${session.label} (${new Date(session.createdAt).toLocaleString()})`);
  });
  
  return sessions.map(s => {
    // 检查session数据有效性
    let hasValidSession = false;
    let dataPreview = 'no session';
    
    if (s.data && s.data.session && s.data.session.length > 10) {
      hasValidSession = true;
      dataPreview = s.data.session.substring(0, 20) + '...';
    }
    
    console.log(`📋 检查session ${s.id}: 数据类型=${typeof s.data}, 有效=${hasValidSession}`);
    
    return {
      id: s.id,
      label: s.label,
      createdAt: s.createdAt,
      hasSession: hasValidSession,
      dataType: typeof s.data,
      dataPreview
    };
  });
}