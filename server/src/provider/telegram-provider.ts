// server/src/providers/telegram-provider.ts
import { MessageProvider, ChatMessagesResponse, ChatInfo, ChatMessage } from '../types/chat.types';
import { getReconnectedTgClient, getAllReconnectedTgClients } from '../services/startup-reconnect.service';
import { sessionStateService } from '../services/session-state.service';
import { client, TelegramClient } from 'telegram';
import { CustomFile } from 'telegram/client/uploads';
import { NewMessage, Raw } from 'telegram/events';
import { config } from '../config/env';
import fs from 'fs';
import path from 'path';
import { Api } from "telegram/tl";
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { websocketService } from '../services/websocket.service';

// 🔒 使用固定的服务器根目录，不依赖 process.cwd()
const SERVER_ROOT = path.resolve(__dirname, '../..');

// Prefer bundled ffmpeg binary if available
if (ffmpegPath) {
  try {
    ffmpeg.setFfmpegPath(ffmpegPath as unknown as string);
  } catch {}
}

export class TelegramProvider implements MessageProvider {
  // 实时相关
  private processedMessages = new Set<string>();
  private telegramNameCache = new Map<string, string>();
  private myIds = new Map<string, string>(); // accountId -> my user id
  private handlers = new Map<string, { handler: (event: any) => any; builder: NewMessage }>();
  private mediaFileCache = new Map<string, string>(); // 缓存已存在的媒体文件路径
  private messageCallback: ((payload: { message: ChatMessage; chatInfo: ChatInfo; accountId: string }) => void) | null = null;
  
  // 添加对话缓存
  private dialogsCache = new Map<string, { data: any[], timestamp: number }>();

  constructor() {
    // 启动时清理旧的临时文件
    this.cleanupOldTempFiles();
  }

  private async handleGroupChange(event: any, accountId: string, client: TelegramClient, updateInfo?: any): Promise<void> {
    try {
      let chatId: string | null = null;
      let actionDetails: any = null;
  
      // 根据更新类型提取 chatId 和 action 详情
      if (updateInfo?.type === 'message_action' && event.message) {
        const message = event.message;
        chatId = ('chatId' in message?.peerId) ? message.peerId.chatId?.toString() : 
                ('channelId' in message?.peerId) ? message.peerId.channelId?.toString() : null;
        
        // 提取 action 详情
        const action = message.action;
        if (action) {
          actionDetails = this.extractActionDetails(action, message);
        }
      } else if (updateInfo?.type === 'chat_update') {
        chatId = event.chatId?.toString();
      } else if (updateInfo?.type === 'channel_update') {
        chatId = event.channelId?.toString();
      } else if (updateInfo?.type === 'chat_participant') {
        chatId = event.chatId?.toString();
        actionDetails = {
          userId: event.userId?.toString(),
          inviterId: event.inviterId?.toString(),
          date: event.date
        };
      } else if (updateInfo?.type === 'channel_participant') {
        chatId = event.channelId?.toString();
        actionDetails = {
          userId: event.userId?.toString(),
          inviterId: event.inviterId?.toString(),
          date: event.date
        };
      }
      
      if (!chatId) {
        console.log(`⚠️ [Telegram群组变更] 缺少 chatId，跳过处理`);
        return;
      }
  
      console.log(`🔄 [Telegram群组变更] 处理群组变更:`, {
        accountId,
        chatId,
        updateType: updateInfo?.type,
        actionDetails
      });
  
      // 获取最新的群组信息
      const chatInfo = await this.buildChatInfoFromId(chatId, accountId, client);
      if (chatInfo) {
        // 转换为 WebSocket 格式
        const wsChatInfo = {
          id: chatInfo.id,
          platform: chatInfo.platform,
          accountId: chatInfo.accountId,
          groupId: chatInfo.groupId,
          name: chatInfo.name,
          avatar: chatInfo.avatar,
          type: chatInfo.type,
          username: chatInfo.username,
          memberCount: chatInfo.memberCount,
          lastMessage: chatInfo.lastMessage || '',
          lastMessageTime: chatInfo.lastMessageTime || 0,
          lastMessageSender: chatInfo.lastMessageSender || '',
          unreadCount: chatInfo.unreadCount,
          status: chatInfo.status,
          createdAt: chatInfo.createdAt,
          updatedAt: Date.now()
        };
        
        // 广播聊天信息更新
        websocketService.broadcastChatUpdate(wsChatInfo);
        
        // 根据不同的变更类型广播特定事件到前端
        const updateType = updateInfo?.type;
        if (updateType === 'message_action' && event.message?.action) {
          const actionType = event.message.action.className;
          
          // 构建详细的变更事件数据
          const changeEvent = {
            chatId: chatInfo.id,
            accountId: accountId,
            timestamp: event.message.date * 1000 || Date.now(),
            actionType: actionType,
            actionDetails: actionDetails,
            chatInfo: wsChatInfo
          };
  
          // 根据不同的动作类型发送特定的 WebSocket 事件
          switch (actionType) {
            case 'MessageActionChatEditTitle':
              websocketService.emit('group_name_changed', {
                ...changeEvent,
                oldName: actionDetails?.oldTitle || 'Unknown',
                newName: actionDetails?.newTitle || chatInfo.name,
                changedBy: actionDetails?.changedBy || 'Unknown'
              });
              console.log(`📝 [群组名称变更] "${actionDetails?.oldTitle}" → "${actionDetails?.newTitle}"`);
              break;
  
            case 'MessageActionChatEditPhoto':
              websocketService.emit('group_photo_changed', {
                ...changeEvent,
                newPhotoUrl: chatInfo.avatar,
                changedBy: actionDetails?.changedBy || 'Unknown'
              });
              console.log(`🖼️ [群组头像变更] ${chatInfo.name}`);
              break;
  
            case 'MessageActionChatAddUser':
              websocketService.emit('group_member_added', {
                ...changeEvent,
                addedUsers: actionDetails?.addedUsers || [],
                addedBy: actionDetails?.addedBy || 'Unknown'
              });
              console.log(`➕ [成员加入] ${actionDetails?.addedUsers?.length || 0} 位新成员`);
              break;
  
            case 'MessageActionChatDeleteUser':
              websocketService.emit('group_member_removed', {
                ...changeEvent,
                removedUser: actionDetails?.removedUser || 'Unknown',
                removedBy: actionDetails?.removedBy || 'Unknown'
              });
              console.log(`➖ [成员移除] ${actionDetails?.removedUser}`);
              break;
  
            case 'MessageActionChatJoinedByLink':
              websocketService.emit('group_member_joined_by_link', {
                ...changeEvent,
                joinedUser: actionDetails?.joinedUser || 'Unknown'
              });
              console.log(`🔗 [通过链接加入] ${actionDetails?.joinedUser}`);
              break;
  
            case 'MessageActionPinMessage':
              websocketService.emit('message_pinned', {
                ...changeEvent,
                pinnedMessageId: actionDetails?.pinnedMessageId,
                pinnedBy: actionDetails?.pinnedBy || 'Unknown'
              });
              console.log(`📌 [消息置顶] 消息ID: ${actionDetails?.pinnedMessageId}`);
              break;
  
            default:
              websocketService.emit('group_action', {
                ...changeEvent,
                action: actionType
              });
              console.log(`🔄 [其他动作] ${actionType}`);
          }
        } else {
          // 其他类型的更新
          websocketService.emit('group_updated', {
            chatId: chatInfo.id,
            accountId: accountId,
            timestamp: Date.now(),
            updateType: updateType,
            chatInfo: wsChatInfo
          });
        }
        
        console.log(`📡 [WebSocket] 已广播群组变更: ${chatInfo.name} (${updateType})`);
      }
    } catch (error) {
      console.error('❌ [Telegram群组变更] 处理失败:', error);
    }
  }

  private extractActionDetails(action: any, message?: any): any {
    const details: any = {
      actionType: action.className
    };
  
    try {
      // 获取操作者信息
      if (message?.sender) {
        details.changedBy = message.sender.firstName || message.sender.username || 'Unknown';
        details.changedById = message.sender.id?.toString();
      }
  
      // 根据不同的 action 类型提取特定信息
      switch (action.className) {
        case 'MessageActionChatEditTitle':
          details.newTitle = action.title;
          details.oldTitle = message?.chat?.title; // 如果可用
          break;
  
        case 'MessageActionChatEditPhoto':
          details.hasPhoto = !!action.photo;
          break;
  
        case 'MessageActionChatAddUser':
          details.addedUsers = action.users?.map((userId: any) => userId.toString()) || [];
          details.addedBy = details.changedBy;
          break;
  
        case 'MessageActionChatDeleteUser':
          details.removedUser = action.userId?.toString();
          details.removedBy = details.changedBy;
          break;
  
        case 'MessageActionChatJoinedByLink':
          details.joinedUser = details.changedBy;
          details.joinedUserId = details.changedById;
          break;
  
        case 'MessageActionPinMessage':
          details.pinnedMessageId = message?.replyTo?.replyToMsgId?.toString();
          details.pinnedBy = details.changedBy;
          break;
  
        case 'MessageActionChatCreate':
          details.chatTitle = action.title;
          details.users = action.users?.map((userId: any) => userId.toString()) || [];
          break;
  
        case 'MessageActionChannelCreate':
          details.channelTitle = action.title;
          break;
  
        case 'MessageActionChatMigrateTo':
          details.newChannelId = action.channelId?.toString();
          break;
  
        case 'MessageActionChannelMigrateFrom':
          details.oldChatId = action.chatId?.toString();
          details.oldTitle = action.title;
          break;
  
        default:
          // 尝试提取所有可用属性
          Object.keys(action).forEach(key => {
            if (key !== 'className' && key !== '_' && action[key] !== undefined) {
              details[key] = action[key];
            }
          });
      }
    } catch (error) {
      console.error('❌ [提取Action详情] 失败:', error);
    }
  
    return details;
  }

  private async buildChatInfoFromId(chatId: string, accountId: string, client: TelegramClient): Promise<ChatInfo | null> {
    try {
      const entity = await client.getEntity(chatId);
      if (!entity) return null;
  
      // 获取最新消息
      const messages = await client.getMessages(entity, { limit: 1 });
      
      return await this.buildChatInfo(entity, messages, accountId, chatId, client);
    } catch (error) {
      console.error('❌ [构建ChatInfo] 失败:', error);
      return null;
    }
  }

  /**
   * 清理所有旧的临时文件
   */
  private cleanupOldTempFiles() {
    try {
      const tempDir = path.join(process.cwd(), 'temp');
      if (!fs.existsSync(tempDir)) {
        return;
      }

      const files = fs.readdirSync(tempDir);
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24小时

      let cleanedCount = 0;
      files.forEach(file => {
        const filePath = path.join(tempDir, file);
        try {
          const stats = fs.statSync(filePath);
          if (now - stats.mtime.getTime() > maxAge) {
            fs.unlinkSync(filePath);
            cleanedCount++;
            console.log(`🗑️ [Temp] 清理旧文件: ${file}`);
          }
        } catch (error) {
          // console.warn(`⚠️ [Temp] 清理文件失败: ${file}`, error);
        }
      });

      if (cleanedCount > 0) {
        console.log(`✅ [Temp] 清理完成，删除了 ${cleanedCount} 个旧临时文件`);
      }
    } catch (error) {
      console.warn(`⚠️ [Temp] 清理旧临时文件失败:`, error);
    }
  }
  private readonly CACHE_TTL = 30000; // 30秒缓存

  /**
   * 启动实时监听，通过回调输出标准化后的消息与会话
   */
  async start(onMessage: (payload: { message: ChatMessage; chatInfo: ChatInfo; accountId: string }) => void): Promise<void> {
    // 保存回调函数
    this.messageCallback = onMessage;
    
    const clients = getAllReconnectedTgClients();
    
    // 获取活跃的Telegram会话
    const activeSessions = sessionStateService.getActiveSessionsByProvider('telegram');
    console.log(`📊 [Telegram Provider] 活跃会话数量: ${activeSessions.length}`);
    
    for (const [accountId, client] of clients) {
      try {
        // 检查账号是否活跃
        const session = activeSessions.find((s: any) => s.id === accountId);
        if (!session || !session.data.isActive) {
          console.log(`⚠️ [Telegram Provider] 账号 ${accountId} 未激活，跳过监听`);
          continue;
        }
        
        // 记录自己的用户ID
        try {
          const me = await (client as TelegramClient).getMe();
          const myIdStr = (me as any)?.id?.toString?.();
          if (myIdStr) {
            this.myIds.set(accountId, myIdStr);
            console.log(`✅ [Telegram Provider] 已设置账号 ${accountId} 的客户端ID: ${myIdStr}`);
          } else {
            console.log(`⚠️ [Telegram Provider] 无法获取账号 ${accountId} 的客户端ID，me对象:`, me);
          }
        } catch (error: any) {
          console.error(`❌ [Telegram Provider] 获取账号 ${accountId} 的客户端ID失败:`, error.message);
        }

        // 避免重复注册
        if (this.handlers.has(accountId)) continue;

        const builder = new NewMessage({ incoming: true, outgoing: true });
        const handler = async (event: any) => {
          try {
            // 检查账号是否仍然活跃
            const activeSessions = sessionStateService.getActiveSessionsByProvider('telegram');
            const session = activeSessions.find((s: any) => s.id === accountId);
            if (!session || !session.data.isActive) {
              console.log(`⚠️ [Telegram Provider] 账号 ${accountId} 已禁用，停止处理消息`);
              // 停止该账号的监听
              await this.stopAccountListening(accountId);
              return;
            }

            const msg = event?.message;
            if (!msg) return;

            // 去重
            const key = `${accountId}-${msg.id}`;
            if (this.processedMessages.has(key)) {
              console.log(`🔄 [去重] 消息已处理，跳过: ${key}`);
              return;
            }
            this.processedMessages.add(key);
            
            // 添加调试信息
            if (msg.document || msg.sticker) {
              console.log(`🎭 [Sticker处理] 开始处理消息:`, {
                messageId: msg.id,
                hasDocument: !!msg.document,
                hasSticker: !!msg.sticker,
                key: key
              });
            }
            if (this.processedMessages.size > 2000) {
              const iter = this.processedMessages.values();
              const first = iter.next().value as string | undefined;
              if (typeof first === 'string') this.processedMessages.delete(first);
            }

            // 获取实体与原始 chatId
            let entity: any | undefined;
            try { entity = await event.getChat(); } catch {}
            const rawId = entity?.id || msg?.peerId?.channelId || msg?.peerId?.chatId || msg?.peerId?.userId;
            if (!rawId) return;
            const originalChatId = rawId.toString();

            if (!entity) {
              try { 
                entity = await (client as TelegramClient).getEntity(rawId); 
              } catch (error: any) {
                console.error(`❌ [Telegram Provider] 获取消息实体失败: ${rawId}`, error.message);
                // 继续处理，不返回
              }
            }

            // 判定是否自己消息
            const senderIdStr = (msg?.sender?.id && msg.sender.id.toString) ? msg.sender.id.toString() : undefined;
            const myId = this.myIds.get(accountId);
            const isOwn = !!(msg as any)?.out || (myId ? senderIdStr === myId : false);
            
            // 检测消息类型和内容
            const { messageType, content } = await this.detectMessageTypeAndContent(msg, accountId, client);

            // 添加 console.log 显示实时消息的 messageType
            console.log(`📱 [Telegram Provider] 实时消息类型检测:`, {
              messageId: msg.id,
              messageType: messageType,
              content: content,
              isOwn: isOwn,
              hasMessage: !!(msg as any).message,
              hasPhoto: !!msg.photo,
              hasVideo: !!msg.video,
              hasDocument: !!msg.document,
              hasSticker: !!msg.sticker,
              hasVoice: !!msg.voice,
              hasLocation: !!msg.location,
              hasContact: !!msg.contact,
              hasAction: !!(msg as any).action,
              rawMessage: {
                message: (msg as any).message,
                action: (msg as any).action,
                photo: msg.photo ? 'present' : 'absent',
                video: msg.video ? 'present' : 'absent',
                document: msg.document ? 'present' : 'absent',
                sticker: msg.sticker ? 'present' : 'absent',
                voice: msg.voice ? 'present' : 'absent',
                location: msg.location ? 'present' : 'absent',
                contact: msg.contact ? 'present' : 'absent'
              }
            });

            // 组装 ChatMessage
            const chatMessage: ChatMessage = {
              id: `tg:${accountId}:${msg.id}`,
              chatId: `tg:${accountId}:${originalChatId}`,
              sender: msg.sender?.firstName || msg.sender?.username || (isOwn ? 'Me' : '未知发送者'),
              content: content,
              timestamp: (msg as any).date * 1000,
              isOwn,
              messageType: messageType,
              status: 'read'
            };

            // 添加地理位置信息
            // 暂不处理地理位置

            // 如果是文档消息或动画贴纸，添加文件名
            if (messageType === 'document' && msg.document) {
              chatMessage.fileName = this.getDocumentFileName(msg.document);
            } else if (messageType === 'sticker' && msg.document) {
              // 动画贴纸的文件名
              chatMessage.fileName = msg.document.fileName || `AnimatedSticker.tgs`;
            } else if (messageType === 'sticker' && msg.sticker) {
              // 直接贴纸消息的文件名
              chatMessage.fileName = `sticker.webp`;
            }

            // 组装 ChatInfo（优先用 entity）
            let chatInfo: ChatInfo;
            if (entity) {
              chatInfo = await this.buildChatInfo(entity, [msg], accountId, originalChatId, client);
            } else {
              chatInfo = {
                id: `tg:${accountId}:${originalChatId}`,
                platform: 'telegram',
                accountId,
                groupId: `telegram:peer:${originalChatId}`,
                name: `聊天 ${originalChatId}`,
                avatar: '',
                type: 'private',
                lastMessage: this.formatLastMessage(msg),
                lastMessageTime: chatMessage.timestamp,
                unreadCount: 0,
                status: 'online',
                createdAt: Date.now() - 86400000,
                updatedAt: Date.now()
              } as ChatInfo;
            }
            chatInfo = {
              ...chatInfo,
              lastMessage: this.formatLastMessage(msg),
              lastMessageTime: chatMessage.timestamp,
              lastMessageSender: chatMessage.sender,
              updatedAt: Date.now()
            };

            onMessage({ message: chatMessage, chatInfo, accountId });
          } catch (e) {
            console.error('❌ [TelegramProvider.start] 处理事件失败:', e);
          }
        };

        (client as TelegramClient).addEventHandler(handler, builder);
        
        // 添加群组变更事件监听器（使用 gramjs 推荐的方式）
        const groupChangeHandler = async (event: any) => {
          try {
            console.log(`🔄 [Telegram群组变更] 收到更新事件:`, {
              accountId,
              updateType: event.constructor.name
            });

            let chatId: string | null = null;
            let updateType = '';

            // 使用 gramjs 推荐的方式检查更新类型
            if (event instanceof Api.UpdateChat) {
              // 群组信息变化
              chatId = event.chatId?.toString();
              updateType = 'chat_update';
              console.log(`📝 [Telegram群组] 群组信息已更新: ${chatId}`);
            } else if (event instanceof Api.UpdateChannel) {
              // 频道信息变化
              chatId = event.channelId?.toString();
              updateType = 'channel_update';
              console.log(`📺 [Telegram频道] 频道信息已更新: ${chatId}`);
            } else if (event instanceof Api.UpdateChatParticipant) {
              // 群组参与者状态变化
              chatId = event.chatId?.toString();
              updateType = 'chat_participant';
              console.log(`👥 [Telegram群组成员] 群组成员已变更: ${chatId} (用户ID: ${event.userId})`);
            } else if (event instanceof Api.UpdateChannelParticipant) {
              // 频道/超级群组参与者状态变化
              chatId = event.channelId?.toString();
              updateType = 'channel_participant';
              console.log(`👥 [Telegram频道成员] 频道成员已变更: ${chatId} (用户ID: ${event.userId})`);
            } else if (event instanceof Api.UpdateNewMessage && event.message) {
              // 新消息（包含群组变更消息）
              const message = event.message;
              const hasAction = message && typeof message === 'object' && 'action' in message;
              const isGroupMessage = message.peerId && 
                (('chatId' in message.peerId) || ('channelId' in message.peerId));
              
              if (hasAction && isGroupMessage) {
                chatId = ('chatId' in message.peerId) ? message.peerId.chatId?.toString() : 
                        ('channelId' in message.peerId) ? message.peerId.channelId?.toString() : null;
                updateType = 'message_action';
                console.log(`📨 [Telegram群组消息] 群组变更消息: ${chatId} (动作: ${message.action?.className})`);
              }
            }

            // 如果有有效的 chatId，处理群组变更
            if (chatId) {
              console.log(`🔄 [Telegram群组变更] 检测到群组变更事件:`, {
                accountId,
                chatId,
                updateType
              });
              
              // 处理群组变更
              await this.handleGroupChange(event, accountId, client, { type: updateType });
            }
          } catch (e) {
            console.error('❌ [Telegram群组变更] 处理群组变更失败:', e);
          }
        };
        
        // 注册群组变更事件监听器（使用 gramjs 推荐的方式）
        const groupChangeBuilder = new Raw({
          types: [
            Api.UpdateChat,                 // 群组基本信息更新
            Api.UpdateChannel,              // 频道信息更新
            Api.UpdateChatParticipant,      // 群组成员变更
            Api.UpdateChannelParticipant,   // 频道成员变更
            Api.UpdateNewMessage            // 新消息（包含群组变更消息）
          ]
        });
        (client as TelegramClient).addEventHandler(groupChangeHandler, groupChangeBuilder);
        
        console.log(`✅ [Telegram Provider] 账号 ${accountId} 的监听已启动（包含群组变更检测）`);
        
        this.handlers.set(accountId, { handler, builder });
      } catch (e) {
        console.error('❌ [TelegramProvider.start] 启动监听失败:', accountId, e);
      }
    }
  }

  async stop(): Promise<void> {
    const clients = getAllReconnectedTgClients();
    for (const [accountId, client] of clients) {
      const entry = this.handlers.get(accountId);
      if (entry) {
        try { (client as TelegramClient).removeEventHandler(entry.handler, entry.builder); } catch {}
        this.handlers.delete(accountId);
      }
    }
  }

  /**
   * 停止特定账号的监听
   */
  async stopAccountListening(accountId: string): Promise<void> {
    console.log(`🛑 [Telegram Provider] 停止账号 ${accountId} 的监听...`);
    
    const handlerInfo = this.handlers.get(accountId);
    if (handlerInfo) {
      try {
        const { handler, builder } = handlerInfo;
        
        // 获取客户端
        const client = getReconnectedTgClient(accountId);
        if (client) {
          (client as TelegramClient).removeEventHandler(handler, builder);
        }
        
        // 从handlers中移除
        this.handlers.delete(accountId);
        
        console.log(`✅ [Telegram Provider] 账号 ${accountId} 的监听已完全停止`);
      } catch (error: any) {
        console.error(`❌ [Telegram Provider] 停止账号 ${accountId} 监听失败:`, error.message);
      }
    } else {
      console.log(`⚠️ [Telegram Provider] 账号 ${accountId} 没有活跃的监听器`);
    }
  }

  /**
   * 启动特定账号的监听
   */
  async startAccountListening(accountId: string): Promise<void> {
    console.log(`🚀 [Telegram Provider] 启动账号 ${accountId} 的监听...`);
    
    // 检查账号是否活跃
    const activeSessions = sessionStateService.getActiveSessionsByProvider('telegram');
    const session = activeSessions.find((s: any) => s.id === accountId);
    if (!session || !session.data.isActive) {
      console.log(`⚠️ [Telegram Provider] 账号 ${accountId} 未激活，跳过启动监听`);
      return;
    }
    
    // 检查是否已经有监听器
    if (this.handlers.has(accountId)) {
      console.log(`⚠️ [Telegram Provider] 账号 ${accountId} 已有监听器，跳过启动`);
      return;
    }

    try {
      // 获取客户端
      const client = await this.getClient(accountId);
      if (!client) {
        console.log(`❌ [Telegram Provider] 无法获取账号 ${accountId} 的客户端`);
        return;
      }

      // 检查连接状态
      try {
        const me = await client.getMe();
        if (!me) {
          console.log(`❌ [Telegram Provider] 账号 ${accountId} 客户端未连接`);
          return;
        }
      } catch (error) {
        console.log(`⚠️ [Telegram Provider] 账号 ${accountId} 客户端未连接，等待连接稳定`);
        // 等待连接稳定
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        try {
          const me = await client.getMe();
          if (!me) {
            console.log(`❌ [Telegram Provider] 账号 ${accountId} 客户端仍未连接，无法启动监听`);
            return;
          }
        } catch (error) {
          console.log(`❌ [Telegram Provider] 账号 ${accountId} 客户端仍未连接，无法启动监听`);
          return;
        }
      }

      // 设置客户端ID
      try {
        const me = await client.getMe();
        const myIdStr = (me as any)?.id?.toString?.();
        if (myIdStr) {
          this.myIds.set(accountId, myIdStr);
          console.log(`✅ [Telegram Provider] 已设置账号 ${accountId} 的客户端ID: ${myIdStr}`);
        } else {
          console.log(`⚠️ [Telegram Provider] 无法获取账号 ${accountId} 的客户端ID，me对象:`, me);
        }
      } catch (error: any) {
        console.error(`❌ [Telegram Provider] 获取账号 ${accountId} 的客户端ID失败:`, error.message);
      }

      // 创建消息处理器
      const handler = async (event: any) => {
        try {
          if (!this.messageCallback) {
            console.log(`⚠️ [Telegram Provider] 消息回调未设置，跳过处理`);
            return;
          }

          // 检查消息是否属于当前账号
          // 通过检查客户端ID来确保消息属于正确的账号
          const currentClientId = this.myIds.get(accountId);
          console.log(`🔍 [Telegram Provider] 调试消息过滤:`, {
            accountId,
            currentClientId,
            messageSenderId: event.message?.sender?.id?.toString(),
            messagePeerId: event.message?.peerId,
            messageOut: event.message?.out,
            myIdsMap: Array.from(this.myIds.entries())
          });
          
          if (!currentClientId) {
            console.log(`⚠️ [Telegram Provider] 未找到账号 ${accountId} 的客户端ID，跳过消息处理`);
            return;
          }

          // 检查消息的发送者是否是当前客户端
          const messageSenderId = event.message?.sender?.id?.toString();
          const isFromCurrentClient = messageSenderId === currentClientId;
          
          // 检查是否是发送给当前客户端的消息
          const messagePeerUserId = event.message?.peerId?.userId?.toString();
          const isToCurrentClient = messagePeerUserId === currentClientId;
          
          // 检查是否是群组消息
          const isGroupMessage = event.message?.peerId?.chatId || event.message?.peerId?.channelId;
          
          // 检查是否是当前客户端发送的消息（outgoing）
          const isOutgoingMessage = event.message?.out === true;
          
          console.log(`🔍 [Telegram Provider] 消息归属检查:`, {
            isFromCurrentClient,
            isToCurrentClient,
            isGroupMessage,
            isOutgoingMessage,
            messageOut: event.message?.out,
            messageSenderId,
            messagePeerUserId,
            currentClientId
          });
          
          // 由于NewMessage事件已经通过账号过滤，我们简化过滤逻辑
          // 只检查是否是群组消息或者与当前客户端相关的消息
          const shouldProcessMessage = isGroupMessage || isFromCurrentClient || isToCurrentClient || isOutgoingMessage;
          
          // 如果以上条件都不满足，但消息确实被NewMessage事件捕获，
          // 可能是Telegram的特殊情况，我们仍然处理它
          if (!shouldProcessMessage) {
            console.log(`⚠️ [Telegram Provider] 消息不匹配标准过滤条件，但NewMessage事件已过滤，继续处理`);
            console.log(`🔍 [Telegram Provider] 消息详情:`, {
              messageId: event.message?.id,
              messageText: event.message?.message?.substring(0, 50),
              messageDate: event.message?.date,
              messageFromId: event.message?.fromId,
              messagePeerId: event.message?.peerId
            });
          }
          
          console.log(`✅ [Telegram Provider] 消息通过过滤，开始处理`);

          console.log(`📨 [Telegram Provider] 收到新消息:`, {
            accountId,
            messageId: event.message?.id,
            fromMe: event.message?.out || false,
            content: event.message?.message?.substring(0, 50) + '...',
            timestamp: event.message?.date
          });

          // 处理消息 - 调用消息回调
          if (this.messageCallback) {
            try {
              // 获取用户信息
              let senderName = '';
              let chatName = '';
              try {
                const userId = event.message?.fromId?.userId?.toString();
                const peerUserId = event.message?.peerId?.userId?.toString();
                
                if (userId) {
                  const user = await (client as TelegramClient).getEntity(userId);
                  senderName = (user as any)?.firstName || (user as any)?.username || `User ${userId}`;
                }
                
                if (peerUserId) {
                  const peerUser = await (client as TelegramClient).getEntity(peerUserId);
                  chatName = (peerUser as any)?.firstName || (peerUser as any)?.username || `User ${peerUserId}`;
                }
              } catch (error) {
                console.log(`⚠️ [Telegram Provider] 获取用户信息失败，使用默认名称`);
              }

              // 构建ChatMessage对象
              const message: ChatMessage = {
                id: event.message?.id?.toString() || '',
                chatId: this.buildChatId(accountId, event.message?.peerId?.userId?.toString() || ''),
                sender: event.message?.fromId?.userId?.toString() || '',
                senderName: senderName,
                content: event.message?.message || '',
                timestamp: event.message?.date || Math.floor(Date.now() / 1000),
                isOwn: event.message?.out || false,
                messageType: 'text', // 默认文本消息
                status: 'sent',
                fileName: '' // 需要处理媒体消息
              };

              // 构建ChatInfo对象
              const chatInfo: ChatInfo = {
                id: this.buildChatId(accountId, event.message?.peerId?.userId?.toString() || ''),
                platform: 'telegram',
                accountId: accountId,
                name: chatName || `User ${event.message?.peerId?.userId?.toString() || 'Unknown'}`,
                type: 'private', // 默认私聊
                lastMessage: message.content,
                lastMessageTime: message.timestamp,
                lastMessageSender: message.senderName,
                unreadCount: 0,
                status: 'online',
                createdAt: message.timestamp,
                updatedAt: message.timestamp
              };

              const payload = {
                message,
                chatInfo,
                accountId
              };

              console.log(`📤 [Telegram Provider] 调用消息回调:`, payload);
              await this.messageCallback(payload);
              console.log(`✅ [Telegram Provider] 消息处理完成`);
            } catch (callbackError: any) {
              console.error(`❌ [Telegram Provider] 消息回调执行失败:`, callbackError.message);
            }
          } else {
            console.log(`⚠️ [Telegram Provider] 消息回调未设置，跳过处理`);
          }
        } catch (error: any) {
          console.error(`❌ [Telegram Provider] 处理消息失败:`, error.message);
        }
      };

      // 创建事件构建器 - 监听所有消息，在处理器中过滤
      const builder = new NewMessage();

      // 注册事件处理器
      (client as TelegramClient).addEventHandler(handler, builder);

      // 保存处理器信息
      this.handlers.set(accountId, { handler, builder });

      console.log(`✅ [Telegram Provider] 账号 ${accountId} 的监听已启动`);
    } catch (error: any) {
      console.error(`❌ [Telegram Provider] 启动账号 ${accountId} 监听失败:`, error.message);
    }
  }

  private async getTelegramContactName(client: any, userId: string): Promise<string> {
    if (!userId) return "someone";
  
    // Return from cache
    if (this.telegramNameCache.has(userId)) {
      return this.telegramNameCache.get(userId) || "someone";
    }
  
    try {
      const entity = await client.getEntity(Number(userId));
      const name =
        entity?.firstName && entity?.lastName
          ? `${entity.firstName} ${entity.lastName}`
          : entity?.firstName ||
            entity?.title || // for groups/channels
            userId;
  
      this.telegramNameCache.set(userId, name);
      return name;
    } catch {
      return "Unknown";
    }
  }

  async getMessages(chatId: string, limit: number): Promise<ChatMessagesResponse> {
    try {

      // console.log(`📱 [Telegram Provider] 获取消息: ${chatId}, 限制: ${limit}`);
      const { accountId, originalChatId } = this.parseChatId(chatId);
      const client = await this.getClient(accountId);
      if (!client) return this.emptyResponse();

      // 验证连接状态
      const me = await client.getMe();
      if (!me) {
        // console.log(`⚠️ [Telegram Provider] 客户端未连接: ${accountId}`);
        return this.emptyResponse();
      }

      // 获取聊天对象
      let entity;
      try {
        entity = await client.getEntity(originalChatId);
        if (!entity) {
          console.log(`⚠️ [Telegram Provider] 聊天未找到: ${originalChatId}`);
          return this.emptyResponse();
        }
      } catch (error: any) {
        console.error(`❌ [Telegram Provider] 获取聊天实体失败: ${originalChatId}`, error.message);
        return this.emptyResponse();
      }

      // 获取消息
      const messages = await client.getMessages(entity, { limit });
      // console.log(`📋 [Telegram Provider] 获取到 ${messages.length} 条消息`);
      const chatMessages = await this.mapMessages(messages, accountId, originalChatId, client, me.id?.toString());
      const chatInfo = await this.buildChatInfo(entity, messages, accountId, originalChatId, client);

      return {
        messages: chatMessages,
        chatInfo: chatInfo,
        hasMore: messages.length === limit
      };
    } catch (error) {
      // console.error("❌ [Telegram Provider] 获取消息失败:", error);
      return { messages: [], chatInfo: {} as ChatInfo, hasMore: false };
    }
  }

  async getChats(accountId: string): Promise<ChatInfo[]> {
    try {
      console.log(`[TG] getChats called for`, accountId);

      // 获取客户端
      const client = await this.getClient(accountId);
      if (!client) {
        // console.log(`⚠️ [Telegram Provider] 客户端未找到: ${accountId}`);
        return [];
      }

      // 验证连接状态
      const me = await client.getMe();
      if (!me) {
        // console.log(`⚠️ [Telegram Provider] 客户端未连接: ${accountId}`);
        return [];
      }

      // 检查缓存
      const cacheKey = accountId;
      const cached = this.dialogsCache.get(cacheKey);
      const now = Date.now();
      
      let dialogs;
      if (cached && (now - cached.timestamp) < this.CACHE_TTL) {
        console.log(`💾 [Telegram Provider] 使用缓存的对话列表: ${accountId}`);
        dialogs = cached.data;
      } else {
        console.log(`🔄 [Telegram Provider] 从API获取对话列表: ${accountId}`);
        try {
          dialogs = await client.getDialogs({ limit: 100 });
          // 更新缓存
          this.dialogsCache.set(cacheKey, { data: dialogs, timestamp: now });
          console.log(`💾 [Telegram Provider] 对话列表已缓存: ${accountId}`);
        } catch (error: any) {
          if (error.message?.includes('flood wait')) {
            console.log(`⚠️ [Telegram Provider] 遇到flood wait，使用缓存数据: ${accountId}`);
            if (cached) {
              dialogs = cached.data;
            } else {
              console.log(`❌ [Telegram Provider] 没有缓存数据，返回空列表: ${accountId}`);
              return [];
            }
          } else {
            throw error;
          }
        }
      }
      
      console.log(`[TG] dialogs length =`, dialogs.length);
    
      const accountChats: ChatInfo[] = [];

      for (const dialog of dialogs) {
        const entity = dialog.entity;
        if (!entity) continue;

        const avatar = (await this.getOrCreateAvatarUrl(client, entity, accountId)) ?? this.resolveAvatar(entity);
   
        const chatInfo: ChatInfo = {
          id: `tg:${accountId}:${entity.id}`,
          platform: 'telegram',
          accountId,
          groupId: `telegram:peer:${entity.id}`, 
          name: this.getChatName(entity),
          avatar,
          type: this.getChatType(entity),
          username: (entity as any).username,
          memberCount: (entity as any).participantsCount,
          lastMessage: dialog.message?.message || `[${dialog.message?.action || 'Media Message'}]`,
          lastMessageTime: dialog.message ? dialog.message.date * 1000 : 0,
          lastMessageSender: (dialog.message?.sender as any)?.firstName || 'Unknown Sender',
          unreadCount: dialog.unreadCount || 0,
          status: 'online',
          createdAt: Date.now() - 86400000,
          updatedAt: Date.now(),
        };

        accountChats.push(chatInfo);
      }
      // for (const dialog of dialogs) {
      //   try {
      //     const entity = dialog.entity;
      //     if (!entity) {
      //       console.log(`⚠️ [Telegram Provider] 对话实体为空，跳过`);
      //       continue;
      //     }

      //     const originalChatId = entity.id?.toString() || 'unknown';

      //     // 获取聊天名称
      //     let chatName = '';
      //     if ((entity as any).title) {
      //       chatName = (entity as any).title;
      //     } else if ((entity as any).firstName) {
      //       chatName = (entity as any).firstName;
      //       if ((entity as any).lastName) {
      //         chatName += ` ${(entity as any).lastName}`;
      //       }
      //     } else {
      //       chatName = `聊天 ${originalChatId}`;
      //     }

      //     // 获取头像
      //     let avatar = '';
      //     try {
      //       if ((entity as any).photo && (entity as any).photo.photoId && (entity as any).photo.dcId && (entity as any).photo.className !== 'ChatPhotoEmpty') {
      //         avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(chatName)}&size=320&background=random&bold=true`;
      //       } else if ((entity as any).username) {
      //         avatar = `https://t.me/i/userpic/320/${(entity as any).username}.jpg`;
      //       } else {
      //         avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(chatName)}&size=320&background=random`;
      //       }
      //     } catch (avatarError) {
      //       console.log(`⚠️ [Telegram Provider] 获取头像失败:`, avatarError);
      //       avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(chatName)}&size=320&background=random`;
      //     }

      //     // 获取最后消息 
      //     let lastMessage = '';
      //     let lastMessageTime = Date.now();
      //     let lastMessageSender = '';
      //     let unreadCount = 0;

      //     try {
      //       if (dialog.message) {
      //         lastMessage = dialog.message.message || `[${dialog.message.action || '媒体消息'}]`;
      //         lastMessageTime = dialog.message.date * 1000;
      //         lastMessageSender = (dialog.message.sender as any)?.firstName || (dialog.message.sender as any)?.username || '未知发送者';
      //       }
      //       unreadCount = dialog.unreadCount || 0;
      //     } catch (msgError) {
      //       console.log(`⚠️ [Telegram Provider] 获取最后消息失败:`, msgError);
      //     }

      //     // 确定聊天类型
      //     let chatType: 'private' | 'group' | 'channel' | 'bot' | 'system' | 'topic' = 'private';
      //     if (entity.className === 'Channel') {
      //       chatType = 'channel';
      //     } else if (entity.className === 'Chat' || entity.className === 'ChatForbidden') {
      //       chatType = 'group';
      //     } else if (entity.className === 'User' && (entity as any).bot) {
      //       chatType = 'bot';
      //     }

      //     // 获取成员数量
      //     let memberCount: number | undefined;
      //     if ((entity as any).participantsCount !== undefined) {
      //       memberCount = (entity as any).participantsCount;
      //     }

      //     const tgGroupId = `telegram:peer:${originalChatId}`;

      //     const chatInfo: ChatInfo = {
      //       id: `tg-${accountId}-${originalChatId}`,
      //       platform: 'telegram',
      //       accountId: accountId,
      //       groupId: tgGroupId,
      //       name: chatName,
      //       avatar: avatar,
      //       type: chatType,
      //       username: (entity as any).username,
      //       chatType: chatType,
      //       memberCount: memberCount,
      //       lastMessage: lastMessage,
      //       lastMessageTime: lastMessageTime,
      //       lastMessageSender: lastMessageSender,
      //       unreadCount: unreadCount,
      //       status: 'online',
      //       createdAt: Date.now() - 86400000,
      //       updatedAt: Date.now()
      //     };

      //     accountChats.push(chatInfo);
      //   } catch (dialogError) {
      //     console.log(`⚠️ [Telegram Provider] 处理对话失败: ${accountId}`, dialogError);
      //   }
      // }

      console.log(`[TG] built accountChats count =`, accountChats.length);
      // 调试：检查排序相关字段
     
        // console.log('accountChats:', accountChats);
        // accountChats.forEach((chat: any) => {
        //   console.log({
        //     name: chat.name,
        //     isGroup: chat.type === 'group',
        //     hasMessage: Boolean(chat.lastMessage),
        //     // Telegram 原始对话的 date 已在上面转换为毫秒存入 lastMessageTime
        //     messageDate: chat.lastMessageTime ? new Date(chat.lastMessageTime).toISOString() : null,
        //     lastMessageTime: chat.lastMessageTime,
        //     pinned: (chat as any).pinned
        //   });
        // });
      // 统一按最后消息时间降序；无最后消息的靠后
      accountChats.sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));
      return accountChats;

    } catch (error) {
      // console.error(`❌ [Telegram Provider] 获取聊天列表失败: ${accountId}`, error);
      return [];
    }
  }

  private parseChatId(chatId: string): { accountId: string, originalChatId: string } {
    const parts = chatId.split(':');
    if (parts.length !== 3) {
      throw new Error(`无效的Telegram聊天ID格式: ${chatId}`);
    }
    
    let accountId = parts[1];
    // 如果 accountId 包含 tg- 前缀，去掉它
    if (accountId.startsWith('tg-')) {
      accountId = accountId.substring(3);
    }
    
    return { accountId, originalChatId: parts[2] };
  }

  private buildChatId(accountId: string, originalChatId: string): string {
    // 构建格式: tg:{accountId}:{originalChatId}
    return `tg:${accountId}:${originalChatId}`;
  }

  private async getClient(accountId: string, maxWaitTime: number = 10000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      console.log(`🔍 [Telegram Provider] 查找客户端: ${accountId}`);
      const allClients = getAllReconnectedTgClients();
      console.log(`🔍 [Telegram Provider] 当前已连接的客户端:`, Array.from(allClients.keys()));

      // 尝试多种ID格式匹配
      let client = getReconnectedTgClient(accountId);
      
      if (!client) {
        // 尝试去掉前缀匹配
        const cleanId = accountId.replace(/^tg-/, '');
        console.log(`🔍 [Telegram Provider] 尝试去掉前缀匹配: ${cleanId}`);
        client = getReconnectedTgClient(cleanId);
      }
      
      if (!client) {
        // 尝试添加前缀匹配
        const prefixedId = accountId.startsWith('tg-') ? accountId : `tg-${accountId}`;
        console.log(`🔍 [Telegram Provider] 尝试添加前缀匹配: ${prefixedId}`);
        client = getReconnectedTgClient(prefixedId);
      }

      if (!client) {
        // 尝试模糊匹配
        const fuzzyMatch = Array.from(allClients.keys()).find(id => 
          id.includes(accountId) || accountId.includes(id)
        );
        if (fuzzyMatch) {
          console.log(`🔍 [Telegram Provider] 找到模糊匹配: ${fuzzyMatch}`);
          client = getReconnectedTgClient(fuzzyMatch);
        }
      }
      
      if (client) {
        console.log(`✅ [Telegram Provider] 找到客户端: ${accountId}`);
        return client;
      } else {
        console.log(`⏳ [Telegram Provider] 客户端未找到，等待连接完成: ${accountId} (${Math.round((Date.now() - startTime) / 1000)}s)`);
        // 等待1秒后重试
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log(`❌ [Telegram Provider] 等待超时，未找到客户端: ${accountId}`);
    return null;
  }

  private emptyResponse(): ChatMessagesResponse {
    return { messages: [], chatInfo: {} as ChatInfo, hasMore: false };
  }

  private async mapMessages(messages: any[], accountId: string, originalChatId: string, client: any, myId?: string): Promise<ChatMessage[]> {
    const results = await Promise.all(messages.map(async (msg: any) => {
      const senderId = msg.sender?.id?.toString();
      const isOwn = senderId === myId;

      // 检测消息类型和内容
      const { messageType, content } = await this.detectMessageTypeAndContent(msg, accountId, client);

      // 添加 console.log 显示 messageType
      // console.log(`📱 [Telegram Provider] 消息类型检测:`, {
      //   messageId: msg.id,
      //   messageType: messageType,
      //   content: content,
      //   hasMessage: !!msg.message,
      //   hasPhoto: !!msg.photo,
      //   hasVideo: !!msg.video,
      //   hasDocument: !!msg.document,
      //   hasSticker: !!msg.sticker,
      //   hasVoice: !!msg.voice,
      //   hasGeo: !!msg.geo,
      //   hasContact: !!msg.contact,
      //   hasAction: !!msg.action,
      //   rawMessage: {
      //     message: msg.message,
      //     action: msg.action,
      //     photo: msg.photo ? 'present' : 'absent',
      //     video: msg.video ? 'present' : 'absent',
      //     document: msg.document ? 'present' : 'absent',
      //     sticker: msg.sticker ? 'present' : 'absent',
      //     voice: msg.voice ? 'present' : 'absent',
      //     geo: msg.geo ? 'present' : 'absent',
      //     contact: msg.contact ? 'present' : 'absent'
      //   }
      // });

      // 为文档消息添加文件名
      const messageData: any = {
        id: `tg:${accountId}:${msg.id}`, // Telegram 用数字 id
        chatId: `tg:${accountId}:${originalChatId}`,
        sender: msg.sender?.firstName || msg.sender?.username || '未知发送者',
        content: content,
        timestamp: msg.date * 1000,
        isOwn,
        messageType: messageType,
        status: 'read' as const
      };

      // 添加地理位置信息
      // 暂不处理地理位置

      // 如果是文档消息或动画贴纸，添加文件名
      if (messageType === 'document' && msg.document) {
        messageData.fileName = this.getDocumentFileName(msg.document);
      } else if (messageType === 'sticker' && msg.document) {
        // 贴纸的文件名，根据动画标志决定扩展名
        const extension = this.getStickerFileExtension(msg.document);
        messageData.fileName = msg.document.fileName || `Sticker.${extension}`;
      } else if (messageType === 'sticker' && msg.sticker) {
        // 直接贴纸消息的文件名（通常是静态WebP格式）
        messageData.fileName = `sticker.webp`;
      }

      return messageData;
    }));
    
    return results;
  }

  private formatLastMessage(msg: any): string {
    if (!msg) return "";
  
    // 1️⃣ Plain text message
    if (typeof msg.message === "string" && msg.message.trim()) {
      return msg.message;
    }
  
    // 2️⃣ System / Action messages
    if (msg.action) {
      const action = msg.action;
      switch (action.className) {
        case "MessageActionChatAddUser":
          return `👤 Added a new member`;
        case "MessageActionChatEditTitle":
          return `📝 Changed group name to "${action.title}"`;
        case "MessageActionChatDeleteUser":
          return `🚪 Member left the group`;
        case "MessageActionPinMessage":
          return `📌 Pinned a message`;
        case "MessageActionChatJoinedByLink":
          return `🔗 Joined via invite link`;
        default:
          return `[${action.className}]`;
      }
    }
  
    // 3️⃣ Media message fallback
    if (msg.photo) return "📷 Photo";
    if (msg.video) return "🎥 Video";
    if (msg.document) return msg.document.fileName || "📎 Document";
    if (msg.sticker) return "🎭 Sticker";
    if (msg.voice) return "🎤 Voice message";
    if (msg.contact) return "👤 Contact shared";
    if (msg.location) return "📍 Location shared";
  
    // 4️⃣ Fallback for unknown types
    return "🕓 New message";
  }
  
  private async buildChatInfo(entity: any, messages: any, accountId: string, chatId: string, client: TelegramClient): Promise<ChatInfo> {
    const lastMessageObj = messages?.[0];
  
    let lastMessageText = '';
  
    if (lastMessageObj) {
      if (lastMessageObj.message) {
        lastMessageText = lastMessageObj.message; // normal text message
      } else if (lastMessageObj.action) {
        // handle special Telegram actions
        switch (lastMessageObj.action.className) {
          case 'MessageActionChatEditTitle':
            lastMessageText = `群组名称修改为「${lastMessageObj.action.title}」`;
            break;
          case 'MessageActionChatAddUser':
            lastMessageText = `新增成员 (${lastMessageObj.action.users?.length || 1} 位)`;
            break;
          case 'MessageActionChatDeleteUser':
            lastMessageText = `成员已移除`;
            break;
          case 'MessageActionChatEditPhoto':
            lastMessageText = `群组头像已更新`;
            break;
          default:
            lastMessageText = `[${lastMessageObj.action.className}]`;
        }
      } else {
        lastMessageText = '[未知消息类型]';
      }
    }
  
    return {
      id: `tg:${accountId}:${chatId}`,
      platform: 'telegram',
      accountId,
      groupId: `telegram:peer:${chatId}`,
      name: entity.title || entity.firstName || 'Unknown',
      avatar: entity.photo?.photoBig?.location?.toString(),
      type: entity.className.includes('Channel') ? 'channel' : 'group',
      username: entity.username,
      memberCount: entity.participantsCount,
      lastMessage:  this.formatLastMessage(lastMessageText[0]), // ✅ now a proper string
      lastMessageTime: lastMessageObj?.date * 1000 || Date.now(),
      lastMessageSender: lastMessageObj?.senderId?.toString() || '',
      unreadCount: 0,
      status: 'online',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }
  

  private async getOrCreateAvatarUrl(client: any, entity: any, accountId: string): Promise<string | undefined> {
    try {
      const baseDir = path.join(process.cwd(), 'public', 'avatars', 'tg', accountId);
      const fileName = `${entity.id}.jpg`;
      const filePath = path.join(baseDir, fileName);
      const publicUrl = `/avatars/tg/${accountId}/${fileName}`;

      if (fs.existsSync(filePath)) {
        return publicUrl;
      }

      if (entity.username) {
        return `https://t.me/i/userpic/320/${entity.username}.jpg`;
      }
      
      if (entity.photo && entity.photo.className !== 'ChatPhotoEmpty' && client?.downloadProfilePhoto) {
        try {
          const buf: Buffer = await client.downloadProfilePhoto(entity, { isSmall: true });
          
          if (buf && buf.length > 0) {
            fs.mkdirSync(baseDir, { recursive: true });
            fs.writeFileSync(filePath, buf);
            return publicUrl;
          }
        } catch (downloadError: any) {
          console.warn(`⚠️ [Telegram] 头像下载失败: ${entity.id}`, downloadError?.message);
        }
      }
    } catch (error: any) {
      console.warn(`⚠️ [Telegram] 头像处理失败: ${entity.id}`, error?.message);
    }
    return undefined;
  }

  private getChatName(entity: any): string {
    if (entity.title) return entity.title;
    if (entity.firstName) return entity.firstName + (entity.lastName ? ` ${entity.lastName}` : '');
    return `聊天 ${entity.id}`;
  }

  private resolveAvatar(entity: any): string {
    try {
      // 1️⃣ 优先用 username 对应的 Telegram 头像（仅个人用户有效）
      if (entity.username) {
        return `https://t.me/i/userpic/320/${entity.username}.jpg`;
      }
  
      // 2️⃣ 尝试用 entity.photo（群组/频道头像）
      if (entity.photo && entity.photo.className !== 'ChatPhotoEmpty') {
        // Telegram photo 下载比较复杂，简单起见返回 ui-avatar 占位
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(this.getChatName(entity))}&size=320&background=random&bold=true`;
      }
    } catch (err) {
      console.warn('⚠️ getAvatar 出错:', err);
    }
  
    // 3️⃣ 都没有头像，返回默认 ui-avatar
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(this.getChatName(entity))}&size=320&background=random`;
  }

  private getChatType(entity: any): 'private' | 'group' | 'channel' | 'bot' | 'system' | 'topic' {
    if (entity.className === 'Channel') return 'channel';
    if (entity.className === 'Chat' || entity.className === 'ChatForbidden') return 'group';
    if (entity.className === 'User' && (entity as any).bot) return 'bot';
    return 'private';
  }

  private async getMediaUrl(media: any, type: string, accountId: string, messageId: string, client?: any): Promise<string> {
    try {
      const mediaDisabled = String(process.env.MEDIA_DOWNLOAD_DISABLED || '').trim().toLowerCase() === 'true';
      // console.log(`[TG][getMediaUrl] accountId=${accountId} type=${type} messageId=${messageId} disabled=${mediaDisabled}`);
      if (mediaDisabled) {
        const baseUrl = config.API_BASE_URL;
        // 计算正确扩展名（避免文档默认.pdf导致不匹配）
        let ext = this.getFileExtension(type);
        if (type === 'document') {
          if (media) {
            const mm = (media as any).mimetype || (media as any).mimeType;
            if (typeof mm === 'string' && mm.length > 0) {
              ext = this.getExtensionFromMimeType(mm);
            } else {
              const fname = (media as any).fileName || (media as any).originalname || '';
              const m = fname.match(/\.([a-zA-Z0-9]+)$/);
              if (m) ext = m[1].toLowerCase();
            }
          } else {
            const existing = this.findExistingDocumentFile(accountId, messageId);
            if (existing) {
              ext = require('path').extname(existing).replace(/^\./, '') || ext;
            }
          }
        }
        // console.log(`[TG][getMediaUrl] MEDIA_DOWNLOAD_DISABLED=true -> return URL only`);
        const acc = String(accountId).replace(/^tg-/, '');
        return `${baseUrl}/api/media/tg/${acc}/${type}/${messageId}.${ext}`;
      }
      const baseUrl = config.API_BASE_URL;

      // 获取正确的文件扩展名（与保存文件时使用相同逻辑）
      let fileExtension = this.getFileExtension(type);
      if ((type === 'photo' || type === 'video') && media) {
        const mimeTypeRaw = (media as any).mimetype || (media as any).mimeType || '';
        const mimeType = typeof mimeTypeRaw === 'string' ? mimeTypeRaw : '';
        fileExtension = this.getExtensionFromMimeType(mimeType) || this.getFileExtension(type);
        if (!fileExtension || fileExtension === 'bin') {
          const fname = (media as any).fileName || (media as any).originalname || '';
          const m = typeof fname === 'string' ? fname.match(/\.([a-zA-Z0-9]+)$/) : null;
          if (m) fileExtension = m[1].toLowerCase();
        }
      }
      const accLog = String(accountId).replace(/^tg-/, '');
      console.log(`🔍 [TG媒体] 检查文件路径: accountId=${accLog} type=${type} messageId=${messageId}`);
      console.log(`🔍 [TG媒体] 生成URL: ${baseUrl}/api/media/tg/${accLog}/${type}/${messageId}.${fileExtension}`);
      if (type === 'sticker' && media) {
        // 对于贴纸，需要根据实际类型决定扩展名
        const mimeType = media.mimeType || '';
        const attributes = media.attributes || [];
        const stickerAttribute = attributes.find((attr: any) => attr.className === 'DocumentAttributeSticker');

        const isAnimatedSticker = mimeType === 'application/x-tgsticker' ||
                                 (mimeType === '' && media.fileName?.endsWith('.tgs')) ||
                                 (stickerAttribute && stickerAttribute.animated === true);

        fileExtension = isAnimatedSticker ? 'tgs' : 'webp';
      }
      if ((type === 'photo' || type === 'video') && media) {
        const mimeType = media.mimeType || '';
        const guessed = this.getExtensionFromMimeType(mimeType);
        if (guessed) fileExtension = guessed;
      }
      if (type === 'document') {
        if (media) {
          const mm = (media as any).mimetype || (media as any).mimeType;
          if (typeof mm === 'string' && mm.length > 0) {
            fileExtension = this.getExtensionFromMimeType(mm);
          } else {
            const fname = (media as any).fileName || (media as any).originalname || '';
            const m = fname.match(/\.([a-zA-Z0-9]+)$/);
            if (m) fileExtension = m[1].toLowerCase();
          }
        } else {
          const existing = this.findExistingDocumentFile(accountId, messageId);
          if (existing) {
            fileExtension = require('path').extname(existing).replace(/^\./, '') || fileExtension;
          }
        }
      }

      // 生成带扩展名的URL
      const accUrl = String(accountId).replace(/^tg-/, '');
      const mediaUrl = `${baseUrl}/api/media/tg/${accUrl}/${type}/${messageId}.${fileExtension}`;

      // 检查缓存
      const cacheKey = `${accountId}/${type}/${messageId}`;
      if (this.mediaFileCache.has(cacheKey)) {
        const cachedPath = this.mediaFileCache.get(cacheKey)!;
        if (fs.existsSync(cachedPath)) {
          // console.log(`📁 [媒体] 从缓存找到文件: ${cachedPath}`);
          return mediaUrl;
        } else {
          // 缓存中的文件已不存在，清除缓存
          this.mediaFileCache.delete(cacheKey);
        }
      }

      // 检查文件是否已存在
      const filePath = this.getMediaFilePathWithExtension(accountId, type, messageId, media);
      if (fs.existsSync(filePath)) {
        // console.log(`📁 [媒体] 文件已存在: ${filePath}`);
        this.mediaFileCache.set(cacheKey, filePath);
        return mediaUrl;
      }

      // 对于文档类型，额外检查其他可能的扩展名
      if (type === 'document' && media) {
        const existingPath = this.findExistingDocumentFile(accountId, messageId, media);
        if (existingPath) {
          console.log(`📁 [媒体] 找到已存在的文档文件: ${existingPath}`);
          this.mediaFileCache.set(cacheKey, existingPath);
          return mediaUrl;
        }
      }

      // 如果没有客户端或媒体为空，返回占位符URL
      if (!client || !media) {
        console.log(`📁 [媒体] 无客户端或媒体为空，返回占位符URL`);
        return mediaUrl;
      }

      // 异步下载媒体文件（不阻塞当前请求）
      this.downloadMediaAsync(media, type, accountId, messageId, client).catch(error => {
        console.error(`❌ [媒体] 异步下载失败: ${type}/${messageId}`, error);
      });

      return mediaUrl;
    } catch (error) {
      console.error('生成媒体URL失败:', error);
      // 返回空字符串而不是错误文本，让前端使用fallback
      return '';
    }
  }
  /**
   * 检测消息类型和内容 - 复用函数
   */
  // private async detectMessageTypeAndContent(msg: any, accountId: string, client?: any): Promise<{ messageType: ChatMessage['messageType']; content: string }> {
  //   let messageType: ChatMessage['messageType'] = 'text';
  //   let content = msg.message || `[${msg.action || '媒体消息'}]`;
    
  //   // 对于媒体消息，不要使用 msg.message 作为 content，因为可能包含无效的占位符
  //   const isMediaMessage = ['photo', 'video', 'voice', 'document', 'sticker'].some(type => msg[type]) || 
  //                         (msg.document && (msg.document.mimeType?.startsWith('image/') || msg.document.mimeType?.startsWith('video/') || msg.document.mimeType?.startsWith('audio/')));
  //   if (isMediaMessage) {
  //     content = ''; // 媒体消息的 content 将在后续处理中设置
  //   }
    
    
  //   // 优先检查语音消息，即使有文本内容
  //   if (msg.document) {
  //     // 检查是否是语音消息（通过 MIME 类型和属性判断）
  //     const mimeType = msg.document?.mimeType || '';
  //     const voiceAttributes = msg.document?.attributes || [];
  //     const isVoiceMessage = mimeType.startsWith('audio/') ||
  //                           voiceAttributes.some((attr: any) => attr.className === 'DocumentAttributeAudio' && attr.voice);

  //     // 检查是否是贴纸（通过属性和MIME类型判断）
  //     const stickerAttributes = msg.document?.attributes || [];
  //     const stickerAttribute = stickerAttributes.find((attr: any) => attr.className === 'DocumentAttributeSticker');
  //     const isStickerDocument = !!stickerAttribute;

  //     // 检查动画标志：通过MIME类型或DocumentAttributeSticker的animated属性
  //     const isAnimatedSticker = mimeType === 'application/x-tgsticker' ||
  //                              (mimeType === '' && msg.document?.fileName?.endsWith('.tgs')) ||
  //                              (stickerAttribute && stickerAttribute.animated === true);

  //     // 检查是否是静态贴纸（有贴纸属性但不是动画）
  //     const isStaticSticker = isStickerDocument && !isAnimatedSticker;


  //     if (isVoiceMessage) {
  //       messageType = 'voice';
  //       // 对于语音消息，先尝试下载文件，确保文件存在
  //       try {
  //         console.log(`🎤 [语音消息] 开始下载语音文件: ${msg.id}`);
  //         const buffer = await client.downloadMedia(msg.document, {
  //           progressCallback: (downloaded: number, total: number) => {
  //             const progress = Math.round((downloaded / total) * 100);
  //             console.log(`🎤 [语音消息] 下载进度: ${progress}% (${downloaded}/${total})`);
  //           }
  //         });
          
  //         if (buffer && buffer.length > 0) {
  //           // 保存语音文件到服务器
  //           await this.saveMediaToServer(buffer, 'voice', accountId, msg.id, msg.document);
  //           console.log(`✅ [语音消息] 语音文件已保存: ${msg.id}`);
  //         }
  //       } catch (downloadError) {
  //         console.error(`❌ [语音消息] 下载失败: ${msg.id}`, downloadError);
  //       }
        
  //       content = await this.getMediaUrl(msg.document, 'voice', accountId, msg.id, client);
  //       console.log(`🎤 [语音消息] 检测到语音消息: ${msg.id}, URL: ${content}`);
  //     } else if (mimeType.startsWith('image/')) {
  //       // 图片以 document 形式到达
  //       messageType = 'photo';
  //       try {
  //         const buffer = await client.downloadMedia(msg.document, {
  //           progressCallback: (downloaded: number, total: number) => {}
  //         });
  //         if (buffer && buffer.length > 0) {
  //           await this.saveMediaToServer(buffer, 'photo', accountId, msg.id, msg.document);
  //         }
  //       } catch (downloadError) {
  //         console.error(`❌ [图片(document)] 下载失败: ${msg.id}`, downloadError);
  //       }
  //       content = await this.getMediaUrl(msg.document, 'photo', accountId, msg.id, client);
  //       console.log(`🖼️ [图片(document)] URL: ${content}`);
  //     } else if (mimeType.startsWith('video/')) {
  //       // 视频以 document 形式到达
  //       messageType = 'video';
  //       try {
  //         const buffer = await client.downloadMedia(msg.document, {
  //           progressCallback: (downloaded: number, total: number) => {}
  //         });
  //         if (buffer && buffer.length > 0) {
  //           await this.saveMediaToServer(buffer, 'video', accountId, msg.id, msg.document);
  //         }
  //       } catch (downloadError) {
  //         console.error(`❌ [视频(document)] 下载失败: ${msg.id}`, downloadError);
  //       }
  //       content = await this.getMediaUrl(msg.document, 'video', accountId, msg.id, client);
  //       console.log(`🎬 [视频(document)] URL: ${content}`);
  //     } else if (isAnimatedSticker) {
  //       messageType = 'sticker';
  //       content = await this.getMediaUrl(msg.document, 'sticker', accountId, msg.id, client);
  //       // console.log(`🎭 [动画贴纸] 检测到TGS动画贴纸:`, {
  //       //   messageId: msg.id,
  //       //   mimeType: mimeType,
  //       //   fileName: msg.document?.fileName || 'AnimatedSticker.tgs',
  //       //   fileSize: msg.document?.size
  //       // });
  //     } else if (isStaticSticker) {
  //       // 静态贴纸通过document检测
  //       messageType = 'sticker';
  //       content = await this.getMediaUrl(msg.document, 'sticker', accountId, msg.id, client);
  //       // console.log(`🎭 [静态贴纸] 检测到WebP贴纸:`, {
  //       //   messageId: msg.id,
  //       //   mimeType: mimeType,
  //       //   fileName: msg.document?.fileName || 'Sticker.webp',
  //       //   fileSize: msg.document?.size
  //       // });
  //     } else {
  //       messageType = 'document';
  //       // 文档消息生成下载URL，但文件名单独存储
  //       const fileName = this.getDocumentFileName(msg.document);
  //       const downloadUrl = await this.getMediaUrl(msg.document, 'document', accountId, msg.id, client);
  //       content = downloadUrl; // 存储下载URL
  //       // console.log(`📄 [文档消息] 显示文件名:`, {
  //       //   messageId: msg.id,
  //       //   fileName: fileName,
  //       //   downloadUrl: downloadUrl,
  //       //   mimeType: mimeType,
  //       //   fileSize: msg.document?.size,
  //       //   expectedExtension: this.getExtensionFromMimeType(mimeType)
  //       // });
  //     }
  //   } else if (msg.message) {
  //     messageType = 'text';
  //   } else if (msg.photo) {
  //     messageType = 'photo';
  //     // 确保图片先下载保存，再生成可用URL，避免前端出现占位符文本
  //     try {
  //       const buffer = await client.downloadMedia(msg.photo, {
  //         progressCallback: (downloaded: number, total: number) => {
  //           const progress = Math.round((downloaded / total) * 100);
  //           // console.log(`🖼️ [图片消息] 下载进度: ${progress}% (${downloaded}/${total})`);
  //         }
  //       });
  //       if (buffer && buffer.length > 0) {
  //         await this.saveMediaToServer(buffer, 'photo', accountId, msg.id, msg.photo);
  //       }
  //     } catch (downloadError) {
  //       console.error(`❌ [图片消息] 下载失败: ${msg.id}`, downloadError);
  //     }
  //     content = await this.getMediaUrl(msg.photo, 'photo', accountId, msg.id, client);
  //   } else if (msg.video) {
  //     messageType = 'video';
  //     content = await this.getMediaUrl(msg.video, 'video', accountId, msg.id, client);
  //   } else if (msg.sticker) {
  //     // 这种情况应该很少见，因为大部分贴纸都通过document检测
  //     // 但保留作为fallback，以防有特殊的贴纸消息
  //     messageType = 'sticker';
  //     content = await this.getMediaUrl(msg.sticker, 'sticker', accountId, msg.id, client);
  //     console.log(`🎭 [直接贴纸] 检测到直接贴纸消息:`, {
  //       messageId: msg.id,
  //       stickerEmoji: msg.sticker?.emoji,
  //       stickerWidth: msg.sticker?.w,
  //       stickerHeight: msg.sticker?.h,
  //       stickerMimeType: msg.sticker?.mimeType,
  //       content: content
  //     });
  //   } else if (msg.voice) {
  //     messageType = 'voice';
  //     // 对于直接语音消息，先尝试下载文件，确保文件存在
  //     try {
  //       console.log(`🎤 [直接语音消息] 开始下载语音文件: ${msg.id}`);
  //       const buffer = await client.downloadMedia(msg.voice, {
  //         progressCallback: (downloaded: number, total: number) => {
  //           const progress = Math.round((downloaded / total) * 100);
  //           console.log(`🎤 [直接语音消息] 下载进度: ${progress}% (${downloaded}/${total})`);
  //         }
  //       });
        
  //       if (buffer && buffer.length > 0) {
  //         // 保存语音文件到服务器
  //         await this.saveMediaToServer(buffer, 'voice', accountId, msg.id, msg.voice);
  //         console.log(`✅ [直接语音消息] 语音文件已保存: ${msg.id}`);
  //       }
  //     } catch (downloadError) {
  //       console.error(`❌ [直接语音消息] 下载失败: ${msg.id}`, downloadError);
  //     }
      
  //     content = await this.getMediaUrl(msg.voice, 'voice', accountId, msg.id, client);
  //     console.log(`🎤 [直接语音消息] 检测到直接语音消息: ${msg.id}, URL: ${content}`);
  //   } else if (msg.contact) {
  //     messageType = 'contact';
  //     content = '[联系人]';
  //   } else if (msg.action) {
  //     messageType = 'action';
  //     content = `[${msg.action}]`;
  //   } else {
  //     messageType = 'unknown';
  //     content = '[未知消息类型]';
  //   }

  //   // 最终兜底：如果仍是文本/未知，但检测到图片或视频资源，强制按媒体处理，避免出现 content 为空
  //   try {
  //     const docMime = msg?.document?.mimeType || '';
  //     if ((messageType === 'text' || messageType === 'unknown') && msg?.photo) {
  //       messageType = 'photo';
  //       content = await this.getMediaUrl(msg.photo, 'photo', accountId, msg.id, client);
  //       console.log(`🖼️ [兜底] 将消息按图片处理: ${msg.id} -> ${content}`);
  //     } else if ((messageType === 'text' || messageType === 'unknown') && docMime.startsWith('image/')) {
  //       messageType = 'photo';
  //       content = await this.getMediaUrl(msg.document, 'photo', accountId, msg.id, client);
  //       console.log(`🖼️ [兜底] 将document按图片处理: ${msg.id} -> ${content}`);
  //     } else if ((messageType === 'text' || messageType === 'unknown') && docMime.startsWith('video/')) {
  //       messageType = 'video';
  //       content = await this.getMediaUrl(msg.document, 'video', accountId, msg.id, client);
  //       console.log(`🎬 [兜底] 将document按视频处理: ${msg.id} -> ${content}`);
  //     }
  //   } catch {}

  //   return { messageType, content };
  // }

  private async detectMessageTypeAndContent(
    msg: any,
    accountId: string,
    client?: any
  ): Promise<{ messageType: ChatMessage['messageType']; content: string }> {
    let messageType: ChatMessage['messageType'] = 'text';
    let content = '';
    const actorId = msg.fromId?.userId?.toString() || msg.senderId?.toString();
    const actorName = await this.getTelegramContactName(client, actorId);
  
    // Helper: return readable label safely
    const safe = (txt: any, fallback: string) =>
      typeof txt === 'string' && txt.trim() ? txt.trim() : fallback;
  
    try {
      // --- 🎯 TEXT MESSAGES ---
      if (typeof msg.message === 'string' && msg.message.trim()) {
        messageType = 'text';
        content = msg.message.trim();
  
      // --- 📷 PHOTO ---
      } else if (msg.photo) {
        messageType = 'photo';
        await this.safeDownload(client, msg.photo, 'photo', accountId, msg.id);
        content = await this.getMediaUrl(msg.photo, 'photo', accountId, msg.id, client);
  
      // --- 🎥 VIDEO ---
      } else if (msg.video) {
        messageType = 'video';
        await this.safeDownload(client, msg.video, 'video', accountId, msg.id);
        content = await this.getMediaUrl(msg.video, 'video', accountId, msg.id, client);
  
      // --- 📄 DOCUMENT / FILE ---
      } else if (msg.document) {
        const mimeType = msg.document?.mimeType || '';
        const attrs = msg.document?.attributes || [];
        const isVoice = mimeType.startsWith('audio/') ||
                        attrs.some((a: any) => a.className === 'DocumentAttributeAudio' && a.voice);
        const isSticker = attrs.some((a: any) => a.className === 'DocumentAttributeSticker');
        const fileName = this.getDocumentFileName(msg.document);
  
        if (isVoice) {
          messageType = 'voice';
          await this.safeDownload(client, msg.document, 'voice', accountId, msg.id);
          content = await this.getMediaUrl(msg.document, 'voice', accountId, msg.id, client);
        } else if (mimeType.startsWith('image/')) {
          messageType = 'photo';
          await this.safeDownload(client, msg.document, 'photo', accountId, msg.id);
          content = await this.getMediaUrl(msg.document, 'photo', accountId, msg.id, client);
        } else if (mimeType.startsWith('video/')) {
          messageType = 'video';
          await this.safeDownload(client, msg.document, 'video', accountId, msg.id);
          content = await this.getMediaUrl(msg.document, 'video', accountId, msg.id, client);
        } else if (isSticker) {
          messageType = 'sticker';
          await this.safeDownload(client, msg.document, 'sticker', accountId, msg.id);
          content = await this.getMediaUrl(msg.document, 'sticker', accountId, msg.id, client);
        } else {
          messageType = 'document';
          await this.safeDownload(client, msg.document, 'document', accountId, msg.id);
          content = await this.getMediaUrl(msg.document, 'document', accountId, msg.id, client);
        }
  
      // --- 🎧 VOICE (Direct voice type) ---
      } else if (msg.voice) {
        messageType = 'voice';
        await this.safeDownload(client, msg.voice, 'voice', accountId, msg.id);
        content = await this.getMediaUrl(msg.voice, 'voice', accountId, msg.id, client);
  
      // --- 📇 CONTACT ---
      } else if (msg.contact) {
        messageType = 'contact';
        content = '📇 Contact';
  
      // --- ⚙️ ACTION / SYSTEM MESSAGES ---
      } else if (msg.action) {
        messageType = 'system';
        const action = msg.action.className || msg.action;
        const groupName = msg.chat?.title || msg.chat?.name || ''; // group name
        //const actorName = msg.from?.firstName || msg.from?.username || 'Someone'; // who triggered it
      
        switch (action) {
          case 'MessageActionChatAddUser': {
            const addedIds = msg.action.users || [];
            const addedNames = await Promise.all(
              addedIds.map((id: any) => this.getTelegramContactName(client, id.toString()))
            );
            content = `${actorName} added ${addedNames.join(", ")}`;
            break;
          }
      
          case 'MessageActionChatDeleteUser': {
            const removedId = msg.action.userId?.toString();
            const removedName = await this.getTelegramContactName(client, removedId);
            content = `${actorName} removed ${removedName}`;
            break;
          }
      
          case 'MessageActionChatEditTitle': {
            const newTitle = msg.action.title || groupName;
            content = `📝 ${actorName} renamed the group to "${newTitle}"`;
            break;
          }
      
          case 'MessageActionChatJoinedByLink': {
            content = `🔗 ${actorName} joined "${groupName}" via invite link`;
            break;
          }
      
          default: {
            content = `⚙️ ${actorName} performed ${action} in "${groupName}"`;
            break;
          }
        }
      }
  
      // Fallback if somehow empty
      if (!content || typeof content !== 'string') {
        content = '🕓 New message';
      }
  
      return { messageType, content };
  
    } catch (err) {
      console.error('❌ detectMessageTypeAndContent failed:', err);
      return { messageType: 'unknown', content: '🕓 New message' };
    }
  }

  private async safeDownload(client: any, media: any, type: string, accountId: string, msgId: string) {
    if (!client || !media) return;
    try {
      const buffer = await client.downloadMedia(media);
      if (buffer?.length > 0) {
        await this.saveMediaToServer(buffer, type, accountId, msgId, media);
      }
    } catch (err) {
      console.warn(`⚠️ Failed to download ${type} (${msgId}):`, err);
    }
  }
  
  /**
   * 获取媒体文件路径
   */
  private getMediaFilePath(accountId: string, type: string, messageId: string): string {
    const acc = String(accountId).replace(/^tg-/, '');
    const fileExtension = this.getFileExtension(type);
    const fileName = `${messageId}.${fileExtension}`;
    return path.join(SERVER_ROOT, 'public', 'media', 'tg', acc, type, fileName);
  }

  /**
   * 获取媒体文件的完整路径（包括扩展名）
   */
  private getMediaFilePathWithExtension(accountId: string, type: string, messageId: string, media?: any): string {
    if (type === 'sticker' && media) {
      // 对于贴纸，需要根据实际类型决定扩展名
      const mimeType = media.mimeType || '';
      const attributes = media.attributes || [];
      const stickerAttribute = attributes.find((attr: any) => attr.className === 'DocumentAttributeSticker');

      const isAnimatedSticker = mimeType === 'application/x-tgsticker' ||
                               (mimeType === '' && media.fileName?.endsWith('.tgs')) ||
                               (stickerAttribute && stickerAttribute.animated === true);

      const extension = isAnimatedSticker ? 'tgs' : 'webp';
      const acc = String(accountId).replace(/^tg-/, '');
      return path.join(SERVER_ROOT, 'public', 'media', 'tg', acc, type, `${messageId}.${extension}`);
    }

    if (type === 'document' && media) {
      // 对于文档类型，根据 MIME 类型确定扩展名
      const mimeType = media.mimeType || '';
      const fileExtension = this.getExtensionFromMimeType(mimeType);
      const acc = String(accountId).replace(/^tg-/, '');
      return path.join(SERVER_ROOT, 'public', 'media', 'tg', acc, type, `${messageId}.${fileExtension}`);
    }
    // 照片/视频：按 mimetype 推断扩展名
    if ((type === 'photo' || type === 'video') && media) {
      const mimeType = media.mimeType || '';
      const fileExtension = this.getExtensionFromMimeType(mimeType) || this.getFileExtension(type);
      const acc = String(accountId).replace(/^tg-/, '');
      return path.join(SERVER_ROOT, 'public', 'media', 'tg', acc, type, `${messageId}.${fileExtension}`);
    }

    return this.getMediaFilePath(accountId, type, messageId);
  }

  /**
   * 查找已存在的文档文件（检查多种可能的扩展名）
   */
  private findExistingDocumentFile(accountId: string, messageId: string, media?: any): string | null {
    const acc = String(accountId).replace(/^tg-/, '');
    const mediaDir = path.join(SERVER_ROOT, 'public', 'media', 'tg', acc, 'document');
    
    if (!fs.existsSync(mediaDir)) {
      return null;
    }

    // 优先检查根据 MIME 类型确定的扩展名
    if (media) {
      const mimeType = media.mimeType || '';
      const expectedExtension = this.getExtensionFromMimeType(mimeType);
      const expectedPath = path.join(mediaDir, `${messageId}.${expectedExtension}`);
      if (fs.existsSync(expectedPath)) {
        return expectedPath;
      }
    }

    // 如果没找到，检查所有可能的扩展名
    const possibleExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.avi', '.mov', '.mp3', '.ogg', '.wav', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.zip', '.rar', '.bin'];
    
    for (const ext of possibleExtensions) {
      const testPath = path.join(mediaDir, `${messageId}${ext}`);
      if (fs.existsSync(testPath)) {
        console.log(`📁 [媒体] 找到已存在的文档文件: ${testPath} (扩展名: ${ext})`);
        return testPath;
      }
    }

    return null;
  }

  /**
   * 获取文件扩展名
   */
  private getFileExtension(type: string): string {
    switch (type) {
      case 'photo': return 'jpg';
      case 'video': return 'mp4';
      // 对于文档，默认不使用固定扩展，避免与实际文件不一致
      case 'document': return 'bin';
      case 'sticker': return 'tgs'; // 默认使用TGS格式，实际保存时会根据动画标志决定
      case 'voice': return 'ogg';
      default: return 'bin';
    }
  }

  /**
   * 获取文档文件名
   */
  private getDocumentFileName(document: any): string {
    try {
      // 尝试从 attributes 中获取文件名
      const attributes = document?.attributes || [];
      const fileNameAttr = attributes.find((attr: any) => 
        attr.className === 'DocumentAttributeFilename'
      );
      
      if (fileNameAttr && fileNameAttr.fileName) {
        return fileNameAttr.fileName;
      }
      
      // 如果没有文件名属性，根据 MIME 类型生成默认名称
      const mimeType = document?.mimeType || '';
      const fileSize = document?.size || 0;
      const sizeStr = this.formatFileSize(fileSize);
      
      if (mimeType.startsWith('image/')) {
        return `图片文件.${this.getExtensionFromMimeType(mimeType)} (${sizeStr})`;
      } else if (mimeType.startsWith('video/')) {
        return `视频文件.${this.getExtensionFromMimeType(mimeType)} (${sizeStr})`;
      } else if (mimeType.startsWith('audio/')) {
        return `音频文件.${this.getExtensionFromMimeType(mimeType)} (${sizeStr})`;
      } else if (mimeType.includes('pdf')) {
        return `PDF文档.pdf (${sizeStr})`;
      } else if (mimeType.includes('word') || mimeType.includes('document')) {
        return `Word文档.docx (${sizeStr})`;
      } else if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) {
        return `Excel表格.xlsx (${sizeStr})`;
      } else if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) {
        return `PowerPoint演示文稿.pptx (${sizeStr})`;
      } else {
        return `文档文件.${this.getExtensionFromMimeType(mimeType)} (${sizeStr})`;
      }
    } catch (error) {
      console.error('获取文档文件名失败:', error);
      return '未知文档';
    }
  }

  /**
   * 格式化文件大小 
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * 检查是否为贴纸消息（包括动画贴纸）
   */
  private isStickerMessage(document: any, mimeType: string, attributes: any[]): boolean {
    if (!document) return false;

    // 检查是否是动画贴纸（TGS格式）
    if (mimeType === 'application/x-tgsticker') return true;

    // 检查文档属性中是否有贴纸属性
    const stickerAttributes = attributes || [];
    return stickerAttributes.some((attr: any) => attr.className === 'DocumentAttributeSticker');
  }

  /**
   * 获取贴纸文件的正确扩展名
   */
  private getStickerFileExtension(document: any): string {
    if (!document) return 'webp';

    const mimeType = document.mimeType || '';
    const stickerAttributes = document.attributes || [];
    const stickerAttribute = stickerAttributes.find((attr: any) => attr.className === 'DocumentAttributeSticker');

    // 检查是否为动画贴纸
    const isAnimated = mimeType === 'application/x-tgsticker' ||
                      (mimeType === '' && document.fileName?.endsWith('.tgs')) ||
                      (stickerAttribute && stickerAttribute.animated === true);

    return isAnimated ? 'tgs' : 'webp';
  }

  /**
   * 从 MIME 类型获取文件扩展名
   */
  private getExtensionFromMimeType(mimeType: string): string {
    const mimeToExt: { [key: string]: string } = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'video/mp4': 'mp4',
      'video/avi': 'avi',
      'video/mov': 'mov',
      'audio/mpeg': 'mp3',
      'audio/ogg': 'ogg',
      'audio/wav': 'wav',
      'application/pdf': 'pdf',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.ms-excel': 'xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'application/vnd.ms-powerpoint': 'ppt',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
      'text/plain': 'txt',
      'application/zip': 'zip',
      'application/x-rar-compressed': 'rar',
      'application/x-tgsticker': 'tgs'
    };

    return mimeToExt[mimeType] || 'bin';
  }

  /**
   * 转换音频文件为 OGG/Opus 格式
   */
  private async convertToOGG(inputBuffer: Buffer, inputMimeType: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      // 创建临时文件
      const tempDir = path.join(process.cwd(), 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const inputFile = path.join(tempDir, `input_${Date.now()}.${inputMimeType.includes('webm') ? 'webm' : 'ogg'}`);
      const outputFile = path.join(tempDir, `output_${Date.now()}.ogg`);
      
      try {
        // 写入输入文件
        fs.writeFileSync(inputFile, inputBuffer);
        
        console.log(`🔄 [FFmpeg] 开始转换: ${inputMimeType} → OGG/Opus`);
        
        // 使用 ffmpeg 转换 - 优化参数以确保浏览器兼容性
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
              const outputBuffer = fs.readFileSync(outputFile);
              console.log(`✅ [FFmpeg] 转换完成: ${outputBuffer.length} bytes`);
              
              // 清理临时文件
              fs.unlinkSync(inputFile);
              fs.unlinkSync(outputFile);
              
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
              if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
            } catch (cleanupError) {
              console.warn(`⚠️ [FFmpeg] 清理临时文件失败:`, cleanupError);
            }
            
            reject(error);
          })
          .save(outputFile);
          
      } catch (error) {
        console.error(`❌ [FFmpeg] 写入输入文件失败:`, error);
        reject(error);
      }
    });
  }
  // 简化：不再需要任何 FFmpeg 路径发现逻辑，完全依赖 ffmpeg-static 的全局设置

  /**
   * 异步下载媒体文件
   */
  private async downloadMediaAsync(media: any, type: string, accountId: string, messageId: string, client: any): Promise<void> {
    try {
      console.log(`📥 [媒体] 开始下载: ${type}/${messageId}`);
      
      // 使用 GramJS 下载媒体
      const buffer = await client.downloadMedia(media, {
        progressCallback: (downloaded: number, total: number) => {
          const progress = Math.round((downloaded / total) * 100);
          console.log(`📥 [媒体] 下载进度: ${progress}% (${downloaded}/${total})`);
        }
      });

      if (buffer && buffer.length > 0) {
        await this.saveMediaToServer(buffer, type, accountId, messageId, media);
        console.log(`✅ [媒体] 下载完成: ${type}/${messageId}`);
      } else {
        console.log(`⚠️ [媒体] 下载失败，无数据: ${type}/${messageId}`);
      }
    } catch (error) {
      console.error(`❌ [媒体] 下载失败: ${type}/${messageId}`, error);
    }
  }

  /**
   * 保存媒体文件到服务器
   */
  private async saveMediaToServer(buffer: Buffer, type: string, accountId: string, messageId: string, media?: any): Promise<string> {
    try {
      let filePath = '';

      if (type === 'document' && media) {
        // 检查是否是动画贴纸（TGS格式）
        const mimeTypeRaw = (media as any).mimetype || (media as any).mimeType || '';
        const mimeType = typeof mimeTypeRaw === 'string' ? mimeTypeRaw : '';
        const stickerAttributes = media.attributes || [];
        const stickerAttribute = stickerAttributes.find((attr: any) => attr.className === 'DocumentAttributeSticker');

        const isAnimatedSticker = mimeType === 'application/x-tgsticker' ||
                                 (mimeType === '' && media.fileName?.endsWith('.tgs')) ||
                                 (stickerAttribute && stickerAttribute.animated === true);

        if (isAnimatedSticker) {
          // 动画贴纸保存为TGS格式
          const acc = String(accountId).replace(/^tg-/, '');
          filePath = path.join(SERVER_ROOT, 'public', 'media', 'tg', acc, 'sticker', `${messageId}.tgs`);
          console.log(`🎭 [动画贴纸保存] 保存为TGS格式: ${filePath}`);
        } else if (stickerAttribute) {
          // 静态贴纸保存为WebP格式
          const acc2 = String(accountId).replace(/^tg-/, '');
          filePath = path.join(SERVER_ROOT, 'public', 'media', 'tg', acc2, 'sticker', `${messageId}.webp`);
          console.log(`🎭 [静态贴纸保存] 保存为WebP格式: ${filePath}`);
        } else {
          // 普通文档类型，根据 MIME 或文件名后缀保存
          let fileExtension = this.getExtensionFromMimeType(mimeType);
          if (!fileExtension || fileExtension === 'bin') {
            const fname = (media as any).fileName || (media as any).originalname || '';
            const m = typeof fname === 'string' ? fname.match(/\.([a-zA-Z0-9]+)$/) : null;
            if (m) fileExtension = m[1].toLowerCase();
          }
          if (!fileExtension) fileExtension = 'pdf';
          const acc3 = String(accountId).replace(/^tg-/, '');
          filePath = path.join(SERVER_ROOT, 'public', 'media', 'tg', acc3, type, `${messageId}.${fileExtension}`);
        }
      } else {
        // 照片/视频按 mimetype 落盘；其余类型走默认
        if ((type === 'photo' || type === 'video') && media) {
          const mimeTypeRaw = (media as any).mimetype || (media as any).mimeType || '';
          const mimeType = typeof mimeTypeRaw === 'string' ? mimeTypeRaw : '';
          let fileExtension = this.getExtensionFromMimeType(mimeType) || this.getFileExtension(type);
          if (!fileExtension || fileExtension === 'bin') {
            const fname = (media as any).fileName || (media as any).originalname || '';
            const m = typeof fname === 'string' ? fname.match(/\.([a-zA-Z0-9]+)$/) : null;
            if (m) fileExtension = m[1].toLowerCase();
          }
          const acc = String(accountId).replace(/^tg-/, '');
          filePath = path.join(SERVER_ROOT, 'public', 'media', 'tg', acc, type, `${messageId}.${fileExtension}`);
        } else {
          filePath = this.getMediaFilePath(accountId, type, messageId);
        }
      }

      const dir = path.dirname(filePath);

      // 确保目录存在
      fs.mkdirSync(dir, { recursive: true });

      // 保存文件
      fs.writeFileSync(filePath, buffer);

      // 更新缓存
      const cacheKey = `${accountId}/${type}/${messageId}`;
      this.mediaFileCache.set(cacheKey, filePath);

      console.log(`💾 [媒体] 文件已保存: ${filePath}`);
      return filePath;
    } catch (error) {
      console.error(`❌ [媒体] 保存失败: ${type}/${messageId}`, error);
      throw error;
    }
  }

  /**
   * 发送消息到指定聊天
   */
  async sendMessage(chatId: string, content: string, messageType?: string, file?: any): Promise<boolean> {
    try {
      console.log(`📤 [Telegram Provider] 发送消息到: ${chatId}`);
      console.log(`📤 [Telegram Provider] 消息内容: ${content}`);
      console.log(`📤 [Telegram Provider] 消息类型: ${messageType}`);
      console.log(`📤 [Telegram Provider] 文件数据:`, file ? '有文件' : '无文件');

      const { accountId, originalChatId } = this.parseChatId(chatId);
      const client = await this.getClient(accountId);

      if (!client) {
        throw new Error(`Telegram 客户端未找到: ${accountId}`);
      }

      // 验证连接状态
      const me = await client.getMe();
      if (!me) {
        throw new Error(`Telegram 客户端未连接: ${accountId}`);
      }

      // 解析聊天ID获取实体（带回退）
      console.log(`🔍 [Telegram Provider] 解析聊天实体: ${originalChatId}`);
      let entity;
      try {
        entity = await client.getEntity(originalChatId);
      } catch (error: any) {
        console.warn(`⚠️ [Telegram Provider] getEntity 直接解析失败，尝试通过对话列表匹配: ${originalChatId}`);
        try {
          const dialogs = await client.getDialogs({ limit: 200 });
          const targetIdStr = String(originalChatId);
          const found = dialogs?.find((d: any) => {
            try {
              const idVal = (d?.entity?.id?.toString?.() || d?.id?.toString?.() || '');
              return idVal === targetIdStr;
            } catch { return false; }
          });
          if (found?.entity) {
            entity = found.entity;
            console.log(`✅ [Telegram Provider] 通过对话列表匹配到实体:`, {
              id: found.entity.id,
              type: found.entity.constructor?.name,
              title: (found.entity as any).title || (found.entity as any).firstName || 'Unknown'
            });
          }
        } catch (fallbackErr: any) {
          console.warn(`⚠️ [Telegram Provider] 通过对话列表匹配实体失败: ${fallbackErr?.message || fallbackErr}`);
        }
      }
      if (!entity) {
        console.error(`❌ [Telegram Provider] 聊天实体未找到: ${originalChatId}`);
        throw new Error(`无法获取聊天实体: ${originalChatId}`);
      }
      console.log(`✅ [Telegram Provider] 聊天实体解析成功:`, {
        id: entity.id,
        type: entity.constructor.name,
        title: (entity as any).title || (entity as any).firstName || 'Unknown'
      });

      // 根据消息类型发送不同内容
      if (messageType === 'text' || !messageType) {
        // 发送文本消息
        await client.sendMessage(entity, {
          message: content,
          parseMode: 'md' // 支持 Markdown 格式
        });
        console.log(`✅ [Telegram Provider] 文本消息发送成功: ${chatId}`);
        return true;

      } else if (file && file.file) {
        // 处理文件消息（图片、视频、文档、音频、语音）
        const fileBuffer = file.file.buffer;
        const fileName = file.fileName || file.file.originalname;
        const mimeType = file.file.mimetype;
        
        console.log(`📤 [Telegram Provider] 发送文件: ${fileName} (${mimeType})`);
        console.log(`📤 [Telegram Provider] 文件大小: ${fileBuffer ? fileBuffer.length : 'undefined'} bytes`);
        console.log(`📤 [Telegram Provider] 文件元数据:`, {
          fileName: fileName,
          mimeType: mimeType,
          bufferExists: !!fileBuffer,
          bufferLength: fileBuffer ? fileBuffer.length : 0,
          originalName: file.file.originalname,
          fieldName: file.file.fieldname,
          encoding: file.file.encoding,
          size: file.file.size
        });
        
        // 验证文件 Buffer 存在
        if (!fileBuffer || fileBuffer.length === 0) {
          console.error(`❌ [Telegram Provider] 文件 Buffer 为空:`, {
            bufferExists: !!fileBuffer,
            bufferLength: fileBuffer ? fileBuffer.length : 0,
            fileData: file
          });
          throw new Error("文件内容为空或无效");
        }
        
        // 验证文件名和 MIME 类型
        if (!fileName || !mimeType) {
          console.error(`❌ [Telegram Provider] 文件元数据缺失:`, {
            fileName: fileName,
            mimeType: mimeType,
            fileData: file
          });
          throw new Error("文件名或 MIME 类型缺失");
        }
        
        // 根据文件类型设置不同的发送选项
        let sendOptions: any = {
          caption: content
        };
        
        // 根据MIME类型设置文件类型
        console.log(`🔍 [Telegram Provider] 文件类型检测:`, {
          mimeType,
          messageType,
          fileName: file.fileName || file.file.originalname
        });
        
        if (mimeType.startsWith('image/')) {
          // 图片消息
          const customFile = new CustomFile(
            fileName,
            fileBuffer.length,
            '',
            fileBuffer
          );
          sendOptions.file = customFile;
          sendOptions.forceDocument = false;
          sendOptions.mimeType = mimeType;
          console.log(`📷 [Telegram Provider] 设置为图片消息 (CustomFile, mimeType: ${mimeType})`);
        } else if (mimeType.startsWith('video/')) {
          // 视频消息
          const customFile = new CustomFile(
            fileName,
            fileBuffer.length,
            '',
            fileBuffer
          );
          sendOptions.file = customFile;
          sendOptions.forceDocument = false;
          sendOptions.supportsStreaming = true;
          sendOptions.mimeType = mimeType;
          console.log(`🎥 [Telegram Provider] 设置为视频消息 (CustomFile, mimeType: ${mimeType})`);
        } else if (mimeType.startsWith('audio/')) {
          // 音频消息 - 检查是否为语音消息
          if (messageType === 'voice') {
            // 语音消息 - 使用 ffmpeg 转换为 OGG/Opus 格式
            let finalBuffer = fileBuffer;
            let finalFileName = fileName;
            
            if (mimeType === 'audio/ogg' || mimeType === 'audio/ogg; codecs=opus') {
              // 已经是 OGG + Opus 格式，直接使用
              console.log(`🎤 [Telegram Provider] 使用原始 OGG 格式`);
            } else {
              // 非 OGG 格式，使用 ffmpeg 转换为 OGG/Opus
              try {
                console.log(`🔄 [Telegram Provider] 转换音频格式: ${mimeType} → OGG/Opus`);
                finalBuffer = await this.convertToOGG(fileBuffer, mimeType);
                finalFileName = fileName.replace(/\.[^.]+$/, '.ogg'); // 更改扩展名为 .ogg
                console.log(`✅ [Telegram Provider] 转换完成: ${finalBuffer.length} bytes`);
              } catch (convertError: any) {
                console.error(`❌ [Telegram Provider] 音频转换失败:`, convertError);
                throw new Error(`音频转换失败: ${convertError.message}`);
              }
            }
            
            // 创建 CustomFile 对象
            const customFile = new CustomFile(
              finalFileName,
              finalBuffer.length,
              '', // 路径留空，使用 buffer
              finalBuffer // 实际的文件内容
            );
            
            // 设置语音消息选项 - 使用正确的 GramJS 格式
            sendOptions.file = customFile;
            sendOptions.voiceNote = true;
            sendOptions.forceDocument = false;
            sendOptions.mimeType = 'audio/ogg'; // 明确指定 MIME 类型
            // 使用正确的 Api.DocumentAttributeAudio 格式
            sendOptions.attributes = [
              new Api.DocumentAttributeAudio({
                voice: true,
                duration: 0, // 可以设置为实际时长
                waveform: undefined
              })
            ];
            console.log(`🎤 [Telegram Provider] 设置为语音消息 (CustomFile, voiceNote: true, mimeType: audio/ogg, attributes: voice=true)`);
          } else {
            // 普通音频文件
            const customFile = new CustomFile(
              fileName,
              fileBuffer.length,
              '',
              fileBuffer
            );
            sendOptions.file = customFile;
            sendOptions.forceDocument = false;
            sendOptions.mimeType = mimeType;
            console.log(`🎵 [Telegram Provider] 设置为普通音频文件 (CustomFile, mimeType: ${mimeType})`);
          }
        } else {
          // 文档消息
          const customFile = new CustomFile(
            fileName,
            fileBuffer.length,
            '',
            fileBuffer
          );
          sendOptions.file = customFile;
          sendOptions.forceDocument = true;
          sendOptions.mimeType = mimeType;
          console.log(`📄 [Telegram Provider] 设置为文档消息 (CustomFile, mimeType: ${mimeType})`);
        }
        
        // 发送前的最终调试信息
        console.log(`🚀 [Telegram Provider] 准备发送文件:`, {
          entityId: entity.id,
          entityType: entity.constructor.name,
          fileName: sendOptions.file?.name || 'Unknown',
          fileSize: sendOptions.file?.size || 0,
          mimeType: sendOptions.mimeType,
          voiceNote: sendOptions.voiceNote,
          forceDocument: sendOptions.forceDocument,
          attributesCount: sendOptions.attributes?.length || 0,
          caption: sendOptions.caption?.substring(0, 50) || 'No caption'
        });
        
        const sentMessage = await client.sendFile(entity, sendOptions);
        console.log(`✅ [Telegram Provider] 文件消息发送成功: ${chatId} (${messageType})`);
        
        // 保存已发送媒体到服务器，使用 Telegram 的原始消息ID，保证刷新后可加载
        if (file?.file?.buffer) {
          const [platform, accountId] = chatId.split(':');
          const telegramMessageId = sentMessage.id?.toString();
          const bufferToSave: Buffer = file.file.buffer;
          if (telegramMessageId) {
            try {
              if (messageType === 'voice') {
                const savedPath = await this.saveMediaToServer(bufferToSave, 'voice', accountId, telegramMessageId, file?.file);
                console.log(`🎤 [语音消息] 文件已保存到服务器: ${savedPath} (Telegram ID: ${telegramMessageId})`);
              } else if (messageType === 'photo') {
                const savedPath = await this.saveMediaToServer(bufferToSave, 'photo', accountId, telegramMessageId, file?.file);
                console.log(`🖼️ [图片消息] 文件已保存到服务器: ${savedPath} (Telegram ID: ${telegramMessageId})`);
              } else if (messageType === 'video') {
                const savedPath = await this.saveMediaToServer(bufferToSave, 'video', accountId, telegramMessageId, file?.file);
                console.log(`🎬 [视频消息] 文件已保存到服务器: ${savedPath} (Telegram ID: ${telegramMessageId})`);
              } else if (messageType === 'document') {
                const savedPath = await this.saveMediaToServer(bufferToSave, 'document', accountId, telegramMessageId, file?.file);
                console.log(`📎 [文档消息] 文件已保存到服务器: ${savedPath} (Telegram ID: ${telegramMessageId})`);
              }
              // 回传 messageId 供路由使用
              (file as any).messageId = telegramMessageId;
            } catch (saveErr) {
              console.error(`❌ [媒体保存] 保存失败:`, saveErr);
            }
          }
        }
        
        // 历史兼容：语音的专用路径（已包含在上面通用保存逻辑中）
        if (messageType === 'voice' && file?.file?.buffer) {
          try {
            // 使用Telegram的原始消息ID，确保与加载历史消息时一致
            const telegramMessageId = sentMessage.id?.toString();
            if (telegramMessageId) {
              // 将messageId存储到file对象中，供chats.ts使用
              if (file) {
                file.messageId = telegramMessageId;
              }
            } else {
              console.warn(`⚠️ [语音消息] 无法获取Telegram消息ID，使用时间戳作为fallback`);
              const messageId = `voice-${Date.now()}`;
              const savedPath = await this.saveMediaToServer(
                file.file.buffer, 
                'voice', 
                accountId, 
                messageId
              );
              console.log(`🎤 [语音消息] 文件已保存到服务器: ${savedPath} (Fallback ID: ${messageId})`);
              
              if (file) {
                file.messageId = messageId;
              }
            }
          } catch (saveError) {
            console.error(`❌ [语音消息] 保存文件失败:`, saveError);
            // 不抛出错误，因为消息已经发送成功
          }
        }
        
        return true;

      } else {
        // 发送普通文本消息
        await client.sendMessage(entity, {
          message: content,
          parseMode: 'md'
        });
        console.log(`✅ [Telegram Provider] 消息发送成功: ${chatId}`);
        return true;
      }

    } catch (error: any) {
      console.error(`❌ [Telegram Provider] 发送消息失败: ${chatId}`, error);
      
      // 解析聊天ID获取原始聊天ID
      let originalChatId = 'unknown';
      try {
        const parsed = this.parseChatId(chatId);
        originalChatId = parsed.originalChatId;
      } catch (e) {
        // 如果解析失败，使用整个chatId
        originalChatId = chatId;
      }
      
      // 处理特定的 Telegram 错误
      if (error?.message) {
        if (error.message.includes('INPUT_USER_DEACTIVATED')) {
          console.error(`❌ [Telegram] 目标用户账户已被停用: ${originalChatId}`);
        } else if (error.message.includes('USER_DEACTIVATED')) {
          console.error(`❌ [Telegram] 用户账户已被停用: ${originalChatId}`);
        } else if (error.message.includes('CHAT_WRITE_FORBIDDEN')) {
          console.error(`❌ [Telegram] 没有权限向此聊天发送消息: ${originalChatId}`);
        } else if (error.message.includes('PEER_ID_INVALID')) {
          console.error(`❌ [Telegram] 无效的聊天ID: ${originalChatId}`);
        } else if (error.message.includes('CHAT_NOT_FOUND')) {
          console.error(`❌ [Telegram] 聊天不存在: ${originalChatId}`);
        } else {
          console.error(`❌ [Telegram] 其他错误: ${error.message}`);
        }
      }
      
      return false;
    }
  }
}

