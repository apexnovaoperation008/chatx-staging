/**
 * WebSocket 服务 - 管理实时消息推送
 */

import { Server as SocketIOServer } from 'socket.io';
import { UnifiedMessage } from '../types/unified-message.types';
import { MessageTypes } from '@open-wa/wa-automate';

export interface WebSocketMessage {
  message: {
    id: string;
    chatId: string;
    sender: string;
    content: string;
    timestamp: number;
    isOwn: boolean;
    messageType: 'text' | 'image' | 'video' | 'audio' | 'file' | 'sticker' | 'location' | 'voice' |'system';
    status: 'sent' | 'delivered' | 'read';
    geo?: {
      lat: number;
      long: number;
    };
  };
  chatInfo: {
    id: string;
    platform: string;
    accountId: string;
    groupId?: string;
    name: string;
    avatar?: string;
    type: string;
    username?: string;
    memberCount?: number;
    lastMessage: string;
    lastMessageTime: number;
    lastMessageSender: string;
    unreadCount: number;
    status: string;
    createdAt: number;
    updatedAt: number;
  };
  accountId: string;
}

export interface MediaDownloadNotification {
  filePath: string;
  messageId: string;
  mediaType: 'image' | 'video' | 'audio' | 'sticker' | 'document';
  accountId: string;
}

class WebSocketService {
  private io: SocketIOServer | null = null;

  emit(event: string, data: any) {
    if (!this.io) {
      console.error('❌ Socket.IO not initialized in WebSocketService');
      return false;
    }

    try {
      this.io.emit(event, data);
      console.log(`📡 WebSocket event emitted: ${event}`, data);
      return true;
    } catch (error) {
      console.error(`❌ Failed to emit event ${event}:`, error);
      return false;
    }
  }

  /**
   * 设置Socket.IO实例
   */
  setSocketIO(io: SocketIOServer) {
    this.io = io;
    console.log('✅ WebSocket服务已初始化');
  }

  emitToChat(chatId: string, event: string, data: any) {
    if (!this.io) {
      console.error('❌ Socket.IO not initialized in WebSocketService');
      return false;
    }
  
    try {
      this.io.to(`chat:${chatId}`).emit(event, data);
      console.log(`📡 [Socket] → chat:${chatId} event: ${event}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to emit to chat ${chatId}:`, error);
      return false;
    }
  }
  

  /**
   * 广播新消息给所有连接的客户端
   */
  broadcastNewMessage(data: UnifiedMessage) {
    if (!this.io) {
      console.warn('⚠️ WebSocket服务未初始化，无法广播新消息');
      return;
    }

    try {
      console.log('📡 [WebSocket] 广播新消息:', {
        chatId: data.chatInfo.id,
        platform: data.chatInfo.platform,
        accountId: data.accountId,
        messageType: data.message.messageType,
        content: data.message.content.substring(0, 50) + '...'
      });

      this.io.emit('newMessage', data);
    } catch (error) {
      console.error('❌ [WebSocket] 广播新消息失败:', error);
    }
  }

  

  /**
   * 广播媒体下载完成通知
   */
  broadcastMediaDownloaded(data: MediaDownloadNotification) {
    if (!this.io) {
      console.warn('⚠️ WebSocket服务未初始化，无法广播媒体下载通知');
      return;
    }

    try {
      console.log('📡 [WebSocket] 广播媒体下载完成通知:', {
        filePath: data.filePath,
        messageId: data.messageId,
        mediaType: data.mediaType,
        accountId: data.accountId
      });

      this.io.emit('mediaDownloaded', data);
    } catch (error) {
      console.error('❌ [WebSocket] 广播媒体下载通知失败:', error);
    }
  }

  /**
   * 广播聊天列表更新
   */
  broadcastChatUpdate(chatInfo: WebSocketMessage['chatInfo']) {
    if (!this.io) {
      console.warn('⚠️ WebSocket服务未初始化，无法广播聊天更新');
      return;
    }

    try {
      console.log('📡 [WebSocket] 广播聊天更新:', {
        chatId: chatInfo.id,
        platform: chatInfo.platform,
        lastMessage: chatInfo.lastMessage.substring(0, 30) + '...'
      });

      this.io.emit('chatUpdated', chatInfo);
    } catch (error) {
      console.error('❌ [WebSocket] 广播聊天更新失败:', error);
    }
  }

  /**
   * 广播账号状态变化
   */
  broadcastAccountStatusChange(accountId: string, status: string) {
    if (!this.io) {
      console.warn('⚠️ WebSocket服务未初始化，无法广播账号状态变化');
      return;
    }

    try {
      console.log('📡 [WebSocket] 广播账号状态变化:', { accountId, status });
      this.io.emit('accountStatusChanged', { accountId, status });
    } catch (error) {
      console.error('❌ [WebSocket] 广播账号状态变化失败:', error);
    }
  }

  /**
   * 获取连接状态
   */
  getConnectionStatus() {
    if (!this.io) {
      return {
        isActive: false,
        connectedClients: 0
      };
    }

    return {
      isActive: true,
      connectedClients: this.io.sockets.sockets.size
    };
  }
}

// 创建单例实例
export const websocketService = new WebSocketService();
export default websocketService;
