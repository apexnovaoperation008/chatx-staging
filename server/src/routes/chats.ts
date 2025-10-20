/**
 * 聊天相关API路由
 */

import { Router } from "express";
import multer from "multer";
import { ChatService } from "../services/chat.service";
import { getChatMessages, } from "../services/chat.service";
import { WhatsAppProvider } from "../provider/whatsapp-provider";
import { TelegramProvider } from "../provider/telegram-provider";
import { ChatListResponse } from "@/types/chat.types";
import { databaseService } from "@/database/database.service";
import { requireAuth } from "@/middleware/requireAuth";
import { accountDatabaseService } from "@/database/account.database.service";
import { Workspace, Account } from "@/types/chat.types"

// 配置multer用于文件上传
const upload = multer({
  storage: multer.memoryStorage(), // 使用内存存储
  limits: {
    fileSize: 50 * 1024 * 1024, // 限制文件大小为50MB
  },
  fileFilter: (req, file, cb) => {
    // 允许所有文件类型
    cb(null, true);
  }
});

const r = Router();

const chatService = new ChatService(
  new WhatsAppProvider(),
  new TelegramProvider()
);

// 获取所有聊天列表
// r.get("/", async (req, res) => {
//   try {
//     console.log("📋 API请求: 获取所有聊天列表");
    
//     const result = await chatService.getChatWithMessages();
    
//     console.log(`✅ 返回 ${result.chats.length} 个聊天`);
//     res.json({
//       success: true,
//       data: result
//     });
//   } catch (error: any) {
//     console.error("❌ 获取聊天列表失败:", error);
//     res.status(500).json({
//       success: false,
//       error: error.message || "获取聊天列表失败"
//     });
//   }
// });

// r.get("/", async (req, res) => {
//   try {
//     console.log("📋 API请求: 获取所有聊天列表");
//     console.log("📋 API请求时间:", new Date().toISOString());

//     let result: ChatListResponse = {
//       chats: [],
//       totalCount: 0,
//       hasMore: false
//     };

//     try {
//       console.log("📋 开始调用 chatService.getChatWithMessages()");
//       result = await chatService.getChatWithMessages();
//       console.log("📋 chatService.getChatWithMessages() 完成");
//     } catch (err: any) {
//       console.warn("⚠️ Telegram/Provider 获取聊天失败:", err.message);
//       console.warn("⚠️ 错误堆栈:", err.stack);
//       // 保留空数组，前端依然能收到 JSON
//     }

//     console.log(`✅ 返回 ${result.chats.length} 个聊天`);
//     console.log("📋 准备发送响应...");
    
//     res.json({
//       success: true,
//       data: result
//     });
//     console.log("📋 响应已发送");
//   } catch (error: any) {
//     console.error("❌ 获取聊天列表失败:", error);
//     console.error("❌ 错误堆栈:", error.stack);
//     res.status(500).json({
//       success: false,
//       error: error.message || "获取聊天列表失败"
//     });
//   }
// });

r.get("/", requireAuth, async (req, res) => {
  try {
    console.log("📋 API请求: 获取所有聊天列表");

    const userId = req.user.userId;
    const roleId = req.user.role_id;

    // 1️⃣ Find all workspaces the user belongs to
    const managerWorkspaces: Workspace[] = await accountDatabaseService.findByManagerId(userId);
    let memberWorkspaces = await accountDatabaseService.findByUserId(userId);

    if (!Array.isArray(memberWorkspaces)) {
      memberWorkspaces = memberWorkspaces ? [memberWorkspaces] : [];
    }

    // Combine & deduplicate workspace IDs
    const workspaceIds: number[] = [
      ...new Set([
        ...(managerWorkspaces || []).map((w: Workspace) => w.id),
        ...memberWorkspaces.map((w: Workspace) => w.id),
      ]),
    ];

    console.log(`📋 用户 ${userId} (${roleId}) 属于工作区: [${workspaceIds.join(", ")}]`);

    // ✅ Get chats for all workspace IDs
    const result = await chatService.getChatWithMessages(workspaceIds, userId);

    res.json({
      success: true,
      data: result
    });

  } catch (error: any) {
    console.error("❌ 获取聊天列表失败:", error);
    res.status(500).json({
      success: false,
      error: error.message || "获取聊天列表失败"
    });
  }
});

// 获取特定聊天的消息
r.get("/:chatId/messages", async (req, res) => {
  try {
    const { chatId } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;
    
    // console.log(`📋 API请求: 获取聊天消息 ${chatId}, 限制: ${limit}`);
    
    const result = await getChatMessages(chatId, limit);
    
    // console.log(`✅ 返回 ${result.messages.length} 条消息`);
    res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error("❌ 获取聊天消息失败:", error);
    res.status(500).json({
      success: false,
      error: error.message || "获取聊天消息失败"
    });
  }
});

// 发送消息
r.post("/:chatId/send", upload.single('file'), async (req, res) => {
  try {
    const { chatId } = req.params;
    
    // 调试信息 - 查看请求内容
    // 关键请求信息（简化日志）
    console.log(`🔍 [请求] Content-Type:`, req.headers['content-type']);
    
    // 检查是否有文件上传
    if (req.file) {
      // 处理文件上传
      let { content, messageType = 'text', fileName, fileSize, geo } = req.body;
      const file = req.file;
      
      console.log(`📤 [文件发送] ${chatId}`, { messageType, fileName: fileName || file.originalname, mimeType: file.mimetype, size: file.size });
      
      // 调试信息
      // 简化文件信息日志
      console.log(`🔎 [文件]`, { originalname: file.originalname, mimetype: file.mimetype, size: file.size, hasBuffer: !!file.buffer });
      
      // 检查文件 Buffer
      if (!file.buffer || file.buffer.length === 0) {
        console.error(`❌ [调试] 文件 Buffer 为空或无效:`, {
          bufferExists: !!file.buffer,
          bufferLength: file.buffer ? file.buffer.length : 0,
          fileSize: file.size,
          encoding: file.encoding
        });
        throw new Error("文件内容为空或无效");
      }
      
      console.log(`✅ [调试] 文件 Buffer 验证通过: ${file.buffer.length} bytes`);

      // 解析聊天ID获取平台和账号信息（兼容旧的连字符格式）
      let platform: string | undefined;
      let accountId: string | undefined;
      let originalChatId: string | undefined;
      

      console.log(`🔍 [调试] 解析聊天ID: ${chatId}`);
      console.log(`🔍 [调试] chatId.includes(':'): ${chatId.includes(':')}`);
      console.log(`🔍 [调试] chatId.split(':'): ${chatId.split(':')}`);
      console.log(`🔍 [调试] platform: ${platform}`);
      console.log(`🔍 [调试] accountId: ${accountId}`);
      console.log(`🔍 [调试] originalChatId: ${originalChatId}`);
      
      if (chatId.includes(':')) {
        [platform, accountId, originalChatId] = chatId.split(':');
      } else {
        // 兼容旧格式：wa-<accountId>-<originalChatId>
        // 其中 <accountId> 可能包含连字符；<originalChatId> 匹配 WhatsApp 的 JID（可能包含连字符）
        const waMatch = chatId.match(/^wa-(.+)-(\d+(?:-\d+)?@(?:c|g)\.us)$/);
        if (waMatch) {
          platform = 'wa';
          accountId = waMatch[1];
          originalChatId = waMatch[2];
          console.log(`🔁 [兼容] 归一化 WA chatId: ${chatId} -> wa:${accountId}:${originalChatId}`);
        }
      }
      if (!platform || !accountId || !originalChatId) {
        throw new Error(`无效的聊天ID格式: ${chatId}`);
      }

      // 获取对应的 provider
      const provider = chatService.getProvider(platform);
      if (!provider) {
        throw new Error(`不支持的平台: ${platform}`);
      }

      // 确保 content 有值
      const messageContent = content || `📎 ${fileName || file.originalname}`;
      
      // 准备文件数据
      const fileData = {
        file: {
          buffer: file.buffer,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size
        },
        fileName: fileName || file.originalname,
        fileSize: fileSize ? parseInt(fileSize) : file.size,
        geo: geo ? JSON.parse(geo) : undefined,
        messageId: undefined as string | undefined
      };

      // console.log(`🔍 [调试] 发送到Provider:`, {
      //   chatId,
      //   content: messageContent,
      //   messageType,
      //   hasFile: !!fileData.file.buffer
      // });

      // 基于 MIME 自动矫正 messageType（确保图片/视频正确渲染）
      try {
        const mimeLower = (file.mimetype || '').toLowerCase();
        if (mimeLower.startsWith('image/')) messageType = 'photo';
        else if (mimeLower.startsWith('video/')) messageType = 'video';
        else if (mimeLower.startsWith('audio/')) messageType = 'voice';
      } catch {}

      // 预生成文件访问URL（用于前端立刻渲染）并可选地落盘一份临时文件
      let preSavedUrl: string | null = null;
      try {
        const safePlatform = platform === 'wa' ? 'wa' : 'tg';
        // 统一规范：Telegram 使用去前缀的 accountId 保存/访问
        const normalizedAccountId = safePlatform === 'tg' ? String(accountId).replace(/^tg-/, '') : accountId;
        const msgId = fileData.messageId || `${Date.now()}`;
        // 简单的MIME到扩展名映射
        const mime = (file.mimetype || '').toLowerCase();
        const ext = mime.includes('image/') ? (mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : mime.includes('png') ? 'png' : mime.includes('gif') ? 'gif' : mime.includes('webp') ? 'webp' : 'jpg')
                  : mime.includes('video/') ? (mime.includes('mp4') ? 'mp4' : 'mp4')
                  : mime.includes('audio/') ? (mime.includes('ogg') ? 'ogg' : mime.includes('mp3') ? 'mp3' : 'ogg')
                  : mime.includes('pdf') ? 'pdf'
                  : mime.includes('docx') ? 'docx'
                  : mime.includes('doc') ? 'doc'
                  : mime.includes('txt') ? 'txt'
                  : 'bin';
        const typeDir = messageType === 'photo' ? 'photo' : messageType === 'video' ? 'video' : messageType === 'voice' ? 'voice' : 'document';
        const path = require('path');
        const fs = require('fs');
        const baseDir = require('path').join(process.cwd(), 'public', 'media', safePlatform, normalizedAccountId, typeDir);
        fs.mkdirSync(baseDir, { recursive: true });
        const filePath = path.join(baseDir, `${msgId}.${ext}`);
        // 将上传内容先行落盘，便于前端立即访问
        fs.writeFileSync(filePath, file.buffer);
        preSavedUrl = `/api/media/${safePlatform}/${normalizedAccountId}/${typeDir}/${msgId}.${ext}`;
        // 将 messageId 传递给 provider（若其支持使用）
        fileData.messageId = msgId;
      } catch (e) {
        console.warn('⚠️ 预保存失败（不影响发送）：', (e as any)?.message || e);
      }

      // 调用 provider 的发送消息方法
      const result = await provider.sendMessage(chatId, "", messageType, fileData);
      const success = typeof result === 'boolean' ? result : !!result?.success;

      if (success) {
        console.log(`✅ 文件消息发送成功: ${chatId}`);
        
        // 发送成功后推送 WebSocket 消息，让前端立即显示
        // try {
        //   const { websocketService } = await import('../services/websocket.service');
        //   const webSocketMessage = {
        //     id: `temp-${Date.now()}`,
        //     chatId: chatId,
        //     sender: "我",
        //     senderName: "我",
        //     content: messageContent,
        //     timestamp: Date.now(),
        //     isOwn: true,
        //     messageType: messageType,
        //     status: 'sent'
        //   };
        //   websocketService.broadcastNewMessage(webSocketMessage);
        //   console.log(`📡 [WebSocket] 已推送发送的文件消息: ${chatId}`);
        // } catch (wsError) {
        //   console.warn(`⚠️ [WebSocket] 推送发送文件消息失败:`, wsError);
        // }
        
        // 如果是语音消息，生成文件URL
        let fileUrl = null;
        if (messageType === 'voice') {
          const [platform, accountId, originalChatId] = chatId.split(':');
          const safePlatform = platform === 'wa' ? 'wa' : 'tg';
          const normalizedAccountId = safePlatform === 'tg' ? String(accountId).replace(/^tg-/, '') : accountId;
          // 使用与telegram-provider.ts相同的messageId
          const messageId = fileData.messageId || `voice-${Date.now()}`;
          // 根据平台类型生成正确的URL路径
          fileUrl = `/api/media/${safePlatform}/${normalizedAccountId}/voice/${messageId}.ogg`;
          console.log(`🎤 [语音消息] 生成文件URL: ${fileUrl}`);
          
          // 语音消息使用标准化返回格式
          res.json({
            success: true,
            chatId,
            fileUrl: fileUrl,
            messageType: "voice",
            messageId,
            platform: safePlatform,
            accountId: normalizedAccountId
          });
        } else {
          // 其他文件类型：优先返回预保存URL确保前端立即可显示；若无预保存再回退到 messageId URL
          const [platform, accountId] = chatId.split(':');
          const safePlatform = platform === 'wa' ? 'wa' : 'tg';
          const normalizedAccountId = safePlatform === 'tg' ? String(accountId).replace(/^tg-/, '') : accountId;
          let finalUrl = preSavedUrl as string | undefined;
          if (!finalUrl && fileData.messageId) {
            const typeDir = messageType === 'photo' ? 'photo' : messageType === 'video' ? 'video' : 'document';
            const ext = messageType === 'photo' ? 'jpg' : messageType === 'video' ? 'mp4' : 'pdf';
            finalUrl = `/api/media/${safePlatform}/${normalizedAccountId}/${typeDir}/${fileData.messageId}.${ext}`;
          }

          res.json({
            success: true,
            message: "文件消息发送成功",
            fileUrl: finalUrl,
            messageType,
            messageId: fileData.messageId,
            platform: safePlatform,
            accountId: normalizedAccountId,
            fileName: (req.body.fileName || req.file?.originalname),
            fileHash: (typeof result === 'object' && result?.fileHash) ? result.fileHash : undefined
          });
        }
      } else {
        // 如果发送失败，返回错误信息
        console.log(`❌ 文件消息发送失败: ${chatId}`);
        res.status(500).json({
          success: false,
          error: "文件消息发送失败",
          chatId
        });
        return;
      }
    } else {
      // 处理普通文本消息
      const { content, messageType = 'text', geo } = req.body;


      // 解析聊天ID获取平台和账号信息（兼容旧的连字符格式）
      let platform: string | undefined;
      let accountId: string | undefined;
      let originalChatId: string | undefined;

      if (chatId.includes(':')) {
        [platform, accountId, originalChatId] = chatId.split(':');
      } else {
        const waMatch = chatId.match(/^wa-(.+)-(\d+(?:-\d+)?@(?:c|g)\.us)$/);
        if (waMatch) {
          platform = 'wa';
          accountId = waMatch[1];
          originalChatId = waMatch[2];
          console.log(`🔁 [兼容] 归一化 WA chatId: ${chatId} -> wa:${accountId}:${originalChatId}`);
        }
      }
      if (!platform || !accountId || !originalChatId) {
        throw new Error(`无效的聊天ID格式: ${chatId}`);
      }

      // 获取对应的 provider
      const provider = chatService.getProvider(platform);
      if (!provider) {
        throw new Error(`不支持的平台: ${platform}`);
      }

      // 准备额外数据
      const additionalData = geo ? { geo: JSON.parse(geo) } : undefined;

      // 调用 provider 的发送消息方法
      
      const success = await provider.sendMessage(chatId, content, messageType, additionalData);

      if (success) {
        console.log(`✅ 文本消息发送成功: ${chatId}`);
        
        // 发送成功后推送 WebSocket 消息，让前端立即显示
        // 机制需要优化，会在后续研发中优化
        // try {
        //   const { websocketService } = await import('../services/websocket.service');
        //   const webSocketMessage = {
        //     id: `temp-${Date.now()}`,
        //     chatId: chatId,
        //     sender: "我",
        //     senderName: "我", 
        //     content: content,
        //     timestamp: Date.now(),
        //     isOwn: true,
        //     messageType: messageType,
        //     status: 'sent'
        //   };
        //   websocketService.broadcastNewMessage(webSocketMessage);
        //   console.log(`📡 [WebSocket] 已推送发送的消息: ${chatId}`);
        // } catch (wsError) {
        //   console.warn(`⚠️ [WebSocket] 推送发送消息失败:`, wsError);
        // }
        
        res.json({
          success: true,
          message: "消息发送成功"
        });
      } else {
        throw new Error("消息发送失败");
      }
    }

  } catch (error: any) {
    console.error("❌ 发送消息失败:", error);
    
    // 根据错误类型返回不同的状态码和消息
    let statusCode = 500;
    let errorMessage = error.message || "发送消息失败";
    
    if (error.message?.includes('INPUT_USER_DEACTIVATED') || 
        error.message?.includes('USER_DEACTIVATED')) {
      statusCode = 400;
      errorMessage = "目标用户账户已被停用，无法发送消息";
    } else if (error.message?.includes('CHAT_WRITE_FORBIDDEN')) {
      statusCode = 403;
      errorMessage = "没有权限向此聊天发送消息";
    } else if (error.message?.includes('PEER_ID_INVALID') || 
               error.message?.includes('CHAT_NOT_FOUND')) {
      statusCode = 404;
      errorMessage = "聊天不存在或无效";
    }
    
    res.status(statusCode).json({
      success: false,
      error: errorMessage
    });
  }
});

export default r;
