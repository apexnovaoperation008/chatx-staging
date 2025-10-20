/**
 * 消息转换器服务
 * 将WhatsApp和Telegram的消息转换为统一的WebSocket消息格式
 */

import { UnifiedMessage, ProviderMessage } from '../types/unified-message.types';

export class MessageConverter {
  /**
   * 转换WhatsApp消息为统一格式
   */
  static convertWhatsAppMessage(payload: ProviderMessage): UnifiedMessage {
    return {
      platform: 'whatsapp',
      accountId: payload.accountId,
      message: {
        id: `wa:${payload.accountId}:${payload.message.id}`,
        chatId: `wa:${payload.accountId}:${payload.chatInfo.id}`,
        sender: payload.message.sender,
        content: payload.message.content,
        timestamp: payload.message.timestamp,
        isOwn: payload.message.isOwn,
        messageType: payload.message.messageType,
        status: payload.message.status,
        fileName: payload.message.fileName,
        geo: payload.message.geo
      },
      chatInfo: {
        ...payload.chatInfo,
        platform: 'whatsapp'
      }
    };
  }

  /**
   * 转换Telegram消息为统一格式
   */
  static convertTelegramMessage(payload: ProviderMessage): UnifiedMessage {
    return {
      platform: 'telegram',
      accountId: payload.accountId,
      message: {
        id: `tg:${payload.accountId}:${payload.message.id}`,
        chatId: payload.chatInfo.id, // 直接使用已经构建好的chatId
        sender: payload.message.sender,
        content: payload.message.content,
        timestamp: payload.message.timestamp,
        isOwn: payload.message.isOwn,
        messageType: payload.message.messageType,
        status: payload.message.status,
        fileName: payload.message.fileName,
        geo: payload.message.geo
      },
      chatInfo: {
        ...payload.chatInfo,
        platform: 'telegram'
      }
    };
  }

  /**
   * 根据平台自动转换消息
   */
  static convertMessage(platform: 'whatsapp' | 'telegram', payload: ProviderMessage): UnifiedMessage {
    switch (platform) {
      case 'whatsapp':
        return this.convertWhatsAppMessage(payload);
      case 'telegram':
        return this.convertTelegramMessage(payload);
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }
}


