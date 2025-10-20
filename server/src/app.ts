import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { config } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import waRoutes from './routes/wa';
import waSessionRoutes from './routes/wa-sessions';
import tgRoutes from './routes/tg';
import sessionsRoutes from './routes/sessions';
import accountManagementRoutes from './routes/account-management-temp';
import chatsRoutes from './routes/chats';
import waMessageMonitorRoutes from './routes/wa-message-monitor';
import waMessageOptimizerRoutes from './routes/wa-message-optimizer';
import waSessionMonitorRoutes from './routes/wa-session-monitor';
import debugClientsRoutes from './routes/debug-clients';
import websocketDebugRoutes from './routes/websocket-debug';
import { autoReconnectOnStartup } from './services/startup-reconnect.service';
import authRoutes from './routes/auth';
import planRoutes from './routes/plan';
import userRoutes from './routes/user';
import workspaceRoutes from './routes/workspace';
import { getHealthStatus, startHealthChecks} from './services/health.service'
import { v4 as uuidv4 } from "uuid"
import { initDb } from "./database/initDb.service"
import { seedSuperAdmin } from "./database/seed"
import cookieParser from "cookie-parser";
import { websocketService } from './services/websocket.service';
import { initializeNodePersistStorage } from './utils/node-persist-init';
import { Server } from "socket.io";
import uploadRoutes from './routes/upload';


const app = express();
app.use(cookieParser());

const server = createServer(app);

// const io = new SocketIOServer(server, {
//   cors: {
//     origin: config.CORS_ORIGIN,
//     methods: ['GET', 'POST'],
//     credentials: true
//   }
// });

const io = new Server(server, {
  cors: { origin: "*" }, // or specify your frontend URL
  path: "/socket.io"
});
app.set('io', io)
websocketService.setSocketIO(io)

// media.ts 文件已删除，WebSocket 功能已移除
// 监听 WebSocket 连接事件，便于调试连接情况
io.on('connection', (socket) => {
  try {
    console.log('✅ WebSocket client connected:', socket.id);
    console.log('🔗 传输方式:', (socket as any)?.conn?.transport?.name);
    socket.on("join", ({ chatId }) => {
      socket.join(`chat:${chatId}`);
      console.log(`👤 Client joined room chat:${chatId}`);
    });
    socket.on('disconnect', (reason) => {
      console.log('❌ WebSocket client disconnected:', socket.id, 'reason:', reason);
    });
    
    socket.on('error', (err: any) => {
      console.error('❌ WebSocket socket error:', socket.id, err?.message || err);
    });
  } catch (e) {
    console.error('❌ WebSocket connection handler error:', (e as any)?.message || e);
  }
});
const mediaDir = require('path').join(process.cwd(), 'public', 'media');
app.use('/media', cors({ origin: config.CORS_ORIGIN, credentials: true }), express.static(mediaDir));
// 优先挂载动态媒体路由（带 CORS），支持多扩展名与账号ID前缀兼容
// mediaRoutes 已删除，使用静态文件服务
// 静态服务作为兜底，命中现有文件直接返回
app.use('/api/media', cors({ origin: config.CORS_ORIGIN, credentials: true }), express.static(mediaDir));

app.use((req, res, next) => {
  req.requestId = uuidv4();
  res.setHeader("X-Request-Id", req.requestId); // optional: send back to client
  next();
});

(async () => {
  try {
    // Initialize node-persist storage directories first
    console.log("🔄 Initializing node-persist storage...");
    await initializeNodePersistStorage({ verbose: true });
    console.log("✅ Node-persist storage initialized");
    
    // Initialize database
    await initDb();
    await seedSuperAdmin();
    console.log("✅ DB init + seeding done");
    
    // Start health checks after database is initialized
    startHealthChecks();
  } catch (err) {
    console.error("❌ Startup error:", err);
  }
})();

// CORS配置
app.use(cors({
  origin: config.CORS_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
// JSON解析中间件
// Only parse JSON/x-www-form-urlencoded; skip multipart (handled by multer per-route)
app.use(express.json({ limit: '10mb', type: (req) => (req.headers['content-type'] || '').toLowerCase().startsWith('application/json') }));
app.use(express.urlencoded({ extended: true, limit: '10mb', type: (req) => (req.headers['content-type'] || '').toLowerCase().startsWith('application/x-www-form-urlencoded') }));

// 自动检测 multipart 语音上传（保持在 JSON 解析器之后）
app.use((req, res, next) => {
  const ct = (req.headers['content-type'] || '').toLowerCase();
  if (ct.startsWith('multipart/form-data')) {
    // 已经在 /upload 路由，直接交给后续处理
    if (req.path.startsWith('/upload')) return next();

    // 仅当显式声明为语音时，自动转交到上传路由
    const isVoice = req.query.type === 'voice' || req.query.voice === '1' || req.headers['x-upload-kind'] === 'voice';
    const platform = (req.query.platform || req.headers['x-platform'] || '').toString().toLowerCase();
    if (isVoice) {
      if (platform === 'wa' || platform === 'tg') {
        // 重写到标准上传端点 /upload/voice/:platform
        // 交给 uploadRoutes 处理（multer）
        (req as any).url = `/upload/voice/${platform}`;
        return uploadRoutes(req, res, next);
      }
      return res.status(400).json({ ok: false, message: 'Missing platform (wa|tg)' });
    }
  }
  next();
});
// JSON解析中间件 - 使用更精确的 type 过滤器
// app.use(express.json({ 
//   limit: '10mb',
//   type: (req) => {
//     const contentType = req.headers['content-type'];
//     // 只处理明确的 JSON 请求
//     return contentType === 'application/json';
//   }
// }));
// app.use(express.urlencoded({ 
//   extended: true, 
//   limit: '10mb',
//   type: (req) => {
//     const contentType = req.headers['content-type'];
//     // 只处理 URL 编码请求，跳过 multipart/form-data
//     return contentType === 'application/x-www-form-urlencoded';
//   }
// }));

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'customer-service-backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: config.NODE_ENV
  });
});


app.get("/health", (req, res) => {
  res.json(getHealthStatus());
});

// API路由
app.use('/workspace', workspaceRoutes);
app.use('/user', userRoutes);
app.use('/plan', planRoutes);
app.use('/auth', authRoutes);
app.use('/wa', waRoutes);
app.use('/wa', waSessionRoutes);  // 新的状态机驱动的会话管理
app.use('/tg', tgRoutes);
app.use('/sessions', sessionsRoutes);
app.use('/account-management', accountManagementRoutes);
app.use('/chats', chatsRoutes);  // 聊天相关API
app.use('/upload', uploadRoutes); // 上传语音（wa/tg 分开目录）
app.use('/wa/message-monitor', waMessageMonitorRoutes);  // 消息监听状态监控
app.use('/wa/message-optimizer', waMessageOptimizerRoutes);  // 消息处理优化
app.use('/wa/session-monitor', waSessionMonitorRoutes);  // 会话管理优化监控
app.use('/debug/clients', debugClientsRoutes);  // 客户端状态调试
app.use('/debug/websocket', websocketDebugRoutes);

// 404处理
app.use(notFoundHandler);

// 错误处理中间件（必须放在最后）
app.use(errorHandler);

app.set('io', io);
//websocketService.setSocketIO(io);

//app.set('io', io);


// 启动服务器
server.listen(config.PORT, async () => {
  console.log('🚀 客服系统后端服务已启动');
  console.log(`📍 服务地址: http://localhost:${config.PORT}`);
  console.log(`🔌 WebSocket: ws://localhost:${config.PORT}/socket.io`);
  console.log(`🌍 环境: ${config.NODE_ENV}`);
  console.log(`🔐 管理员令牌: ${config.ADMIN_TOKEN.substring(0, 8)}...`);
  console.log(`📊 健康检查: http://localhost:${config.PORT}/health`);
  console.log('');
  console.log('📋 可用接口:');
  console.log('  WhatsApp (新状态机API):');
  console.log('    GET  /wa/sessions - 获取所有会话');
  console.log('    POST /wa/sessions - 创建新会话');
  console.log('    GET  /wa/sessions/:id/qr - 获取QR码');
  console.log('    POST /wa/sessions/:id/regenerate-qr - 重新生成QR');
  console.log('    DELETE /wa/sessions/:id - 删除会话');
  console.log('  WhatsApp (旧API):');
  console.log('    POST /wa/login/start');
  console.log('    GET  /wa/login/qr?sessionId=...');
  console.log('    GET  /wa/login/status?sessionId=...');
  console.log('  Telegram:');
  console.log('    POST /tg/qr/start');
  console.log('    GET  /tg/qr/poll?loginKey=...');
  console.log('    POST /tg/phone/start');
  console.log('    POST /tg/phone/verify');
  console.log('  Account Management:');
  console.log('    GET  /account-management/accounts');
  console.log('    GET  /account-management/stats');
  console.log('    DELETE /account-management/accounts/:id');
  console.log('    PUT  /account-management/accounts/:id/toggle');
  console.log('  Chats:');
  console.log('    GET  /chats - 获取所有聊天列表');
  console.log('    GET  /chats/:id/messages - 获取聊天消息');
  console.log('    POST /chats/:id/send - 发送消息');
  console.log('  Message Monitoring:');
  console.log('    GET  /wa/message-monitor/stats - 消息监听统计');
  console.log('    GET  /wa/message-monitor/validate - 验证监听器');
  console.log('    GET  /wa/message-monitor/stats/:accountId - 获取指定账号统计');
  console.log('  Message Optimization:');
  console.log('    GET  /wa/message-optimizer/stats - 消息处理统计');
  console.log('    GET  /wa/message-optimizer/queue - 消息队列状态');
  console.log('    POST /wa/message-optimizer/queue/clear - 清空消息队列');
  console.log('    POST /wa/message-optimizer/filters/global - 添加全局过滤器');
  console.log('    POST /wa/message-optimizer/filters/account/:id - 添加账号过滤器');
  console.log('    GET  /wa/message-optimizer/rate-limits - 速率限制状态');
  console.log('  Session Management:');
  console.log('    GET  /wa/session-monitor/health - 会话健康状态');
  console.log('    GET  /wa/session-monitor/metrics - 性能指标');
  console.log('    GET  /wa/session-monitor/status - 系统状态概览');
  console.log('    POST /wa/session-monitor/reconnect/:accountId - 强制重连账号');
  console.log('    GET  /wa/session-monitor/session/:accountId - 会话详情');
  console.log('  Debug:');
  console.log('    GET  /debug/clients/wa-clients - WhatsApp客户端状态');
  console.log('    GET  /debug/clients/tg-clients - Telegram客户端状态');
  console.log('    GET  /debug/clients/wa-clients/:accountId - 指定账号详情');
  console.log('  WebSocket:');
  console.log('    GET  /debug/websocket/status - WebSocket连接状态');
  console.log('    POST /debug/websocket/test-broadcast - 测试消息广播');
  console.log('');
  
  // 🚀 启动时自动重连已保存的账号
  setTimeout(async () => {
    try {
      console.log("⏰ 开始自动重连流程...");
      await autoReconnectOnStartup();
      console.log("✅ 自动重连流程完成");
      
      // 🚀 启动WhatsApp Provider消息监听
      console.log("📱 启动WhatsApp Provider消息监听...");
      const { WhatsAppProvider } = await import('./provider/whatsapp-provider');
      const waProvider = new WhatsAppProvider();
      await waProvider.start((payload) => {
        console.log('📨 [WhatsApp] 收到消息，发送到WebSocket:', {
          chatId: payload.chatInfo.id,
          sender: payload.message.sender,
          content: payload.message.content.substring(0, 30) + '...'
        });
        
        // 转换为WebSocket消息格式
        const webSocketMessage = {
          platform: 'whatsapp' as const,
          message: {
            ...payload.message,
            messageType: (payload.message.messageType === 'photo' ? 'photo' :
                        payload.message.messageType === 'video' ? 'video' :
                        payload.message.messageType === 'voice' ? 'voice' :
                        payload.message.messageType === 'document' ? 'document' :
                        payload.message.messageType === 'sticker' ? 'sticker' :
                        payload.message.messageType === 'location' ? 'location' :
                        payload.message.messageType === 'encrypted' ? 'text' :
                        payload.message.messageType === 'system' ? 'system':
                        'text') as 'text' | 'photo' | 'video' | 'document' | 'sticker' | 'location' | 'voice' | 'system'
          },
          chatInfo: {
            ...payload.chatInfo,
            lastMessage: payload.chatInfo.lastMessage || '',
            lastMessageSender: payload.chatInfo.lastMessageSender || '',
            lastMessageTime: payload.chatInfo.lastMessageTime || 0,
            unreadCount: payload.chatInfo.unreadCount || 0,
            createdAt: payload.chatInfo.createdAt || Date.now(),
            updatedAt: payload.chatInfo.updatedAt || Date.now()
          },
          accountId: payload.accountId
        };
        
        websocketService.broadcastNewMessage(webSocketMessage);
      });
      console.log("✅ WhatsApp Provider消息监听已启动");
      
      // 🚀 启动Telegram Provider消息监听
      console.log("📱 启动Telegram Provider消息监听...");
      const { TelegramProvider } = await import('./provider/telegram-provider');
      const tgProvider = new TelegramProvider();
      await tgProvider.start((payload) => {
        console.log('📨 [Telegram] 收到消息，发送到WebSocket:', {
          chatId: payload.chatInfo.id,
          sender: payload.message.sender,
          content: payload.message.content.substring(0, 30) + '...'
        });
        
        // 转换为WebSocket消息格式
        const webSocketMessage = {
          platform: 'telegram' as const,
          message: {
            ...payload.message,
            messageType: (payload.message.messageType === 'photo' ? 'photo' :
                        payload.message.messageType === 'video' ? 'video' :
                        payload.message.messageType === 'voice' ? 'voice' :
                        payload.message.messageType === 'document' ? 'document' :
                        payload.message.messageType === 'sticker' ? 'sticker' :
                        payload.message.messageType === 'location' ? 'location' :
                        payload.message.messageType === 'encrypted' ? 'text' :
                        'text') as 'text' | 'photo' | 'video' | 'document' | 'sticker' | 'location' | 'voice'
          },
          chatInfo: {
            ...payload.chatInfo,
            lastMessage: payload.chatInfo.lastMessage || '',
            lastMessageSender: payload.chatInfo.lastMessageSender || '',
            lastMessageTime: payload.chatInfo.lastMessageTime || 0,
            unreadCount: payload.chatInfo.unreadCount || 0,
            createdAt: payload.chatInfo.createdAt || Date.now(),
            updatedAt: payload.chatInfo.updatedAt || Date.now()
          },
          accountId: payload.accountId
        };
        
        websocketService.broadcastNewMessage(webSocketMessage);
      });
      console.log("✅ Telegram Provider消息监听已启动");
      
    } catch (error) {
      console.error("❌ 自动重连失败:", error);
    }
  }, 3000); // 减少到3秒，加快启动
  
  // 🧹 废弃会话清理服务已禁用 - 避免删除仍在使用的会话文件夹
  console.log("ℹ️ 废弃会话清理服务已禁用，避免与用户会话冲突");
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('📴 收到SIGTERM信号，正在关闭服务器...');
  server.close(() => {
    console.log('✅ 服务器已关闭');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n📴 收到SIGINT信号，正在关闭服务器...');
  server.close(() => {
    console.log('✅ 服务器已关闭');
    process.exit(0);
  });
});

// 未捕获的异常处理
process.on('uncaughtException', (error) => {
  // 忽略 wmic.exe 相关的错误，因为它在较新的 Windows 版本中不可用
  if (error.message && error.message.includes('spawn wmic.exe ENOENT')) {
    console.warn('⚠️ 忽略 wmic.exe 错误 (Windows 版本兼容性问题):', error.message);
    return;
  }
  
  console.error('❌ 未捕获的异常:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  // 忽略 wmic.exe 相关的错误
  if (reason && typeof reason === 'object' && 'message' in reason && 
      String(reason.message).includes('spawn wmic.exe ENOENT')) {
    console.warn('⚠️ 忽略 wmic.exe Promise 拒绝 (Windows 版本兼容性问题):', reason);
    return;
  }
  
  console.error('❌ 未处理的Promise拒绝:', reason);
  console.error('Promise:', promise);
  process.exit(1);
});

export default app;
