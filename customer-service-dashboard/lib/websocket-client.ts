/**
 * WebSocket 客户端 - 处理实时消息推送
 */

import { io, Socket } from 'socket.io-client';

// 临时禁用 WebSocket 功能（需要启用时将其设为 false）
const DISABLE_WEBSOCKET = false;

export interface WebSocketMessage {
  message: {
    id: string;
    chatId: string;
    sender: string;
    content: string;
    timestamp: number;
    isOwn: boolean;
    messageType: 'text' | 'image' | 'video' | 'audio' | 'file' | 'sticker' | 'location';
    status: 'sent' | 'delivered' | 'read' | 'failed';
    geo?: {
      lat: number;
      long: number;
    };
  };
  chatInfo: {
    id: string;
    platform: string;
    accountId: string;
    groupId: string;
    name: string;
    avatar: string;
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

class WebSocketClient {
  private socket: Socket | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  constructor() {
    // 仅在浏览器环境建立连接，避免在SSR阶段（Node环境）尝试连接导致 ECONNREFUSED
    if (typeof window !== 'undefined') {
      if (!DISABLE_WEBSOCKET) {
        this.connect();
      } else {
        console.log('⚠️ WebSocket 已临时禁用（DISABLE_WEBSOCKET=true）');
        this.socket = null;
        this.isConnected = false;
      }
    } else {
      // 服务器端渲染环境下跳过，等到客户端再连接
      this.socket = null;
      this.isConnected = false;
    }
  }

  /**
   * 连接到 WebSocket 服务器
   */
  connect() {
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_BASE;
      console.log('🔌 连接到 WebSocket 服务器:', API_BASE);
      console.log('🔌 环境变量 NEXT_PUBLIC_API_BASE:', process.env.NEXT_PUBLIC_API_BASE);
      console.log('🔌 所有环境变量:', Object.keys(process.env).filter(key => key.startsWith('NEXT_PUBLIC_')));
      console.log('🔌 当前环境:', typeof window !== 'undefined' ? '浏览器' : '服务器');
      console.log('🔌 DISABLE_WEBSOCKET:', DISABLE_WEBSOCKET);
      
      if (!API_BASE) {
        console.error('❌ NEXT_PUBLIC_API_BASE 环境变量未设置');
        console.error('❌ 请检查 .env.local 文件是否存在且包含 NEXT_PUBLIC_API_BASE=', process.env.NEXT_PUBLIC_API_BASE);
        return;
      }
      
      this.socket = io(API_BASE, {
        // 允许协商并优先升级到 WebSocket，失败时回退到 polling
        transports: ['websocket', 'polling'],
        timeout: 20000,
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectDelay,
        reconnectionDelayMax: 5000,
        forceNew: true,
        autoConnect: true
      });
      if (typeof window !== 'undefined') {
        (window as any).socket = this.socket;
      }

      this.setupEventListeners();
    } catch (error) {
      console.error('❌ WebSocket 连接失败:', error);
    }
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('✅ WebSocket 已连接:', this.socket?.id);
      console.log('✅ 连接状态:', this.socket?.connected);
      console.log('✅ 传输方式:', this.socket?.io?.engine?.transport?.name);
      this.isConnected = true;
      this.reconnectAttempts = 0;
      // 触发状态变化事件
      this.triggerStatusChange();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ WebSocket 已断开:', reason);
      this.isConnected = false;
      // 触发状态变化事件
      this.triggerStatusChange();
    });

    this.socket.on('connect_error', (error: any) => {
      try {
        // 统一打印错误对象
        console.error('❌ WebSocket 连接错误:', error);

        // 兼容不同形态的错误对象（Socket.IO v4/浏览器/网络栈）
        const errorInfo = {
          type: (error && (error.type || error.name)) || 'Unknown',
          message: (error && (error.message || String(error))) || 'No message',
          description: error && (error.description || error.details || undefined),
          context: error && (error.context || undefined),
          reason: error && (error.reason || undefined)
        };
        console.error('❌ 详细错误信息:', errorInfo);

        this.isConnected = false;
        this.triggerStatusChange();

        // 如果是传输错误，尝试重新连接
        if (errorInfo.type === 'TransportError') {
          console.log('🔄 检测到传输错误，尝试重新连接...');
          setTimeout(() => {
            this.disconnect();
            this.connect();
          }, 2000);
        }
      } catch (_) {
        // 兜底：至少标记断开状态
        this.isConnected = false;
      }
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log('🔄 WebSocket 重连成功:', attemptNumber);
      this.isConnected = true;
      this.triggerStatusChange();
    });

    this.socket.on('reconnect_attempt', (attemptNumber) => {
      console.log('🔄 WebSocket 重连尝试:', attemptNumber);
      this.reconnectAttempts = attemptNumber;
    });

    this.socket.on('reconnect_failed', () => {
      console.error('❌ WebSocket 重连失败，尝试重新创建连接');
      this.isConnected = false;
      this.reconnectAttempts = 0; // 重置重连计数
      this.triggerStatusChange();
      // 延迟后重新创建连接
      setTimeout(() => {
        this.disconnect();
        this.connect();
      }, 5000);
    });

    this.socket.on('reconnect_error', (error) => {
      console.error('❌ WebSocket 重连错误:', error);
    });

    // 监听群组/聊天更新事件（如群组名称变更）
    this.socket.on('chatUpdated', (data) => {
      try {
        console.log('🔄 [WS:chatUpdated] 群组/聊天更新:', {
          chatId: data?.id,
          platform: data?.platform,
          accountId: data?.accountId,
          name: data?.name,
          type: data?.type,
          lastMessage: data?.lastMessage?.slice(0, 50)
        });
        // 向全局广播，供任意页面监听
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('chatx:chatUpdated', { detail: data }));
        }
      } catch (error) {
        console.error('❌ [WS:chatUpdated] 处理群组更新失败:', error);
      }
    });

    // 全局记录后端推送的新消息，便于调试
    this.socket.on('newMessage', (data) => {
      try {
        console.log('📨 [WS:newMessage] 原始数据:', data);
        const preview = (data?.message?.content || '').slice(0, 80);
        console.log('📨 [WS:newMessage] 解析后 - chatId:', data?.chatInfo?.id, 'account:', data?.accountId, 'content:', preview,);
        // 向全局广播，供任意页面监听
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('chatx:newMessage', { detail: data }));
        }
      } catch (error) {
        console.error('❌ [WS:newMessage] 处理消息失败:', error);
      }
    });

    // 监听媒体下载完成事件
    this.socket.on('mediaDownloaded', (data) => {
      try {
        console.log('📡 [WS:mediaDownloaded] 媒体下载完成:', {
          filePath: data?.filePath,
          messageId: data?.messageId,
          mediaType: data?.mediaType,
          accountId: data?.accountId
        });
        // 向全局广播，供任意页面监听
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('chatx:mediaDownloaded', { detail: data }));
        }
      } catch (error) {
        console.error('❌ [WS:mediaDownloaded] 处理媒体下载事件失败:', error);
      }
    });

    // 监听账号状态变化事件
    this.socket.on('accountStatusChanged', (data) => {
      try {
        console.log('📡 [WS:accountStatusChanged] 账号状态变化:', {
          accountId: data?.accountId,
          status: data?.status
        });
        // 向全局广播，供任意页面监听
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('chatx:accountStatusChanged', { detail: data }));
        }
      } catch (error) {
        console.error('❌ [WS:accountStatusChanged] 处理账号状态变化事件失败:', error);
      }
    });
  }

  /**
   * 监听新消息事件
   */
  onNewMessage(callback: (data: WebSocketMessage) => void) {
    if (this.socket) {
      this.socket.on('newMessage', callback);
    }
  }

  /**
   * 移除新消息事件监听器
   */
  offNewMessage(callback: (data: WebSocketMessage) => void) {
    if (this.socket) {
      this.socket.off('newMessage', callback);
    }
  }

  /**
   * 发送消息到服务器
   */
  emit(event: string, data: any) {
    if (this.socket && this.isConnected) {
      this.socket.emit(event, data);
    } else {
      console.warn('⚠️ WebSocket 未连接，无法发送消息');
    }
  }

  /**
   * 获取连接状态
   */
  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      socketId: this.socket?.id,
      socketConnected: this.socket?.connected,
      transportName: this.socket?.io?.engine?.transport?.name
    };
  }

  /**
   * 检查是否已连接
   */
  isConnectedStatus() {
    return this.isConnected;
  }

  /**
   * 手动检查连接状态
   */
  checkConnection() {
    console.log('🔍 WebSocket 连接状态检查:', this.getConnectionStatus());
    if (this.socket) {
      console.log('🔍 Socket 对象存在:', !!this.socket);
      console.log('🔍 Socket 连接状态:', this.socket.connected);
      console.log('🔍 Socket ID:', this.socket.id);
    } else {
      console.log('❌ Socket 对象不存在');
    }
  }

  /**
   * 触发状态变化事件
   */
  private triggerStatusChange() {
    if (typeof window !== 'undefined') {
      const status = this.getConnectionStatus();
      window.dispatchEvent(new CustomEvent('chatx:websocketStatusChange', { 
        detail: status 
      }));
    }
  }

  /**
   * 断开连接
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      // 触发状态变化事件
      this.triggerStatusChange();
    }
  }
}

// 创建单例实例
export const websocketClient = new WebSocketClient();

export default websocketClient;
