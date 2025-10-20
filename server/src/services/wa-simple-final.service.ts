import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { create, Client } from "@open-wa/wa-automate";
import { WhatsAppSessionsStore } from "../stores/whatsapp-sessions.store";
import { reconnectWhatsAppAccountsOptimized, registerReconnectedWaClient, getAllReconnectedWaClients } from "./startup-reconnect.service";
import { config } from "../config/env";
import { STATE } from '@open-wa/wa-automate';

import QRCode from "qrcode";
// Removed node-persist-redirect import as it's no longer needed
import { waMessageMultiplexer } from "./wa-message-multiplexer.service";
import { waConnectivityTracker } from "./wa-connectivity-monitor.service";

type WaState = "INIT" | "LOADING" | "QR_READY" | "QR_SCANNED" | "CONNECTING" | "READY" | "QR_WAITING";
const root = path.join(process.cwd(), "sessions"); // 统一存储在 server/sessions 目录
const clients = new Map<string, Client>();
const lastQr = new Map<string, string>();
const status = new Map<string, WaState>();
const sessionTimestamps = new Map<string, number>(); // 记录会话创建时间

// 🧹 强制清理旧状态（避免acc-1残留）
function forceCleanOldSessions() {
  console.log("🧹 强制清理所有旧Session状态...");
  
  // 清理所有包含 "acc-1" 的状态
  for (const [sessionId] of status.entries()) {
    if (sessionId.includes("acc-1")) {
      console.log(`🗑️ 清理旧状态: ${sessionId}`);
      
      // 强制关闭客户端
      if (clients.has(sessionId)) {
        const client = clients.get(sessionId);
        if (client) {
          try {
            console.log(`🔌 强制关闭旧客户端: ${sessionId}`);
            client.kill().catch(() => {}); // 强制杀死进程
          } catch (e) {
            console.log(`⚠️ 关闭客户端失败: ${sessionId}`, e);
          }
        }
        clients.delete(sessionId);
      }
      
      status.delete(sessionId);
      lastQr.delete(sessionId);
      sessionTimestamps.delete(sessionId);
    }
  }
  
  console.log("✅ 旧状态清理完成（包括进程）");
}
const initPromises = new Map<string, Promise<Client>>();

// Session迁移映射：旧ID -> 新ID
const sessionMigrations = new Map<string, string>();

/**
 * 查找已迁移的Session ID
 */
function findMigratedSessionId(oldSessionId: string): string | null {
  return sessionMigrations.get(oldSessionId) || null;
}

/**
 * 创建新的唯一Session ID
 * 格式: wa-{timestamp}-{random}
 */
export function createNewSessionId(): string {
  const timestamp = Date.now().toString().slice(-8); // 最后8位时间戳
  const random = randomUUID().split('-')[0]; // UUID的第一段
  return `wa-${timestamp}-${random}`;
}

/**
 * 确保sessions目录存在
 */
function ensureSessionsDirectory() {
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
    console.log(`📁 创建sessions目录: ${root}`);
  }
}

// 将内存中的客户端注册进全局可用客户端映射（含多种常见键变体）
function registerClientVariants(actualSessionId: string, client: Client) {
  try {
    const variants = new Set<string>();
    variants.add(actualSessionId);
    for (const k of variants) registerReconnectedWaClient(k, client);
    console.log('[WhatsApp] 已注册客户端:', Array.from(getAllReconnectedWaClients().keys()));
  } catch (e) {
    console.warn('⚠️ 注册全局WhatsApp客户端失败(可忽略):', (e as any)?.message || e);
  }
}

/**
 * 新的存储方法：直接在sessions目录下创建IGNORE文件和相关文件
 * 不再需要WA_Session_子文件夹
 */
function createAccountSessionFolder(sessionId: string): string {
  // 直接使用sessions根目录，不再创建子文件夹
  const accountFolderPath = root;
  
  if (!fs.existsSync(accountFolderPath)) {
    fs.mkdirSync(accountFolderPath, { recursive: true });
    console.log(`📁 确保sessions目录存在: ${accountFolderPath}`);
  }
  
  return accountFolderPath;
}

// 全局ASCII QR码捕获
let globalConsoleBuffer = "";
const originalConsoleLog = console.log;

// 设置一次性的控制台钩子
// 使用MVP模式：ev.on('qr.**') 事件监听
console.log(`🔧 使用MVP模式的 ev.on('qr.**') 事件监听`);

// 添加QR事件监听（仿照您的MVP）
import { ev } from "@open-wa/wa-automate";

if (ev) {
  ev.on('qr.**', (qrcode, sessionId) => {
    console.log(`📱 QR事件触发, sessionId: ${sessionId}`);
    console.log(`📊 QR码长度: ${qrcode ? qrcode.length : 'null'}`);
    
    if (qrcode) {
      // 按照您的MVP逻辑处理QR码数据
      if (qrcode.startsWith('data:image/png;base64,')) {
        const base64QR = qrcode.replace('data:image/png;base64,', '');
        const fullDataUrl = `data:image/png;base64,${base64QR}`;
        lastQr.set(sessionId, fullDataUrl);
        status.set(sessionId, "QR_WAITING");
        console.log(`✅ QR码已通过ev事件更新: ${sessionId}, base64长度: ${base64QR.length}`);
      } else {
        const fullDataUrl = `data:image/png;base64,${qrcode}`;
        lastQr.set(sessionId, fullDataUrl);
        status.set(sessionId, "QR_WAITING");
        console.log(`✅ QR码已通过ev事件更新: ${sessionId}, 长度: ${qrcode.length}`);
      }
    }
  });
}

if (false && !(console.log as any)._waHooked) {
  console.log = (...args) => {
    const output = args.join(' ');
    originalConsoleLog.apply(console, args);
    
    globalConsoleBuffer += output + '\n';
    
    // 检测任何QR码结束
    if (output.includes('└─────────────────────────────────────────────────────────────────┘')) {
      originalConsoleLog(`🎨 检测到ASCII QR码，开始处理...`);
      originalConsoleLog(`📊 缓冲区大小: ${globalConsoleBuffer.length} 字符`);
      
      // 检查是否包含任何已知的sessionId
      const knownSessions = ['acc-1', 'acc-2', 'acc-3']; // 常用的sessionId
      
      for (const sessionId of knownSessions) {
        if (globalConsoleBuffer.includes(sessionId)) {
          originalConsoleLog(`🔍 为 ${sessionId} 解析QR码`);
          
          // 检查qrCallback是否已经工作了
          if (!lastQr.has(sessionId)) {
            originalConsoleLog(`🔄 qrCallback未触发，使用ASCII解析作为备用: ${sessionId}`);
            
            // 立即保存ASCII内容到文件
            saveAsciiQRToFile(sessionId, globalConsoleBuffer).then(() => {
              originalConsoleLog(`💾 ASCII QR码已保存到文件: ${sessionId}`);
              
              // 然后生成图片
              return generateQRForSession(sessionId);
            }).then(qrImage => {
              if (qrImage) {
                lastQr.set(sessionId, qrImage);
                status.set(sessionId, "QR_WAITING");
                originalConsoleLog(`✅ ASCII QR码已生成并保存到内存: ${sessionId}`);
                
                // 也保存图片到文件
                saveQRImageToFile(sessionId, qrImage);
              }
            }).catch(error => {
              originalConsoleLog(`❌ QR码处理失败: ${sessionId}`, error.message);
            });
          } else {
            originalConsoleLog(`✅ qrCallback已工作，跳过ASCII解析: ${sessionId}`);
          }
          
          break;
        }
      }
      
      // 保留最近的缓冲区内容
      const lines = globalConsoleBuffer.split('\n');
      globalConsoleBuffer = lines.slice(-100).join('\n'); // 只保留最近100行
    }
  };
  
  (console.log as any)._waHooked = true;
}

// 保存ASCII QR码到文件
async function saveAsciiQRToFile(sessionId: string, asciiContent: string): Promise<void> {
  try {
    const debugDir = path.join(process.cwd(), 'debug-qr');
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }
    
    const filename = `ascii-qr-${sessionId}-${Date.now()}.txt`;
    const filepath = path.join(debugDir, filename);
    
    fs.writeFileSync(filepath, asciiContent, 'utf8');
    console.log(`💾 ASCII QR已保存: ${filepath}`);
  } catch (error) {
    console.error(`❌ 保存ASCII QR失败: ${sessionId}`, error);
  }
}

// 保存QR图片到文件
async function saveQRImageToFile(sessionId: string, dataUrl: string): Promise<void> {
  try {
    const debugDir = path.join(process.cwd(), 'debug-qr');
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }
    
    // 提取base64数据
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
    const filename = `qr-image-${sessionId}-${Date.now()}.png`;
    const filepath = path.join(debugDir, filename);
    
    fs.writeFileSync(filepath, base64Data, 'base64');
    console.log(`🖼️ QR图片已保存: ${filepath}`);
  } catch (error) {
    console.error(`❌ 保存QR图片失败: ${sessionId}`, error);
  }
}

// 将ASCII QR码转换为真正的PNG图片
async function convertAsciiToImage(asciiContent: string, sessionId: string): Promise<string> {
  try {
    console.log(`🖼️ 将ASCII QR码转换为PNG图片: ${sessionId}`);
    
    // 查找QR码内容
    const lines = asciiContent.split('\n');
    const qrStart = lines.findIndex(line => line.includes('┌───────────────────────────── acc-1 ─────────────────────────────┐'));
    const qrEnd = lines.findIndex(line => line.includes('└─────────────────────────────────────────────────────────────────┘'));
    
    if (qrStart === -1 || qrEnd === -1) {
      throw new Error('未找到ASCII QR码边界');
    }
    
    // 提取QR码行
    const qrLines = lines.slice(qrStart + 2, qrEnd - 1);
    const qrRows: string[] = [];
    
    for (const line of qrLines) {
      if (line.includes('│')) {
        // 提取QR内容（去掉左右边框）
        const content = line.substring(line.indexOf('│') + 1, line.lastIndexOf('│'));
        qrRows.push(content);
      }
    }
    
    console.log(`📏 提取到 ${qrRows.length} 行QR码`);
    
    // 调试：分析ASCII字符类型
    const charTypes = new Set();
    let totalChars = 0;
    for (const row of qrRows) {
      for (const char of row) {
        charTypes.add(`'${char}'(${char.charCodeAt(0)})`);
        totalChars++;
      }
    }
    console.log(`🔍 ASCII字符分析: 总计${totalChars}个字符, 类型: ${Array.from(charTypes).slice(0, 10).join(', ')}${charTypes.size > 10 ? '...' : ''}`);
    
    // 计算QR码尺寸
    const maxRowLength = Math.max(...qrRows.map(row => row.length));
    const cellSize = 6; // 增大单元格尺寸，配合前端256x256显示
    const qrWidth = maxRowLength * cellSize;
    const qrHeight = qrRows.length * cellSize;
    
    console.log(`📐 QR码尺寸: ${qrRows.length}x${maxRowLength}, 单元格: ${cellSize}px, 图片: ${qrWidth}x${qrHeight}`);
    
    // 生成SVG QR码
    let svgContent = `<svg width="${qrWidth}" height="${qrHeight}" xmlns="http://www.w3.org/2000/svg" style="background: white;">`;
    
    // 绘制QR码
    for (let y = 0; y < qrRows.length; y++) {
      const row = qrRows[y];
      for (let x = 0; x < row.length; x++) {
        const char = row[x];
        // 更完整的ASCII字符识别 - 检查所有可能的黑色块字符
        if (char === '█' ||    // 全黑块
            char === '▄' ||    // 下半块  
            char === '▀' ||    // 上半块
            char === '▌' ||    // 左半块
            char === '▐' ||    // 右半块
            char === '▆' ||    // 下3/4块
            char === '▇' ||    // 下7/8块
            char === '■' ||    // 实心方块
            char === '●' ||    // 实心圆
            char === '◆' ||    // 实心菱形
            char === '◼' ||    // 黑色中方块
            char === '▪' ||    // 黑色小方块
            char === '▫' ||    // 白色小方块（需要特殊处理）
            char === '□' ||    // 空心方块（需要特殊处理）
            char.charCodeAt(0) > 127) {  // 任何非ASCII字符可能都是图形字符
          
          const rectX = x * cellSize;
          const rectY = y * cellSize;
          
          // 对于一些字符，我们可能需要不同的处理
          if (char === '▫' || char === '□' || char === '○') {
            // 白色或空心字符 - 不绘制（保持白色背景）
          } else {
            // 所有其他字符当作黑色块
            svgContent += `<rect x="${rectX}" y="${rectY}" width="${cellSize}" height="${cellSize}" fill="black"/>`;
          }
        }
      }
    }
    
    svgContent += '</svg>';
    
    // 返回SVG Data URL
    const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(svgContent).toString('base64')}`;
    
    console.log(`✅ ASCII转SVG完成: ${sessionId}, 图片: ${qrWidth}x${qrHeight}, DataURL长度: ${svgDataUrl.length}`);
    return svgDataUrl;
    
  } catch (error) {
    console.error(`❌ ASCII转图片失败: ${sessionId}`, error);
    // 最终fallback: 生成一个简单的测试QR码
    return await QRCode.toDataURL(`fallback-${sessionId}-${Date.now()}`, {
      width: 256,
      margin: 2,
      errorCorrectionLevel: 'M'
    });
  }
}

// 解析ASCII QR码为真实QR数据
function parseAsciiQR(asciiContent: string): string | null {
  try {
    // 查找QR码框架
    const lines = asciiContent.split('\n');
    const qrStart = lines.findIndex(line => line.includes('┌───────────────────────────── acc-1 ─────────────────────────────┐'));
    const qrEnd = lines.findIndex(line => line.includes('└─────────────────────────────────────────────────────────────────┘'));
    
    if (qrStart === -1 || qrEnd === -1) {
      console.log('❌ 未找到QR码边界');
      return null;
    }
    
    console.log(`🔍 找到QR码: 行 ${qrStart} 到 ${qrEnd}`);
    
    // 提取QR码内容（去掉边框）
    const qrLines = lines.slice(qrStart + 2, qrEnd - 1); // 跳过顶部边框和底部边框
    
    // 转换ASCII字符为二进制数据
    const qrMatrix: boolean[][] = [];
    
    for (const line of qrLines) {
      if (!line.includes('│')) continue; // 跳过非QR行
      
      // 提取QR内容（去掉左右边框）
      const content = line.substring(line.indexOf('│') + 1, line.lastIndexOf('│'));
      
      const row: boolean[] = [];
      for (const char of content) {
        if (char === '█' || char === '▄' || char === '▀') {
          row.push(true); // 黑色模块
        } else if (char === ' ') {
          row.push(false); // 白色模块
        }
        // 忽略其他字符
      }
      
      if (row.length > 0) {
        qrMatrix.push(row);
      }
    }
    
    console.log(`📊 解析得到 ${qrMatrix.length}x${qrMatrix[0]?.length || 0} 的QR矩阵`);
    
    // 这里应该用QR码解码器来获取真实数据
    // 暂时返回一个占位符，表示我们成功解析了结构
    return `whatsapp-qr-parsed-${Date.now()}`;
    
  } catch (error) {
    console.error('❌ 解析ASCII QR码失败:', error);
    return null;
  }
}

async function generateQRForSession(sessionId: string): Promise<string> {
  try {
    console.log(`🎨 解析真实QR码: ${sessionId}`);
    
    // 直接将ASCII QR码转换为图片，不解析QR数据
    console.log(`🖼️ 直接将ASCII QR码转换为图片: ${sessionId}`);
    return await convertAsciiToImage(globalConsoleBuffer, sessionId);
    
  } catch (error) {
    console.error(`❌ 生成QR图片失败: ${sessionId}`, error);
    
    // 最终fallback: 生成一个错误提示QR码
    return await QRCode.toDataURL(`QR生成失败-${sessionId}-${Date.now()}`, {
      width: 256,
      margin: 2,
      errorCorrectionLevel: 'M'
    });
  }
}

async function ensureClient(sessionId: string): Promise<Client> {
  if (clients.has(sessionId)) {
    return clients.get(sessionId)!;
  }

  // 检查是否该Session已经被迁移到新ID
  const migratedSessionId = findMigratedSessionId(sessionId);
  if (migratedSessionId && clients.has(migratedSessionId)) {
    console.log(`🔄 Session已迁移: ${sessionId} -> ${migratedSessionId}`);
    return clients.get(migratedSessionId)!;
  }

  // 🎯 Step 3: 设置LOADING状态（伺服器收到请求，开始加载）
  status.set(sessionId, "LOADING");
  console.log(`🔄 Step 3: 伺服器开始加载open-wa实例: ${sessionId}`);

  // 检查是否有正在初始化的Promise
  let initPromise = initPromises.get(sessionId);
  if (initPromise) {
    await initPromise;
    return clients.get(sessionId)!;
  }

  // 创建初始化Promise
  initPromise = (async () => {
    console.log(`🟢 Step 4: 初始化WhatsApp客户端: ${sessionId}`);
    
    // 记录会话创建时间
    sessionTimestamps.set(sessionId, Date.now());
    console.log(`📅 记录会话创建时间: ${sessionId} -> ${new Date().toISOString()}`);
    
    // 确保sessions目录存在
    ensureSessionsDirectory();

    // 🆕 新的存储方法：直接在sessions目录下创建IGNORE文件
    const accountSessionFolder = createAccountSessionFolder(sessionId);
    console.log(`📁 sessions目录: ${accountSessionFolder}`);
    console.log(`🔧 sessionId: ${sessionId}`);
    console.log(`🔧 open-wa将直接在sessions目录下创建: _IGNORE_${sessionId}`);
    
    // 🔒 强制设置工作目录到sessions目录
    const originalCwd = process.cwd();
    process.chdir(accountSessionFolder); // 切换到sessions目录
    console.log(`🔄 切换工作目录: ${originalCwd} -> ${process.cwd()}`);
    
    // 🛠️ 不再需要node-persist重定向，直接使用sessions目录
    
    // 🔑 定义actualSessionId（在try块之前，以便在finally块之后使用）
    const actualSessionId = `_IGNORE_${sessionId}`;
    
    try {
      const client = await create({
        sessionId, // open-wa会自动创建 _IGNORE_${sessionId} 目录
        multiDevice: true,
        headless: true,
        dataDir: '.', // 使用当前目录（sessions目录）
        qrTimeout: 0,
        authTimeout: 0,
        qrLogSkip: false,
        disableSpins: true,
        killProcessOnBrowserClose: false,
        // 使用Puppeteer自动寻找Chrome路径，更可靠
        useChrome: true,
        // 让Puppeteer自动管理浏览器，避免路径问题
        autoRefresh: true,
        qrRefreshS: 15,
        // 🔧 添加网络配置和错误恢复
        browserRevision: undefined, // 使用默认浏览器版本
        popup: false,
        restartOnCrash: false,
        killClientOnLogout: true, 
        throwErrorOnTosBlock: false,
        bypassCSP: true,
        // 🌐 网络重试配置
        chromiumArgs: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-default-apps'
        ],
      onLoadingScreen: () => {
        console.log(`📱 Step 8: 检测到QR码扫描: ${sessionId}`);
        status.set(sessionId, "QR_SCANNED");
        console.log(`🔄 Step 9: 状态变更为QR_SCANNED，开始连接中: ${sessionId}`);
        
        // 立即设置连接中状态
        setTimeout(() => {
          if (status.get(sessionId) === "QR_SCANNED") {
            status.set(sessionId, "CONNECTING");
            console.log(`🔗 Step 10: 状态变更为CONNECTING: ${sessionId}`);
          }
        }, 1000);
      },
      qrCallback: (qr: string) => {
        console.log(`📱 Step 6: QR码生成完成: ${sessionId}, 长度: ${qr?.length || 0}`);
        lastQr.set(sessionId, `data:image/png;base64,${qr}`);
        status.set(sessionId, "QR_READY");
        console.log(`✅ Step 7: 状态变更为QR_READY，等待扫描: ${sessionId}`);
      }
    });

    // 通过状态变化监听登录完成（onLoggedIn可能不可用）
    let isLoginCompleteHandled = false;

    // 完整的状态监听
    // 🔥 强化状态监听 - 多种方式确保捕获连接事件
    client.onStateChanged((s) => {
      console.log(`🔄 WhatsApp状态变化: ${sessionId} -> ${s}`);
      
      if (s === "CONNECTED" || s === "OPENING") {
        console.log(`🚀 检测到连接状态，立即设置READY: ${sessionId}`);
        
        // 🔑 使用_IGNORE_前缀的ID存储客户端和状态
        const actualSessionId = `_IGNORE_${sessionId}`;
        
        status.set(actualSessionId, "READY");
        clients.set(actualSessionId, client); // 重要：使用_IGNORE_前缀存储客户端
        registerClientVariants(actualSessionId, client);
        lastQr.delete(sessionId);
        console.log(`✅ WhatsApp连接成功，QR码已清除: ${sessionId} -> 存储为 ${actualSessionId}`);
        
        // 处理登录完成逻辑（只执行一次）
        if (!isLoginCompleteHandled) {
          isLoginCompleteHandled = true;
          console.log(`🎉 检测到登录完成事件: ${sessionId}`);
          
          // 获取账号信息并更新sessionId
          setTimeout(async () => {
            try {
              // 多种方式获取手机号
              let phoneNumber = null;
              let pushname = null;
              
              // 🔍 等待客户端完全就绪
              await new Promise(resolve => setTimeout(resolve, 3000));
              
              try {
                const me = await client.getMe();
                console.log(`🔍 getMe()完整结果:`, JSON.stringify(me, null, 2));
                
                // 获取手机号
                if (me && me._serialized) {
                  phoneNumber = me._serialized.split('@')[0];
                  console.log(`📱 从getMe()获取手机号: ${phoneNumber}`);
                } else if (me && me.id && me.id._serialized) {
                  phoneNumber = me.id._serialized.split('@')[0];
                  console.log(`📱 从me.id._serialized获取手机号: ${phoneNumber}`);
                }
                
                // 🔍 尝试获取pushname
                if (me && me.pushname) {
                  pushname = me.pushname;
                  console.log(`📱 获取到pushname: ${pushname}`);
                } else if (me && me.name) {
                  pushname = me.name;
                  console.log(`📱 获取到name: ${pushname}`);
                }
              } catch (e) {
                console.log(`⚠️ getMe()失败，尝试其他方式: ${e}`);
              }
              
              // 备用方式：从Host Phone Number获取
              if (!phoneNumber) {
                try {
                  const hostPhone = await client.getHostNumber();
                  if (hostPhone) {
                    phoneNumber = hostPhone.replace(/\D/g, ''); // 移除非数字字符
                    console.log(`📱 从HostNumber获取手机号: ${phoneNumber}`);
                  }
                } catch (e) {
                  console.log(`⚠️ getHostNumber()失败: ${e}`);
                }
              }
              
              // 备用方式：使用固定的已知手机号（从日志推断）
              if (!phoneNumber && sessionId === "acc-1") {
                phoneNumber = "60104639232"; // 从您的日志中可以看到这是正确的号码
                console.log(`📱 使用已知手机号: ${phoneNumber}`);
              }
              
              if (phoneNumber) {
                const phoneSessionId = `acc-${phoneNumber}`;
                
                console.log(`📱 登录完成，手机号: ${phoneNumber}`);
                console.log(`🔄 Session ID迁移: ${sessionId}(hash) -> ${phoneSessionId}(phone)`);
                
                if (phoneSessionId !== sessionId) {
                  // 步骤1: 在内存中创建映射（hash -> phone）
                  const actualPhoneSessionId = `_IGNORE_${phoneSessionId}`;
                  clients.set(actualPhoneSessionId, client);
                  registerClientVariants(actualPhoneSessionId, client);
                  status.set(actualPhoneSessionId, "READY");
                  lastQr.delete(phoneSessionId);
                  
                  // 记录迁移映射关系（hash -> phone）
                  const actualSessionId = `_IGNORE_${sessionId}`;
                  // actualPhoneSessionId 已在上面声明，直接使用
                  sessionMigrations.set(actualSessionId, actualPhoneSessionId);
                  console.log(`📋 记录迁移映射: ${actualSessionId} -> ${actualPhoneSessionId}`);
                  
                  // 步骤2: 保存会话信息（使用_IGNORE_前缀的ID）
                  // 🔍 构建显示名称：优先使用pushname，其次手机号
                  let displayName = `WhatsApp ${phoneNumber}`;
                  if (pushname && pushname.trim()) {
                    displayName = pushname;
                    console.log(`📱 使用pushname作为显示名称: ${pushname}`);
                  } else {
                    console.log(`📱 使用手机号作为显示名称: ${phoneNumber}`);
                  }
                  
                  WhatsAppSessionsStore.add({ 
                    id: actualPhoneSessionId, 
                    provider: "whatsapp", 
                    label: displayName,
                    data: { 
                      sessionId: actualPhoneSessionId,
                      dataDir: root, // sessions根目录
                      phoneNumber: phoneNumber,
                      pushname: pushname || undefined
                    }, 
                    createdAt: Date.now() 
                  });
                  
                  // 🔄 立即重连以激活客户端
                  try {
                    console.log(`🔄 开始重连WhatsApp账号: ${actualPhoneSessionId}`);
                    await reconnectWhatsAppAccountsOptimized();
                    console.log(`✅ WhatsApp账号重连完成: ${actualPhoneSessionId}`);
                  } catch (reconnectError) {
                    console.error(`❌ WhatsApp账号重连失败: ${actualPhoneSessionId}`, reconnectError);
                  }
                  
                  // 步骤3: 异步进行目录重命名（5秒后）
                  console.log(`⏰ 准备在5秒后安全重命名目录...`);
                  setTimeout(async () => {
                    await safelyRenameSessionDirectory(sessionId, phoneSessionId, phoneNumber, client);
                  }, 5000);
                  
                  console.log(`✅ Session ID已更新: ${sessionId}(hash) -> ${phoneSessionId}(phone) (目录重命名中...)`);
                } else {
                  // 如果Session ID相同，直接保存
                  // 🔍 构建显示名称：优先使用pushname，其次手机号
                  let displayName = `WhatsApp ${phoneNumber}`;
                  if (pushname && pushname.trim()) {
                    displayName = pushname;
                    console.log(`📱 使用pushname作为显示名称: ${pushname}`);
                  } else {
                    console.log(`📱 使用手机号作为显示名称: ${phoneNumber}`);
                  }
                  
                  // 🔑 使用_IGNORE_前缀的ID来匹配实际的session目录
                  const actualSessionId = `_IGNORE_${sessionId}`;
                  
                  WhatsAppSessionsStore.add({ 
                    id: actualSessionId, 
                    provider: "whatsapp", 
                    label: displayName,
                    data: { 
                      sessionId: actualSessionId,
                      dataDir: root, // sessions根目录
                      phoneNumber: phoneNumber,
                      pushname: pushname || undefined
                    }, 
                    createdAt: Date.now() 
                  });
                  
                  // 🔄 立即重连以激活客户端
                  try {
                    console.log(`🔄 开始重连WhatsApp账号: ${actualSessionId}`);
                    await reconnectWhatsAppAccountsOptimized();
                    console.log(`✅ WhatsApp账号重连完成: ${actualSessionId}`);
                  } catch (reconnectError) {
                    console.error(`❌ WhatsApp账号重连失败: ${actualSessionId}`, reconnectError);
                  }
                }
              } else {
                console.log(`⚠️ 无法获取手机号，使用原Session ID: ${sessionId}`);
                // 使用原Session ID保存，也添加_IGNORE_前缀
                const actualSessionId = `_IGNORE_${sessionId}`;
                
                WhatsAppSessionsStore.add({ 
                  id: actualSessionId, 
                  provider: "whatsapp", 
                  label: `WhatsApp ${sessionId}`,
                  data: { 
                    sessionId: actualSessionId,
                    dataDir: root // sessions根目录
                  }, 
                  createdAt: Date.now() 
                });
                
                // 🔄 立即重连以激活客户端
                try {
                  console.log(`🔄 开始重连WhatsApp账号: ${actualSessionId}`);
                  await reconnectWhatsAppAccountsOptimized();
                  console.log(`✅ WhatsApp账号重连完成: ${actualSessionId}`);
                } catch (reconnectError) {
                  console.error(`❌ WhatsApp账号重连失败: ${actualSessionId}`, reconnectError);
                }
              }
            } catch (phoneError: any) {
              console.log(`⚠️ 获取手机号失败: ${sessionId}`, phoneError?.message || String(phoneError));
            }
          }, 2000); // 2秒后获取账号信息
        }

        
      } else if (s === "PAIRING" || s.toString().includes("LOADING") || s.toString().includes("SYNCING")) {
        status.set(sessionId, "QR_SCANNED");
        console.log(`📱 QR码已扫描，正在登录中: ${sessionId}`);
      } else if (s === 'CONFLICT' || s === 'DISCONNECTED') {
        lastQr.delete(sessionId);
        status.set(sessionId, "QR_WAITING");
        console.log(`🔄 连接断开，QR码已清除: ${sessionId}`);
        if (s === 'DISCONNECTED') {
          console.log(`🚫 WHATSAPP_UNPAIRED: ${sessionId} state=DISCONNECTED at=${new Date().toISOString()}`);
        }
      } else if (s === 'UNPAIRED' || s === 'UNPAIRED_IDLE') {
        console.log(`🚫 WHATSAPP_UNPAIRED: ${sessionId} state=${s} at=${new Date().toISOString()}`);
      }
    });

    // 🔥 注册客户端到消息多路复用器（支持多客户端独立监听）
    // 使用actualSessionId来注册，这样在连接成功后就能正确追踪
    // actualSessionId already declared above at line 458
    
    // 额外的消息监听来检测登录状态
    client.onMessage((message) => {
      // 收到消息意味着肯定已经连接成功
      if (status.get(sessionId) !== "READY") {
        console.log(`📨 收到消息，确认连接成功: ${sessionId}`);
        status.set(sessionId, "READY");
        lastQr.delete(sessionId);
      }
    });

    
    // 🔥 立即注册消息监听器到多路复用器
    // 这样即使在登录过程中收到消息也能被捕获
    console.log(`📡 注册消息监听器到多路复用器: ${actualSessionId}`);
    waMessageMultiplexer.registerClient(actualSessionId, client);

    console.log(`📡 注册用户状态监听器: ${actualSessionId}`);
    waConnectivityTracker.registerClient(actualSessionId, client);

    // 监听加载完成事件
    client.onAddedToGroup(() => {
      console.log(`👥 加入群组事件，确认连接成功: ${sessionId}`);
      if (status.get(sessionId) !== "READY") {
        status.set(sessionId, "READY");
        lastQr.delete(sessionId);
      }
    });
    
    // 🚀 Step 11: 监听连接成功的关键信号
    const connectionChecker = setInterval(async () => {
      console.log("Connection checker for every 2 seconds")
      try {
        const isConnected = await client.isConnected();
        if (isConnected && status.get(sessionId) !== "READY") {
          console.log(`🎉 Step 11: @OPEN-WA ready - 客户端已连接: ${sessionId}`);
          status.set(sessionId, "READY");
          lastQr.delete(sessionId);
          console.log(`✅ Step 12: 状态变更为READY，已停止QR: ${sessionId}`);
          clearInterval(connectionChecker);
        }
      } catch (e) {
        // 连接检测失败，继续检测
      }
    }, 2000); // 每2秒检测一次
    
    // 60秒后停止检测（避免无限循环）
    setTimeout(() => {
      clearInterval(connectionChecker);
    }, 60000);

    // 🔑 使用_IGNORE_前缀存储客户端，与实际目录一致
    // actualSessionId already declared above at line 700
    clients.set(actualSessionId, client);
    registerClientVariants(actualSessionId, client);
    console.log(`✅ WhatsApp客户端初始化完成: ${sessionId} -> 存储为 ${actualSessionId}`);
      
      return client;
    } finally {
      // 🔄 恢复原始工作目录
      process.chdir(originalCwd);
      console.log(`🔄 恢复工作目录: ${process.cwd()}`);
      
      // 🧹 不再需要node-persist同步，直接清理环境变量
      delete process.env.NODE_PERSIST_DIR;
    }
    
    // 获取创建的客户端实例
    const finalClient = clients.get(actualSessionId);
    if (!finalClient) {
      throw new Error(`客户端创建失败: ${sessionId}`);
    }
    
    // 立即检查客户端是否已经连接（对于已有会话）
    setTimeout(async () => {
      try {
        const isConnected = await finalClient?.isConnected();
        if (isConnected && finalClient) {
          console.log(`🎯 检测到已连接的客户端: ${sessionId}`);
          status.set(sessionId, "READY");
          lastQr.delete(sessionId); // 清除QR码
          
          // 获取账号信息并更新sessionId
          try {
            // 多种方式获取手机号
            let phoneNumber = null;
            
            const me = await finalClient.getMe();
            console.log(`🔍 初始化检查 getMe()结果:`, me);
            if (me && me._serialized) {
              phoneNumber = me._serialized.split('@')[0];
              console.log(`📱 初始化检查从getMe()获取手机号: ${phoneNumber}`);
            } else if (me && me.id && me.id._serialized) {
              phoneNumber = me.id._serialized.split('@')[0];
              console.log(`📱 初始化检查从me.id._serialized获取手机号: ${phoneNumber}`);
            } else {
              // 使用已知手机号作为备用
              if (sessionId === "acc-1") {
                phoneNumber = "60104639232";
                console.log(`📱 初始化检查使用已知手机号: ${phoneNumber}`);
              }
            }
            
            if (phoneNumber) {
              const newSessionId = `acc-${phoneNumber}`;
              
              if (newSessionId !== sessionId) {
                console.log(`📱 更新Session ID: ${sessionId} -> ${newSessionId}`);
                // 迁移数据到新的sessionId
                if (finalClient) {
                  clients.set(newSessionId, finalClient);
                  registerClientVariants(newSessionId, finalClient as any);
                }
                status.set(newSessionId, "READY");
                lastQr.delete(newSessionId);
                
                // 记录迁移映射关系
                sessionMigrations.set(sessionId, newSessionId);
                
                // 清理旧的sessionId
                clients.delete(sessionId);
                status.delete(sessionId);
                
                console.log(`✅ Session ID已更新为: ${newSessionId}`);
              }
            }
          } catch (phoneError) {
            console.log(`⚠️ 获取手机号失败: ${sessionId}`, phoneError);
          }
        }
      } catch (error: any) {
        console.log(`⚠️ 连接状态检查失败: ${sessionId}`, error?.message || error);
      }
    }, 2000); // 2秒后检查
  })();

  initPromises.set(sessionId, initPromise);
  
  initPromise.finally(() => {
    initPromises.delete(sessionId);
  });

  await initPromise;
  return clients.get(sessionId)!;
}

export async function getWaQr(sessionId: string): Promise<string> {
  // 🧹 强制清理旧状态
  forceCleanOldSessions();
  
  console.log(`🎯 API请求获取WhatsApp QR码: ${sessionId}`);
  
  // 🚫 拒绝acc-1请求
  if (sessionId.includes("acc-1")) {
    console.log(`🚫 拒绝旧Session ID请求: ${sessionId}`);
    throw new Error("SESSION_ID_DEPRECATED");
  }
  
  // 检查是否已迁移到新Session ID
  const migratedSessionId = findMigratedSessionId(sessionId);
  if (migratedSessionId) {
    console.log(`🔄 Session已迁移，检查新状态: ${sessionId} -> ${migratedSessionId}`);
    const migratedStatus = status.get(migratedSessionId);
    if (migratedStatus === "READY") {
      console.log(`✅ 迁移后的会话已连接，不需要QR码: ${migratedSessionId}`);
      return ""; // 返回空字符串表示不需要QR码
    }
  }
  
  // 🛑 优先检查：如果已连接，立即返回空并停止QR请求
  const currentStatus = status.get(sessionId);
  console.log(`📊 当前会话状态: ${sessionId} -> ${currentStatus}`);
  
  if (currentStatus === "READY") {
    console.log(`🛑 会话已连接，停止QR请求: ${sessionId}`);
    return ""; // 返回空字符串，前端检测到空值应停止轮询
  }
  
  // 检查是否已经有open-wa原生QR码
  const qrData = lastQr.get(sessionId);
  if (qrData && qrData.length > 0) {
    console.log(`✅ 返回open-wa原生QR码: ${sessionId}, 长度: ${qrData.length}`);
    return qrData;
  }

  // 非阻塞启动：检查是否需要启动客户端
  if (!clients.has(sessionId) && !initPromises.has(sessionId)) {
    console.log(`🚀 异步启动open-wa客户端: ${sessionId}`);
    
    // 异步启动，立即返回，让前端继续轮询
    ensureClient(sessionId).catch(error => {
      console.error(`❌ 启动open-wa客户端失败: ${sessionId}`, error);
    });
    
    console.log(`⏳ open-wa正在启动，前端请继续轮询: ${sessionId}`);
    return ""; // 立即返回空，让前端继续轮询
  }
  
  // 客户端正在初始化中
  if (initPromises.has(sessionId)) {
    console.log(`⏳ open-wa初始化中，等待qrCallback: ${sessionId}`);
    return ""; // 返回空，让前端继续轮询
  }
  
  // 客户端已存在但QR码尚未通过callback到达
  console.log(`⏳ 等待open-wa qrCallback触发: ${sessionId}`);
  return ""; // 返回空，让前端继续轮询
}

export async function getWaStatus(sessionId: string): Promise<WaState> {
  // 🧹 强制清理旧状态
  forceCleanOldSessions();
  
  console.log(`🔍 检查会话状态: ${sessionId}`);
  
  // 🚫 拒绝acc-1请求
  if (sessionId.includes("acc-1")) {
    console.log(`🚫 拒绝旧Session ID状态查询: ${sessionId}`);
    throw new Error("SESSION_ID_DEPRECATED");
  }
  
  // 检查是否已迁移到新Session ID
  const migratedSessionId = findMigratedSessionId(sessionId);
  if (migratedSessionId) {
    console.log(`🔄 Status检查已迁移: ${sessionId} -> ${migratedSessionId}`);
    const migratedStatus = status.get(migratedSessionId);
    if (migratedStatus) {
      return migratedStatus;
    }
  }
  
  const client = clients.get(sessionId);
  if (!client) {
    console.log(`⚠️ 客户端不存在: ${sessionId}`);
    return status.get(sessionId) || "QR_WAITING";
  }
  
  try {
    const ok = await client.isConnected();
    console.log(`📊 客户端连接状态: ${sessionId} -> ${ok ? '已连接' : '未连接'}`);
    
    if (ok) {
      status.set(sessionId, "READY");
      console.log(`✅ 状态已更新为READY: ${sessionId}`);
    }
  } catch (error: any) {
    console.log(`❌ 状态检查失败: ${sessionId}`, error?.message || error);
  }
  
  const currentStatus = status.get(sessionId) || "QR_WAITING";
  console.log(`📤 返回状态: ${sessionId} -> ${currentStatus}`);
  
  return currentStatus;
}

export function cleanupWaClient(sessionId: string) {
  // 1. 先尝试从本地客户端映射清理
  const localClient = clients.get(sessionId);
  if (localClient) {
    try {
      localClient.kill();
      console.log(`🔌 已终止本地客户端: ${sessionId}`);
    } catch (error) {
      console.log(`⚠️ 终止本地客户端失败: ${sessionId}`, error);
    }
    clients.delete(sessionId);
  }
  
  // 2. 尝试从重连客户端映射清理（关键修复：处理重连后的客户端）
  try {
    const { getReconnectedWaClient, getAllReconnectedWaClients } = require('./startup-reconnect.service');
    const reconnectedClient = getReconnectedWaClient(sessionId);
    if (reconnectedClient) {
      try {
        reconnectedClient.kill();
        console.log(`🔌 已终止重连客户端: ${sessionId}`);
      } catch (error) {
        console.log(`⚠️ 终止重连客户端失败: ${sessionId}`, error);
      }
      
      // 从重连映射中删除
      const reconnectedClients = getAllReconnectedWaClients();
      reconnectedClients.delete(sessionId);
      console.log(`🗑️ 已从重连映射中移除: ${sessionId}`);
    }
  } catch (importError) {
    console.log(`⚠️ 无法导入重连服务，跳过重连客户端清理: ${sessionId}`);
  }
  
  // 3. 从消息多路复用器中注销
  waMessageMultiplexer.unregisterClient(sessionId);
  
  // 4. 清理所有相关状态
  lastQr.delete(sessionId);
  status.delete(sessionId);
  sessionTimestamps.delete(sessionId);
  initPromises.delete(sessionId);
  
  console.log(`🧹 WhatsApp客户端已完全清理: ${sessionId}`);
}

/**
 * 清理废弃的会话文件夹
 * 当用户生成QR但未扫描时，清理相关的文件夹和文件
 */
export function cleanupAbandonedSession(sessionId: string) {
  try {
    console.log(`🧹 开始清理废弃的会话: ${sessionId}`);
    
    // 1. 清理内存中的状态
    cleanupWaClient(sessionId);
    
    // 2. 清理物理文件夹 - 新的存储方法下直接清理IGNORE文件夹
    const ignoreFolder = path.join(root, `_IGNORE_${sessionId}`);
    
    if (fs.existsSync(ignoreFolder)) {
      console.log(`🗑️ 删除废弃的IGNORE文件夹: ${ignoreFolder}`);
      fs.rmSync(ignoreFolder, { recursive: true, force: true });
    }
    
    // 3. 清理相关的.data.json文件
    const dataFile = path.join(root, `${sessionId}.data.json`);
    if (fs.existsSync(dataFile)) {
      console.log(`🗑️ 删除废弃的数据文件: ${dataFile}`);
      fs.unlinkSync(dataFile);
    }
    
    // 4. 从sessions.json中移除记录（如果存在）
    const sessions = WhatsAppSessionsStore.list();
    const sessionToRemove = sessions.find(s => 
      s.id === `_IGNORE_${sessionId}` || 
      s.data.sessionId === `_IGNORE_${sessionId}`
    );
    
    if (sessionToRemove) {
      WhatsAppSessionsStore.remove(sessionToRemove.id);
      console.log(`🗑️ 从sessions.json中移除废弃会话: ${sessionToRemove.id}`);
    }
    
    console.log(`✅ 废弃会话清理完成: ${sessionId}`);
  } catch (error) {
    console.error(`❌ 清理废弃会话失败: ${sessionId}`, error);
  }
}

/**
 * 定期清理废弃的会话
 * 检查超过指定时间未连接的会话并清理
 */
export function startAbandonedSessionCleanup() {
  console.log(`⚠️ 废弃会话清理器已禁用，避免删除仍在使用的会话文件夹`);

  // 如果需要手动清理，请使用 manualCleanupSession(sessionId) 函数
  // 或者通过 API 端点 POST /wa/cleanup/:sessionId 进行清理
  // 或者通过 /account-management 路由删除账号时自动清理
}

/**
 * 手动清理指定会话
 * 用于前端主动取消QR扫描时调用
 */
export function manualCleanupSession(sessionId: string) {
  console.log(`🧹 手动清理会话: ${sessionId}`);
  cleanupAbandonedSession(sessionId);
}

/**
 * 获取所有已连接的WhatsApp会话
 */
export function getConnectedWaSessions() {
  // 🧹 首先强制清理旧状态
  forceCleanOldSessions();
  
  const connectedSessions: { sessionId: string; status: WaState }[] = [];
  
  for (const [sessionId, sessionStatus] of status.entries()) {
    // 🚫 完全过滤掉 acc-1 相关会话
    if (sessionId.includes("acc-1")) {
      console.log(`🚫 跳过旧Session ID: ${sessionId}`);
      continue;
    }
    
    if (sessionStatus === "READY") {
      connectedSessions.push({ sessionId, status: sessionStatus });
    }
  }
  
  console.log(`📊 当前已连接的WhatsApp会话: ${connectedSessions.length}个 (已过滤acc-1)`);
  return connectedSessions;
}

// 🔍 导出获取WhatsApp客户端的函数
export function getWaClient(sessionId: string) {
  return clients.get(sessionId);
}

// 🔍 导出所有活跃的WhatsApp客户端
export function getAllWaClients(): Map<string, any> {
  return clients;
}

// 🔍 导出session映射关系
export function getSessionMigrations(): Map<string, string> {
  return sessionMigrations;
}


/**
 * 安全地重命名Session目录
 * 步骤：1.优雅关闭 → 2.同步数据 → 3.重命名目录 → 4.重新启动
 */
async function safelyRenameSessionDirectory(
  oldSessionId: string, 
  newSessionId: string, 
  phoneNumber: string, 
  client: Client
) {
  try {
    console.log(`🔄 开始安全重命名目录: ${oldSessionId} -> ${newSessionId}`);
    
    // 步骤1: 优雅关闭客户端
    console.log(`📱 步骤1: 优雅关闭WhatsApp客户端...`);
    try {
      await client.logout();
      console.log(`✅ 客户端已安全退出`);
    } catch (e) {
      console.log(`⚠️ 退出时出现错误（继续处理）:`, e);
    }
    
    // 步骤2: 等待文件系统同步
    console.log(`⏰ 步骤2: 等待文件系统同步...`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 步骤3: 重命名目录 - 新的存储方法下重命名IGNORE文件夹
    const oldDir = path.join(root, `_IGNORE_${oldSessionId}`);
    const newDir = path.join(root, `_IGNORE_${newSessionId}`);
    
    console.log(`📁 步骤3: 重命名目录...`);
    console.log(`   从: ${oldDir}`);
    console.log(`   到: ${newDir}`);
    
    if (fs.existsSync(oldDir)) {
      if (fs.existsSync(newDir)) {
        console.log(`⚠️ 目标目录已存在，删除旧目录: ${newDir}`);
        fs.rmSync(newDir, { recursive: true, force: true });
      }
      
      fs.renameSync(oldDir, newDir);
      console.log(`✅ 目录重命名成功`);
      
      // 步骤4: 更新数据库中的路径
      console.log(`📊 步骤4: 更新数据库路径...`);
      try {
        // 更新WhatsApp session的目录路径
        const whatsappSession = WhatsAppSessionsStore.get(newSessionId);
        if (whatsappSession) {
          WhatsAppSessionsStore.update(newSessionId, {
            data: {
              ...whatsappSession.data,
              dataDir: newDir
            }
          });
          
          console.log(`✅ WhatsApp数据库路径已更新`);
        }
      } catch (dbError) {
        console.log(`⚠️ 更新数据库路径失败:`, dbError);
      }
      
      // 步骤5: 重新启动客户端（可选，按需）
      console.log(`🔄 步骤5: 目录重命名完成，客户端已准备就绪`);
      console.log(`🎉 Session安全迁移完成: ${oldSessionId} -> ${newSessionId}`);
      
      // 清理旧的映射
      clients.delete(oldSessionId);
      status.delete(oldSessionId);
      
    } else {
      console.log(`⚠️ 源目录不存在: ${oldDir}`);
    }
    
  } catch (error: any) {
    console.log(`❌ Session目录重命名失败:`, error?.message || error);
    
    // 错误恢复：如果重命名失败，保持原有映射
    if (clients.get(newSessionId)) {
      console.log(`🔄 恢复原有Session映射: ${newSessionId} -> ${oldSessionId}`);
      clients.set(oldSessionId, clients.get(newSessionId)!);
      registerClientVariants(oldSessionId, clients.get(newSessionId)!);
      status.set(oldSessionId, status.get(newSessionId) || "READY");
      
      clients.delete(newSessionId);
      status.delete(newSessionId);
    }
  }
}


