/**
 * 聊天相关API客户端
 */

import { api } from './api';

export interface ChatMessage {
  id: string;
  chatId: string;
  sender: string;
  senderName?: string;
  content: string;
  timestamp: number;
  isOwn: boolean;
  messageType: 'text' | 'photo' | 'video' | 'document' | 'sticker' | 'voice' | 'location' | 'contact' | 'action' | 'buttons_response' | 'list_response' | 'order' | 'revoked' | 'contact_multi' | 'system'| 'unknown';
  status: 'sent' | 'delivered' | 'read' | 'failed';
  fileName?: string; // 文档文件名（仅用于document类型）
  geo?: {
    lat: number;
    long: number;
  }; // 地理位置信息（仅用于location类型）
  
  // 按钮响应消息
  buttonResponse?: {
    selectedButtonId: string;
    selectedButtonText: string;
  };
  
  // 列表响应消息
  listResponse?: {
    selectedListId: string;
    selectedOptionId: string;
    selectedOptionText: string;
  };
  
  // 订单消息
  orderData?: {
    orderId: string;
    orderStatus: string;
    orderTotal: number;
    currency: string;
  };
  
  // 联系人卡片（多个）
  contacts?: Array<{
    name: string;
    phone: string;
    email?: string;
  }>;
  
  // 撤回消息信息
  revokedInfo?: {
    originalMessageId: string;
    revokedBy: string;
    revokedAt: number;
  };
}

export interface ChatInfo {
  id: string;
  platform: 'whatsapp' | 'telegram';
  accountId: string;
  
  // 基本信息
  name: string;
  avatar?: string;
  
  // 聊天类型
  type: 'private' | 'group' | 'channel' | 'bot' | 'system' | 'topic';
  
  // WhatsApp特有
  phoneNumber?: string;
  isVerified?: boolean;
  
  // Telegram特有
  username?: string;
  chatType?: 'private' | 'group' | 'supergroup' | 'channel' | 'bot';
  topicId?: number;
  
  // 群组信息
  memberCount?: number;
  
  // 群组展开相关
  groupId?: string; // 群组唯一标识，用于关联不同平台的同一群组
  isGroupExpanded?: boolean; // 群组是否已展开
  subChats?: ChatInfo[]; // 子聊天记录（同一群组的不同账号）
  
  // 最后消息
  lastMessage?: string;
  lastMessageTime?: number;
  lastMessageSender?: string;
  
  // 置顶
  pinned?: boolean;
  
  // 状态
  unreadCount: number;
  status: 'online' | 'offline' | 'away' | 'typing';
  
  // 时间
  createdAt: number;
  updatedAt: number;
}

export interface ChatListResponse {
  chats: ChatInfo[];
  totalCount: number;
  hasMore: boolean;
}

export interface ChatMessagesResponse {
  messages: ChatMessage[];
  chatInfo: ChatInfo;
  hasMore: boolean;
}

/**
 * 聊天API客户端
 */
export const ChatApi = {
  /**
   * 获取所有聊天列表
   */
  async getAllChats(): Promise<ChatListResponse> {
    try {
      console.log('🌐 [ChatApi] 开始请求聊天列表...');
      const response = await api('/chats');
      console.log('🌐 [ChatApi] 收到响应:', response);
      console.log('🌐 [ChatApi] 响应数据类型:', typeof response);
      console.log('🌐 [ChatApi] 响应数据键:', Object.keys(response || {}));
      
      const result = response.data || { chats: [], totalCount: 0, hasMore: false };
      console.log('🌐 [ChatApi] 解析后的数据:', result);
      console.log('🌐 [ChatApi] 聊天数量:', result.chats?.length || 0);
      
      return result;
    } catch (error) {
      console.error('❌ [ChatApi] 获取聊天列表失败:', error);
      return { chats: [], totalCount: 0, hasMore: false };
    }
  },

  /**
   * 获取特定聊天的消息
   */
  async getChatMessages(chatId: string, limit: number = 10): Promise<ChatMessagesResponse> {
    try {
      console.log(`🌐 [API] 开始请求聊天消息: ${chatId}, 限制: ${limit}`);
      // 规范 chatId：兼容 wa-<accountId>-<jid> → wa:<accountId>:<jid>
      let normalized = chatId;
      if (!chatId.includes(':') && chatId.includes('-')) {
        const firstDash = chatId.indexOf('-');
        const lastDash = chatId.lastIndexOf('-');
        if (firstDash > 0 && lastDash > firstDash) {
          const platform = chatId.substring(0, firstDash); // wa / tg
          const accountId = chatId.substring(firstDash + 1, lastDash);
          const originalChatId = chatId.substring(lastDash + 1);
          if (platform === 'wa' || platform === 'tg') {
            normalized = `${platform}:${accountId}:${originalChatId}`;
            console.log(`🔄 [API] 规范聊天ID: ${chatId} -> ${normalized}`);
          }
        }
      }
      // 对 JID 内的 @ 进行编码，避免 404
      const parts = normalized.split(':');
      if (parts.length === 3) {
        parts[2] = encodeURIComponent(parts[2]);
        normalized = parts.join(':');
      }
      // 添加超时检测
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('API请求超时')), 10000); // 10秒超时
      });     
      const apiPromise = api(`/chats/${normalized}/messages?limit=${limit}`);
      const response = await Promise.race([apiPromise, timeoutPromise]);
      const result = response.data || { messages: [], chatInfo: {} as ChatInfo, hasMore: false };
      console.log('🌐 [API] 聊天消息返回条数:', Array.isArray(result.messages) ? result.messages.length : 0);
      return result;
    } catch (error) {
 
      return { messages: [], chatInfo: {} as ChatInfo, hasMore: false };
    }
  },

  /**
   * 发送消息
   */
  async sendMessage(
    chatId: string, 
    content: string, 
    messageType: string = 'text',
    file?: File,
    additionalData?: {
      fileName?: string,
      fileSize?: number,
      geo?: { lat: number, long: number }
    }
  ): Promise<{ success: boolean; fileUrl?: string; chatId?: string; messageType?: string; error?: string }> {
    try {
      // 如果有文件，使用 FormData 上传
      if (file) {
        console.log(`🔍 [ChatApi] 准备发送文件:`, {
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          content,
          messageType,
          fileConstructor: file.constructor.name,
          isFile: file instanceof File,
          lastModified: file.lastModified
        });
        
        const formData = new FormData();
        formData.append('content', content);
        formData.append('messageType', messageType);
        // 关键：附带原始文件名，便于后端拿到 req.file.originalname
        formData.append('file', file, (additionalData?.fileName || file.name));
        // 备份文件名字段
        formData.append('fileName', (additionalData?.fileName || file.name));
        
        // 已在上面无论是否提供都写入 fileName；这里无需重复
        if (additionalData?.fileSize) {
          formData.append('fileSize', additionalData.fileSize.toString());
        }
        if (additionalData?.geo) {
          formData.append('geo', JSON.stringify(additionalData.geo));
        }
        
        // 调试 FormData 内容
        console.log(`🔍 [ChatApi] FormData 内容:`, {
          hasContent: formData.has('content'),
          hasMessageType: formData.has('messageType'),
          hasFile: formData.has('file'),
          hasFileName: formData.has('fileName'),
          hasFileSize: formData.has('fileSize'),
          hasGeo: formData.has('geo')
        });

        const response = await api(`/chats/${chatId}/send`, {
          method: 'POST',
          headers: {
            // 不设置 Content-Type，让浏览器自动设置 multipart/form-data
          } as HeadersInit,
          body: formData
        });
        
        return response;
      } else {
        // 普通文本消息
        const response = await api(`/chats/${chatId}/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            content, 
            messageType,
            ...(additionalData?.geo && { geo: additionalData.geo })
          })
        });
        
        return response;
      }
    } catch (error) {
      console.error('发送消息失败:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : '发送消息失败' 
      };
    }
  }
};
