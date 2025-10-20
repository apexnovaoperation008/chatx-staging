/**
 * 统一的消息类型定义
 * 用于WhatsApp和Telegram的统一WebSocket消息格式
 */

export interface UnifiedMessage {
  platform: 'whatsapp' | 'telegram';
  accountId: string;
  message: {
    id: string;
    chatId: string;
    sender: string;
    content: string;
    timestamp: number;
    isOwn: boolean;
    messageType: 'text' | 'photo' | 'video' | 'document' | 'sticker' | 'voice' | 'location' | 'contact' | 'action' | 'buttons_response' | 'list_response' | 'order' | 'revoked' | 'contact_multi' | 'system' | 'service'| 'encrypted' |'unknown';
    status: 'sent' | 'delivered' | 'read';
    fileName?: string;
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
    type: 'private' | 'group' | 'channel' | 'bot' | 'system' | 'topic';
    username?: string;
    memberCount?: number;
    lastMessage?: string;
    lastMessageTime?: number;
    lastMessageSender?: string;
    unreadCount?: number;
    status?: string;
    createdAt?: number;
    updatedAt?: number;
  };
}

export interface ProviderMessage {
  message: {
    id: string;
    chatId: string;
    sender: string;
    content: string;
    timestamp: number;
    isOwn: boolean;
    messageType: 'text' | 'photo' | 'video' | 'document' | 'sticker' | 'voice' | 'location' | 'contact' | 'action' | 'buttons_response' | 'list_response' | 'order' | 'revoked' | 'contact_multi' | 'system' | 'unknown';
    status: 'sent' | 'delivered' | 'read';
    fileName?: string;
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
    type: 'private' | 'group' | 'channel' | 'bot' | 'system' | 'topic';
    username?: string;
    memberCount?: number;
    lastMessage?: string;
    lastMessageTime?: number;
    lastMessageSender?: string;
    unreadCount?: number;
    status?: string;
    createdAt?: number;
    updatedAt?: number;
  };
  accountId: string;
}

