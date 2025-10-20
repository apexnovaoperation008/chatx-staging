/**
 * 媒体文件API路由
 */

import { Router } from "express";
import { requireAdmin } from "../middleware/requireAdmin";
import path from "path";
import fs from "fs";
import { Server as SocketIOServer } from "socket.io";

const r = Router();

// 🔒 使用固定的服务器根目录，不依赖 process.cwd()
const SERVER_ROOT = path.resolve(__dirname, '../..');
console.log(`📁 [媒体服务] 服务器根目录: ${SERVER_ROOT}`);

// 控制是否输出详细日志
const VERBOSE_MEDIA_LOG = false;

// 获取全局io实例（从app.ts中导入）
let io: SocketIOServer | null = null;

// 设置io实例的方法（从app.ts调用）
export const setSocketIO = (socketIO: SocketIOServer) => {
  io = socketIO;
};

// 供其他模块获取全局 io 实例
export const getSocketIO = (): SocketIOServer | null => io;

// 获取 Telegram 媒体文件
r.get("/tg/:accountId/:type/:messageId", async (req, res) => {
  try {
    let { accountId, type, messageId } = req.params;

    // 如果messageId包含扩展名，提取纯ID部分
    const originalMessageId = messageId;
    // 支持多种格式：纯数字.扩展名 或 voice-数字.扩展名
    const extensionMatch = messageId.match(/^(voice-\d+|\d+)\.([^.]+)$/);
    if (extensionMatch) {
      messageId = extensionMatch[1]; // 提取ID部分（可能是纯数字或voice-数字）
      if (VERBOSE_MEDIA_LOG) console.log(`📝 [媒体服务] 解析messageId: ${originalMessageId} -> ${messageId}`);
    }

    // URL解码accountId（如果包含特殊字符）
    try {
      accountId = decodeURIComponent(accountId);
    } catch (error) {
      console.log(`⚠️ [媒体服务] accountId解码失败，使用原始值: ${accountId}`);
    }

    // console.log(`📁 [媒体服务] 请求媒体文件: ${type}/${accountId}/${messageId}`);
    // console.log(`📁 [媒体服务] 原始参数:`, { accountId, type, messageId });

    // 规范化：优先使用去掉 tg- 前缀的目录
    const normalizedAccountId = String(accountId).replace(/^tg-/, '');
    let mediaDir = path.join(SERVER_ROOT, 'public', 'media', 'tg', normalizedAccountId, type);
    
    if (VERBOSE_MEDIA_LOG) console.log(`📁 [媒体服务] mediaDir: ${mediaDir}`);
    if (VERBOSE_MEDIA_LOG) console.log(`📁 [媒体服务] SERVER_ROOT: ${SERVER_ROOT}`);
    if (VERBOSE_MEDIA_LOG) console.log(`📁 [媒体服务] accountId: ${accountId}, normalizedAccountId: ${normalizedAccountId}, type: ${type}`);

    // 添加详细的类型信息
    if (type === 'voice') {
      // console.log(`🎵 [媒体服务] 语音文件请求详情:`, {
      //   expectedExtension: getFileExtension(type),
      //   expectedContentType: getContentType(type),
      //   mediaDir: mediaDir
      // });
    }

    if (type === 'sticker') {
      // console.log(`🎭 [媒体服务] 贴纸文件请求详情:`, {
      //   originalMessageId: originalMessageId,
      //   parsedMessageId: messageId,
      //   mediaDir: mediaDir,
      //   accountId: accountId,
      //   stickerDir: mediaDir,
      //   filesInDir: fs.existsSync(mediaDir) ? fs.readdirSync(mediaDir).filter(f => f.includes(messageId)) : []
      // });
    }

    // 统一文件查找逻辑
    let filePath = '';
    let contentType = '';
    let actualFileName = '';

    // 根据类型定义可能的扩展名 - 优化分类，避免类型混淆
    let possibleExtensions: string[] = [];
    switch (type) {
      case 'document':
        // 文档类型：包含文档格式和作为文档发送的图片格式
        possibleExtensions = ['.txt', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.zip', '.rar', 
                             '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.bin'];
        break;
      case 'photo':
        // 图片类型：只包含图片格式
        possibleExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.bin'];
        break;
      case 'video':
        // 视频类型：只包含视频格式
        possibleExtensions = ['.mp4', '.avi', '.mov', '.webm', '.mkv', '.flv', '.wmv', '.bin'];
        break;
      case 'voice':
        // 语音类型：只包含音频格式
        possibleExtensions = ['.ogg', '.mp3', '.wav', '.m4a', '.aac', '.bin'];
        break;
      case 'sticker':
        // 贴纸类型：只包含贴纸格式
        possibleExtensions = ['.tgs', '.webp', '.bin'];
        break;
      default:
        // 未知类型：使用通用二进制格式
        possibleExtensions = ['.bin'];
    }

    // 尝试找到文件
    for (const ext of possibleExtensions) {
      const testPath = path.join(mediaDir, `${messageId}${ext}`);
      if (fs.existsSync(testPath)) {
        filePath = testPath;
        actualFileName = `${messageId}${ext}`;
        contentType = getContentTypeFromExtension(ext);
        if (VERBOSE_MEDIA_LOG) console.log(`✅ [媒体服务] 找到文件: ${actualFileName}`);
        break;
      }
    }

    // 如果没找到文件，使用默认扩展名
    if (!filePath) {
      const defaultExt = type === 'document' ? '.pdf' : '.bin';
      filePath = path.join(mediaDir, `${messageId}${defaultExt}`);
      actualFileName = `${messageId}${defaultExt}`;
      contentType = getContentTypeFromExtension(defaultExt);
      if (VERBOSE_MEDIA_LOG) console.log(`⚠️ [媒体服务] 使用默认扩展名: ${actualFileName}`);
    }

    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      if (VERBOSE_MEDIA_LOG) console.log(`⚠️ [媒体服务] 文件不存在: ${filePath}`);
      
      // 跨目录查找：检查其他可能的目录
      const alternativeDirs = [];
      
      if (type === 'sticker') {
        // 贴纸可能在 document 目录
        alternativeDirs.push('document');
      } else if (type === 'photo') {
        // 照片可能在 document 目录（WhatsApp 有时将图片保存为文档）
        alternativeDirs.push('document');
      } else if (type === 'document') {
        // 文档可能在 photo 目录（如果被误分类）
        alternativeDirs.push('photo');
      }
      
      // 尝试在替代目录中查找
      for (const altDir of alternativeDirs) {
        const altMediaDir = path.join(SERVER_ROOT, 'public', 'media', 'tg', accountId, altDir);
        for (const ext of possibleExtensions) {
          const altFilePath = path.join(altMediaDir, `${messageId}${ext}`);
          if (fs.existsSync(altFilePath)) {
            filePath = altFilePath;
            actualFileName = `${messageId}${ext}`;
            contentType = getContentTypeFromExtension(ext);
            if (VERBOSE_MEDIA_LOG) console.log(`🔄 [媒体服务] 在${altDir}目录中找到文件: ${filePath}`);
            break;
          }
        }
        if (filePath && fs.existsSync(filePath)) break;
      }
    }

    // console.log(`📁 [媒体服务] 文件路径构建:`, {
    //   mediaDir,
    //   actualFileName,
    //   filePath,
    //   contentType
    // });

    // 检查文件是否存在；若不存在尝试 accountId 前缀变体（兼容 tg- 与非 tg- 目录）
    if (!fs.existsSync(filePath)) {
      if (VERBOSE_MEDIA_LOG) console.log(`⚠️ [媒体服务] 文件不存在: ${filePath}`);

      // 计算前缀变体
      const altAccountId = accountId.startsWith('tg-') ? accountId.replace(/^tg-/, '') : `tg-${accountId}`;
      const altMediaDir = path.join(SERVER_ROOT, 'public', 'media', 'tg', altAccountId, type);
      let altFilePath = path.join(altMediaDir, actualFileName);

      // 对于 sticker/document，尝试多种扩展名
      if (!fs.existsSync(altFilePath)) {
        if (type === 'sticker') {
          const possibleExtensions = ['.tgs', '.webp'];
          for (const ext of possibleExtensions) {
            const test = path.join(altMediaDir, `${messageId}${ext}`);
            if (fs.existsSync(test)) {
              altFilePath = test;
              actualFileName = `${messageId}${ext}`;
              contentType = getContentTypeFromExtension(ext);
              break;
            }
          }
        } else if (type === 'document') {
          const possibleExtensions = ['.txt', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.zip', '.rar'];
          for (const ext of possibleExtensions) {
            const test = path.join(altMediaDir, `${messageId}${ext}`);
            if (fs.existsSync(test)) {
              altFilePath = test;
              actualFileName = `${messageId}${ext}`;
              contentType = getContentTypeFromExtension(ext);
              break;
            }
          }
        }
      }

      if (fs.existsSync(altFilePath)) {
        if (VERBOSE_MEDIA_LOG) console.log(`🔁 [媒体服务] 使用替代账号目录: ${altFilePath}`);
        filePath = altFilePath;
      }
    }

    // 若仍不存在则返回占位符/404
    if (!fs.existsSync(filePath)) {
      if (VERBOSE_MEDIA_LOG) console.log(`⚠️ [媒体服务] 最终仍未找到文件: ${filePath}`);

      // 返回占位符图片
      const placeholderSvg = path.join(SERVER_ROOT, 'public', 'placeholder', `${type}.svg`);
      const placeholderPng = path.join(SERVER_ROOT, 'public', 'placeholder', `${type}.png`);

      if (fs.existsSync(placeholderSvg)) {
        if (VERBOSE_MEDIA_LOG) console.log(`📁 [媒体服务] 返回 SVG 占位符: ${placeholderSvg}`);
        res.setHeader('Content-Type', 'image/svg+xml');
        return res.sendFile(placeholderSvg);
      } else if (fs.existsSync(placeholderPng)) {
        if (VERBOSE_MEDIA_LOG) console.log(`📁 [媒体服务] 返回 PNG 占位符: ${placeholderPng}`);
        return res.sendFile(placeholderPng);
      }

      // 如果连占位符都没有，返回 404
      // 对于TGS贴纸，返回空的TGS响应而不是JSON，避免lottie-web报错
      if (type === 'sticker') {
        console.log(`📁 [媒体服务] TGS文件不存在，返回空TGS响应`);
        // 返回一个最小的有效TGS响应头，避免lottie-web responseType冲突
        res.setHeader('Content-Type', 'application/x-tgsticker');
        return res.send(Buffer.from([0x00, 0x00, 0x00, 0x00])); // 最小TGS头部
      }

      return res.status(404).json({
        success: false,
        error: '媒体文件不存在'
      });
    }

    // 设置适当的 Content-Type
    res.setHeader('Content-Type', contentType);

    // 设置缓存头
    res.setHeader('Cache-Control', 'public, max-age=3600'); // 1小时缓存

    // 根据文件类型设置 Content-Disposition（优先读取同名 .meta.json 的 originalName）
    let preferredName = actualFileName;
    try {
      console.log('🔍 [WhatsApp媒体] 读取同名 .meta.json:', {
        messageId: messageId,
        type: type, 
        filePath: filePath,
        metaPath: `${filePath}.meta.json`
      });
      const metaPath = `${filePath}.meta.json`;
      if (fs.existsSync(metaPath)) {
        const raw = fs.readFileSync(metaPath, 'utf-8');
        const meta = JSON.parse(raw || '{}');
        if (typeof meta?.originalName === 'string' && meta.originalName.trim()) {
          preferredName = meta.originalName.trim();
        }
      }
    } catch {}

    // 清理文件名，移除无效的 HTTP 头字符
    const cleanFileName = preferredName
      .replace(/[\r\n\t]/g, ' ') // 移除换行符、回车符、制表符
      .replace(/[^\x20-\x7E]/g, '') // 只保留可打印的 ASCII 字符
      .trim();
    
    // 如果清理后的文件名为空，使用默认文件名
    const finalFileName = cleanFileName || actualFileName || 'file';

    const isTextFile = contentType.startsWith('text/') ||
                      contentType.includes('json') ||
                      contentType.includes('xml') ||
                      contentType.includes('csv');

    if (isTextFile) {
      res.setHeader('Content-Disposition', `attachment; filename="${finalFileName}"`);
    } else {
      res.setHeader('Content-Disposition', `inline; filename="${finalFileName}"`);
    }

    // console.log(`✅ [媒体服务] 返回媒体文件详情:`, {
    //   filePath,
    //   contentType,
    //   fileName: actualFileName,
    //   isTextFile,
    //   disposition: isTextFile ? 'attachment' : 'inline',
    //   fileSize: fs.existsSync(filePath) ? fs.statSync(filePath).size : '文件不存在'
    // });

    // 添加调试：检查文件内容
    try {
      if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath);
        // console.log(`📁 [媒体服务] 文件读取成功，大小: ${fileContent.length} 字节，前10字节:`, fileContent.slice(0, 10));

        // 对于TGS文件，特别检查魔数
        if (type === 'sticker' && fileContent.length > 2) {
          const magic = fileContent.slice(0, 2);
          // console.log(`🎭 [媒体服务] TGS魔数检查: ${magic[0].toString(16).toUpperCase()}${magic[1].toString(16).toUpperCase()}`);
        }

        // 广播媒体下载完成通知
        if (io) {
          const mediaNotification = {
            type: 'mediaDownloaded',
            filePath: `/api/media/tg/${accountId}/${type}/${actualFileName}`,
            messageId: messageId,
            accountId: accountId,
            mediaType: type,
            fileName: preferredName,
            timestamp: Date.now()
          };
          io.emit('mediaDownloaded', mediaNotification);
          // console.log(`📡 [WebSocket] 广播媒体下载完成通知:`, mediaNotification);
        } else {
          console.warn(`⚠️ [WebSocket] io实例未设置，无法广播媒体下载通知`);
        }
      }
    } catch (readError) {
      console.error(`❌ [媒体服务] 文件读取失败:`, readError);
    }

    res.sendFile(filePath);

  } catch (error: any) {
    console.error("❌ [媒体服务] 获取媒体文件失败:", error);
    res.status(500).json({
      success: false,
      error: error.message || "获取媒体文件失败"
    });
  }
});

// 辅助函数：直接通过messageId查找文件
function findFileByMessageId(mediaDir: string, messageId: string, type: string): { exists: boolean; filePath: string; fileName: string } {
  const possibleExtensions = getPossibleExtensions(type);
  
  for (const ext of possibleExtensions) {
    const testPath = path.join(mediaDir, `${messageId}${ext}`);
    if (fs.existsSync(testPath)) {
      return {
        exists: true,
        filePath: testPath,
        fileName: `${messageId}${ext}`
      };
    }
  }
  
  return { exists: false, filePath: '', fileName: '' };
}

// 辅助函数：通过文件名模式匹配查找文件
function findFileByPattern(mediaDir: string, messageId: string, type: string): { exists: boolean; filePath: string; fileName: string } {
  try {
    // 如果目录不存在，直接返回
    if (!fs.existsSync(mediaDir)) {
      return { exists: false, filePath: '', fileName: '' };
    }

    const files = fs.readdirSync(mediaDir);
    const possibleExtensions = getPossibleExtensions(type);
    
    // 尝试多种匹配策略
    const patterns = [
      // 1. 完全匹配
      messageId,
      // 2. 如果messageId包含扩展名，去掉扩展名
      messageId.replace(/\.[^.]+$/, ''),
      // 3. 如果messageId是WhatsApp内部格式，尝试提取关键部分
      extractKeyFromWhatsAppId(messageId),
      // 4. 如果messageId是时间戳格式，尝试匹配
      extractTimestampFromId(messageId)
    ];

    for (const pattern of patterns) {
      if (!pattern) continue;
      
      for (const ext of possibleExtensions) {
        const fileName = `${pattern}${ext}`;
        if (files.includes(fileName)) {
          const filePath = path.join(mediaDir, fileName);
          console.log(`🎯 [WhatsApp媒体] 模式匹配成功: ${pattern} -> ${fileName}`);
          return {
            exists: true,
            filePath: filePath,
            fileName: fileName
          };
        }
      }
    }
  } catch (error) {
    console.log(`⚠️ [WhatsApp媒体] 模式匹配失败:`, error);
  }
  
  return { exists: false, filePath: '', fileName: '' };
}

// 辅助函数：从WhatsApp内部ID中提取关键部分
function extractKeyFromWhatsAppId(messageId: string): string | null {

  const timestampMatch = messageId.match(/(\d{13,})@lid$/);
  if (timestampMatch) {
    return timestampMatch[1];
  }
  
  // 尝试提取其他数字部分
  const numberMatch = messageId.match(/(\d{10,})/);
  if (numberMatch) {
    return numberMatch[1];
  }
  
  return null;
}

// 辅助函数：从ID中提取时间戳
function extractTimestampFromId(messageId: string): string | null {
  // 匹配时间戳格式 (10位或13位数字)
  const timestampMatch = messageId.match(/(\d{10,13})/);
  return timestampMatch ? timestampMatch[1] : null;
}

// 辅助函数：获取可能的文件扩展名
function getPossibleExtensions(type: string): string[] {
  switch (type) {
    case 'photo':
      return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bin'];
    case 'voice':
    case 'ptt':
      return ['.ogg', '.mp3', '.wav', '.m4a', '.aac', '.bin'];
    case 'video':
      return ['.mp4', '.avi', '.mov', '.webm', '.mkv', '.flv', '.wmv', '.bin'];
    case 'document':
      return ['.pdf', '.docx', '.doc', '.txt', '.xls', '.xlsx', '.ppt', '.pptx', '.zip', '.rar', 
              '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.bin'];
    case 'sticker':
      return ['.webp', '.bin'];
    default:
      return ['.bin'];
  }
}

// 将请求到的 WhatsApp 媒体 messageId 与实际文件名建立映射，便于后续直接命中
function persistWaMediaMap(accountId: string, type: string, messageId: string, fileName: string) {
  try {
    const mapDir = path.join(SERVER_ROOT, 'data');
    const mapPath = path.join(mapDir, 'wa-media-map.json');
    fs.mkdirSync(mapDir, { recursive: true });

    let mapData: any = {};
    if (fs.existsSync(mapPath)) {
      try {
        const raw = fs.readFileSync(mapPath, 'utf-8');
        mapData = JSON.parse(raw || '{}');
      } catch {}
    }

    const key = `${accountId}:${type}:${messageId}`;
    const value = fileName;
    if (mapData[key] !== value) {
      mapData[key] = value;
      fs.writeFileSync(mapPath, JSON.stringify(mapData, null, 2), 'utf-8');
      console.log(`🗂️ [WA媒体映射] 已记录: ${key} -> ${value}`);
    }
  } catch (e) {
    console.warn('⚠️ [WA媒体映射] 记录失败:', e);
  }
}

// 通用函数：查找WhatsApp媒体文件（重用现有逻辑）
function findWhatsAppMediaFile(accountId: string, type: string, messageId: string): { exists: boolean; filePath: string; fileName: string } {
  console.log(`🔍 [WhatsApp媒体] findWhatsAppMediaFile 参数:`, { accountId, type, messageId });
  const mediaDir = path.join(SERVER_ROOT, 'public', 'media', 'wa', accountId, type);
  console.log(`🔍 [WhatsApp媒体] 构建的媒体目录: ${mediaDir}`);
  let actualFileName = '';
  let filePath = '';

  // 👉 简化为单一查找：仅按默认扩展名拼接路径
  const fileExtension = getFileExtension(type);
  actualFileName = `${messageId}.${fileExtension}`;
  filePath = path.join(mediaDir, actualFileName);

  // ▶ 仅对 document 类型增加同目录多后缀重试（常见文档与被当作文档的图片）
  if (type === 'document' && !fs.existsSync(filePath)) {
    const docExts = ['.pdf', '.docx', '.doc', '.txt', '.xls', '.xlsx', '.ppt', '.pptx', '.zip', '.rar'];
    const imgExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const tryExts = [...docExts, ...imgExts];
    for (const ext of tryExts) {
      const testName = `${messageId}${ext}`;
      const testPath = path.join(mediaDir, testName);
      if (fs.existsSync(testPath)) {
        actualFileName = testName;
        filePath = testPath;
        console.log(`✅ [WhatsApp媒体] document 多格式命中: ${filePath}`);
        break;
      }
    }
  }

  /*
  // 首先尝试直接查找（已停用）
  const directResult = findFileByMessageId(mediaDir, messageId, type);
  if (directResult.exists) {
    try { persistWaMediaMap(accountId, type, messageId, directResult.fileName); } catch {}
    return directResult;
  }

  // 模式匹配查找（已停用）
  console.log(`🔍 [WhatsApp媒体] 直接查找失败，尝试模式匹配: ${messageId}`);
  const patternResult = findFileByPattern(mediaDir, messageId, type);
  if (patternResult.exists) {
    try { persistWaMediaMap(accountId, type, messageId, patternResult.fileName); } catch {}
    return patternResult;
  }

  if (type === 'photo') {
    // 图片尝试多种可能扩展名 
    const possibleExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bin'];
    for (const ext of possibleExtensions) {
      const testPath = path.join(mediaDir, `${messageId}${ext}`);
      if (fs.existsSync(testPath)) {
        filePath = testPath;
        actualFileName = `${messageId}${ext}`;
        break;
      }
    }
    // 若未找到，回退到默认 jpg
    if (!filePath) {
      actualFileName = `${messageId}.jpg`;
      filePath = path.join(mediaDir, actualFileName);
    }
  } else if (type === 'voice' || type === 'ptt') {
    // 语音文件尝试多种可能扩展名
    const possibleExtensions = ['.ogg', '.mp3', '.wav', '.m4a', '.aac', '.bin'];
    for (const ext of possibleExtensions) {
      const testPath = path.join(mediaDir, `${messageId}${ext}`);
      if (fs.existsSync(testPath)) {
        filePath = testPath;
        actualFileName = `${messageId}${ext}`;
        break;
      }
    }
    // 若未找到，回退到默认 ogg
    if (!filePath) {
      actualFileName = `${messageId}.ogg`;
      filePath = path.join(mediaDir, actualFileName);
    }
  } else if (type === 'video') {
    // 视频文件尝试多种可能扩展名
    const possibleExtensions = ['.mp4', '.avi', '.mov', '.webm', '.mkv', '.flv', '.wmv', '.bin'];
    for (const ext of possibleExtensions) {
      const testPath = path.join(mediaDir, `${messageId}${ext}`);
      if (fs.existsSync(testPath)) {
        filePath = testPath;
        actualFileName = `${messageId}${ext}`;
        break;
      }
    }
    // 若未找到，回退到默认 mp4
    if (!filePath) {
      actualFileName = `${messageId}.mp4`;
      filePath = path.join(mediaDir, actualFileName);
    }
  } else if (type === 'document') {
    // 对文档尝试多种扩展名，包含文档格式和作为文档发送的图片格式
    const possibleExtensions = ['.pdf', '.docx', '.doc', '.txt', '.xls', '.xlsx', '.ppt', '.pptx', '.zip', '.rar', 
                               '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.bin'];
    for (const ext of possibleExtensions) {
      const testPath = path.join(mediaDir, `${messageId}${ext}`);
      if (fs.existsSync(testPath)) {
        filePath = testPath;
        actualFileName = `${messageId}${ext}`;
        break;
      }
    }
    // 如果没有找到，回退到默认 pdf 路径（保持兼容）
    if (!filePath) {
      actualFileName = `${messageId}.pdf`;
      filePath = path.join(mediaDir, actualFileName);
    }
  } else {
    const fileExtension = getFileExtension(type);
    actualFileName = `${messageId}.${fileExtension}`;
    filePath = path.join(mediaDir, actualFileName);
  }

  // 如果文件不存在，尝试跨目录查找
  if (!fs.existsSync(filePath)) {
    // console.log(`⚠️ [WhatsApp媒体] 文件不存在: ${filePath}`);
    // console.log(`🔍 [WhatsApp媒体] 开始跨目录查找，类型: ${type}`);
    // console.log(`🔍 [WhatsApp媒体] 当前 mediaDir: ${mediaDir}`);
    // console.log(`🔍 [WhatsApp媒体] 当前 accountId: ${accountId}`);
    
    // 跨目录查找：检查其他可能的目录
    const alternativeDirs = [];
    
    if (type === 'photo') {
      // 照片可能在 document 目录（WhatsApp 有时将图片保存为文档）
      alternativeDirs.push('document');
      // console.log(`🔍 [WhatsApp媒体] 照片类型，将检查 document 目录`);
    } else if (type === 'document') {
      // 文档可能在 photo 目录（如果被误分类）
      alternativeDirs.push('photo');
      // console.log(`🔍 [WhatsApp媒体] 文档类型，将检查 photo 目录`);
    }
    
    console.log(`🔍 [WhatsApp媒体] 替代目录列表: ${alternativeDirs.join(', ')}`);
    
    // 尝试在替代目录中查找
    for (const altDir of alternativeDirs) {
      console.log(`🔍 [WhatsApp媒体] 构建替代目录，accountId: ${accountId}, altDir: ${altDir}`);
      const altMediaDir = path.join(SERVER_ROOT, 'public', 'media', 'wa', accountId, altDir);
      console.log(`🔍 [WhatsApp媒体] 检查替代目录: ${altMediaDir}`);
      
      // 根据类型定义可能的扩展名
      let possibleExtensions: string[] = [];
      switch (type) {
        case 'photo':
          possibleExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bin'];
          break;
        case 'document':
          possibleExtensions = ['.pdf', '.docx', '.doc', '.txt', '.xls', '.xlsx', '.ppt', '.pptx', '.zip', '.rar', 
                               '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.bin'];
          break;
        default:
          possibleExtensions = ['.bin'];
      }
      
      console.log(`🔍 [WhatsApp媒体] 在${altDir}目录中查找，扩展名: ${possibleExtensions.join(', ')}`);
      console.log(possibleExtensions);
      for (const ext of possibleExtensions) {
        const altFilePath = path.join(altMediaDir, `${messageId}${ext}`);
        // console.log(`🔍 [WhatsApp媒体] 检查文件: ${altFilePath}`);
        if (fs.existsSync(altFilePath)) {
          filePath = altFilePath;
          actualFileName = `${messageId}${ext}`;
          console.log(`🔄 [WhatsApp媒体] 在${altDir}目录中找到文件: ${filePath}`);
          break;
        }
      }
      if (filePath && fs.existsSync(filePath)) break;
    }
  }
  */

  return {
    exists: fs.existsSync(filePath),
    filePath: filePath,
    fileName: actualFileName
  };
}

// 重试下载 WhatsApp 媒体文件
// r.post("/wa/:accountId/:type/:messageId/retry", async (req, res) => {
//   try {
//     const { accountId, type, messageId } = req.params;
//     console.log(`🔄 [WhatsApp媒体重试] 请求: ${accountId}/${type}/${messageId}`);
    
//     // 使用通用函数检查文件是否存在
//     const fileInfo = findWhatsAppMediaFile(accountId, type, messageId);
    
//     if (fileInfo.exists) {
//       console.log(`✅ [WhatsApp媒体重试] 文件已存在，无需重新下载: ${fileInfo.filePath}`);
//       return res.json({
//         success: true,
//         message: "文件已存在，无需重新下载",
//         messageId: messageId,
//         type: type,
//         filePath: fileInfo.filePath,
//         fileName: fileInfo.fileName,
//         alreadyExists: true
//       });
//     }
    
//     console.log(`📥 [WhatsApp媒体重试] 文件不存在，尝试重新下载: ${messageId}`);
    
//     // 尝试重新触发下载
//     try {
//       // 动态导入 WhatsApp Provider
//       const { WhatsAppProvider } = await import('../provider/whatsapp-provider');
//       const waProvider = new WhatsAppProvider();
      
//       // 获取客户端
//       const client = await waProvider.getClient(accountId);
//       if (!client) {
//         console.log(`❌ [WhatsApp媒体重试] 无法获取客户端: ${accountId}`);
//         return res.status(404).json({
//           success: false,
//           error: "无法获取 WhatsApp 客户端"
//         });
//       }
      
//       // 尝试通过 messageId 获取原始消息
//       let originalMessage = null;
//       try {
//         originalMessage = await client.getMessageById(messageId as any);
//         console.log(`📨 [WhatsApp媒体重试] 找到原始消息: ${messageId}`);
//       } catch (msgError: any) {
//         console.log(`⚠️ [WhatsApp媒体重试] 无法获取原始消息: ${messageId}`, msgError.message);
//         // 继续尝试，可能不需要原始消息
//       }
      
//       // 构建媒体对象（模拟原始媒体对象）
//       const mediaObject = originalMessage || {
//         id: { _serialized: messageId },
//         type: type === 'voice' ? 'ptt' : type,
//         mimetype: type === 'voice' ? 'audio/ogg' : 
//                   type === 'photo' ? 'image/jpeg' :
//                   type === 'video' ? 'video/mp4' :
//                   type === 'document' ? 'application/pdf' : 'application/octet-stream'
//       };
      
//       // 调用下载方法
//       console.log(`🚀 [WhatsApp媒体重试] 开始重新下载: ${type}/${messageId}`);
//       await waProvider.downloadMediaAsync(mediaObject, type, accountId, messageId, client);
      
//       console.log(`✅ [WhatsApp媒体重试] 重新下载完成: ${type}/${messageId}`);
      
//       res.json({
//         success: true,
//         message: "重新下载已触发",
//         messageId: messageId,
//         type: type,
//         alreadyExists: false,
//         downloadTriggered: true
//       });
      
//     } catch (downloadError: any) {
//       console.error(`❌ [WhatsApp媒体重试] 重新下载失败:`, downloadError);
//       res.status(500).json({
//         success: false,
//         error: "重新下载失败: " + (downloadError.message || "未知错误")
//       });
//     }
    
//   } catch (error: any) {
//     console.error('重试下载失败:', error);
//     res.status(500).json({
//       success: false,
//       error: error.message || "重试下载失败"
//     });
//   }
// });

// 获取 WhatsApp 媒体文件
r.get("/wa/:accountId/:type/:messageId", async (req, res) => {
  try {
    let { accountId, type, messageId } = req.params;
    console.log(`🔍 [WhatsApp媒体] 原始参数:`, { accountId, type, messageId });

    // 如果messageId包含扩展名，提取纯ID部分
    const originalMessageId = messageId;
    const extensionMatch = messageId.match(/^(.+)\.([^.]+)$/);
    if (extensionMatch) {
      messageId = extensionMatch[1];
      console.log(`🔍 [WhatsApp媒体] 提取messageId: ${originalMessageId} -> ${messageId}`);
    }

    console.log(`📱 [WhatsApp媒体] 请求: ${accountId}/${type}/${messageId}`);

    // 使用通用函数查找文件
    const fileInfo = findWhatsAppMediaFile(accountId, type, messageId);
    const filePath = fileInfo.filePath;
    const actualFileName = fileInfo.fileName;

    // console.log(`📁 [WhatsApp媒体] 查找文件: ${filePath}`);

    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      // console.log(`⚠️ [WhatsApp媒体] 文件不存在: ${filePath}`);
      
      // 检查是否是重试请求
      const isRetry = req.query.retry === 'true' || req.query.retry === '1';
      if (isRetry) {
        console.log(`🔄 [WhatsApp媒体] 检测到重试请求，尝试重新下载: ${messageId}`);
        
        // 尝试重新触发下载
        try {
          // 这里需要获取 WhatsApp 客户端和原始消息
          // 由于路由层无法直接访问 provider，我们需要通过其他方式
          // 暂时返回 404，让前端知道需要等待
          return res.status(404).json({
            success: false,
            error: "文件不存在，正在重新下载中...",
            retrying: true
          });
        } catch (error) {
          console.error(`❌ [WhatsApp媒体] 重试下载失败:`, error);
        }
      }
      
      return res.status(404).json({
        success: false,
        error: "文件不存在"
      });
    }

    // 设置响应头（基于实际文件扩展名判断）
    const extFromNameMatch = actualFileName.match(/\.([^.]+)$/);
    const extFromName = extFromNameMatch ? `.${extFromNameMatch[1]}` : '.bin';
    const contentType = getContentTypeFromExtension(extFromName);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1年缓存

    // 读取同名 .meta.json（如果存在）来优先确定原始文件名
    let preferredName = actualFileName;
    try {
      const metaPath = `${filePath}.meta.json`;
      if (fs.existsSync(metaPath)) {
        const raw = fs.readFileSync(metaPath, 'utf-8');
        const meta = JSON.parse(raw || '{}');
        if (typeof meta?.originalName === 'string' && meta.originalName.trim()) {
          preferredName = meta.originalName.trim();
        }
      }
    } catch {}

    // 清理文件名，移除无效的 HTTP 头字符
    const cleanFileName = preferredName
      .replace(/[\r\n\t]/g, ' ') // 移除换行符、回车符、制表符
      .replace(/[^\x20-\x7E]/g, '') // 只保留可打印的 ASCII 字符
      .trim();
    
    // 如果清理后的文件名为空，使用默认文件名
    const finalFileName = cleanFileName || actualFileName || 'file';
    console.log('finalFileNameee:', finalFileName);
    res.setHeader('Content-Disposition', `inline; filename="${finalFileName}"`);

    // 发送文件
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error(`❌ [WhatsApp媒体] 发送文件失败:`, err);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: "发送文件失败"
          });
        }
      } else {
        console.log(`✅ [WhatsApp媒体] 文件发送成功: ${actualFileName}`);
        // 广播媒体下载完成通知（包含文件名）
        try {
          if (io) {
            // 读取 .meta.json 的 hash 作为 fileHash
            let fileHash: string | undefined = undefined;
            try {
              const metaPath = `${filePath}.meta.json`;
              if (fs.existsSync(metaPath)) {
                const raw = fs.readFileSync(metaPath, 'utf-8');
                const meta = JSON.parse(raw || '{}');
                if (typeof meta?.hash === 'string' && meta.hash) fileHash = meta.hash;
              }
            } catch {}
            console.log('🔍 [WhatsApp媒体] 广播媒体下载完成通知:', {
              filePath: `/api/media/wa/${accountId}/${type}/${actualFileName}`,
              messageId: messageId,
              accountId: accountId,
              mediaType: type,
              fileName: preferredName,
              fileHash,
              timestamp: Date.now()
            });
            const mediaNotification = {
              type: 'mediaDownloaded',
              filePath: `/api/media/wa/${accountId}/${type}/${actualFileName}`,
              messageId: messageId,
              accountId: accountId,
              mediaType: type,
              fileName: preferredName,
              fileHash,
              timestamp: Date.now()
            } as any;
            io.emit('mediaDownloaded', mediaNotification);
            // console.log('[DEDUP:wsNotify]', mediaNotification);
          }
        } catch {}
        // 如果是时间戳命名的临时文件（如 1760516998978.jpg），发送成功后清理它
        // try {
        //   const isTimestampNamed = /^\d{10,13}\.[a-z0-9]+$/i.test(actualFileName);
        //   if (isTimestampNamed && fs.existsSync(filePath)) {
        //     fs.unlinkSync(filePath);
        //     console.log(`🗑️ [WhatsApp媒体] 已清理时间戳文件: ${actualFileName}`);
        //   }
        // } catch (cleanupErr) {
        //   console.warn(`⚠️ [WhatsApp媒体] 清理时间戳文件失败:`, cleanupErr);
        // }
      }
    });

  } catch (error: any) {
    console.error(`❌ [WhatsApp媒体] 获取媒体文件失败:`, error);
    res.status(500).json({
      success: false,
      error: error.message || "获取WhatsApp媒体文件失败"
    });
  }
});

// 获取文件扩展名
function getFileExtension(type: string): string {
  switch (type) {
    case 'photo': return 'jpg';
    case 'video': return 'mp4';
    case 'document': return 'pdf';
    case 'sticker': return 'webp'; // 贴纸使用webp格式
    case 'voice': return 'ogg';
    default: return 'bin';
  }
}

// 获取 Content-Type
function getContentType(type: string): string {
  switch (type) {
    case 'photo': return 'image/jpeg';
    case 'video': return 'video/mp4';
    case 'document': return 'application/pdf';
    case 'sticker': return 'image/webp'; // 贴纸使用webp格式
    case 'voice': return 'audio/ogg';
    default: return 'application/octet-stream';
  }
}

// 根据文件扩展名获取 Content-Type
function getContentTypeFromExtension(extension: string): string {
  const ext = extension.toLowerCase();
  switch (ext) {
    case '.txt': return 'text/plain';
    case '.pdf': return 'application/pdf';
    case '.doc': return 'application/msword';
    case '.docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case '.xls': return 'application/vnd.ms-excel';
    case '.xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case '.ppt': return 'application/vnd.ms-powerpoint';
    case '.pptx': return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case '.zip': return 'application/zip';
    case '.rar': return 'application/x-rar-compressed';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.png': return 'image/png';
    case '.gif': return 'image/gif';
    case '.webp': return 'image/webp';
    case '.tgs': return 'application/x-tgsticker'; // TGS动画贴纸格式
    case '.mp4': return 'video/mp4';
    case '.avi': return 'video/avi';
    case '.mov': return 'video/quicktime';
    case '.mp3': return 'audio/mpeg';
    case '.ogg': return 'audio/ogg';
    case '.wav': return 'audio/wav';
    case '.bin': return 'image/jpeg'; // Telegram 的 .bin 文件通常是图片数据
    default: return 'application/octet-stream';
  }
}

export default r;
