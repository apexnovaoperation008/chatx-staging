/**
 * WebSocket 调试路由
 */

import { Router } from "express";
import { websocketService } from "../services/websocket.service";
import { UnifiedMessage } from "../types/unified-message.types";

const r = Router();

// 获取 WebSocket 连接状态
r.get("/status", (req, res) => {
  try {
    const status = websocketService.getConnectionStatus();
    res.json({
      ok: true,
      websocket: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ 获取WebSocket状态失败:', error);
    res.status(500).json({
      ok: false,
      error: '获取WebSocket状态失败'
    });
  }
});

// 测试广播消息
r.post("/test-broadcast", (req, res) => {
  try {
    const { message, chatId = 'test-chat', accountId = 'test-account' } = req.body;
    
    if (!message) {
      return res.status(400).json({
        ok: false,
        error: '缺少消息内容'
      });
    }

    const testMessage: UnifiedMessage = {
      platform: 'telegram',
      accountId,
      message: {
        id: `test-${Date.now()}`,
        chatId,
        sender: 'Test User',
        content: message,
        timestamp: Date.now(),
        isOwn: false,
        messageType: 'text',
        status: 'delivered'
      },
      chatInfo: {
        id: chatId,
        platform: 'telegram',
        accountId,
        name: 'Test Chat',
        type: 'private',
        lastMessage: message,
        lastMessageTime: Date.now(),
        lastMessageSender: 'Test User',
        unreadCount: 1,
        status: 'online',
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    };

    websocketService.broadcastNewMessage(testMessage);
    
    res.json({
      ok: true,
      message: '测试消息已广播',
      data: testMessage
    });
  } catch (error) {
    console.error('❌ 测试广播失败:', error);
    res.status(500).json({
      ok: false,
      error: '测试广播失败'
    });
  }
});

export default r;
