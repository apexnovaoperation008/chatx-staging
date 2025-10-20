// server/src/providers/whatsapp-provider.ts
import { MessageProvider, ChatMessagesResponse, ChatInfo, ChatMessage } from '../types/chat.types';
import { getReconnectedWaClient, getAllReconnectedWaClients } from '../services/startup-reconnect.service';// 注意：这里使用的是 @open-wa/wa-automate，不是 whatsapp-web.js
import { sessionStateService } from '../services/session-state.service';
import { config } from '../config/env';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { decryptMedia } from '@open-wa/wa-automate';
import crypto from "crypto";
import { websocketService } from '../services/websocket.service';


// 🔒 使用固定的服务器根目录，不依赖 process.cwd()
const SERVER_ROOT = path.resolve(__dirname, '../..');
interface SystemCacheEntry {
  timestamp: number;
  type: 'e2e' | 'gp2';
  content: string;
}

const contactCache: Record<string, any> = {};

interface CachedSystemEvent {
  type: 'e2e' | 'gp2' | 'e2e_notification '| 'notification';
  content: string;
  timestamp: number;
}

const systemMsgCache = new Map<string, CachedSystemEvent[]>();

interface GroupChangeEvent {
  groupId: string;
  type: "subject" | "description" | "icon" | string;
  actor?: { pushname?: string };
  data: { subject?: string; description?: string };
}

interface ParticipantChangeEvent {
  action: "add" | "remove" | "promote" | "demote" | string;
  who: string;
  by?: string;
  chat: string;
}


// Prefer bundled ffmpeg binary if available
if (ffmpegPath) {
  try {
    ffmpeg.setFfmpegPath(ffmpegPath as unknown as string);
  } catch {}
}

class WhatsAppProvider implements MessageProvider {
  // 🚀 添加联系人姓名缓存
  private contactNameCache = new Map<string, string>()
  
  // 🚀 添加 meta 信息内存缓存：hash -> { originalName, hash, savedAs, mimeType, timestamp, isTemp? }
  private metaCache = new Map<string, any>();

  // 实时相关
  private processedMessages = new Set<string>();
  private handlers = new Map<string, { handler: (message: any) => any; client: any }>();
  private messageCallback: ((payload: { message: ChatMessage; chatInfo: ChatInfo; accountId: string; messageType:string;}) => void) | null = null;
  private reRegisterInterval: NodeJS.Timeout | null = null;

  // 🎵 语音文件缓存 - 避免重复转换相同文件
  private voiceCache = new Map<string, { 
    oggPath: string; 
    timestamp: number; 
    originalSize: number; 
    convertedSize: number;
  }>();
  private readonly VOICE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24小时缓存

  constructor() {
    // 启动时清理旧的临时文件
    this.cleanupOldTempFiles();
    // 启动时加载所有 meta 文件到内存缓存
    this.loadMetaCache();
  }

  async getMessages(chatId: string, limit: number): Promise<ChatMessagesResponse> {
    try {
      // console.log(`📱 [WhatsApp Provider] 获取消息: ${chatId}, 限制: ${limit}`);
      const { accountId, originalChatId } = this.parseChatId(chatId);
      const client = await this.getClient(accountId);
      if (!client) return this.emptyResponse();


      // 验证连接状态
      const isConnected = await client.isConnected();
      if (!isConnected) {
        console.log(`⚠️ [WhatsApp Provider] 客户端未连接，等待重连稳定: ${accountId}`);
        // 等待一下让重连完成
        await new Promise(resolve => setTimeout(resolve, 3000));

        // 再次检查连接状态
        const isStillConnected = await client.isConnected();
        if (!isStillConnected) {
          console.log(`⚠️ [WhatsApp Provider] 客户端仍未连接: ${accountId}`);
          return this.emptyResponse();
        }
        console.log(`✅ [WhatsApp Provider] 客户端重连稳定: ${accountId}`);
      }

      // 获取聊天对象
      const chat = await client.getChatById(originalChatId as any);
      if (!chat) {
        console.log(`⚠️ [WhatsApp Provider] 聊天未找到: ${originalChatId}`);
        return this.emptyResponse();
      }

      // ✅ Works in whatsapp-web.js (TypeScript safe)
      try {
        if (chat.isGroup) {
          // participants: WWebJS.GroupParticipant[]
          const participants = (chat as any).participants || [];
      
          await Promise.allSettled(
            participants.map(async (p: any) => {
              const participantId = p?.id?._serialized;
              if (!participantId) return;
              try {
                await client.getContact(participantId); // ✅ correct method in your version
              } catch {}
            })
          );
      
          console.log(`👥 [WhatsApp Provider] 已预加载 ${participants.length} 个群成员联系人`);
        }
      } catch (err) {
        console.warn("⚠️ [WhatsApp Provider] 预加载群成员失败:", err);
      }

      // console.log('[Debug][Chat]', chat);
      // 获取消息
      // const messages = await (chat as any).fetchMessages({ limit });
      // const messages = await (chat as any).getChatMessages({ limit });
      // 使用 loadEarlierMessages 预加载，然后获取全部并按 limit 截断
      try {
        await client.loadEarlierMessages((chat as any).id);
      } catch (e) {
        // 忽略预加载失败，继续尝试获取
      }
      const allMsgs = await client.getAllMessagesInChat((chat as any).id, true, true);
      const messages = Array.isArray(allMsgs) ? allMsgs.slice(-Math.max(0, limit || 50)) : [];
      // console.log(`📋 [WhatsApp Provider] 获取到 ${messages.length} 条消息`);
      const chatMessages = await this.mapMessages(messages, accountId, originalChatId, chat, client);
      // console.log("[Debug][API Response] chatMessages:", chatMessages.slice(0, 3));

      // 调试：显示消息类型分布
      const messageTypeCounts = chatMessages.reduce((acc: Record<string, number>, msg) => {
        acc[msg.messageType] = (acc[msg.messageType] || 0) + 1;
        return acc;
      }, {});
      console.log(`📊 [WhatsApp Provider] 消息类型分布:`, messageTypeCounts);
      const chatInfo = this.buildChatInfo(chat, messages, accountId, originalChatId);

      // 诊断：检查消息ID重复或包含 undefined 的情况
      try {
        // const msgIds = chatMessages.map(m => m.id);
        const msgIds = chatMessages.map(m => (m as any)._serialized || (m as any).id);
        const undefinedMsgIds = msgIds.filter(id => !id || /undefined/i.test(String(id)));
        const seenMsg = new Set<string>();
        const dupMsg: string[] = [];
        for (const id of msgIds) {
          if (!id) continue;
          if (seenMsg.has(id)) dupMsg.push(id); else seenMsg.add(id);
        }
        // console.log('[Diag][Messages]', {
        //   chatId: originalChatId,
        //   total: msgIds.length,
        //   unique: seenMsg.size,
        //   dupes: dupMsg.length,
        //   undefinedLike: undefinedMsgIds.length,
        //   dupExamples: dupMsg.slice(0, 3),
        //   undefExamples: undefinedMsgIds.slice(0, 3)
        // });
      } catch (e) {
        console.log('[Diag][Messages] diagnostics failed:', e);
      }

      return {
        messages: chatMessages,
        chatInfo: chatInfo,
        hasMore: messages.length === limit
      };
    } catch (error) {
      console.error("❌ [WhatsApp Provider] 获取消息失败:", error);
      return { messages: [], chatInfo: {} as ChatInfo, hasMore: false };
    }
  }

  

  async sendMessage(chatId: string, content: string, messageType?: string, file?: any): Promise<boolean | { success: boolean; fileHash?: string; fileName?: string }> {
    let tempPath: string | undefined;
    
    try {
      const { accountId, originalChatId } = this.parseChatId(chatId);
      const client = await this.ensureClientConnected(accountId);

      console.log(`📤 [WhatsApp] (${messageType}) → ${originalChatId}`);

      if (messageType === 'text' || !file) {
        return await this.sendTextMessage(client, originalChatId, content);
      }

      const { buffer, fileName, mimeType } = this.validateFile(file);
      tempPath = this.saveTempFile(buffer, fileName);

     let success = false;
      let resultFileHash: string | undefined;
      let resultFileName: string | undefined;
      
      switch (messageType) {
        case 'voice':
          success = await this.sendVoiceMessage(client, originalChatId, tempPath, mimeType);
          if (success) {
            try {
              const ext = this.getFileExtension('voice', { mimetype: mimeType });
              const destDir = path.join(SERVER_ROOT, 'public', 'media', 'wa', accountId, 'voice');
              const tsId = `voice-${Date.now()}`;
              const destPath = path.join(destDir, `${tsId}.${ext}`);
              fs.mkdirSync(destDir, { recursive: true });
              fs.copyFileSync(tempPath, destPath);
              console.log(`💾 [WhatsApp媒体] 语音已保存: ${destPath}`);
            } catch (e) {
              console.warn('⚠️ [WhatsApp媒体] 保存语音失败:', e);
            }
          }
          break;
        case 'photo':
          {
            const imgResult = await this.sendImageMessage(client, originalChatId, tempPath, mimeType);
            success = imgResult.success;
            if (imgResult.realId) {
              try {
                const ext = this.getFileExtension('photo', { mimetype: mimeType });
                const destDir = path.join(SERVER_ROOT, 'public', 'media', 'wa', accountId, 'photo');
                const destPath = path.join(destDir, `${imgResult.realId}.${ext}`);
                fs.mkdirSync(destDir, { recursive: true });
                // 仅保留真实ID文件：写入真实ID文件，删除时间戳命名的文件（若存在）
                fs.copyFileSync(this.filePathOrTemp(tempPath), destPath);
                console.log(`💾 [WhatsApp媒体] 基于真实ID保存图片: ${destPath}`);
              } catch (e) {
                console.warn('⚠️ [WhatsApp媒体] 保存真实ID图片失败:', e);
              }
            }
          }
          break;
        case 'video':
        case 'document':
          {
            const result = await this.sendMediaMessage(client, originalChatId, tempPath, mimeType, fileName);
            success = result.success;
            if (result.success) {
              try {
                const mediaType = this.detectMediaType(mimeType) || (messageType as 'video' | 'document');
                const ext = this.getFileExtension(mediaType, { mimetype: mimeType });
                const destDir = path.join(SERVER_ROOT, 'public', 'media', 'wa', accountId, mediaType);
                fs.mkdirSync(destDir, { recursive: true });
                const fileHash = result.hash || (await this.generateFileHash(tempPath)).hash;
                const destPath = path.join(destDir, `${fileHash}.${ext}`);
                fs.copyFileSync(tempPath, destPath);
                console.log(`💾 [WhatsApp媒体] 文档/视频已保存: ${destPath}`);
                
                // 保存 fileHash 和 fileName 用于返回
                resultFileHash = fileHash;
                resultFileName = fileName;
                
                // 保存元数据，记录原始文件名以便前端显示
                try {
                  const meta = {
                    originalName: fileName,
                    hash: fileHash,
                    savedAs: path.basename(destPath),
                    mimeType,
                    timestamp: Date.now()
                  };
                  console.log('💾 [META][WA:send] 写入文档/视频元数据:', {
                    path: `${destPath}.meta.json`,
                    meta
                  });
                  fs.writeFileSync(`${destPath}.meta.json`, JSON.stringify(meta));
                  
                  // 简化：移除临时meta文件创建，只保留基本的meta.json
                } catch (metaErr) {
                  console.warn('⚠️ [WhatsApp媒体] 写入元数据失败:', metaErr);
                }
                console.log(`💾 [WhatsApp媒体] ${mediaType} 已保存: ${destPath}`);
                console.log('📦 [sendMessage] 返回 document 对象:', {
                  success: true,
                  fileHash,
                  fileName
                });
                // 注意：这里不能直接 return，需要让代码继续执行到 cleanupTempFile
                success = true;
              } catch (e) {
                console.warn('⚠️ [WhatsApp媒体] 保存媒体失败:', e);
              }
            }
          }
          break;
        default:
          success = await this.sendFileFallback(client, originalChatId, tempPath);
      }

      // 对于 document 和 video 类型，如果成功发送，返回包含 fileHash 和 fileName 的对象
      if ((messageType === 'document' || messageType === 'video') && success && resultFileHash && resultFileName) {
        return { success: true, fileHash: resultFileHash, fileName: resultFileName };
      }
      
      return success;
    } catch (error: any) {
      this.handleError(chatId, error);
      return false;
    } finally {
      // 确保临时文件总是被清理
      if (tempPath) {
        this.cleanupTempFile(tempPath);
      }
    }
  }

  private async ensureClientConnected(accountId: string) {
    const client = await this.getClient(accountId);
    if (!client) throw new Error(`WhatsApp 客户端未找到: ${accountId}`);
    const connected = await client.isConnected();
    if (!connected) throw new Error(`WhatsApp 客户端未连接: ${accountId}`);
    return client;
  }

  private validateFile(file: any) {
    const buffer = file.file?.buffer;
    let fileName = file.fileName || file.file?.originalname || '';
    const mimeType = file.file?.mimetype;

    console.log('🔍 [validateFile] 接收到的文件信息:', {
      'file.fileName': file.fileName,
      'file.file?.originalname': file.file?.originalname,
      'fileName (最终)': fileName,
      'mimeType': mimeType,
      'bufferLength': buffer?.length,
      'fileKeys': Object.keys(file || {}),
      'file.fileKeys': Object.keys(file.file || {})
    });

    if (!buffer?.length) throw new Error('文件 Buffer 为空');
    if (!mimeType) throw new Error('MIME 类型缺失');
    
    // 简单的文件名验证和清理
    if (!fileName || fileName.trim() === '') {
      const ext = mimeType.split('/')[1] || 'bin';
      fileName = `file_${Date.now()}.${ext}`;
      console.warn('⚠️ [validateFile] 文件名为空，使用默认名称:', fileName);
    } else {
      // 清理文件名中的非法字符
      fileName = fileName.replace(/[<>:"/\\|?*]/g, '_').trim();
      console.log('✅ [validateFile] 文件名清理完成:', fileName);
    }

    console.log('🔍 [validateFile] 最终文件信息:', {
      fileName,
      mimeType,
      bufferLength: buffer.length
    });

    return { buffer, fileName, mimeType };
  }

  private saveTempFile(buffer: Buffer, fileName: string): string {
    const tempDir = path.join(process.cwd(), 'temp', 'whatsapp');
    fs.mkdirSync(tempDir, { recursive: true });
    const tempPath = path.join(tempDir, `temp_${Date.now()}_${fileName}`);
    fs.writeFileSync(tempPath, buffer);
    console.log(`📁 [Temp] 保存: ${tempPath}`);
    return tempPath;
  }

  // 简单封装：返回可复制的现有文件路径（当前即为 temp 文件路径）
  private filePathOrTemp(p: string): string { return p; }

  private cleanupTempFile(tempPath: string) {
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
        console.log(`🗑️ [Temp] 已删除: ${path.basename(tempPath)}`);
      }
    } catch (error) {
      console.warn(`⚠️ [Temp] 删除临时文件失败: ${path.basename(tempPath)}`);
    }
  }

  /**
   * 清理所有旧的临时文件
   */
  private cleanupOldTempFiles() {
    const tempDirs = [
      path.join(SERVER_ROOT, 'temp', 'whatsapp'),
      path.join(SERVER_ROOT, 'temp', 'voice-cache')
    ];

    let totalCleaned = 0;
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24小时

    tempDirs.forEach(tempDir => {
      try {
        if (!fs.existsSync(tempDir)) {
          return;
        }

        const files = fs.readdirSync(tempDir);
        let cleanedCount = 0;
        
        files.forEach(file => {
          const filePath = path.join(tempDir, file);
          try {
            const stats = fs.statSync(filePath);
            if (now - stats.mtime.getTime() > maxAge) {
              fs.unlinkSync(filePath);
              cleanedCount++;
              totalCleaned++;
              console.log(`🗑️ [Temp] 清理旧文件: ${file}`);
            }
          } catch (error) {
            console.warn(`⚠️ [Temp] 清理文件失败: ${file}`, error);
          }
        });

        if (cleanedCount > 0) {
          console.log(`✅ [Temp] ${path.basename(tempDir)} 清理完成，删除了 ${cleanedCount} 个文件`);
        }
      } catch (error) {
        console.warn(`⚠️ [Temp] 清理目录失败: ${tempDir}`, error);
      }
    });

    if (totalCleaned > 0) {
      console.log(`✅ [Temp] 总清理完成，删除了 ${totalCleaned} 个旧文件`);
    }
  }
  private async sendTextMessage(client: any, chatId: string, text: string): Promise<boolean> {
    await client.sendText(chatId, text);
    console.log(`✅ 文本消息发送成功`);
    return true;
  }

  private async sendVoiceMessage(client: any, chatId: string, filePath: string, mimeType: string): Promise<boolean> {
    // 路径级 MIME 检测，必要时校正传入的 mimeType
    // 简易路径MIME检测（不引入类型依赖）
    try {
      const ext = path.extname(filePath).toLowerCase();
      const extMap: Record<string, string> = {
        '.ogg': 'audio/ogg',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.m4a': 'audio/m4a',
        '.aac': 'audio/aac',
        '.webm': 'audio/webm'
      };
      const detected = extMap[ext];
      if (detected && detected !== mimeType) {
        console.log(`🔎 [MIME检查] 路径检测=${detected}，传入=${mimeType}`);
        mimeType = detected;
      }
    } catch {}
    
    console.log(`🎤 尝试发送语音 dataURL`);
    console.log(typeof client.sendPtt, typeof client.sendVoice, typeof client.sendAudio);
    let dataUrl: string | null = null;
    let sendSucceeded = false;
    let maybeId: any = null;
  
    try {
      let buf = fs.readFileSync(filePath);
      
      // 检查是否为 WebM 格式，进行转换
      if (mimeType.includes('webm') || path.extname(filePath).toLowerCase() === '.webm') {
        console.log(`🔄 [语音转换] 检测到 WebM 格式，开始转换为 OGG`);
        console.log(`🔍 [语音转换] 文件信息: MIME=${mimeType}, 扩展名=${path.extname(filePath)}, 大小=${buf.length} bytes`);
        try {
          const convertedBuf = await this.convertWebmToOgg(buf);
          buf = convertedBuf as any;
          mimeType = 'audio/ogg';
          console.log(`✅ [语音转换] WebM 转换为 OGG 成功: ${buf.length} bytes`);
        } catch (convertError) {
          console.error(`❌ [语音转换] WebM 转换失败:`, convertError);
          // 如果转换失败，继续使用原始文件
        }
      } else {
        console.log(`ℹ️ [语音转换] 非 WebM 格式，跳过转换: MIME=${mimeType}, 扩展名=${path.extname(filePath)}`);
      }
      
      dataUrl = `data:${mimeType};base64,${buf.toString('base64')}`;
    } catch (err) {
      console.warn("⚠️ 转换 dataUrl 失败:", err);
    }
  
    // 1) sendPtt(dataUrl)
    if (!sendSucceeded && dataUrl) {
      try {
        // await client.sendText(chatId, `🎤 尝试 sendPtt(chatId, dataUrl)`);
        maybeId = await client.sendPtt(chatId, dataUrl);
        console.log(`✅ 语音发送成功 (sendPtt dataUrl)`);
        sendSucceeded = true;
      } catch (err) {
        console.error('❌ sendPtt(dataUrl) 出错:', err);
        console.warn(`⚠️ sendPtt(dataUrl) 失败`, err);
      }
    }
  
   
  
    return sendSucceeded;
  }

  private async sendMediaMessage(client: any, chatId: string, filePath: string, mimeType: string, originalFileName?: string): Promise<{ success: boolean; hash?: string; fileName?: string }> {
    try {
      const { hash, fileName } = await this.generateFileHash(filePath);
      console.log(`📦 [sendMediaMessage] 文件信息:`, {
        filePath,
        generatedFileName: fileName,
        originalFileName,
        mimeType,
        hash
      });
      
      // 使用原始文件名作为发送时的文件名
      const sendFileName = originalFileName || fileName;
      console.log(`📤 [sendMediaMessage] 发送文件: ${sendFileName}`);
      
      // 使用@open-wa/wa-automate的sendFile方法
      // 正确的参数顺序：sendFile(to: ChatId, file: AdvancedFile, filename: string)
      await client.sendFile(chatId, filePath, sendFileName);
      console.log(`🔍 [sendMediaMessage] 已传递文件名给WhatsApp: ${sendFileName}`);
      
      console.log(`✅ [sendMediaMessage] 媒体文件发送成功: ${sendFileName}`);
      return { success: true, hash, fileName: sendFileName };
    } catch (error) {
      console.error(`❌ [sendMediaMessage] 媒体文件发送失败:`, error);
      return { success: false };
    }
  }

  private async sendImageMessage(client: any, chatId: string, filePath: string, mimeType: string): Promise<{ success: boolean; realId?: string }> {
    try {
      console.log(`🖼️ 尝试发送图片: ${filePath}`);
      
      // 优先使用 sendImage（某些 client SDK 直接提供）
      if (typeof client.sendImage === 'function') {
        const maybeId = await client.sendImage(chatId, filePath, '', '', null , true);
        console.log('🧪 [waitForId] 返回值:', typeof maybeId, maybeId);
        const realId = typeof maybeId === 'string' ? maybeId : (maybeId?.id?._serialized || maybeId?.id || maybeId?.key?.id);
        if (realId) {
          console.log(`🆔 [WhatsApp Provider] 发送媒体真实 messageId: ${realId}`);
        }
        console.log(`✅ 图片发送成功`);
        return { success: true, realId };
      } else {
        // fallback 方式（有些 SDK 只有 sendFile）
        await client.sendFile(chatId, filePath, '');
        console.log(`✅ 图片发送成功`);
        return { success: true };
      }
    } catch (err) {
      console.warn(`⚠️ sendImage 失败，尝试 sendFile`);
      try {
        await client.sendFile(chatId, filePath, '');
        console.log(`✅ 图片通过 sendFile 成功`);
        return { success: true };
      } catch (finalErr) {
        console.error(`❌ 图片发送失败: ${finalErr}`);
        return { success: false };
      }
    }
  }

  private async sendFileFallback(client: any, chatId: string, filePath: string): Promise<boolean> {
    try {
      await client.sendFile(chatId, filePath, '');
      console.log(`✅ 回退文件发送成功`);
      return true;
    } catch (err) {
      console.error(`❌ 文件发送失败: ${err}`);
      return false;
    }
  }

  private detectMediaType(mimeType: string): 'photo' | 'video' | 'document' | 'voice' | undefined {
    try {
      const m = (mimeType || '').toLowerCase();
      if (m.startsWith('image/')) return 'photo';
      if (m.startsWith('video/')) return 'video';
      if (m.startsWith('audio/')) return 'voice';
      if (m) return 'document';
    } catch {}
    return undefined;
  }
  private handleError(chatId: string, error: any) {
    const msg = error?.message || '未知错误';
    console.error(`❌ [WhatsApp] ${chatId}: ${msg}`);
    if (msg.includes('not-authorized')) console.error(`未授权`);
    else if (msg.includes('not-connected')) console.error(`未连接`);
    else if (msg.includes('chat-not-found')) console.error(`聊天不存在`);
  }

  // async sendMessage(chatId: string, content: string, messageType?: string, file?: any): Promise<boolean> {
  //   try {
  //     console.log(`📤 [WhatsApp Provider] 发送消息到: ${chatId}`);
  //     console.log(`📤 [WhatsApp Provider] 消息内容: ${content}`);
  //     console.log(`📤 [WhatsApp Provider] 消息类型: ${messageType}`);
  //     console.log(`📤 [WhatsApp Provider] 文件数据:`, file ? '有文件' : '无文件');

  //     const { accountId, originalChatId } = this.parseChatId(chatId);
  //     const client = await this.getClient(accountId);

  //     if (!client) {
  //       throw new Error(`WhatsApp 客户端未找到: ${accountId}`);
  //     }

  //     // 验证连接状态
  //     const isConnected = await client.isConnected();
  //     if (!isConnected) {
  //       throw new Error(`WhatsApp 客户端未连接: ${accountId}`);
  //     }

  //     // 直接使用 JID 发送（OpenWA 客户端）
  //     console.log(`🔍 [WhatsApp Provider] 目标JID: ${originalChatId}`);

  //     // 根据消息类型发送不同内容
  //     if (messageType === 'text' || !messageType) {
  //       // 发送文本消息（OpenWA）
  //       await client.sendText(originalChatId as any, content);
  //       console.log(`✅ [WhatsApp Provider] 文本消息发送成功: ${chatId}`);
  //       return true;

  //     } else if (file && file.file) {
  //       // 处理文件消息（图片、视频、文档、音频、语音）
  //       const fileBuffer = file.file.buffer;
  //       const fileName = file.fileName || file.file.originalname;
  //       const mimeType = file.file.mimetype;

  //       console.log(`📤 [WhatsApp Provider] 发送文件: ${fileName} (${mimeType})`);
  //       console.log(`📤 [WhatsApp Provider] 文件大小: ${fileBuffer ? fileBuffer.length : 'undefined'} bytes`);

  //       // 验证文件 Buffer 存在
  //       if (!fileBuffer || fileBuffer.length === 0) {
  //         console.error(`❌ [WhatsApp Provider] 文件 Buffer 为空:`, {
  //           bufferExists: !!fileBuffer,
  //           bufferLength: fileBuffer ? fileBuffer.length : 0,
  //           fileData: file
  //         });
  //         throw new Error("文件内容为空或无效");
  //       }

  //       // 验证文件名和 MIME 类型
  //       if (!fileName || !mimeType) {
  //         console.error(`❌ [WhatsApp Provider] 文件元数据缺失:`, {
  //           fileName: fileName,
  //           mimeType: mimeType,
  //           fileData: file
  //         });
  //         throw new Error("文件名或 MIME 类型缺失");
  //       }

  //       // 尝试两种方法：文件路径和数据URL
  //       const base64 = fileBuffer.toString('base64');
  //       const dataUrl = `data:${mimeType};base64,${base64}`;
  //       console.log(`🔍 [WhatsApp Provider] 文件大小: ${fileBuffer ? fileBuffer.length : 'undefined'} bytes`);
  //       console.log(`🔍 [WhatsApp Provider] 文件内容: ${dataUrl.substring(0, 100)}...`);

  //       // 验证数据URL格式
  //       if (!dataUrl.startsWith('data:')) {
  //         throw new Error('生成的数据URL格式不正确');
  //       }

  //       // 验证base64数据
  //       if (base64.length === 0) {
  //         throw new Error('Base64编码后的数据为空');
  //       }

  //       // 检查数据URL大小（WhatsApp Web可能对数据URL大小有限制）
  //       if (dataUrl.length > 1000000) { // 1MB限制
  //         console.warn(`⚠️ [WhatsApp Provider] 数据URL过大 (${dataUrl.length} 字符)，可能导致发送失败`);
  //       }

  //       // 创建临时文件路径（作为备用方案）
  //       const tempDir = path.join(process.cwd(), 'temp', 'whatsapp');
  //       const tempFilePath = path.join(tempDir, `temp_${Date.now()}_${fileName}`);

  //       // 确保临时目录存在
  //       try {
  //         fs.mkdirSync(tempDir, { recursive: true });
  //         fs.writeFileSync(tempFilePath, fileBuffer);
  //         console.log(`📁 [WhatsApp Provider] 创建临时文件: ${tempFilePath}`);
  //       } catch (tempError: any) {
  //         console.warn(`⚠️ [WhatsApp Provider] 创建临时文件失败:`, tempError.message);
  //       }
  //       // 发送结果标记，确保所有分支最终统一返回并且执行清理
  //       let sendSucceeded = false;

  //       // 发送语音（PTT）
  //       if (mimeType.startsWith('audio/') && messageType === 'voice') {
  //         if (!client) {
  //           console.error(`❌ [WhatsApp Provider] 客户端未连接，无法发送语音`);
  //           sendSucceeded = false;
  //         } else {
  //           try {
  //             console.log(`🎤 [WhatsApp Provider] 发送语音(PTT)`);
  //             // 按基本用法，仅传 dataUrl
  //             console.log(originalChatId);
  //             // console.log(dataUrl);
  //             // console.log('dataUrl:',dataUrl);
  //             await client.sendPtt(accountId as any, dataUrl)  
  //             // await client.sendPtt(originalChatId as any, tempFilePath)  
  //             console.error(`❌ [WhatsApp Provider] 语音回退发送失败:`, {
  //               originalChatId:originalChatId,
  //               tempFilePath:tempFilePath,
  //               fileName:fileName,
  //               content:content,
  //             });

  //             console.log(`✅ [WhatsApp Provider] 语音消息发送成功1`);
  //             sendSucceeded = true;
  //           } catch (pttError: any) {
  //              await (client as any).sendAudio(originalChatId as any, tempFilePath)
  //             // console.error(`❌ [WhatsApp Provider] sendPtt 失败:`, {
  //             //   message: pttError?.message || String(pttError),
  //             //   stack: pttError?.stack,
  //             //   code: pttError?.code,
  //             //   name: pttError?.name,
  //             //   data: pttError
  //             // });
  //             // 回退：尝试发送音频为文件
  //             try {
  //               await (client as any).sendFile(originalChatId as any, tempFilePath, '', '');

  //               console.log(`✅ [WhatsApp Provider] 回退为文件发送成功(语音)2`);
  //               sendSucceeded = true;
  //             } catch (fileErr: any) {
  //               console.error(`❌ [WhatsApp Provider] 语音回退发送失败:`, {
  //                 originalChatId:originalChatId,
  //                 tempFilePath:tempFilePath,
  //                 fileName:fileName,
  //                 content:content,
  //                 message: fileErr?.message || String(fileErr),
  //                 stack: fileErr?.stack,
  //                 code: fileErr?.code,
  //                 name: fileErr?.name,
  //                 data: fileErr
  //               });
  //               sendSucceeded = false;

  //             try{
  //                 // 或者使用 sendFile 并指定文件名  
  //               await client.sendFile(originalChatId as any, fileBuffer, 'audio.webm', '');
  //               console.log(`✅ [WhatsApp Provider] 回退为文件发送成功(语音)3`);
  //               sendSucceeded = true;
  //             } catch (fileErr: any) {
  //               console.error(`❌ [WhatsApp Provider] 语音回退发送失败:`, {
  //                 originalChatId:originalChatId,
  //                 tempFilePath:tempFilePath,
  //                 fileName:fileName,
  //                 content:content,
  //                 message: fileErr?.message || String(fileErr),
  //                 stack: fileErr?.stack,
  //                 code: fileErr?.code,
  //                 name: fileErr?.name,
  //                 data: fileErr
  //               });
  //               sendSucceeded = false;
  //             }}
  //           }
  //         }
  //       } else {
  //         // 其他媒体/文档
  //         try {
  //           // 使用临时文件路径而不是 data URL
  //           await client.sendFile(originalChatId as any, tempFilePath, '', '');
  //           console.log(`📎 [WhatsApp Provider] 媒体/文档消息发送成功`);
  //           sendSucceeded = true;
  //         } catch (fileError: any) {
  //           console.error(`❌ [WhatsApp Provider] sendFile 失败:`, fileError);
  //           throw new Error(`文件消息发送失败: ${fileError.message}`);
  //         }
  //       }

  //       // 日志：根据结果输出不同提示
  //       if (sendSucceeded) {
  //         console.log(`✅ [WhatsApp Provider] 文件/提示发送成功: ${chatId} (${messageType})`);
  //       } else if (mimeType.startsWith('audio/') && messageType === 'voice') {
  //         console.log(`⚠️ [WhatsApp Provider] 语音发送失败，且文本提示可能未发送: ${chatId}`);
  //       }

  //       // 清理临时文件
  //       try {
  //         if (fs.existsSync(tempFilePath)) {
  //           fs.unlinkSync(tempFilePath);
  //           console.log(`🗑️ [WhatsApp Provider] 临时文件已清理: ${tempFilePath}`);
  //         }
  //       } catch (cleanupError: any) {
  //         console.warn(`⚠️ [WhatsApp Provider] 清理临时文件失败:`, cleanupError.message);
  //       }

  //       return sendSucceeded;

  //     } else {
  //       // 发送普通文本消息（OpenWA）
  //       await client.sendText(originalChatId as any, content);
  //       console.log(`✅ [WhatsApp Provider] 消息发送成功: ${chatId}`);
  //       return true;
  //     }

  //   } catch (error: any) {
  //     console.error(`❌ [WhatsApp Provider] 发送消息失败: ${chatId}`, error);

  //     // 解析聊天ID获取原始聊天ID
  //     let originalChatId = 'unknown';
  //     try {
  //       const parsed = this.parseChatId(chatId);
  //       originalChatId = parsed.originalChatId;
  //     } catch (e) {
  //       // 如果解析失败，使用整个chatId
  //       originalChatId = chatId;
  //     }

  //     // 处理特定的 WhatsApp 错误
  //     if (error?.message) {
  //       if (error.message.includes('not-authorized')) {
  //         console.error(`❌ [WhatsApp] 客户端未授权: ${originalChatId}`);
  //       } else if (error.message.includes('not-connected')) {
  //         console.error(`❌ [WhatsApp] 客户端未连接: ${originalChatId}`);
  //       } else if (error.message.includes('chat-not-found')) {
  //         console.error(`❌ [WhatsApp] 聊天不存在: ${originalChatId}`);
  //       } else {
  //         console.error(`❌ [WhatsApp] 其他错误: ${error.message}`);
  //       }
  //     }

  //     return false;
  //   }
  // }

  /**
   * 启动实时监听，通过回调输出标准化后的消息与会话
   */
  async start(onMessage: (payload: { message: ChatMessage; chatInfo: ChatInfo; accountId: string;  }) => void): Promise<void> {
    // 保存回调函数
    this.messageCallback = onMessage;

    // // 等待一段时间让客户端完成重连
    // console.log(`⏳ [WhatsApp Provider] 等待客户端重连完成...`);
    // await new Promise(resolve => setTimeout(resolve, 5000)); // 等待5秒

    const clients = getAllReconnectedWaClients();
    console.log(`🚀 [WhatsApp Provider] 开始启动消息监听，找到 ${clients.size} 个客户端`);

    // 获取活跃的WhatsApp会话
    const activeSessions = sessionStateService.getActiveSessionsByProvider('whatsapp');
    console.log(`📊 [WhatsApp Provider] 活跃会话数量: ${activeSessions.length}`);

    // 启动定期重新注册机制
    this.startReRegisterInterval();

    for (const [accountId, client] of clients) {
      try {
        // 检查账号是否活跃
        const session = activeSessions.find(s => s.id === accountId);
        if (!session) {
          console.log(`⚠️ [WhatsApp Provider] 账号 ${accountId} 未找到，跳过监听`);
          continue;
        }

        // 检查isActive状态，如果未定义则默认为true（活跃）
        const isActive = session.data.isActive !== undefined ? session.data.isActive : true;
        if (!isActive) {
          console.log(`⚠️ [WhatsApp Provider] 账号 ${accountId} 未激活，跳过监听`);
          continue;
        }

        console.log(`✅ [WhatsApp Provider] 账号 ${accountId} 已激活，开始注册监听器`);

        // 避免重复注册
        if (this.handlers.has(accountId)) {
          console.log(`⚠️ [WhatsApp Provider] 账号 ${accountId} 已注册监听器，跳过`);
          continue;
        }

        // 验证客户端连接状态
        const isConnected = await client.isConnected();
        if (!isConnected) {
          console.log(`❌ [WhatsApp Provider] 账号 ${accountId} 未连接，跳过监听器注册`);
          continue;
        }

        console.log(`✅ [WhatsApp Provider] 账号 ${accountId} 连接正常，开始注册监听器`);

        const handler = async (message: any) => {
          try {
            // 检查账号是否仍然活跃
            const activeSessions = sessionStateService.getActiveSessionsByProvider('whatsapp');
            console.log(`🔍 [WhatsApp Provider] 检查账号 ${accountId} 活跃状态:`, {
              activeSessionsCount: activeSessions.length,
              activeSessionIds: activeSessions.map(s => s.id),
              currentAccountId: accountId
            });

            const session = activeSessions.find(s => s.id === accountId);
            console.log(`🔍 [WhatsApp Provider] 找到的会话:`, session ? {
              id: session.id,
              isActive: session.data.isActive,
              provider: session.provider
            } : 'null');

            if (!session) {
              console.log(`⚠️ [WhatsApp Provider] 账号 ${accountId} 未找到，停止处理消息`);
              // 停止该账号的监听
              await this.stopAccountListening(accountId);
              return;
            }

            // 检查isActive状态，如果未定义则默认为true（活跃）
            const isActive = session.data.isActive !== undefined ? session.data.isActive : true;
            if (!isActive) {
              console.log(`⚠️ [WhatsApp Provider] 账号 ${accountId} 已禁用，停止处理消息`);
              // 停止该账号的监听
              await this.stopAccountListening(accountId);
              return;
            }

            if (!message) {
              console.log(`⚠️ [WhatsApp Provider] 收到空消息，跳过`);
              return;
            }

            // 添加调试日志
            console.log(`📨 [WhatsApp Provider] 收到新消息:`, {
              accountId,
              messageId: message.id?._serialized || message.id,
              fromMe: message.fromMe,
              body: message.body?.substring(0, 50) + '...',
              timestamp: message.timestamp
            });

            // 去重
            const key = `${accountId}-${message.id?._serialized || message.id}`;
            if (this.processedMessages.has(key)) {
              console.log(`🔄 [WhatsApp去重] 消息已处理，跳过: ${key}`);
              return;
            }
            this.processedMessages.add(key);

            if (this.processedMessages.size > 2000) {
              const iter = this.processedMessages.values();
              const first = iter.next().value as string | undefined;
              if (typeof first === 'string') this.processedMessages.delete(first);
            }

            // 获取聊天信息 - 使用client.getChatById替代message.getChat()
            let chat;
            try {
              // 首先尝试从消息对象获取chatId
              const chatId = message.chatId || message.to || message.from;
              if (chatId) {
                chat = await client.getChatById(chatId);
                // console.log(`✅ [WhatsApp Provider] 获取聊天信息成功:`, chat);
              } else {
                // 如果消息对象没有getChat方法，尝试从客户端获取聊天信息
                console.log(`⚠️ [WhatsApp Provider] 消息对象没有getChat方法，尝试从客户端获取聊天信息`);
                // 尝试多种方式获取chatId
                let fallbackChatId = message.from || message.chatId || message.to || message.id?.remote;

                // 如果还是没有chatId，尝试从消息ID中提取
                if (!fallbackChatId && message.id?._serialized) {
                  const messageIdParts = message.id._serialized.split('_');
                  if (messageIdParts.length >= 2) {
                    fallbackChatId = messageIdParts[1]; // 通常第二部分是chatId
                  }
                }

                console.log(`🔍 [WhatsApp Provider] 尝试的chatId:`, {
                  from: message.from,
                  chatId: message.chatId,
                  to: message.to,
                  remote: message.id?.remote,
                  serialized: message.id?._serialized,
                  finalChatId: fallbackChatId
                });

                if (fallbackChatId) {
                  chat = await client.getChatById(fallbackChatId);
                } else {
                  console.log(`❌ [WhatsApp Provider] 无法确定chatId，跳过消息`);
                  return;
                }
              }
            } catch (chatError: any) {
              console.log(`⚠️ [WhatsApp Provider] 获取聊天信息失败:`, chatError?.message || chatError);
              console.log(`🔍 [WhatsApp Provider] 消息详情:`, {
                messageId: message.id?._serialized || message.id,
                from: message.from,
                chatId: message.chatId,
                to: message.to,
                remote: message.id?.remote,
                hasGetChat: typeof message.getChat === 'function'
              });
              return;
            }

            if (!chat) {
              console.log(`⚠️ [WhatsApp Provider] 无法获取聊天信息，跳过消息`);
              return;
            }

            const originalChatId = (chat.id as any)?._serialized || chat.id || message.from || message.chatId || 'unknown';
            const isOwn = message.fromMe || false;

            // 检测消息类型和内容
            const { messageType, content } = await this.detectMessageTypeAndContent(message, accountId, client);

            // 组装 ChatMessage
            const chatMessage: ChatMessage = {
              id: `wa:${accountId}:${(message.id as any)?._serialized || message.id}`,
              chatId: `wa:${accountId}:${originalChatId}`,
              sender: message.sender?.pushname || message.sender?.name || (isOwn ? 'Me' : '未知发送者'),
              content: content,
              timestamp: message.timestamp * 1000,
              isOwn,
              messageType: messageType,
              status: message.ack === 3 ? 'read' : message.ack === 2 ? 'delivered' : 'sent'
            };

            // 组装 ChatInfo
            const chatInfo: ChatInfo = {
              id: `wa:${accountId}:${originalChatId}`,
              platform: 'whatsapp',
              accountId,
              groupId: chat.isGroup ? `whatsapp:gid:${originalChatId.split('@')[0]}` : `whatsapp:jid:${originalChatId}`,
              name: (chat as any).name || (chat as any).formattedName || (chat as any).pushname || originalChatId.split('@')[0] || '未知聊天',
              avatar: this.resolveAvatar(chat),
              type: chat.isGroup ? 'group' : 'private',
              memberCount: (chat as any).participants?.length,
              lastMessage: chatMessage.content,
              lastMessageTime: chatMessage.timestamp,
              lastMessageSender: chatMessage.sender,
              unreadCount: 0,
              status: 'online',
              createdAt: Date.now() - 86400000,
              updatedAt: Date.now()
            };

            console.log(`✅ [WhatsApp Provider] 处理消息成功，准备推送:`, {
              chatId: chatMessage.chatId,
              sender: chatMessage.sender,
              content: chatMessage.content.substring(0, 30) + '...',
              messageType: chatMessage.messageType
            });

            if (this.messageCallback) {
              console.log('🪝 [WhatsApp Provider] 即将调用上层回调 messageCallback', {
                accountId,
                chatId: chatMessage.chatId,
                messageId: chatMessage.id,
                messageType: chatMessage.messageType
              });
              this.messageCallback({ message: chatMessage, chatInfo, accountId, messageType });
              console.log('✅ [WhatsApp Provider] 上层回调已返回');
            } else {
              console.log('⚠️ [WhatsApp Provider] messageCallback 未设置，跳过回调触发');
            }
          } catch (e) {
            console.error('❌ [WhatsAppProvider.start] 处理事件失败:', e);
            // 添加重试机制
            setTimeout(() => {
              console.log(`🔄 [WhatsApp Provider] 尝试重新处理消息`);
            }, 1000);
          }
        };

        // 注册消息监听器（改进版本）
        try {
          console.log(`🔧 [WhatsApp Provider] 开始注册消息监听器: ${accountId}`);

          // 优先使用 onAnyMessage 方法（捕获所有消息，包括自己发送的）
          if (typeof (client as any).onAnyMessage === 'function') {
            (client as any).onAnyMessage(handler);
            console.log(`✅ [WhatsApp Provider] 使用 onAnyMessage 方法注册成功: ${accountId}`);
          }
          // 备用方案：使用 onMessage 方法
          else if (typeof (client as any).onMessage === 'function') {
            (client as any).onMessage(handler);
            console.log(`✅ [WhatsApp Provider] 使用 onMessage 方法注册成功: ${accountId}`);
          }
          // 最后备用方案：使用 on 方法
          else if (typeof (client as any).on === 'function') {
            (client as any).on('message', handler);
            console.log(`✅ [WhatsApp Provider] 使用 on('message') 方法注册成功: ${accountId}`);
          }
          // 最后尝试：直接监听事件
          else if (typeof (client as any).addEventListener === 'function') {
            (client as any).addEventListener('message', handler);
            console.log(`✅ [WhatsApp Provider] 使用 addEventListener 方法注册成功: ${accountId}`);
          } else {
            console.warn(`⚠️ [WhatsApp Provider] 客户端不支持任何消息事件API: ${accountId}`);
            console.log(`🔍 [WhatsApp Provider] 客户端方法列表:`, Object.getOwnPropertyNames(client));
          }
        } catch (e) {
          console.error(`❌ [WhatsApp Provider] 注册消息监听器失败: ${accountId}`, e);
        }

        this.handlers.set(accountId, { handler, client });
        console.log(`✅ [WhatsApp Provider] 监听器注册完成: ${accountId}`);
      } catch (e) {
        console.error(`❌ [WhatsAppProvider.start] 启动监听失败: ${accountId}`, e);
      }
    }

    console.log(`✅ [WhatsApp Provider] 消息监听启动完成，共注册 ${this.handlers.size} 个监听器`);
  }

  async stop(): Promise<void> {
    // 清理定时器
    if (this.reRegisterInterval) {
      clearInterval(this.reRegisterInterval);
      this.reRegisterInterval = null;
      console.log(`✅ [WhatsApp Provider] 定期重新注册定时器已清理`);
    }

    const clients = getAllReconnectedWaClients();
    for (const [accountId, client] of clients) {
      const entry = this.handlers.get(accountId);
      if (entry) {
        try {
          if ((client as any).removeListener) {
            (client as any).removeListener('message', entry.handler);
          }
          if ((client as any).offMessage) {
            (client as any).offMessage(entry.handler);
          }
        } catch { }
        this.handlers.delete(accountId);
      }
    }

    // 清理回调函数
    this.messageCallback = null;
    console.log(`✅ [WhatsApp Provider] 所有监听器已停止`);
  }

  /**
   * 停止特定账号的监听
   */
  async stopAccountListening(accountId: string): Promise<void> {
    console.log(`🛑 [WhatsApp Provider] 停止账号 ${accountId} 的监听...`);

    const handlerInfo = this.handlers.get(accountId);
    if (handlerInfo) {
      try {
        const { handler, client } = handlerInfo;
        if ((client as any).removeListener) {
          (client as any).removeListener('message', handler);
        }
        if ((client as any).offMessage) {
          (client as any).offMessage(handler);
        }

        // 从handlers中移除
        this.handlers.delete(accountId);

        // 清理该账号的已处理消息记录
        const keysToDelete = Array.from(this.processedMessages).filter(key => key.startsWith(`${accountId}-`));
        keysToDelete.forEach(key => this.processedMessages.delete(key));

        console.log(`✅ [WhatsApp Provider] 账号 ${accountId} 的监听已完全停止`);
      } catch (error: any) {
        console.error(`❌ [WhatsApp Provider] 停止账号 ${accountId} 监听失败:`, error.message);
      }
    } else {
      console.log(`⚠️ [WhatsApp Provider] 账号 ${accountId} 没有活跃的监听器`);
    }

    // 额外检查：确保从所有客户端中移除该账号的监听器
    try {
      const clients = getAllReconnectedWaClients();
      for (const [clientAccountId, client] of clients) {
        if (clientAccountId === accountId) {
          console.log(`🔍 [WhatsApp Provider] 检查客户端 ${accountId} 的监听器状态`);
          // 这里可以添加额外的清理逻辑，但主要清理已经在上面完成
        }
      }
    } catch (error: any) {
      console.error(`❌ [WhatsApp Provider] 额外清理失败:`, error.message);
    }
  }

  /**
   * 启动特定账号的监听
   */
  async startAccountListening(accountId: string): Promise<void> {
    console.log(`🚀 [WhatsApp Provider] 启动账号 ${accountId} 的监听...`);

    // 检查账号是否活跃
    const activeSessions = sessionStateService.getActiveSessionsByProvider('whatsapp');
    const session = activeSessions.find(s => s.id === accountId);
    if (!session || !session.data.isActive) {
      console.log(`⚠️ [WhatsApp Provider] 账号 ${accountId} 未激活，跳过启动监听`);
      return;
    }

    // 检查是否已经有监听器
    if (this.handlers.has(accountId)) {
      console.log(`⚠️ [WhatsApp Provider] 账号 ${accountId} 已有监听器，跳过启动`);
      return;
    }

    try {
      // 获取客户端
      const client = await this.getClient(accountId);
      if (!client) {
        console.log(`❌ [WhatsApp Provider] 无法获取账号 ${accountId} 的客户端`);
        return;
      }

      // 检查连接状态
      const isConnected = await client.isConnected();
      if (!isConnected) {
        console.log(`⚠️ [WhatsApp Provider] 账号 ${accountId} 客户端未连接，等待连接稳定`);
        // 等待连接稳定
        await new Promise(resolve => setTimeout(resolve, 3000));

        const isStillConnected = await client.isConnected();
        if (!isStillConnected) {
          console.log(`❌ [WhatsApp Provider] 账号 ${accountId} 客户端仍未连接，无法启动监听`);
          return;
        }
      }

      // 创建消息处理器
      const handler = async (message: any) => {
        try {
          if (!this.messageCallback) {
            console.log(`⚠️ [WhatsApp Provider] 消息回调未设置，跳过处理`);
            return;
          }

          // 生成消息唯一标识
          const messageId = `${accountId}-${message.id?._serialized || message.id || Date.now()}`;

          // 检查是否已处理过
          if (this.processedMessages.has(messageId)) {
            return;
          }
          this.processedMessages.add(messageId);

          console.log(`📨 [WhatsApp Provider] 收到新消息:`, {
            accountId,
            messageId: message.id?._serialized || message.id,
            fromMe: message.fromMe,
            body: message.body?.substring(0, 50) + '...',
            timestamp: message.timestamp
          });

          // 处理消息 - 这里需要实现完整的消息处理逻辑
          // 暂时跳过，因为需要完整的消息处理流程
          console.log(`⚠️ [WhatsApp Provider] 消息处理逻辑需要实现`);
        } catch (error: any) {
          console.error(`❌ [WhatsApp Provider] 处理消息失败:`, error.message);
        }
      };

      // 注册监听器
      if ((client as any).on) {
        (client as any).on('message', handler);
      } else if ((client as any).addListener) {
        (client as any).addListener('message', handler);
      }

      // 保存处理器信息
      this.handlers.set(accountId, { handler, client });

      console.log(`✅ [WhatsApp Provider] 账号 ${accountId} 的监听已启动`);
    } catch (error: any) {
      console.error(`❌ [WhatsApp Provider] 启动账号 ${accountId} 监听失败:`, error.message);
    }
  }

  async getChats(accountId: string): Promise<ChatInfo[]> {
    try {
      console.log(`📱 [WhatsApp Provider] 获取聊天列表: ${accountId}`);

      // 🚀 优化: 只获取一次客户端，然后传递给所有处理函数
      const client = await this.getClient(accountId);
      if (!client) {
        console.log(`⚠️ [WhatsApp Provider] 客户端未找到: ${accountId}`);
        return [];
      }


      // 验证连接状态
      const isConnected = await client.isConnected();
      if (!isConnected) {
        console.log(`⚠️ [WhatsApp Provider] 客户端未连接，等待重连稳定: ${accountId}`);
        // 等待一下让重连完成
        await new Promise(resolve => setTimeout(resolve, 3000));

        // 再次检查连接状态
        const isStillConnected = await client.isConnected();
        if (!isStillConnected) {
          console.log(`⚠️ [WhatsApp Provider] 客户端仍未连接: ${accountId}`);
          return [];
        }
        console.log(`✅ [WhatsApp Provider] 客户端重连稳定: ${accountId}`);
      }

      // 获取聊天列表（添加超时处理）
      let chats = [];
      try {
        const chatsPromise = client.getAllChats();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('getAllChats timeout')), 60000) // 60秒超时
        );

        chats = await Promise.race([chatsPromise, timeoutPromise]) as any[];
        console.log(`📋 [WhatsApp Provider] ${accountId} 获取到 ${chats.length} 个聊天`);
      } catch (timeoutError: any) {
        console.log(`⚠️ [WhatsApp Provider] ${accountId} 获取聊天列表失败:`, timeoutError?.message || '未知错误');
        console.log(`⚠️ [WhatsApp Provider] ${accountId} 错误类型:`, timeoutError?.constructor?.name || '未知类型');
        if (timeoutError?.message?.includes('timeout')) {
          console.log(`⚠️ [WhatsApp Provider] ${accountId} 操作超时，返回空数组`);
        } else {
          console.log(`⚠️ [WhatsApp Provider] ${accountId} 其他错误，返回空数组`);
        }
        return [];
      }

      // 目前 每个账号会拿50个对话
      const maxChats = Math.min(chats.length, 50);
      console.log(`⚡ [WhatsApp Provider] 处理前 ${maxChats} 个聊天（性能优化）`);

      // 🚀 优化2: 使用并发处理，传递客户端避免重复获取
      const chatPromises = [];

      for (let i = 0; i < maxChats; i++) {
        const chat = chats[i];
        chatPromises.push(this.processChatInfo(chat, accountId, i, client));
      }

      // 🚀 优化3: 并发执行所有聊天处理
      console.log(`⚡ [WhatsApp Provider] 开始并发处理 ${chatPromises.length} 个聊天...`);
      const startTime = Date.now();
      const results = await Promise.allSettled(chatPromises);
      const endTime = Date.now();
      console.log(`⚡ [WhatsApp Provider] 并发处理完成，耗时: ${endTime - startTime}ms`);

      // 过滤成功的结果
      const accountChats: ChatInfo[] = results
        .filter((result): result is PromiseFulfilledResult<ChatInfo> => result.status === 'fulfilled')
        .map(result => result.value);

      // console.log(`✅ [WhatsApp Provider] ${accountId} 成功处理 ${accountChats.length} 个聊天`);

      // 诊断：检查聊天ID重复或包含 undefined 的情况
      try {
        const ids = accountChats.map(c => c.id);
        const undefinedIds = ids.filter(id => !id || /undefined/i.test(String(id)));
        const seen = new Set<string>();
        const dupes: string[] = [];
        for (const id of ids) {
          if (!id) continue;
          if (seen.has(id)) dupes.push(id); else seen.add(id);
        }
        console.log('[Diag][Chats] total=', ids.length, 'unique=', seen.size, 'dupes=', dupes.length, 'undefinedLike=', undefinedIds.length);
        if (dupes.length > 0) {
          console.log('[Diag][Chats] duplicate examples:', dupes.slice(0, 5));
        }
        if (undefinedIds.length > 0) {
          console.log('[Diag][Chats] undefined-like id examples:', undefinedIds.slice(0, 5));
        }
      } catch (e) {
        console.log('[Diag][Chats] diagnostics failed:', e);
      }

      // 统一按最后消息时间排序（降序）；无最后消息的靠后
      accountChats.sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));
      return accountChats;

    } catch (error) {
      console.error(`❌ [WhatsApp Provider] 获取聊天列表失败: ${accountId}`, error);
      return [];
    }
  }

  // 🚀 新增：单独处理每个聊天信息的函数
  private async processChatInfo(chat: any, accountId: string, index: number, client: any): Promise<ChatInfo> {
    try {
      const rawId = (chat as any)?.id;
      const serializedId = (chat as any)?.id?._serialized;
      const fallbackId = `chat-${accountId}-${index}-${Date.now()}`;
      const originalChatId =
        typeof serializedId === 'string' && serializedId.length > 0
          ? serializedId
          : typeof rawId === 'string' && rawId.length > 0
            ? rawId
            : fallbackId;

      // 获取聊天名称
      let chatName = '';
      if ((chat as any).name) {
        chatName = (chat as any).name;
      } else if ((chat as any).isGroup) {
        chatName = `群组 ${originalChatId}`;
      } else {
        // 🚀 优化: 对于私聊，先尝试快速获取，避免阻塞
        const phoneOnly = String(originalChatId).includes('@') ? String(originalChatId).split('@')[0] : String(originalChatId);

        // 只在索引小于10时尝试获取联系人姓名，避免过多网络请求
        if (index < 10) {
          try {
            const contactName = await this.getContactName(originalChatId, accountId, client);
            chatName = contactName || phoneOnly || `聊天 ${originalChatId}`;
          } catch (error) {
            chatName = phoneOnly || `聊天 ${originalChatId}`;
          }
        } else {
          chatName = phoneOnly || `聊天 ${originalChatId}`;
        }
      }

      // 调试：仅输出前50个的关键字段
      // console.log(`🧪 [WhatsApp Provider] #${index} id=${originalChatId}, name=${chatName}`);

      // 获取头像（先尝试真实头像，再回退UI占位）
      let avatar = '';
      try {
        if ((chat as any).profilePicUrl) {
          avatar = (chat as any).profilePicUrl;
        } else if (index < 5) { // 限流：仅前5个尝试后端拉取头像，其他先用占位
          // 尝试从服务器拉取头像（私聊/群聊皆可传 JID）
          const fetched = await client.getProfilePicFromServer(originalChatId as any).catch(() => undefined);
          if (typeof fetched === 'string' && fetched.length > 0 && !/^error/i.test(fetched)) {
            avatar = fetched;
          }
        }
      } catch { }
      if (!avatar) {
        avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(chatName)}&size=320&background=random&bold=true`;
      }
      // 诊断：输出头像来源（只打印前10个，避免刷屏）
      // if (index < 10) {
      //   console.log('[Diag][Avatar][Server]', {
      //     accountId,
      //     idx: index,
      //     chatId: originalChatId,
      //     name: chatName,
      //     hasProfilePicUrl: Boolean((chat as any).profilePicUrl),
      //     avatarIsFetched: !((chat as any).profilePicUrl) && avatar && !avatar.includes('ui-avatars.com'),
      //     avatarSample: avatar?.slice(0, 120)
      //   });
      // }

      // 🚀 优化4: 简化最后消息获取，减少网络请求
      let lastMessage = '';
      let lastMessageTime = 0; // 没有最后消息时不应把该聊天置顶
      let lastMessageSender = '';
      let unreadCount = 0;

      // 使用聊天对象中已有的信息，避免额外的网络请求
      if ((chat as any).lastMessage) {
        const lastMsg = (chat as any).lastMessage;
        lastMessage = lastMsg.body || `[${lastMsg.type}]`;
        if (lastMsg.timestamp) {
          lastMessageTime = lastMsg.timestamp * 1000;
        }
        lastMessageSender = lastMsg.sender?.pushname || lastMsg.sender?.name || '未知发送者';
      }

      unreadCount = (chat as any).unreadCount || 0;

      const waGroupId = (chat as any).isGroup
        ? `whatsapp:gid:${originalChatId.split('@')[0]}`
        : `whatsapp:jid:${originalChatId}`;

      return {
        id: `wa:${accountId}:${originalChatId}`,
        platform: 'whatsapp',
        accountId: accountId,
        groupId: waGroupId,
        name: chatName,
        avatar: avatar,
        type: (chat as any).isGroup ? 'group' : 'private',
        phoneNumber: (chat as any).isGroup ? undefined : originalChatId.split('@')[0],
        memberCount: (chat as any).isGroup ? (chat as any).participants?.length : undefined,
        lastMessage: lastMessage,
        lastMessageTime: lastMessageTime,
        lastMessageSender: lastMessageSender,
        unreadCount: unreadCount,
        status: 'online',
        createdAt: Date.now() - 86400000,
        updatedAt: Date.now()
      };

    } catch (chatError) {
      console.log(`⚠️ [WhatsApp Provider] 处理聊天失败: ${accountId}`, chatError);
      throw chatError;
    }
  }

  // 🚀 新增：获取联系人姓名的方法（带缓存）
  private async getContactName(contactId: string, accountId: string, client?: any): Promise<string | null> {
    try {
      const cacheKey = `${accountId}-${contactId}`;
      if (this.contactNameCache.has(cacheKey)) {
        return this.contactNameCache.get(cacheKey) || null;
      }
  
      let waClient = client || await this.getClient(accountId);
      if (!waClient) return null;
  
      // Normalize contact ID
      const formattedContactId = contactId.includes('@') ? contactId : `${contactId}@c.us`;
  
      // Fetch with timeout
      const contactPromise = waClient.getContactById
        ? waClient.getContactById(formattedContactId)
        : waClient.getContact(formattedContactId);
  
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Contact fetch timeout')), 3000)
      );
  
      const contact = await Promise.race([contactPromise, timeoutPromise]) as any;
  
      // ✨ Enhanced fallback logic
      const contactName =
        contact?.pushname?.trim() ||
        contact?.name?.trim() ||
        contact?.formattedName?.trim() ||
        contact?.notify?.trim() ||
        (contact?.id?._serialized?.split('@')[0]) ||
        contactId.split('@')[0];
  
      this.contactNameCache.set(cacheKey, contactName || '');
      return contactName;
    } catch (error) {
      const cacheKey = `${accountId}-${contactId}`;
      this.contactNameCache.set(cacheKey, '');
      return null;
    }
  }
  

  private parseChatId(chatId: string): { accountId: string, originalChatId: string } {
    // 支持两种格式：
    // 1) 标准：wa:<accountId>:<jid>
    // 2) 兼容：wa-<accountId>-<jid>
    if (chatId.includes(':')) {
      const parts = chatId.split(':');
      if (parts.length !== 3) {
        throw new Error(`无效的WhatsApp聊天ID格式: ${chatId}`);
      }
      let accountId = parts[1];
      if (accountId.startsWith('wa-')) {
        accountId = accountId.substring(3);
      }
      return { accountId, originalChatId: parts[2] };
    }

    // 连字符旧格式处理：wa-<accountId>-<jid>
    const hyphenMatch = chatId.match(/^wa-(.+)-(\d+(?:-\d+)?@(?:c|g)\.us)$/);
    if (hyphenMatch) {
      let accountId = hyphenMatch[1];
      if (accountId.startsWith('wa-')) {
        accountId = accountId.substring(3);
      }
      const originalChatId = hyphenMatch[2];
      return { accountId, originalChatId };
    }

    throw new Error(`无效的WhatsApp聊天ID格式: ${chatId}`);
  }

  async getClient(accountId: string) {
    const allClients = getAllReconnectedWaClients();

    console.log(`🔍 [WhatsApp Provider] 查找客户端: ${accountId}`);
    console.log(`🔍 [WhatsApp Provider] 可用客户端:`, Array.from(allClients.keys()));

    // 尝试多种ID格式匹配
    let client = getReconnectedWaClient(accountId);

    if (client) {
      console.log(`✅ [WhatsApp Provider] 找到客户端: ${accountId} -> ${Array.from(allClients.keys()).find(key => allClients.get(key) === client)}`);
      return client;
    } else {
      console.log(`❌ [WhatsApp Provider] 客户端未找到: ${accountId}`);
      return null;
    }
  }

  private emptyResponse(): ChatMessagesResponse {
    return { messages: [], chatInfo: {} as ChatInfo, hasMore: false };
  }
  private extractPhoneNumber(jid: string): string {
    if (!jid) return '';
    return jid.split('@')[0]; // 取 @ 前面的部分
  }

  private async mapMessages(
    messages: any[],
    accountId: string,
    originalChatId: string,
    chat: any,
    client?: any
  ): Promise<ChatMessage[]> {
    const results = await Promise.all(
      messages.map(async (msg: any, index: number) => {
        // 1️⃣ Generate message ID
        const msgId =
          msg.id?._serialized ||
          `msg-${originalChatId}-${msg.timestamp || Date.now()}-${index}`;
  
        // 2️⃣ Extract phone number
        const phoneNumber = this.extractPhoneNumber(
          msg.from || msg.sender?.id || "未知号码"
        );
  
        // 3️⃣ Determine sender name
        let senderName = "未知发送者";
        if (msg.sender) {
          senderName =
            msg.sender.pushname ||
            msg.sender.name ||
            msg.sender.formattedName ||
            msg.sender.id ||
            "未知发送者";
        }
  
        // 4️⃣ Detect message type and content
        const { messageType, content } = await this.detectMessageTypeAndContent(
          msg,
          accountId,
          client
        );
  
        // 5️⃣ Determine sender avatar
        let senderAvatar = "";
        if (chat.contact?.profilePicThumbObj?.imgFull) {
          senderAvatar = chat.contact.profilePicThumbObj.imgFull;
        } else if (chat.pic && !chat.pic.startsWith("ERROR")) {
          senderAvatar = chat.pic;
        } else {
          const nameForAvatar =
            chat.contact?.formattedName || chat.formattedTitle || phoneNumber || "未知";
          senderAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(
            nameForAvatar
          )}&size=128&background=random&bold=true`;
        }
  
        // 6️⃣ Build base ChatMessage
        const base: ChatMessage = {
          id: `wa:${accountId}:${msgId}`,
          chatId: `wa:${accountId}:${originalChatId}`,
          sender: senderName,
          senderName: senderName,
          senderAvatar: senderAvatar,
          content: content,
          timestamp: msg.timestamp * 1000,
          isOwn: msg.fromMe || false,
          messageType: messageType,
          status: msg.ack === 3 ? "read" : msg.ack === 2 ? "delivered" : "sent",
        };
  
        // 7️⃣ Handle media files (document, video, photo, voice)
        if (["document", "video", "photo", "voice"].includes(messageType)) {
          try {
            let fileName = msg.filename?.trim();
            let fileHash: string | undefined;
  
            const url = typeof content === "string" ? content : "";
            if (url.includes(`/api/media/wa/${accountId}/${messageType}/`)) {
              const file = url.split("?")[0].split("/").pop() || "";
              const filePath = path.join(SERVER_ROOT, "public", "media", "wa", accountId, messageType, file);
              const metaPath = `${filePath}.meta.json`;
  
              if (fs.existsSync(metaPath)) {
                const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8") || "{}");
                fileName = fileName || meta?.originalName?.trim();
                fileHash = meta?.hash;
              } else if (fs.existsSync(filePath)) {
                const buf = fs.readFileSync(filePath);
                fileHash = crypto.createHash("md5").update(buf).digest("hex");
                fileName = fileName || decodeURIComponent(file).replace(/\+/g, " ");
                fs.writeFileSync(metaPath, JSON.stringify({ originalName: fileName, hash: fileHash, savedAs: path.basename(filePath), timestamp: Date.now() }));
              }
            }
  
            if (fileName) (base as any).fileName = fileName;
            if (fileHash) (base as any).fileHash = fileHash;
          } catch {}
        }
  
        return base;
      })
    );
  
    return results;
  }
  
  

  private buildChatInfo(chat: any, messages: any[], accountId: string, originalChatId: string): ChatInfo {
    let avatar = this.resolveAvatar(chat);
    const waGroupId = chat.isGroup
      ? `whatsapp:gid:${originalChatId.split('@')[0]}`
      : `whatsapp:jid:${originalChatId}`;
    const phone = originalChatId.split('@')[0] || '';
    const chatName =
      chat.name || chat.formattedName || chat.pushname || phone || '未知聊天';
    return {
      id: `wa:${accountId}:${originalChatId}`,
      platform: 'whatsapp',
      accountId: accountId,
      groupId: waGroupId,
      name: chatName,
      avatar,
      type: chat.isGroup ? 'group' : 'private',
      phoneNumber: chat.isGroup ? undefined : originalChatId.split('@')[0],
      memberCount: chat.isGroup ? chat.participants?.length : undefined,
      lastMessage: messages[0]?.body || '',
      lastMessageTime: messages[0]?.timestamp * 1000 || Date.now(),
      unreadCount: chat.unreadCount || 0,
      status: 'online',
      createdAt: Date.now() - 86400000,
      updatedAt: Date.now()
    };
  }

  private resolveAvatar(chat: any): string {
    // 私聊
    if (!chat.isGroup) {
      // 有 profilePicUrl 就用它
      if (chat.profilePicUrl) return chat.profilePicUrl;

      // fallback: 用号码或名字生成头像
      const phoneNumber = chat.id?.split('@')[0] || '未知号码';
      const chatName = chat.name || chat.formattedName || chat.pushname || phoneNumber;
      return `https://ui-avatars.com/api/?name=${encodeURIComponent(chatName)}&size=128&background=random&bold=true`;
    }

    // 群组
    if (chat.isGroup) {
      if (chat.profilePicUrl) return chat.profilePicUrl;

      const chatName = chat.name || '群组';
      return `https://ui-avatars.com/api/?name=${encodeURIComponent(chatName)}&size=128&background=random&bold=true`;
    }

    // 最后兜底
    return `https://ui-avatars.com/api/?name=未知聊天&size=128&background=random&bold=true`;
  }

  /**
 * 尝试合并 E2E + GP2 系统事件
 */
  private tryMergeSystemEvents(chatId: string): {
    messageType: ChatMessage['messageType'];
    content: string;
    merged: boolean;
  } | null {
    const events = systemMsgCache.get(chatId);
    if (!events || events.length === 0) return null;

    const e2e = events.find((e) => e.type === 'e2e');
    const gp2s = events.filter((e) => e.type === 'gp2');

    if (!e2e || gp2s.length === 0) return null;

    // Combine GP2 contents — keep unique, non-empty
    const gp2Contents = gp2s
      .map((e) => e.content?.trim())
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i);

    const mergedContent = `群组信息更新：${[e2e.content, ...gp2Contents].join('、')}`;

    console.log(`🔗 [Force Merge] E2E + ${gp2s.length} GP2 merged for ${chatId}:`);
    console.log(`   🧠 E2E content: ${e2e.content || '(空)'}`);
    gp2s.forEach((g, i) => console.log(`   📄 GP2[${i + 1}] content: ${g.content || '(空)'}`));

    systemMsgCache.delete(chatId);

    return {
      messageType: 'system',
      content: mergedContent,
      merged: true,
    };
  }

  /**
   * 检测消息类型和内容 - 带增强系统消息检测
   */
    private async detectMessageTypeAndContent(
      msg: any,
      accountId: string,
      client?: any
    ):Promise<{ messageType: ChatMessage['messageType']; content: string }>  {
      const chatId = msg.from;
      const type = msg.type;
      const body = msg.body || msg._data?.body || `[${type}]`;

      // === 🧩 Step 1. Group events (gp2) ===
      if (type === "gp2") {
        const subtype = msg.subtype || msg._data?.subtype;
        const authorId = msg.author || msg._data?.author;
        const recipient =
          msg.recipient ||
          msg.recipients?.[0] ||
          msg._data?.recipient ||
          msg._data?.recipients?.[0] ||
          msg._data?.participants?.[0];

        // ✅ Use your cached helper to get proper display names
        const authorName = authorId
          ? (await this.getContactName(authorId, accountId, client)) || "Someone"
          : "Someone";

        const recipientName = recipient
          ? (await this.getContactName(recipient, accountId, client)) || "someone"
          : "someone";

        let content = "";
        switch (subtype) {
          case "add":
            content = `${authorName} added ${recipientName}`;
            break;
          case "remove":
            content = `${authorName} removed ${recipientName || "someone"}`;
            break;
          case "leave":
            content = `${authorName} left.`;
            break;
          case "promote":
            content = `${authorName} promoted ${recipientName}`;
            break;
          case "demote":
            content = `${authorName} demoted ${recipientName}`;
            break;
          case "subject":
            content = `${authorName} changed the group name from"${body}"`;
            break;
          case "picture":
            content = `${authorName} changed the group picture`;
            break;
          case "invite":
            content = `${authorName} joined the group`;
            break;
          default:
            content = body || "(group update)";
        }

        return {
          messageType: "system",
          content,
        };
      }

      // === 🔐 Step 2. Encryption / notification system messages ===
      if (["e2e_notification", "notification_template", "system"].includes(type)) {
      const sysMsg =
        msg.systemMessage?.body ||
        msg.systemMessage?.content ||
        msg._data?.systemMessage?.body ||
        msg._data?.systemMessage?.content ||
        msg.body ||
        "(系统消息)";
      return { messageType: "system", content: sysMsg };
    }

    // === 🧩 Step 3. Try merging cached E2E + GP2 ===
    const merged = this.tryMergeSystemEvents(chatId);
    if (merged) return merged;
    // === 💬 Step 3. 常规消息类型检测 ===
    let messageType: ChatMessage['messageType'] = 'text';
    let content = body;

    // 对于媒体消息，不要使用 msg.body 作为 content，因为可能包含无效的占位符
    const isMediaMessage = ['image', 'video', 'audio', 'ptt', 'document', 'sticker'].includes(msg.type) ||
      (msg.media || msg._data?.media);
    if (isMediaMessage) {
      content = ''; // 媒体消息的 content 将在后续处理中设置
    }
    // 添加调试信息
    // console.log('🔍 [WhatsApp消息类型检测] 原始消息数据:', {
    //   messageId: msg.id?._serialized || msg.id,
    //   msgType: msg.type,
    //   msgBody: msg.body,
    //   hasMedia: !!(msg.media || msg._data?.media),
    //   mediaType: msg.media?.mimetype || msg._data?.media?.mimetype,
    //   isGroup: msg.isGroup,
    //   from: msg.from,
    //   to: msg.to
    // });

    if (msg.type === 'text' || msg.type === 'chat') {
      messageType = 'text';
      content = msg.body || '';
    } else if (msg.type === 'ptt') {
      // WhatsApp 语音消息（push-to-talk）
      messageType = 'voice';
      content = this.getMediaUrl(msg, 'voice', accountId, msg.id?._serialized || msg.id, client);
    } else if (msg.type === 'image') {
      messageType = 'photo';
      content = this.getMediaUrl(msg, 'photo', accountId, msg.id?._serialized || msg.id, client);
    } else if (msg.type === 'video') {
      messageType = 'video';
      content = this.getMediaUrl(msg, 'video', accountId, msg.id?._serialized || msg.id, client);
    } else if (msg.type === 'audio') {
      messageType = 'voice';
      content = this.getMediaUrl(msg, 'voice', accountId, msg.id?._serialized || msg.id, client);
    } else if (msg.type === 'document') {
      // 对于文档类型，先检查是否实际上是图片或其他媒体
      if (msg.media || msg._data?.media) {
        const mediaType = msg.media?.mimetype || msg._data?.media?.mimetype || '';
        console.log('🔍 [文档检测] 发现媒体消息:', { msgType: msg.type, mediaType });

        if (mediaType.startsWith('image/')) {
          messageType = 'photo';
          content = this.getMediaUrl(msg, 'photo', accountId, msg.id?._serialized || msg.id, client);
          console.log('✅ [文档检测] 识别为图片消息');
        } else if (mediaType.startsWith('video/')) {
          messageType = 'video';
          content = this.getMediaUrl(msg, 'video', accountId, msg.id?._serialized || msg.id, client);
          console.log('✅ [文档检测] 识别为视频消息');
        } else if (mediaType.startsWith('audio/')) {
          messageType = 'voice';
          content = this.getMediaUrl(msg, 'voice', accountId, msg.id?._serialized || msg.id, client);
          console.log('✅ [文档检测] 识别为语音消息');
        } else {
          messageType = 'document';
          content = this.getMediaUrl(msg, 'document', accountId, msg.id?._serialized || msg.id, client);
          console.log('✅ [文档检测] 确认为文档消息');
        }
      } else {
        messageType = 'document';
        content = this.getMediaUrl(msg, 'document', accountId, msg.id?._serialized || msg.id, client);
      }
    } else if (msg.type === 'sticker') {
      messageType = 'sticker';
      content = this.getMediaUrl(msg, 'sticker', accountId, msg.id?._serialized || msg.id, client);
    } else if (msg.type === 'location') {
      messageType = 'location';
      content = '[位置]';
    } else if (msg.type === 'contact') {
      messageType = 'contact';
      content = '[联系人]';
    } else if (msg.type === 'multi_vcard') {
      messageType = 'contact_multi';
      content = '[多个联系人]';
    } else if (msg.type === 'buttons_response') {
      messageType = 'buttons_response';
      content = `[按钮响应] ${msg.selectedButtonId || '未知按钮'}`;
    } else if (msg.type === 'list_response') {
      messageType = 'list_response';
      content = `[列表响应] ${msg.selectedListId || '未知列表'}`;
    } else if (msg.type === 'order') {
      messageType = 'order';
      content = '[订单消息]';
    } else if (msg.type === 'revoked') {
      messageType = 'revoked';
      content = '[消息已撤回]';
    } else if (msg.type === 'ciphertext') {
      messageType = 'encrypted';
      content = '[加密消息]';
      console.log('🔒 [智能检测] 识别为加密消息');
    } else {
      // 智能检测：即使 msg.type 不匹配，也尝试检测实际的消息类型
      if (msg.media || msg._data?.media) {
        const mediaType = msg.media?.mimetype || msg._data?.media?.mimetype || '';
        console.log('🔍 [智能检测] 发现媒体消息:', { msgType: msg.type, mediaType });

        if (mediaType.startsWith('image/')) {
          messageType = 'photo';
          content = this.getMediaUrl(msg, 'photo', accountId, msg.id?._serialized || msg.id, client);
          console.log('✅ [智能检测] 识别为图片消息');
        } else if (mediaType.startsWith('video/')) {
          messageType = 'video';
          content = this.getMediaUrl(msg, 'video', accountId, msg.id?._serialized || msg.id, client);
          console.log('✅ [智能检测] 识别为视频消息');
        } else if (mediaType.startsWith('audio/')) {
          messageType = 'voice';
          content = this.getMediaUrl(msg, 'voice', accountId, msg.id?._serialized || msg.id, client);
          console.log('✅ [智能检测] 识别为语音消息');
        } else {
          messageType = 'document';
          content = this.getMediaUrl(msg, 'document', accountId, msg.id?._serialized || msg.id, client);
          console.log('✅ [智能检测] 识别为文档消息');
        }
      } else if (msg.body && msg.body.includes('[image]')) {
        // 特殊处理：如果 body 包含 [image] 但 msg.type 不是 image
        messageType = 'photo';
        content = this.getMediaUrl(msg, 'photo', accountId, msg.id?._serialized || msg.id, client);
        console.log('✅ [智能检测] 通过 body 内容识别为图片消息');
      } else if (msg.body && msg.body.includes('[video]')) {
        messageType = 'video';
        content = this.getMediaUrl(msg, 'video', accountId, msg.id?._serialized || msg.id, client);
        console.log('✅ [智能检测] 通过 body 内容识别为视频消息');
      } else if (msg.body && msg.body.includes('[audio]')) {
        messageType = 'voice';
        content = this.getMediaUrl(msg, 'voice', accountId, msg.id?._serialized || msg.id, client);
        console.log('✅ [智能检测] 通过 body 内容识别为语音消息');
      } else if (msg.body && msg.body.includes('[document]')) {
        messageType = 'document';
        content = this.getMediaUrl(msg, 'document', accountId, msg.id?._serialized || msg.id, client);
        console.log('✅ [智能检测] 通过 body 内容识别为文档消息');
      }
      else {
        messageType = 'unknown';
        content = `[${msg.type}]`;
        console.log('❌ [智能检测] 无法识别消息类型:', msg.type);
      }
    }

    return { messageType, content };
  }

  /**
   * 获取基础URL
   */
  private getBaseUrl(): string {
    return config.API_BASE_URL;
  }

  /**
   * 获取媒体文件URL
   */
  private getMediaUrl(media: any, type: string, accountId: string, messageId: string, client?: any): string {
    try {
      const mediaDisabled = String(process.env.MEDIA_DOWNLOAD_DISABLED || '').trim().toLowerCase() === 'true';
      // console.log(`[WA][getMediaUrl] accountId=${accountId} type=${type} messageId=${messageId} disabled=${mediaDisabled}`);

      // 动态获取baseUrl，支持多种方案
      const baseUrl = this.getBaseUrl();

      if (mediaDisabled) {
        // 仅返回URL，不触发任何下载
        const fileExtension = this.getFileExtension(type);
        // console.log(`[WA][getMediaUrl] MEDIA_DOWNLOAD_DISABLED=true -> return URL only`);
        return `${baseUrl}/api/media/wa/${accountId}/${type}/${messageId}.${fileExtension}`;
      }
      const fileExtension = this.getFileExtension(type, media);
      const mediaUrl = `${baseUrl}/api/media/wa/${accountId}/${type}/${messageId}.${fileExtension}`;

      // 检查文件是否已存在
      const filePath = this.getMediaFilePath(accountId, type, messageId, media);
      // console.log(`🔍 [WA媒体] 检查文件路径: ${filePath}`);
      // console.log(`🔍 [WA媒体] 生成URL: ${mediaUrl}`);
      // console.log(`🔍 [WA媒体] 文件扩展名: ${fileExtension}`);

      if (fs.existsSync(filePath)) {
        // console.log(`📁 [WA媒体] 文件已存在: ${filePath}`);
        // console.log(`📁 [WA媒体] 返回URL: ${mediaUrl}`);
        return mediaUrl;
      } else {
        // console.log(`❌ [WA媒体] 文件不存在: ${filePath}`);
        // 尝试查找其他可能的扩展名
        const possibleExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
        for (const ext of possibleExtensions) {
          const altPath = path.join(SERVER_ROOT, 'public', 'media', 'wa', accountId, type, `${messageId}.${ext}`);
          if (fs.existsSync(altPath)) {
            console.log(`📁 [WA媒体] 找到替代文件: ${altPath}`);
            const altUrl = `${baseUrl}/api/media/wa/${accountId}/${type}/${messageId}.${ext}`;
            console.log(`📁 [WA媒体] 返回替代URL: ${altUrl}`);
            return altUrl;
          }
        }
      }

      // 如果没有客户端或媒体为空，返回占位符URL
      if (!client || !media) {
        console.log(`📁 [WhatsApp媒体] 无法触发下载:`, {
          hasClient: Boolean(client),
          hasMedia: Boolean(media)
        });
        return mediaUrl;
      }

      // 异步下载媒体文件（不阻塞当前请求）
      // console.log(`🔍 [WhatsApp媒体] 准备调用 downloadMediaAsync，参数:`, {
      //   type,
      //   accountId,
      //   messageId,
      //   hasClient: !!client,
      //   mediaKeys: Object.keys(media || {}),
      //   mediaType: media?.type,
      //   mediaMimetype: media?.mimetype
      // });
      this.downloadMediaAsync(media, type, accountId, messageId, client).catch(error => {
        console.error(`❌ [WhatsApp媒体] 异步下载失败: ${type}/${messageId}`, error);
      });

      return mediaUrl;
    } catch (error) {
      console.error('生成WhatsApp媒体URL失败:', error);
      // 返回空字符串而不是错误文本，让前端使用fallback
      return '';
    }
  }

  /**
   * 获取媒体文件路径
   */
  private getMediaFilePath(accountId: string, type: string, messageId: string, media?: any): string {
    const fileExtension = this.getFileExtension(type, media);
    const fileName = `${messageId}.${fileExtension}`;
    return path.join(SERVER_ROOT, 'public', 'media', 'wa', accountId, type, fileName);
  }

  /**
   * 获取文件扩展名
   */
  private getFileExtension(type: string, media?: any): string {
    switch (type) {
      case 'photo': return 'jpg';
      case 'video': return 'mp4';
      case 'document':
        // 对于文档类型，尝试从MIME类型推断正确的扩展名
        if (media && media.mimetype) {
          const mimeType = media.mimetype.toLowerCase();
          if (mimeType.startsWith('image/')) {
            if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
            if (mimeType.includes('png')) return 'png';
            if (mimeType.includes('gif')) return 'gif';
            if (mimeType.includes('webp')) return 'webp';
            return 'jpg'; // 默认图片格式
          }
          if (mimeType.includes('pdf')) return 'pdf';
          if (mimeType.includes('doc')) return 'doc';
          if (mimeType.includes('docx')) return 'docx';
          if (mimeType.includes('txt')) return 'txt';
        }
        return 'pdf'; // 默认文档格式
      case 'sticker': return 'webp';
      case 'voice': return 'ogg';
      default: return 'bin';
    }
  }

  /**
   * 异步下载媒体文件
   */
  async downloadMediaAsync(media: any, type: string, accountId: string, messageId: string, client: any): Promise<void> {
    try {
      // console.log(`📥 [WhatsApp媒体] 开始下载: ${type}/${messageId}`);
      // console.log(`🔍 [WhatsApp媒体] media对象结构:`, {
      //   hasDownloadMedia: typeof media?.downloadMedia === 'function',
      //   hasMimetype: !!media?.mimetype,
      //   mimetype: media?.mimetype,
      //   hasId: !!media?.id,
      //   id: media?.id,
      //   type: media?.type,
      //   keys: Object.keys(media || {})
      // });

      let buffer: Buffer | undefined;

      // 1. 优先使用 decryptMedia（适用于 PTT 语音消息、文档、sticker 和 video）
      if (type === 'voice' || media?.type === 'ptt' || type === 'document' || type === 'sticker' || type === 'video') {
        try {
          const targetMsg = media?.mimetype ? media :
            (client && (media?.id?._serialized || media?.id) ?
              await client.getMessageById(media.id?._serialized || media.id).catch(() => undefined) :
              undefined);

          if (targetMsg) {
            const decrypted = await decryptMedia(targetMsg);
            buffer = Buffer.isBuffer(decrypted) ? decrypted : Buffer.from(decrypted, 'base64');
            console.log(`✅ [WhatsApp媒体] ${type} decryptMedia 成功，大小: ${buffer.length} 字节`);
          }
        } catch (e: any) {
          console.log(`⚠️ [WhatsApp媒体] ${type} decryptMedia 失败:`, e.message);
        }
      }

      // 2. 尝试通过 client 获取完整消息对象（适用于所有类型）
      if (!buffer && client && media?.id) {
        try {
          console.log(`🔄 [WhatsApp媒体] 尝试通过 client 获取完整消息对象`);
          const messageId = media.id._serialized || media.id;
          const fullMessage = await client.getMessageById(messageId);
          
          if (fullMessage) {
            if (fullMessage.downloadMedia) {
              buffer = await fullMessage.downloadMedia();
              console.log(`✅ [WhatsApp媒体] 通过完整消息 downloadMedia 成功，大小: ${buffer?.length || 0} 字节`);
            } else if (fullMessage._data?.media?.downloadMedia) {
              buffer = await fullMessage._data.media.downloadMedia();
              console.log(`✅ [WhatsApp媒体] 通过消息数据 media.downloadMedia 成功，大小: ${buffer?.length || 0} 字节`);
            }
          }
        } catch (e: any) {
          console.log(`⚠️ [WhatsApp媒体] 通过 client 获取完整消息失败:`, e.message);
        }
      }

      // 3. 兜底使用 downloadMedia（适用于其他媒体类型，如图片、视频等）
      if (!buffer && media?.downloadMedia) {
        try {
          console.log(`🔄 [WhatsApp媒体] 尝试使用 downloadMedia 下载 ${type} 类型文件`);
          buffer = await media.downloadMedia();
          console.log(`✅ [WhatsApp媒体] downloadMedia 成功，大小: ${buffer?.length || 0} 字节`);
        } catch (e: any) {
          console.log(`⚠️ [WhatsApp媒体] downloadMedia 失败:`, e.message);
          console.log(`⚠️ [WhatsApp媒体] downloadMedia 错误详情:`, e);
        }
      } else if (!buffer) {
        console.log(`❌ [WhatsApp媒体] media对象没有 downloadMedia 方法，无法下载 ${type} 类型文件`);
        console.log(`🔍 [WhatsApp媒体] media对象结构:`, {
          hasDownloadMedia: typeof media?.downloadMedia === 'function',
          hasMimetype: !!media?.mimetype,
          mimetype: media?.mimetype,
          hasId: !!media?.id,
          id: media?.id,
          type: media?.type,
        });
        
        // Fallback if client and media.id are available but initial attempts failed
        if (client && media?.id) {
          try {
            console.log(`🔄 [WhatsApp媒体] 尝试通过 client 下载媒体文件 (fallback)`);
            const messageId = media.id._serialized || media.id;
            const message = await client.getMessageById(messageId);
            
            if (message && message.downloadMedia) {
              buffer = await message.downloadMedia();
              console.log(`✅ [WhatsApp媒体] 通过 message.downloadMedia 成功 (fallback)，大小: ${buffer?.length || 0} 字节`);
            } else if (message && message._data && message._data.media) {
              const mediaData = message._data.media;
              if (mediaData.downloadMedia) {
                buffer = await mediaData.downloadMedia();
                console.log(`✅ [WhatsApp媒体] 通过 mediaData.downloadMedia 成功 (fallback)，大小: ${buffer?.length || 0} 字节`);
              }
            } else {
              console.log(`⚠️ [WhatsApp媒体] 消息对象也没有 downloadMedia 方法 (fallback)`);
              // console.log(`🔍 [WhatsApp媒体] message对象结构 (fallback):`, {
              //   hasDownloadMedia: typeof message?.downloadMedia === 'function',
              //   hasData: !!message?._data,
              //   hasMedia: !!message?._data?.media,
              //   messageKeys: Object.keys(message || {}),
              //   dataKeys: Object.keys(message?._data || {})
              // });
            }
          } catch (e: any) {
            console.log(`⚠️ [WhatsApp媒体] 通过 client 下载失败 (fallback):`, e.message);
          }
        } else {
          console.log(`⚠️ [WhatsApp媒体] 无法尝试替代下载方法，缺少 client 或 media.id`);
        }
      }

      // 3. 保存文件（带哈希去重）
      if (buffer && buffer.length > 0) {
        // 计算文件哈希
        const fileHash = crypto.createHash('md5').update(buffer).digest('hex');
        console.log(`🔍 [WhatsApp媒体] 计算文件哈希: ${fileHash}`);
        
        // 检查是否已存在相同哈希的文件
        const existingFile = await this.findExistingFileByHash(accountId, type, fileHash);
        if (existingFile) {
          console.log(`♻️ [WhatsApp媒体] 发现重复文件，跳过下载: ${existingFile}`);
          // 创建软链接或复制到新位置
          await this.linkOrCopyExistingFile(existingFile, accountId, type, messageId, media);
          return;
        }
        
        await this.saveMediaToServer(buffer, type, accountId, messageId, media);
        console.log(`✅ [WhatsApp媒体] 下载完成: ${type}/${messageId}`);
      } else {
        console.log(`❌ [WhatsApp媒体] 下载失败: ${type}/${messageId}`);
      }

    } catch (error) {
      console.error(`❌ [WhatsApp媒体] 下载失败: ${type}/${messageId}`, error);
    }
  }

  /**
   * 保存媒体文件到服务器
   */
  private async saveMediaToServer(buffer: Buffer, type: string, accountId: string, messageId: string, media?: any): Promise<string> {
    try {
      const filePath = this.getMediaFilePath(accountId, type, messageId, media);
      const dir = path.dirname(filePath);

      // 确保目录存在
      fs.mkdirSync(dir, { recursive: true });

      // 保存文件
      fs.writeFileSync(filePath, buffer);

      console.log(`💾 [WhatsApp媒体] 文件已保存: ${filePath}`);

      // 简化：只保存hash，文件名直接从media.filename获取
      try {
        const hash = crypto.createHash('md5').update(buffer).digest('hex');
        const originalName = (media && media.filename) || path.basename(filePath);
        
        console.log('🔍 [META][WA:save] 简化文件名处理:', {
          'media.filename': media?.filename,
          '最终originalName': originalName,
          'hash': hash
        });
        
        // 简化：直接使用media.filename，无需复杂的临时文件处理
        // 简化：只保存基本的meta信息
        const meta = { 
          originalName, 
          hash, 
          savedAs: path.basename(filePath), 
          mimeType: (media as any)?.mimetype || '', 
          timestamp: Date.now() 
        };
        fs.writeFileSync(`${filePath}.meta.json`, JSON.stringify(meta));
        console.log('✅ [META][WA:save] 已保存简化元数据:', meta);
      } catch (metaErr) {
        console.warn('⚠️ [WhatsApp媒体] 写入元数据失败:', metaErr);
      }

      // WebSocket 事件广播已移除（media.ts 文件已删除）

      return filePath;
    } catch (error) {
      console.error(`❌ [WhatsApp媒体] 保存失败: ${type}/${messageId}`, error);
      throw error;
    }
  }

  /**
   * 启动定期重新注册机制
   */
  private startReRegisterInterval() {
    if (this.reRegisterInterval) {
      clearInterval(this.reRegisterInterval);
    }

    this.reRegisterInterval = setInterval(async () => {
      console.log(`🔄 [WhatsApp Provider] 开始定期重新注册监听器`);
      await this.reRegisterListeners();
    }, 60000); // 每60秒重新注册一次

    console.log(`✅ [WhatsApp Provider] 定期重新注册机制已启动`);
  }

  /**
   * 启动时加载所有 meta 文件到内存缓存
   */
  private loadMetaCache() {
    try {
      console.log('🔄 [WhatsApp Provider] 开始加载 meta 缓存...');
      const waMediaDir = path.join(SERVER_ROOT, 'public', 'media', 'wa');
      if (!fs.existsSync(waMediaDir)) {
        console.log('📁 [WhatsApp Provider] WA 媒体目录不存在，跳过 meta 缓存加载');
        return;
      }

      let totalLoaded = 0;
      const accountDirs = fs.readdirSync(waMediaDir);
      
      for (const accountId of accountDirs) {
        const accountPath = path.join(waMediaDir, accountId);
        if (!fs.statSync(accountPath).isDirectory()) continue;
        
        const typeDirs = fs.readdirSync(accountPath);
        for (const type of typeDirs) {
          const typePath = path.join(accountPath, type);
          if (!fs.statSync(typePath).isDirectory()) continue;
          
          const files = fs.readdirSync(typePath);
          for (const file of files) {
            if (!file.endsWith('.meta.json')) continue;
            
            try {
              const metaPath = path.join(typePath, file);
              const raw = fs.readFileSync(metaPath, 'utf-8');
              const meta = JSON.parse(raw || '{}');
              
              if (typeof meta?.hash === 'string' && meta.hash) {
                // 简化：直接加载所有meta文件
                this.metaCache.set(meta.hash, {
                  ...meta,
                  accountId,
                  type,
                  filePath: metaPath
                });
                totalLoaded++;
              }
            } catch (error) {
              console.warn(`⚠️ [WhatsApp Provider] 加载 meta 文件失败: ${file}`, error);
            }
          }
        }
      }
      
      console.log(`✅ [WhatsApp Provider] Meta 缓存加载完成，共加载 ${totalLoaded} 个文件`);
    } catch (error) {
      console.error('❌ [WhatsApp Provider] 加载 meta 缓存失败:', error);
    }
  }

  /**
   * 通过哈希查找原始文件名，优先使用内存缓存
   */
  private findOriginalNameByHash(accountId: string, type: string, hash: string): string | undefined {
    // 首先尝试从内存缓存中查找
    const cached = this.metaCache.get(hash);
    if (cached && typeof cached.originalName === 'string' && cached.originalName.trim()) {
      console.log(`[findOriginalNameByHash] 从内存缓存找到原始名: ${cached.originalName}`);
      return cached.originalName.trim();
    }
    
    // 如果内存缓存中没有，回退到文件系统查找（并更新缓存）
    try {
      const dir = path.join(SERVER_ROOT, 'public', 'media', 'wa', accountId, type);
      if (!fs.existsSync(dir)) return undefined;
      
      // 简化：直接查找所有 .meta.json 文件
      const entries = fs.readdirSync(dir);
      for (const name of entries) {
        if (!name.endsWith('.meta.json')) continue;
        const metaPath = path.join(dir, name);
        try {
          const raw = fs.readFileSync(metaPath, 'utf-8');
          const meta = JSON.parse(raw || '{}');
          if (typeof meta?.hash === 'string' && meta.hash === hash) {
            const original = typeof meta?.originalName === 'string' ? meta.originalName.trim() : '';
            if (original) {
              // 更新内存缓存
              this.metaCache.set(hash, {
                ...meta,
                accountId,
                type,
                filePath: metaPath
              });
              console.log(`[findOriginalNameByHash] 从普通 meta 文件找到原始名: ${original}`);
              return original;
            }
          }
        } catch {}
      }
    } catch (error) {
      console.warn(`[findOriginalNameByHash] 查找失败:`, error);
    }
    return undefined;
  }

  /**
   * 重新注册所有监听器
   */
  private async reRegisterListeners() {
    if (!this.messageCallback) {
      console.log(`⚠️ [WhatsApp Provider] 没有消息回调函数，跳过重新注册`);
      return;
    }

    // 获取所有活跃的WhatsApp会话，而不是只检查已重连的客户端
    const activeSessions = sessionStateService.getActiveSessionsByProvider('whatsapp');
    console.log(`🔄 [WhatsApp Provider] 重新注册监听器，找到 ${activeSessions.length} 个活跃会话`);

    for (const session of activeSessions) {
      const accountId = session.id;
      try {
        // 检查客户端是否存在
        const client = getAllReconnectedWaClients().get(accountId);
        if (!client) {
          console.log(`⚠️ [WhatsApp Provider] 账号 ${accountId} 客户端未连接，跳过重新注册`);
          continue;
        }

        // 检查客户端连接状态
        const isConnected = await client.isConnected();
        if (!isConnected) {
          console.log(`❌ [WhatsApp Provider] 账号 ${accountId} 未连接，跳过重新注册`);
          continue;
        }

        // 检查是否已有监听器
        if (this.handlers.has(accountId)) {
          console.log(`✅ [WhatsApp Provider] 账号 ${accountId} 已有监听器，跳过`);
          continue;
        }

        console.log(`🔄 [WhatsApp Provider] 重新注册监听器: ${accountId}`);

        const handler = async (message: any) => {
          try {
            // 检查账号是否仍然活跃
            const activeSessions = sessionStateService.getActiveSessionsByProvider('whatsapp');
            const session = activeSessions.find(s => s.id === accountId);
            if (!session) {
              console.log(`⚠️ [WhatsApp Provider] 账号 ${accountId} 未找到，停止处理消息`);
              // 停止该账号的监听
              await this.stopAccountListening(accountId);
              return;
            }

            // 检查isActive状态，如果未定义则默认为true（活跃）
            const isActive = session.data.isActive !== undefined ? session.data.isActive : true;
            if (!isActive) {
              console.log(`⚠️ [WhatsApp Provider] 账号 ${accountId} 已禁用，停止处理消息`);
              // 停止该账号的监听
              await this.stopAccountListening(accountId);
              return;
            }

            if (!message) {
              console.log(`⚠️ [WhatsApp Provider] 收到空消息，跳过`);
              return;
            }

            // 去重
            const key = `${accountId}-${message.id?._serialized || message.id}`;
            if (this.processedMessages.has(key)) {
              console.log(`🔄 [WhatsApp去重] 消息已处理，跳过: ${key}`);
              return;
            }
            this.processedMessages.add(key);

            if (this.processedMessages.size > 2000) {
              const iter = this.processedMessages.values();
              const first = iter.next().value as string | undefined;
              if (typeof first === 'string') this.processedMessages.delete(first);
            }

            // 获取聊天信息 - 使用client.getChatById替代message.getChat()
            let chat;
            try {
              // 首先尝试从消息对象获取chatId
              const chatId = message.chatId || message.to || message.from;
              if (chatId) {
                chat = await client.getChatById(chatId);
              } else {
                console.log(`⚠️ [WhatsApp Provider] 无法从消息获取chatId，跳过消息`);
                return;
              }
            } catch (chatError) {
              console.log(`⚠️ [WhatsApp Provider] 获取聊天信息失败:`, chatError);
              return;
            }

            if (!chat) {
              console.log(`⚠️ [WhatsApp Provider] 无法获取聊天信息，跳过消息`);
              return;
            }

            const originalChatId = (chat.id as any)?._serialized || chat.id || message.from || message.chatId || 'unknown';
            const isOwn = message.fromMe || false;

            // 检测消息类型和内容
            const { messageType, content } = await this.detectMessageTypeAndContent(message, accountId, client);

            // 组装 ChatMessage
            const chatMessage: ChatMessage = {
              id: `wa:${accountId}:${(message.id as any)?._serialized || message.id}`,
              chatId: `wa:${accountId}:${originalChatId}`,
              sender: message.sender?.pushname || message.sender?.name || (isOwn ? 'Me' : '未知发送者'),
              content: content,
              timestamp: message.timestamp * 1000,
              isOwn,
              messageType: messageType,
              status: message.ack === 3 ? 'read' : message.ack === 2 ? 'delivered' : 'sent'
            };

            // 组装 ChatInfo
            const chatInfo: ChatInfo = {
              id: `wa:${accountId}:${originalChatId}`,
              platform: 'whatsapp',
              accountId,
              groupId: chat.isGroup ? `whatsapp:gid:${originalChatId.split('@')[0]}` : `whatsapp:jid:${originalChatId}`,
              name: (chat as any).name || (chat as any).formattedName || (chat as any).pushname || originalChatId.split('@')[0] || '未知聊天',
              avatar: this.resolveAvatar(chat),
              type: chat.isGroup ? 'group' : 'private',
              memberCount: (chat as any).participants?.length,
              lastMessage: chatMessage.content,
              lastMessageTime: chatMessage.timestamp,
              lastMessageSender: chatMessage.sender,
              unreadCount: 0,
              status: 'online',
              createdAt: Date.now() - 86400000,
              updatedAt: Date.now()
            };

            if (this.messageCallback) {
              this.messageCallback({ message: chatMessage, chatInfo, accountId, messageType });
            }
          } catch (e) {
            console.error('❌ [WhatsAppProvider.reRegisterListeners] 处理事件失败:', e);
          }
        };

        // 注册消息监听器
        try {
          // 优先使用 onAnyMessage 方法（捕获所有消息，包括自己发送的）
          if (typeof (client as any).onAnyMessage === 'function') {
            (client as any).onAnyMessage(handler);
            console.log(`✅ [WhatsApp Provider] 重新注册成功 (onAnyMessage): ${accountId}`);
          } else if (typeof (client as any).onMessage === 'function') {
            (client as any).onMessage(handler);
            console.log(`✅ [WhatsApp Provider] 重新注册成功 (onMessage): ${accountId}`);
          } else if (typeof (client as any).on === 'function') {
            (client as any).on('message', handler);
            console.log(`✅ [WhatsApp Provider] 重新注册成功 (on): ${accountId}`);
          } else if (typeof (client as any).addEventListener === 'function') {
            (client as any).addEventListener('message', handler);
            console.log(`✅ [WhatsApp Provider] 重新注册成功 (addEventListener): ${accountId}`);
          } else {
            console.warn(`⚠️ [WhatsApp Provider] 客户端不支持任何消息事件API: ${accountId}`);
          }
        } catch (e) {
          console.error(`❌ [WhatsApp Provider] 重新注册失败: ${accountId}`, e);
        }

        this.handlers.set(accountId, { handler, client });
      } catch (e) {
        console.error(`❌ [WhatsApp Provider] 重新注册监听器失败: ${accountId}`, e);
      }
    }

    console.log(`✅ [WhatsApp Provider] 重新注册完成，共注册 ${this.handlers.size} 个监听器`);
  }


  /**
   * 根据哈希查找已存在的文件
   */
  private async findExistingFileByHash(accountId: string, type: string, fileHash: string): Promise<string | null> {
    try {
      const mediaDir = path.join(SERVER_ROOT, 'public', 'media', 'wa', accountId, type);
      if (!fs.existsSync(mediaDir)) return null;
      
      const files = fs.readdirSync(mediaDir);
      for (const file of files) {
        if (file.endsWith('.meta.json')) continue;
        
        const filePath = path.join(mediaDir, file);
        const metaPath = `${filePath}.meta.json`;
        
        // 检查 .meta.json 中的哈希
        if (fs.existsSync(metaPath)) {
          try {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            if (meta.hash === fileHash) {
              console.log(`🔍 [WhatsApp媒体] 找到重复文件: ${filePath}`);
              return filePath;
            }
          } catch (e) {
            // 忽略损坏的 meta 文件
          }
        }
      }
      return null;
    } catch (error) {
      console.warn('⚠️ [WhatsApp媒体] 查找重复文件失败:', error);
      return null;
    }
  }

  /**
   * 链接或复制已存在的文件到新位置
   */
  private async linkOrCopyExistingFile(existingFile: string, accountId: string, type: string, messageId: string, media: any): Promise<void> {
    try {
      const mediaDir = path.join(SERVER_ROOT, 'public', 'media', 'wa', accountId, type);
      const fileExtension = this.getFileExtension(type, { mimetype: media?.mimetype });
      const newFilePath = path.join(mediaDir, `${messageId}.${fileExtension}`);
      
      // 复制文件（Windows 不支持软链接）
      fs.copyFileSync(existingFile, newFilePath);
      
      // 复制或创建 meta.json
      const existingMetaPath = `${existingFile}.meta.json`;
      const newMetaPath = `${newFilePath}.meta.json`;
      
      if (fs.existsSync(existingMetaPath)) {
        fs.copyFileSync(existingMetaPath, newMetaPath);
        console.log(`♻️ [WhatsApp媒体] 复制重复文件: ${existingFile} → ${newFilePath}`);
      } else {
        // 创建新的 meta.json
        const meta = {
          originalName: media?.filename || path.basename(existingFile),
          hash: crypto.createHash('md5').update(fs.readFileSync(existingFile)).digest('hex'),
          savedAs: path.basename(newFilePath),
          mimeType: media?.mimetype || '',
          timestamp: Date.now(),
          isDuplicate: true
        };
        fs.writeFileSync(newMetaPath, JSON.stringify(meta));
        console.log(`♻️ [WhatsApp媒体] 创建重复文件元数据: ${newMetaPath}`);
      }
    } catch (error) {
      console.error('❌ [WhatsApp媒体] 处理重复文件失败:', error);
    }
  }

  /**
   * 生成文件内容的哈希值用于缓存键
   */
  private async generateFileHash(filePath: string): Promise<{ hash: string; fileName: string }> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash("md5");
      const stream = fs.createReadStream(filePath);
  
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("end", () => {
        const fileName = path.basename(filePath); // 👉 取得文件名
        resolve({ hash: hash.digest("hex"), fileName });
      });
      stream.on("error", (err) => reject(err));
    });
  }

  /**
   * 检查语音文件是否已缓存
   */
  private getCachedVoice(fileHash: string): string | null {
    const cached = this.voiceCache.get(fileHash);
    if (!cached) return null;

    // 检查缓存是否过期
    const now = Date.now();
    if (now - cached.timestamp > this.VOICE_CACHE_TTL) {
      this.voiceCache.delete(fileHash);
      // 删除过期的缓存文件
      try {
        if (fs.existsSync(cached.oggPath)) {
          fs.unlinkSync(cached.oggPath);
          console.log(`🗑️ [语音缓存] 删除过期缓存: ${path.basename(cached.oggPath)}`);
        }
      } catch (error) {
        console.warn(`⚠️ [语音缓存] 删除过期缓存失败:`, error);
      }
      return null;
    }

    // 检查缓存文件是否仍然存在
    if (!fs.existsSync(cached.oggPath)) {
      this.voiceCache.delete(fileHash);
      return null;
    }

    console.log(`🎵 [语音缓存] 命中缓存: ${path.basename(cached.oggPath)} (${cached.originalSize} → ${cached.convertedSize} bytes)`);
    return cached.oggPath;
  }

  /**
   * 缓存转换后的语音文件
   */
  private cacheVoice(fileHash: string, oggPath: string, originalSize: number, convertedSize: number): void {
    this.voiceCache.set(fileHash, {
      oggPath,
      timestamp: Date.now(),
      originalSize,
      convertedSize
    });
    console.log(`💾 [语音缓存] 已缓存: ${path.basename(oggPath)} (${originalSize} → ${convertedSize} bytes)`);
  }

  /**
   * 将 WebM 音频格式转换为 OGG 格式（带缓存）
   * @param webmBuffer - WebM 音频文件的 Buffer
   * @returns Promise<Buffer> - 转换后的 OGG Buffer
   */
  async convertWebmToOgg(webmBuffer: Buffer): Promise<Buffer> {
    // 生成文件哈希作为缓存键（基于内容计算）
    const fileHash = crypto.createHash('md5').update(webmBuffer).digest('hex');
    
    // 检查缓存
    const cachedPath = this.getCachedVoice(fileHash);
    if (cachedPath) {
      return fs.readFileSync(cachedPath);
    }
    return new Promise((resolve, reject) => {
      // 创建缓存目录
      const cacheDir = path.join(SERVER_ROOT, 'temp', 'voice-cache');
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      
      // 使用文件哈希作为缓存文件名
      const cachedOggPath = path.join(cacheDir, `${fileHash}.ogg`);
      
      // 创建临时文件
      const tempDir = path.join(SERVER_ROOT, 'temp', 'whatsapp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const inputFile = path.join(tempDir, `input_${Date.now()}.webm`);
      
      try {
        // 写入输入文件
        fs.writeFileSync(inputFile, webmBuffer);
        
        console.log(`🔄 [FFmpeg] 开始转换: WebM → OGG (${webmBuffer.length} bytes)`);
        
        // 使用 ffmpeg 转换，直接输出到缓存文件
        ffmpeg(inputFile)
          .toFormat('ogg')
          .audioCodec('libopus')
          .audioBitrate(64) // 64kbps 适合语音
          .audioChannels(1) // 单声道
          .audioFrequency(48000) // 48kHz 采样率
          .outputOptions([
            '-strict -2', // 允许实验性编码器
            '-avoid_negative_ts make_zero', // 避免负时间戳
            '-fflags +genpts' // 生成PTS
          ])
          .on('end', () => {
            try {
              // 读取转换后的文件
              const outputBuffer = fs.readFileSync(cachedOggPath);
              console.log(`✅ [FFmpeg] 转换完成: ${outputBuffer.length} bytes`);
              
              // 缓存转换结果
              this.cacheVoice(fileHash, cachedOggPath, webmBuffer.length, outputBuffer.length);
              
              // 清理临时输入文件
              fs.unlinkSync(inputFile);
              
              resolve(outputBuffer);
            } catch (error) {
              console.error(`❌ [FFmpeg] 读取输出文件失败:`, error);
              reject(error);
            }
          })
          .on('error', (error) => {
            console.error(`❌ [FFmpeg] 转换失败:`, error);
            
            // 清理临时文件
            try {
              if (fs.existsSync(inputFile)) fs.unlinkSync(inputFile);
              if (fs.existsSync(cachedOggPath)) fs.unlinkSync(cachedOggPath);
            } catch (cleanupError) {
              console.warn(`⚠️ [FFmpeg] 清理临时文件失败:`, cleanupError);
            }
            
            reject(error);
          })
          .save(cachedOggPath);
          
      } catch (error) {
        console.error(`❌ [FFmpeg] 写入输入文件失败:`, error);
        reject(error);
      }
    });
  }

  /**
   * 从 DataURL 转换 WebM 到 OGG
   * @param dataUrl - WebM 的 DataURL
   * @returns Promise<Buffer> - 转换后的 OGG Buffer
   */
  async convertWebmDataUrlToOgg(dataUrl: string): Promise<Buffer> {
    // 从 DataURL 提取 Base64 数据
    const base64Data = dataUrl.split(',')[1];
    if (!base64Data) {
      throw new Error('无效的 DataURL 格式');
    }

    // 转换为 Buffer
    const webmBuffer = Buffer.from(base64Data, 'base64');
    
    // 调用转换函数
    return await this.convertWebmToOgg(webmBuffer);
  }

  /**
   * Register group-related listeners for this WhatsApp client.
   */
  async registerGroupEvents(client: any, accountId: string) {
    if (client.__groupEventsRegistered) return;
    client.__groupEventsRegistered = true;

    console.log(`✅ [${accountId}] Registered WhatsApp group event listeners`);

    // 🔹 Group info changes (subject, description, icon)
    client.onGroupChange(async (event: GroupChangeEvent) => {
      const { groupId, type, actor, data } = event;
      const actorName = actor?.pushname || "Someone";

      const messageText =
        type === "subject"
          ? `${actorName} changed the group name to "${data.subject}"`
          : type === "description"
          ? `${actorName} updated the group description`
          : type === "icon"
          ? `${actorName} changed the group icon`
          : `${actorName} made a group change (${type})`;

      websocketService.emitToChat(groupId, "chat:new_message", {
        accountId,
        chatId: groupId,
        type: "system",
        text: messageText,
        timestamp: Date.now(),
        platform: "whatsapp",
        isSystem: true,
      });
    });

    // 🔹 Participants join/leave/promote/demote
    client.onGlobalParticipantsChanged(async (event: ParticipantChangeEvent) => {
      const { action, who, chat } = event;

      const messageText =
        action === "add"
          ? `${who} joined the group`
          : action === "remove"
          ? `${who} left or was removed`
          : action === "promote"
          ? `${who} was promoted to admin`
          : action === "demote"
          ? `${who} was demoted`
          : `${who} performed: ${action}`;

      websocketService.emitToChat(chat, "chat:new_message", {
        accountId,
        chatId: chat,
        type: "system",
        text: messageText,
        timestamp: Date.now(),
        platform: "whatsapp",
        isSystem: true,
      });
    });
  }
}

export { WhatsAppProvider };