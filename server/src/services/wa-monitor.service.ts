import { EventEmitter } from 'events';
import { asciiToQR } from "../utils/ascii-to-qr";

/**
 * WhatsApp QR码监控服务
 * 负责监控控制台输出，检测QR码生成，并触发转换流程
 */
export class WAQRMonitor extends EventEmitter {
  private consoleBuffer = "";
  private activeSessionId: string | null = null;
  private isMonitoring = false;
  private qrGenerationStartTime: number = 0;

  constructor() {
    super();
    this.setupConsoleHook();
  }

  /**
   * 开始监控指定会话的QR码生成
   */
  startMonitoring(sessionId: string) {
    console.log(`🔍 开始监控WhatsApp QR码生成: ${sessionId}`);
    this.activeSessionId = sessionId;
    this.isMonitoring = true;
    this.qrGenerationStartTime = Date.now();
    this.consoleBuffer = "";
    
    // 设置超时检测
    setTimeout(() => {
      if (this.isMonitoring && this.activeSessionId === sessionId) {
        console.log(`⏰ QR码生成超时: ${sessionId}`);
        this.emit('qr-timeout', sessionId);
        this.stopMonitoring();
      }
    }, 30000); // 30秒超时
  }

  /**
   * 停止监控
   */
  stopMonitoring() {
    console.log(`🛑 停止监控WhatsApp QR码生成: ${this.activeSessionId}`);
    this.isMonitoring = false;
    this.activeSessionId = null;
    this.consoleBuffer = "";
  }

  /**
   * 设置控制台钩子
   */
  private setupConsoleHook() {
    // 检查是否已经设置过钩子
    if ((console.log as any)._hooked) {
      return;
    }

    const originalConsoleLog = console.log;
    
    console.log = (...args) => {
      const output = args.join(' ');
      
      // 先调用原始console.log
      originalConsoleLog.apply(console, args);
      
      // 只在监控状态下处理
      if (!this.isMonitoring || !this.activeSessionId) {
        return;
      }
      
      this.consoleBuffer += output + '\n';
      
      // 检测QR码开始
      if (output.includes('┌') && output.includes(this.activeSessionId)) {
        originalConsoleLog(`🎨 检测到QR码开始: ${this.activeSessionId}`);
        this.emit('qr-start', this.activeSessionId);
      }
      
      // 检测QR码内容行
      if (output.includes('█') && output.includes('│')) {
        // QR码内容行，继续收集
      }
      
      // 检测QR码结束
      if (output.includes('└─────────────────────────────────────────────────────────────────┘')) {
        originalConsoleLog(`🎨 检测到QR码结束: ${this.activeSessionId}`);
        this.emit('qr-end', this.activeSessionId);
        
        // 开始ASCII转换
        this.processAsciiQR();
      }
    };

    // 标记已设置钩子
    (console.log as any)._hooked = true;
  }

  /**
   * 处理ASCII QR码转换
   */
  private async processAsciiQR() {
    if (!this.activeSessionId || !this.consoleBuffer) {
      return;
    }

    const sessionId = this.activeSessionId;
    
    try {
      console.log(`🔄 开始处理ASCII QR码: ${sessionId}`);
      console.log(`📊 缓冲区大小: ${this.consoleBuffer.length} 字符`);
      
      const qrImage = await asciiToQR.parseConsoleOutput(this.consoleBuffer, sessionId);
      
      if (qrImage) {
        console.log(`✅ ASCII QR码转换成功: ${sessionId}`);
        this.emit('qr-converted', sessionId, qrImage);
      } else {
        console.log(`❌ ASCII QR码转换失败: ${sessionId}`);
        this.emit('qr-convert-failed', sessionId);
      }
    } catch (error) {
      console.error(`❌ ASCII QR码处理异常: ${sessionId}`, error);
      this.emit('qr-convert-error', sessionId, error);
    } finally {
      this.stopMonitoring();
    }
  }

  /**
   * 获取监控状态
   */
  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      activeSessionId: this.activeSessionId,
      bufferSize: this.consoleBuffer.length,
      elapsedTime: this.qrGenerationStartTime ? Date.now() - this.qrGenerationStartTime : 0
    };
  }
}

// 单例
export const waQRMonitor = new WAQRMonitor();
